'use strict';
const D=require('../shared/domain');
const {randomUUID}=require('node:crypto');
const key=value=>String(value).trim().replace(/\s+/g,' ').toLowerCase();
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function unique(name,items,max=200){const names=new Set(items.map(x=>key(x.name)));let result=name,i=2;while(names.has(key(result))){const suffix=` (${i++})`;result=name.slice(0,max-suffix.length)+suffix;}return result;}

// Build both documents before writing either one. Every imported reference gets a new ID.
function prepare(source,target,request){
  if(request.sourceId===request.targetId)fail('Ընտրեք այլ սկզբնական նախագիծ');
  if(!['copy','move'].includes(request.mode)||!Array.isArray(request.rackIds)||!request.rackIds.length||request.rackIds.length>20000||request.rackIds.some(id=>typeof id!=='string')||new Set(request.rackIds).size!==request.rackIds.length)fail('Ընտրեք ռաքերը և ներմուծման եղանակը');
  if(!source||!target)fail('Նախագիծը չի գտնվել',404);
  if(source.revision!==request.sourceRevision||target.revision!==request.targetRevision)fail('Նախագծերը փոխվել են։ Կրկին բացեք ներմուծումը։',409);
  const s=structuredClone(source.state),t=structuredClone(target.state),chosen=new Set(request.rackIds);
  const racks=s.floors.flatMap(f=>f.racks).filter(r=>chosen.has(r.id));
  if(racks.length!==chosen.size)fail('Ընտրված ռաքը չի գտնվել',404);
  const selectedDevices=racks.flatMap(r=>r.devices),deviceIds=new Set(selectedDevices.map(d=>d.id)),portIds=new Set(selectedDevices.flatMap(d=>d.portList.map(p=>p.id)));
  const ids=new Map(),map=id=>{if(!ids.has(id))ids.set(id,randomUUID());return ids.get(id);};
  const summary={floors:0,racks:racks.length,devices:selectedDevices.length,ports:portIds.size,plans:0,detachedLinks:0,renamed:0};
  const rename=(item,others,max)=>{const name=unique(item.name,others,max);if(name!==item.name)summary.renamed++;item.name=name;};
  const floors=new Map();
  const addFloor=id=>{
    if(!id)return '';
    if(floors.has(id))return floors.get(id);
    const f=s.floors.find(x=>x.id===id);if(!f)return '';
    let dest=t.floors.find(x=>key(x.name)===key(f.name));
    if(!dest){dest={...f,id:map(id),racks:[]};t.floors.push(dest);summary.floors++;}
    floors.set(id,dest.id);return dest.id;
  };
  const types=new Map(),services=new Map();
  for(const [field,mapping,prefix,max] of [['deviceTypes',types,'type-',39],['serviceTypes',services,'custom-',64]]){
    t[field]??=[];
    for(const original of s[field]||[]){
      const used=field==='deviceTypes'?selectedDevices.some(d=>d.type===original.id):selectedDevices.some(d=>d.portList.some(p=>p.service===original.id));
      if(!used)continue;
      if(field==='deviceTypes'&&D.deviceTypes(D.empty()).some(([id])=>id===original.id)&&t[field].some(x=>x.id===original.id)){mapping.set(original.id,original.id);continue;}
      const same=t[field].find(x=>JSON.stringify(x)===JSON.stringify(original));
      if(same){mapping.set(original.id,same.id);continue;}
      const item=structuredClone(original);
      if(t[field].some(x=>x.id===item.id))item.id=(prefix+randomUUID().replace(/-/g,'')).slice(0,max);
      if(field==='serviceTypes')rename(item,t[field],80);
      mapping.set(original.id,item.id);t[field].push(item);
    }
  }
  for(const m of s.deviceModels||[]){
    if(!selectedDevices.some(d=>d.type===m.type&&d.model===m.name))continue;
    t.deviceModels??=[];const item={...m,type:types.get(m.type)||m.type};
    if(!t.deviceModels.some(x=>x.type===item.type&&key(x.name)===key(item.name)))t.deviceModels.push(item);
  }
  for(const p of selectedDevices.flatMap(d=>d.portList)){
    const service=services.get(p.service)||p.service;
    t.hiddenServices=(t.hiddenServices||[]).filter(x=>x!==service);
    for(const field of ['serviceIcons','serviceColors','serviceLabels'])if(s[field]?.[p.service]!==undefined){t[field]??={};t[field][service]??=s[field][p.service];}
  }
  const names=D.devices(t).map(({d})=>({name:d.name})),endpoints=D.ports(t).filter(({p})=>p.endpointName?.trim()).map(({p})=>({name:p.endpointName}));
  for(const f of s.floors)for(const rack of f.racks.filter(r=>chosen.has(r.id))){
    const floorId=addFloor(f.id),dest=t.floors.find(x=>x.id===floorId),r=structuredClone(rack);r.id=map(r.id);rename(r,dest.racks);
    for(const d of r.devices){
      d.id=map(d.id);d.type=types.get(d.type)||d.type;rename(d,names);names.push({name:d.name});
      for(const p of d.portList){
        p.id=map(p.id);p.floorId=addFloor(p.floorId);p.service=services.get(p.service)||p.service;
        if(p.switchPortId){if(!portIds.has(p.switchPortId)){p.switchPortId='';summary.detachedLinks++;}else p.switchPortId=map(p.switchPortId);}
        if(p.endpointName?.trim()){const entry={name:p.endpointName};rename(entry,endpoints);p.endpointName=entry.name;endpoints.push(entry);}
      }
    }
    dest.racks.push(r);
  }
  t.networks??=[];
  for(const n of s.networks||[]){
    const hosts=n.hosts.filter(h=>deviceIds.has(h.deviceId));
    if(!hosts.length&&!selectedDevices.some(d=>d.portList.some(p=>p.vlan===n.vlan)))continue;
    let dest=t.networks.find(x=>x.vlan===n.vlan);
    if(dest&&JSON.stringify(dest.ip)!==JSON.stringify(n.ip))fail('Նույն VLAN-ը նախագծերում ունի տարբեր հասցեներ։ Նախ ուղղեք ցանցերը։');
    if(!dest){dest={...structuredClone(n),id:map(n.id),hosts:[]};rename(dest,t.networks);t.networks.push(dest);}
    if(n.deviceTypes)dest.deviceTypes=[...new Set([...(dest.deviceTypes||[]),...n.deviceTypes.map(id=>types.get(id)||id).filter(id=>D.deviceTypes(t).some(([k])=>k===id))])];
    for(const h of hosts){
      if(dest.hosts.some(x=>x.ip===h.ip))fail('Ներմուծվող սարքի IP հասցեն արդեն զբաղված է նպատակային ցանցում։');
      const copy={...h,id:map(h.id),deviceId:map(h.deviceId)};rename(copy,dest.hosts);dest.hosts.push(copy);
    }
  }
  t.floorPlans??=[];
  for(const plan of s.floorPlans||[]){
    const markers=plan.markers.filter(m=>portIds.has(m.portId));
    const rackMarkers=(plan.rackMarkers||[]).filter(rm=>chosen.has(rm.rackId));
    if(!markers.length&&!rackMarkers.length)continue;
    const copy={...plan,id:map(plan.id),floorId:addFloor(plan.floorId),markers:markers.map(m=>({...m,id:map(m.id),portId:map(m.portId)})),rackMarkers:rackMarkers.map(rm=>({...rm,id:map(rm.id),rackId:map(rm.rackId)}))};
    if(plan.plannedRoutes){
      const present=new Set([...markers,...rackMarkers].map(m=>m.id));
      copy.plannedRoutes=plan.plannedRoutes.filter(r=>present.has(r.from)&&present.has(r.to)).map(r=>({...structuredClone(r),id:map(r.id),from:map(r.from),to:map(r.to)}));
      delete copy.drawingSourceId;
    }
    rename(copy,t.floorPlans);t.floorPlans.push(copy);summary.plans++;
  }
  if(request.mode==='move'){
    for(const f of s.floors)f.racks=f.racks.filter(r=>!chosen.has(r.id));
    for(const {p} of D.ports(s))if(portIds.has(p.switchPortId)){p.switchPortId='';summary.detachedLinks++;}
    for(const n of s.networks||[])n.hosts=n.hosts.filter(h=>!deviceIds.has(h.deviceId));
    for(const plan of s.floorPlans||[]){
      plan.markers=plan.markers.filter(m=>!portIds.has(m.portId));
      if(plan.rackMarkers)plan.rackMarkers=plan.rackMarkers.filter(rm=>!chosen.has(rm.rackId));
    }
    for(const f of s.floors)if(f.linkedRackIds)f.linkedRackIds=f.linkedRackIds.filter(id=>!chosen.has(id));
  }
  require('../shared/drawing-model').pruneMapRoutes(s);
  D.validate(s);D.validate(t);
  const max=request.maxBytes||4*1024*1024;
  if([s,t].some(state=>Buffer.byteLength(JSON.stringify({state,revision:0}))>max))fail('Ներմուծումից հետո նախագիծը գերազանցում է պահպանման չափի սահմանը։',413);
  return {source:s,target:t,summary};
}

