(function(root,factory){
  if(typeof module==='object')module.exports=factory();
  else root.RackDrawingModel=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const tr=text=>globalThis.RackI18n?.t(text)||text;
  const clamp=v=>Math.max(0,Math.min(1,v));
  const point=p=>({x:clamp(p.x),y:clamp(p.y)});
  const freshId=()=>globalThis.crypto.randomUUID();
  function routePoints(route,nodes){
    const from=nodes.find(n=>n.id===route.from),to=nodes.find(n=>n.id===route.to);
    return from&&to?[point(from),...(route.points||[]).map(point),point(to)]:[];
  }
  function removeNode(sheet,id){
    sheet.nodes=sheet.nodes.filter(n=>n.id!==id);
    sheet.routes=sheet.routes.filter(r=>r.from!==id&&r.to!==id);
  }
  function pruneMapRoutes(state){
    for(const plan of state.floorPlans||[])if(plan.plannedRoutes){
      const ids=new Set([...plan.markers,...(plan.rackMarkers||[])].map(m=>m.id));
      plan.plannedRoutes=plan.plannedRoutes.filter(r=>ids.has(r.from)&&ids.has(r.to));
    }
  }
  function uniqueName(value,used){
    const base=String(value).trim().slice(0,180)||'Plan';
    const names=new Set(used.map(v=>String(v).trim().replace(/\s+/g,' ').toLowerCase()));
    let name=base,i=2;
    while(names.has(name.toLowerCase()))name=base+' ('+(i++)+')';
    return name;
  }
  function validate(state,h){
    const {id,name,text,integer,assert,hasService}=h;
    const position=p=>assert(p&&[p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Invalid drawing coordinates');
    function routes(list,nodes){
      assert(Array.isArray(list)&&list.length<=2000,'Invalid drawing routes');
      for(const r of list){
        id(r.id);name(r.name);text(r.notes,2000);
        assert(r.from!==r.to&&nodes.has(r.from)&&nodes.has(r.to),'Invalid drawing connection');
        assert(Array.isArray(r.points)&&r.points.length<=128,'Invalid drawing bends');
        r.points.forEach(position);
      }
    }
    if(state.drawings!==undefined){
      assert(Array.isArray(state.drawings)&&state.drawings.length<=30,'Maximum 30 drawings');
      for(const sheet of state.drawings){
        id(sheet.id);name(sheet.name);text(sheet.floorId);text(sheet.sourceName);
        assert(!sheet.floorId||state.floors.some(f=>f.id===sheet.floorId),'Invalid drawing floor');
        integer(sheet.width,1,3000);integer(sheet.height,1,3000);text(sheet.image,2500000);
        assert(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(sheet.image),'Invalid drawing image');
        assert(Array.isArray(sheet.nodes)&&sheet.nodes.length<=1000,'Maximum 1000 drawing devices');
        const ids=new Set();
        for(const n of sheet.nodes){
          id(n.id);name(n.name);text(n.notes,2000);position(n);ids.add(n.id);
          assert(n.kind==='rack'||n.kind==='device','Invalid drawing device');
          assert(typeof n.service==='string'&&(n.kind==='rack'||hasService(state,n.service)),'Invalid drawing device type');
        }
        routes(sheet.routes,ids);
      }
    }
    for(const plan of state.floorPlans||[])if(plan.plannedRoutes!==undefined){
      routes(plan.plannedRoutes,new Set([...(plan.markers||[]),...(plan.rackMarkers||[])].map(m=>m.id)));
    }
  }
  function mapSheet(state,plan,D){
    const ports=new Map(D.ports(state).map(x=>[x.p.id,x]));
    const racks=new Map(state.floors.flatMap(f=>f.racks).map(r=>[r.id,r]));
    return {...plan,nodes:[
      ...plan.markers.filter(m=>ports.has(m.portId)).map(m=>{
        const {p}=ports.get(m.portId);
        return {id:m.id,kind:'device',service:p.service||'',name:p.endpointName||p.cable||String(p.number),notes:p.notes||'',...point(m)};
      }),
      ...(plan.rackMarkers||[]).filter(m=>racks.has(m.rackId)).map(m=>({id:m.id,kind:'rack',service:'',name:racks.get(m.rackId).name,notes:'',...point(m)}))
    ],routes:plan.plannedRoutes||[]};
  }
  // Updates the map's own copy; no reverse synchronization with the source draft.
  function updateMap(state,planId,sheet,D){
    const plan=state.floorPlans.find(p=>p.id===planId);
    if(!plan)throw new Error(tr('Հատակագիծը չի գտնվել'));
    const nodes=new Map(sheet.nodes.map(n=>[n.id,n]));
    for(const marker of [...plan.markers,...(plan.rackMarkers||[])]){
      const n=nodes.get(marker.id);if(!n)continue;
      if(marker.x!==n.x||marker.y!==n.y)Object.assign(marker,point(n),{iconX:n.x,iconY:n.y});
      if(marker.portId){
        const p=D.ports(state).find(x=>x.p.id===marker.portId)?.p;
        if(p)Object.assign(p,{endpointName:n.name,service:n.service,notes:n.notes});
      }
    }
    plan.plannedRoutes=structuredClone(sheet.routes);
  }
  function exportToMap(state,sheetId,options,D,uid=freshId){
    const sheet=state.drawings?.find(s=>s.id===sheetId),floor=state.floors.find(f=>f.id===options.floorId);
    if(!sheet||!floor)throw new Error(tr('Ընտրեք հարկը'));
    if((state.floorPlans||[]).length>=30)throw new Error(tr('Առավելագույնը՝ 30 հատակագիծ'));
    const plan={id:uid(),name:uniqueName(sheet.name,(state.floorPlans||[]).map(p=>p.name)),floorId:floor.id,
      width:sheet.width,height:sheet.height,image:sheet.image,markers:[],rackMarkers:[],plannedRoutes:[],drawingSourceId:sheet.id};
    const newRack=name=>{
      const r={id:uid(),name:uniqueName(name,floor.racks.map(r=>r.name)),u:42,location:'',photo:'',devices:[]};
      floor.racks.push(r);return r;
    };
    const rackNodes=sheet.nodes.filter(n=>n.kind==='rack'),racks=new Map(),markerIds=new Map();
    for(const n of rackNodes){
      const rack=newRack(n.name),marker={id:uid(),rackId:rack.id,...point(n)};
      racks.set(n.id,rack);markerIds.set(n.id,marker.id);plan.rackMarkers.push(marker);
    }
    let fallback=options.rackId?floor.racks.find(r=>r.id===options.rackId):null;
    if(options.rackId&&!fallback)throw new Error(tr('Ընտրեք այս հարկի ռաքը'));
    const endpoints=sheet.nodes.filter(n=>n.kind==='device'),batches=new Map();
    for(const n of endpoints){
      const linkedRacks=new Set(sheet.routes.filter(r=>r.from===n.id||r.to===n.id).map(r=>r.from===n.id?r.to:r.from).filter(id=>racks.has(id)));
      if(linkedRacks.size>1)throw new Error(tr('Սարքը միացրեք մեկ ռաքի՝ քարտեզ տեղափոխելու համար։'));
      const rack=linkedRacks.size?racks.get([...linkedRacks][0]):(fallback||=racks.values().next().value||newRack(options.rackName||sheet.name));
      if(!batches.has(rack))batches.set(rack,[]);
      batches.get(rack).push(n);
    }
    const endpointNames=D.ports(state).map(x=>x.p.endpointName),deviceNames=D.devices(state).map(x=>x.d.name);
    for(const [rack,nodes]of batches){
      for(let i=0;i<nodes.length;i+=24){
        const chunk=nodes.slice(i,i+24),pos=Array.from({length:rack.u},(_,j)=>j+1).find(u=>!rack.devices.some(d=>u>=d.pos&&u<d.pos+d.height));
        if(!pos)throw new Error(tr('Ռաքում ազատ U դիրք չկա։ Ընտրեք այլ ռաք։'));
        const panel={id:uid(),name:uniqueName('PLAN · '+sheet.name,deviceNames),type:'panel',model:'',color:'#167d8d',pos,height:1,portList:[]};
        deviceNames.push(panel.name);
        chunk.forEach((n,index)=>{
          const name=uniqueName(n.name,endpointNames);endpointNames.push(name);
          const route=sheet.routes.find(r=>r.from===n.id||r.to===n.id);
          const p={...D.port(index+1,uid()),status:'used',service:n.service,endpointName:name,floorId:floor.id,notes:n.notes,cable:route?.name||''};
          panel.portList.push(p);
          const marker={id:uid(),portId:p.id,...point(n),iconX:n.x,iconY:n.y};
          plan.markers.push(marker);markerIds.set(n.id,marker.id);
        });
        rack.devices.push(panel);
      }
    }
    plan.plannedRoutes=sheet.routes.map(r=>({...structuredClone(r),id:uid(),from:markerIds.get(r.from),to:markerIds.get(r.to)}));
    (state.floorPlans||=[]).push(plan);
    sheet.lastExportId=plan.id;
    D.validate(state);
    return plan;
  }
  return {point,routePoints,removeNode,pruneMapRoutes,uniqueName,validate,mapSheet,updateMap,exportToMap};
});
