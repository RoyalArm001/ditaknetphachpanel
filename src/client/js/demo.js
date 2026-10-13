'use strict';
(function(root){
  const D=root.RackDomain||(typeof require==='function'?require('../../shared/domain'):null);
  function fixture(){
    const device=(id,type,pos,count,sfp=0)=>({id,name:id.toUpperCase(),type,model:type==='router'?'Demo Gateway':type==='switch'?'Demo PoE Switch':'Cat6 Demo',pos,height:1,color:'#397c78',sfpCount:sfp,modelType:type==='switch'?'poe':'',portList:Array.from({length:count+sfp},(_,i)=>D.port(i+1,id+'-p'+(i+1)))});
    const panel=device('pp-01','panel',12,24),sw=device('sw-01','switch',10,24,2),router=device('rt-01','router',11,8,1);
    const s={...D.empty(),company:'Demo Office',floors:[{id:'demo-f1',name:'1',racks:[{id:'demo-r1',name:'Main Rack',u:12,location:'Office',photo:'',devices:[panel,router,sw]}]},{id:'demo-f2',name:'2',racks:[{id:'demo-r2',name:'Floor 2 Rack',u:12,location:'Meeting rooms',photo:'',devices:[device('pp-02','panel',12,12),device('sw-02','switch',10,8)]}]}]};
    for(let i=0;i<8;i++){Object.assign(panel.portList[i],{status:'used',endpointName:(i<4?'WiFi Zone ':'Camera ')+(i+1),cable:'LAN-'+String(i+1).padStart(3,'0'),floorId:'demo-f1',room:'Room '+(i+1),service:i<4?'wifi':'camera',vlan:i<4?'10':'20',switchPortId:sw.portList[i].id});sw.portList[i].status='used';}
    s.networks=[{id:'demo-net1',name:'Office WiFi',vlan:'10',ip:'192.168.10.0/24',hosts:[{id:'demo-host',name:'Gateway',ip:'192.168.10.1',username:'',password:'',deviceId:router.id}]},{id:'demo-net2',name:'Cameras',vlan:'20',ip:'192.168.20.0/24',hosts:[]}];
    return D.validate(s);
  }
  function createStore(seed=fixture()){
    let data=new Map([['demo',{state:structuredClone(seed),revision:0}]]),history=new Map();
    const error=(message,code=400)=>{const e=new Error(message);e.code=code;throw e;};
    const list=()=>[...data].map(([id,x])=>({id,name:x.state.company,revision:x.revision,floorCount:x.state.floors.length}));
    return {reset(){data=new Map([['demo',{state:structuredClone(seed),revision:0}]]);history.clear();},async request(path,options={}){
      const url=new URL(path,'https://demo.invalid'),id=url.searchParams.get('company')||'demo',method=options.method||'GET',body=options.body?JSON.parse(options.body):{},row=data.get(id);
      if(url.pathname==='/api/companies'){
        if(method==='GET')return list();
        if(method==='DELETE'){if(!row)error('Նախագիծը չի գտնվել',404);if(row.revision!==body.revision)error('Նախագիծը փոխվել է։ Թարմացրեք էջը և կրկին փորձեք։',409);if(!body.name||body.name!==row.state.company)error('Հաստատման համար գրեք նախագծի ճշգրիտ անվանումը։');data.delete(id);history.delete(id);return {ok:true};}
        if(method==='POST'){const name=String(body.name||'').trim();if(!name||name.length>200||!Number.isInteger(body.floorCount)||body.floorCount<1||body.floorCount>200)error('Նշեք անունը և հարկերի քանակը');if(list().some(x=>x.name.toLowerCase()===name.toLowerCase()))error('Այս անունով ընկերություն արդեն կա');const key=root.crypto.randomUUID(),state={...D.empty(),...D.projectStyle(body.style),company:name,floors:Array.from({length:body.floorCount},(_,i)=>({id:root.crypto.randomUUID(),name:String(i+1),racks:[]}))};D.validate(state);data.set(key,{state,revision:0});return {id:key,state:structuredClone(state),revision:0};}
      }
      if(url.pathname==='/api/storage')return {database:'Demo · in memory',backups:'JSON',directory:'Demo'};
      if(url.pathname==='/api/network')return {urls:[]};
      if(url.pathname==='/api/backup/status')return {enabled:false,healthy:false};
      if(['/api/audit','/api/backup/list'].includes(url.pathname))return [];
      if(url.pathname==='/api/backup')return {format:'ditaknet-rackmap-cloud',version:1,companies:[...data].map(([id,x])=>({id,revision:x.revision,body:structuredClone(x.state)})),history:[]};
      if(!row)error('Նախագիծը չի գտնվել',404);
      if(url.pathname==='/api/state'){
        if(method==='GET')return {state:structuredClone(row.state),revision:row.revision,companyId:id};
        if(method==='PUT'){D.validate(body.state);if(row.revision!==body.revision)error('Նախագիծը փոխվել է։ Թարմացրեք էջը և կրկին փորձեք։',409);const versions=history.get(id)||[];versions.unshift({revision:row.revision,saved_at:new Date().toISOString(),body:row.state});history.set(id,versions.slice(0,50));row.state=structuredClone(body.state);row.revision++;return {revision:row.revision};}
      }
      if(url.pathname==='/api/revision')return {revision:row.revision};
      if(url.pathname==='/api/history')return (history.get(id)||[]).map(({revision,saved_at})=>({revision,saved_at}));
      if(url.pathname.startsWith('/api/history/')){const item=(history.get(id)||[]).find(x=>x.revision===Number(url.pathname.split('/').pop()));if(item)return {state:structuredClone(item.body)};}
      error('Դեմո ռեժիմում այս գործողությունը հասանելի չէ։',403);
    }};
  }
  if(typeof module==='object'){module.exports={fixture,createStore};return;}
  const enabled=new URLSearchParams(location.search).get('demo')==='1';
  root.RackDemo={enabled};if(!enabled)return;
  const seed=fixture(),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=700;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f8fa';ctx.fillRect(0,0,1200,700);ctx.lineWidth=8;ctx.strokeStyle='#547477';ctx.strokeRect(40,40,1120,620);ctx.font='24px sans-serif';
  for(let i=0;i<8;i++){const x=60+(i%4)*275,y=60+Math.floor(i/4)*310;ctx.strokeRect(x,y,250,270);ctx.fillStyle='#547477';ctx.fillText('Room '+(i+1),x+22,y+40);}
  seed.floorPlans=[{id:'demo-plan',name:'Office Plan',floorId:'demo-f1',width:1200,height:700,image:canvas.toDataURL('image/png'),markers:Array.from({length:8},(_,i)=>({id:'demo-marker'+i,portId:'pp-01-p'+(i+1),x:(180+(i%4)*275)/1200,y:(210+Math.floor(i/4)*310)/700}))}];
  Object.assign(root.RackDemo,createStore(seed));
  // Any API path in this demo tab is resolved in memory, including direct fetch callers.
  const fetchReal=root.fetch.bind(root);root.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return fetchReal(input,options);
    try{const result=await root.RackDemo.request(url.href,{method:options.method||input.method||'GET',body:options.body||(input instanceof Request&&input.method!=='GET'?await input.clone().text():undefined)});return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});}
    catch(e){return new Response(JSON.stringify({error:e.message}),{status:e.code||400,headers:{'Content-Type':'application/json'}});}
  };
})(globalThis);
