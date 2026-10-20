// Cricket market load server. Needs Node 18+. Key goes in env var ODDSPAPI_KEY (never in code).
const http=require("http"),fs=require("fs"),path=require("path");
const KEY=process.env.ODDSPAPI_KEY,BASE="https://api.oddspapi.io/v4",MAX=8;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,q){const u=new URL(BASE+p);u.search=new URLSearchParams({apiKey:KEY,...q});const r=await fetch(u);if(!r.ok)throw new Error(p+" "+r.status);return r.json();}
const day=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10);
function side(o){ // price + liquidity (sum of back and lay sizes) for one outcome
  const p=(o&&o.players&&o.players["0"])||{},m=p.exchangeMeta||{};
  const s=a=>(a||[]).reduce((t,x)=>t+(x.size||0),0);
  return{p:p.price||0,l:s(m.availableToBack)+s(m.availableToLay)};
}
function market(bf,id){ // outcomes sorted by id: first = team 1, second = team 2
  const mk=bf&&bf.markets&&bf.markets[id];if(!mk)return null;
  const k=Object.keys(mk.outcomes).sort((a,b)=>a-b);if(k.length<2)return null;
  return{a:side(mk.outcomes[k[0]]),b:side(mk.outcomes[k[1]])};
}
async function build(){
  const fx=(await api("/fixtures",{sportId:27,from:day(0),to:day(3)})).filter(f=>f.hasOdds).slice(0,MAX);
  const out=[];
  for(const f of fx){
    await sleep(1100);
    try{
      const o=await api("/odds",{fixtureId:f.fixtureId});
      const bf=(o.bookmakerOdds||{})["betfair-ex"];if(!bf)continue;
      const st=Date.parse(f.startTime||f.startTimestamp||f.trueStartTime||"")||0;
      out.push({id:f.fixtureId,c:f.tournamentName,a:f.participant1Name,b:f.participant2Name,live:st>0&&st<=Date.now(),win:market(bf,"271"),toss:market(bf,"278")});
    }catch(e){console.log("skip",f.fixtureId,e.message);}
  }
  return out;
}
let cache={t:0,d:[]},busy=null;
async function data(){
  if(Date.now()-cache.t<60000)return cache.d;
  if(!busy)busy=build().then(d=>{cache={t:Date.now(),d};}).finally(()=>{busy=null;});
  await busy;return cache.d;
}
http.createServer(async(req,res)=>{
  if(req.url.startsWith("/api/data")){
    try{if(!KEY)throw new Error("ODDSPAPI_KEY not set");res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(await data()));}
    catch(e){res.writeHead(500,{"content-type":"application/json"});res.end(JSON.stringify({error:e.message}));}
    return;
  }
  fs.readFile(path.join(__dirname,"index.html"),(e,b)=>{res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(b);});
}).listen(process.env.PORT||3000);
