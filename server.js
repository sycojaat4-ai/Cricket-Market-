// Cricket market load server (Node 18+). Key in env var ODDSPAPI_KEY. index.html sits next to this file.
const http=require("http"),fs=require("fs"),path=require("path");
const KEY=process.env.ODDSPAPI_KEY,BASE="https://api.oddspapi.io/v4",MAX=14;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,q){const u=new URL(BASE+p);u.search=new URLSearchParams({apiKey:KEY,...q});const r=await fetch(u);if(!r.ok)throw new Error(p+" "+r.status);return r.json();}
const day=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10);
const startOf=f=>Date.parse(f.startTime||f.startTimestamp||f.trueStartTime||"")||0;
function side(o){
  const p=(o&&o.players&&o.players["0"])||{},m=p.exchangeMeta||{};
  const s=a=>(a||[]).reduce((t,x)=>t+(x.size||0),0);
  return{p:p.price||0,l:s(m.availableToBack)+s(m.availableToLay)};
}
function market(b,id){
  const mk=b&&b.markets&&b.markets[id];if(!mk)return null;
  const k=Object.keys(mk.outcomes).sort((a,b)=>a-b);if(k.length<2)return null;
  return{a:side(mk.outcomes[k[0]]),b:side(mk.outcomes[k[1]])};
}
function pickMarket(bo,id){ // Betfair first, then Pinnacle, then any bookmaker
  for(const s of ["betfair-ex","pinnacle",...Object.keys(bo)]){const m=market(bo[s],id);if(m)return Object.assign(m,{src:s});}
  return null;
}
async function build(){
  let fx=(await api("/fixtures",{sportId:27,from:day(-1),to:day(3)})).filter(f=>f.hasOdds);
  const now=Date.now();
  fx.sort((x,y)=>{const lx=startOf(x)<=now?0:1,ly=startOf(y)<=now?0:1;return lx-ly||startOf(x)-startOf(y);});
  const out=[];
  for(const f of fx.slice(0,MAX)){
    await sleep(1100);
    try{
      const bo=(await api("/odds",{fixtureId:f.fixtureId})).bookmakerOdds||{};
      const win=pickMarket(bo,"271"),toss=pickMarket(bo,"278");
      if(!win&&!toss)continue;
      const st=startOf(f);
      out.push({id:f.fixtureId,c:f.tournamentName,a:f.participant1Name,b:f.participant2Name,live:st>0&&st<=now,win,toss});
    }catch(e){console.log("skip",f.fixtureId,e.message);}
  }
  return out;
}
let cache={t:0,d:null},busy=null;
function refresh(){if(!busy)busy=build().then(d=>{cache={t:Date.now(),d};}).catch(e=>console.log("build",e.message)).finally(()=>{busy=null;});return busy;}
async function data(){
  if(!cache.d)await refresh();else if(Date.now()-cache.t>60000)refresh();
  return cache.d||[];
}
const send=(res,c,o)=>{res.writeHead(c,{"content-type":"application/json"});res.end(JSON.stringify(o));};
http.createServer(async(req,res)=>{
  try{
    if(req.url.startsWith("/api/data")){if(!KEY)throw new Error("ODDSPAPI_KEY not set");return send(res,200,await data());}
    if(req.url.startsWith("/api/debug")){if(!KEY)throw new Error("ODDSPAPI_KEY not set");
      const fx=await api("/fixtures",{sportId:27,from:day(-1),to:day(3)});
      return send(res,200,fx.map(f=>({n:f.participant1Name+" v "+f.participant2Name,t:f.tournamentName,start:f.startTime||f.startTimestamp||f.trueStartTime,status:f.statusId,odds:f.hasOdds})));}
  }catch(e){return send(res,500,{error:e.message});}
  fs.readFile(path.join(__dirname,"index.html"),(e,b)=>{
    const h=e?"index.html not found":b.toString().replace("updates every 4 seconds","updates every 20 seconds").replace("Total matched = match mein ab tak laga total paisa.","Total = back/lay mein available paisa.");
    res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(h);});
}).listen(process.env.PORT||3000);