// Lock projects in a fixed order; history and both revisions commit together.
async function transferPostgres(pool,owner,request){
  const client=await pool.connect(),account=owner!==null;
  const table=account?'rackmap.personal_companies':'rackmap.companies',history=account?'rackmap.personal_history':'rackmap.company_history';
  const args=id=>account?[id,owner]:[id],where=account?'id=$1 AND user_id=$2':'id=$1';
  try{
    await client.query('BEGIN');const rows=new Map();
    for(const id of [request.sourceId,request.targetId].sort()){
      const row=(await client.query(`SELECT revision,body FROM ${table} WHERE ${where} FOR UPDATE`,args(id))).rows[0];
      rows.set(id,row?{revision:Number(row.revision),state:row.body}:null);
    }
    const result=prepare(rows.get(request.sourceId),rows.get(request.targetId),request);
    const writes=[[request.targetId,result.target]];if(request.mode==='move')writes.push([request.sourceId,result.source]);
    for(const [id,state] of writes){
      const current=rows.get(id),rev=current.revision;
      if(account){
        await client.query(`INSERT INTO ${history}(user_id,company_id,revision,body) VALUES($1,$2,$3,$4)`,[owner,id,rev,JSON.stringify(current.state)]);
        await client.query(`DELETE FROM ${history} WHERE user_id=$1 AND company_id=$2 AND revision<$3`,[owner,id,rev-49]);
        await client.query(`UPDATE ${table} SET body=$3,revision=$4 WHERE user_id=$1 AND id=$2`,[owner,id,JSON.stringify(state),rev+1]);
      }else{
        await client.query(`INSERT INTO ${history}(company_id,revision,body) VALUES($1,$2,$3)`,[id,rev,JSON.stringify(current.state)]);
        await client.query(`DELETE FROM ${history} WHERE company_id=$1 AND revision<$2`,[id,rev-49]);
        await client.query(`UPDATE ${table} SET body=$2,revision=$3 WHERE id=$1`,[id,JSON.stringify(state),rev+1]);
      }
    }
    await client.query('COMMIT');return {state:result.target,revision:request.targetRevision+1,summary:result.summary};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
function transferLocal(db,read,request){
  db.exec('BEGIN IMMEDIATE');
  try{
    const source=read(request.sourceId),target=read(request.targetId),result=prepare(source,target,request);
    const writes=[[request.targetId,target,result.target]];if(request.mode==='move')writes.push([request.sourceId,source,result.source]);
    for(const [id,current,state] of writes){
      db.prepare('INSERT INTO company_history VALUES(?,?,?,?)').run(id,current.revision,new Date().toISOString(),JSON.stringify(current.state));
      db.prepare('DELETE FROM company_history WHERE company_id=? AND revision<?').run(id,current.revision-49);
      db.prepare('UPDATE companies SET body=?,revision=? WHERE id=?').run(JSON.stringify(state),current.revision+1,id);
    }
    db.exec('COMMIT');return {state:result.target,revision:request.targetRevision+1,summary:result.summary};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={prepare,transferPostgres,transferLocal};
