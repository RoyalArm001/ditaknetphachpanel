'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/shared/domain');
const {prepare,transferLocal,transferPostgres}=require('../src/server/project-transfer');
const {DatabaseSync}=require('node:sqlite');
function fixture(){
  const dev=(id,type,pos=1)=>({id,name:id,type,model:'Model',color:'#397c78',pos,height:1,portList:[{...D.port(1,id+'-p'),status:'used',service:'wifi',endpointName:id+' outlet'}]});
  const rack=(id,devices)=>({id,name:id,u:42,location:'Room',photo:'',devices});
  const state={...D.empty(),company:'Source',floors:[{id:'f1',name:'-1',racks:[rack('r1',[dev('panel','panel'),dev('switch','switch',2)])]},{id:'f2',name:'1',racks:[rack('r2',[dev('outside','panel')])]}]};
  state.floors[0].racks[0].devices[0].portList[0].switchPortId='switch-p';
  state.floors[0].racks[0].devices[0].portList[0].floorId='f2';
  state.networks=[{id:'net',name:'WiFi',vlan:'10',ip:'192.168.1.0/24',hosts:[{id:'host',name:'Switch',ip:'192.168.1.2',username:'admin',password:'kept-private',deviceId:'switch'}]}];
  state.floorPlans=[{id:'plan',name:'Basement',floorId:'f1',width:100,height:100,image:'data:image/png;base64,YQ==',markers:[{id:'m1',portId:'panel-p',x:.5,y:.5,iconX:.6,iconY:.6},{id:'m2',portId:'outside-p',x:.7,y:.8}]}];
  return D.validate(state);
}
const request=(extras={})=>({sourceId:'source',targetId:'target',sourceRevision:0,targetRevision:0,mode:'move',rackIds:['r1'],...extras});
const wrap=state=>({revision:0,state});
const target=()=>({...D.empty(),company:'Target'});
test('move remaps racks, internal links, floor references, hosts and only selected map markers',()=>{
  const original=fixture(),before=structuredClone(original),result=prepare(wrap(original),wrap(target()),request());
  assert.deepEqual(original,before);D.validate(result.source);D.validate(result.target);
  assert.equal(result.source.floors[0].racks.length,0);assert.equal(result.source.floors[1].racks.length,1);
  const imported=D.devices(result.target),panel=imported.find(({d})=>d.type==='panel').d,sw=imported.find(({d})=>d.type==='switch').d;
  assert.notEqual(panel.id,'panel');assert.equal(panel.portList[0].switchPortId,sw.portList[0].id);
  assert.equal(result.target.floors.find(f=>f.id===panel.portList[0].floorId).name,'1');
  assert.equal(result.target.networks[0].hosts[0].deviceId,sw.id);assert.equal(result.target.networks[0].hosts[0].password,'kept-private');
  assert.equal(result.source.networks[0].hosts.length,0);
  assert.equal(result.target.floorPlans[0].markers[0].portId,panel.portList[0].id);
  assert.equal(result.target.floorPlans[0].markers.length,1);assert.equal(result.source.floorPlans[0].markers[0].portId,'outside-p');
  assert.equal(result.summary.racks,1);assert.equal(result.summary.devices,2);
});
test('copy keeps source unchanged and safely renames duplicate devices, racks and endpoints',()=>{
  const original=fixture(),dest=fixture();dest.networks=[];dest.floorPlans=[];
  const result=prepare(wrap(original),wrap(dest),request({mode:'copy'}));
  assert.deepEqual(result.source,original);assert.equal(D.devices(result.target).length,5);assert.ok(result.summary.renamed>=5);D.validate(result.target);
});
test('move detaches inbound and outbound cross-project links',()=>{
  const original=fixture();D.devices(original)[0].d.portList[0].switchPortId='';
  D.devices(original)[2].d.portList[0].switchPortId='switch-p';
  const incoming=prepare(wrap(original),wrap(target()),request());
  assert.equal(D.ports(incoming.source)[0].p.switchPortId,'');assert.equal(incoming.summary.detachedLinks,1);
  const outgoing=prepare(wrap(original),wrap(target()),request({rackIds:['r2']}));
  assert.equal(D.ports(outgoing.target)[0].p.switchPortId,'');assert.equal(outgoing.summary.detachedLinks,1);
});
test('custom types, models and service metadata survive collisions',()=>{
  const original=fixture(),dest=target(),device=D.devices(original)[0].d;
  device.type='sensor';device.portList[0].switchPortId='';device.portList[0].service='custom-sensor';
  original.deviceTypes=[{id:'sensor',name:'Sensor'}];original.deviceModels=[{type:'sensor',name:'Model',ports:1}];
  original.serviceTypes=[{id:'custom-sensor',name:'Sensor',color:'#112233'}];original.serviceIcons={'custom-sensor':'wifi'};
  dest.deviceTypes=[{id:'sensor',name:'Different'}];dest.serviceTypes=[{id:'custom-sensor',name:'Sensor',color:'#334455'}];
  const result=prepare(wrap(original),wrap(dest),request()),copy=D.devices(result.target)[0].d;
  assert.notEqual(copy.type,'sensor');assert.notEqual(copy.portList[0].service,'custom-sensor');
  assert.equal(result.target.deviceModels[0].type,copy.type);assert.equal(result.target.serviceIcons[copy.portList[0].service],'wifi');D.validate(result.target);
});
test('rejects stale revisions, invalid selections, same project, VLAN/IP conflicts and oversized imports',()=>{
  for(const change of [{sourceRevision:1},{targetRevision:1},{rackIds:[]},{rackIds:['r1','r1']},{rackIds:['missing']},{mode:'invalid'},{targetId:'source'},{maxBytes:100}])assert.throws(()=>prepare(wrap(fixture()),wrap(target()),request(change)));
  const dest=target();dest.networks=structuredClone(fixture().networks);dest.networks[0].hosts=[];dest.networks[0].ip='10.0.0.0/24';
  assert.throws(()=>prepare(wrap(fixture()),wrap(dest),request()),/VLAN/);
  dest.networks=structuredClone(fixture().networks);dest.networks[0].hosts[0].deviceId='';
  assert.throws(()=>prepare(wrap(fixture()),wrap(dest),request()),/IP/);
});
function memoryStore(){
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE companies(id TEXT PRIMARY KEY,revision INTEGER,body TEXT); CREATE TABLE company_history(company_id TEXT,revision INTEGER,saved_at TEXT,body TEXT,PRIMARY KEY(company_id,revision));');
  for(const [id,state] of [['source',fixture()],['target',target()]])db.prepare('INSERT INTO companies VALUES(?,0,?)').run(id,JSON.stringify(state));
  const read=id=>{const row=db.prepare('SELECT * FROM companies WHERE id=?').get(id);return row?{revision:row.revision,state:JSON.parse(row.body)}:null;};
  return {db,read,transfer:r=>transferLocal(db,read,r),list:()=>['source','target'].map(id=>({id,...read(id),name:read(id).state.company})),close:()=>db.close()};
}
test('atomic SQLite move saves both histories and retry is rejected',t=>{
  const store=memoryStore();t.after(()=>store.close());
  const result=store.transfer(request());assert.equal(result.revision,1);assert.equal(store.read('source').revision,1);assert.equal(store.read('target').revision,1);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM company_history').get().n,2);
  assert.throws(()=>store.transfer(request()),e=>e.status===409);assert.equal(store.read('target').revision,1);
});
test('failure writing the second document rolls back both documents and history',t=>{
  const store=memoryStore();t.after(()=>store.close());
  store.db.exec("CREATE TRIGGER fail_move BEFORE UPDATE ON companies WHEN new.id='source' BEGIN SELECT RAISE(ABORT,'write failed'); END;");
  assert.throws(()=>store.transfer(request()),/write failed/);assert.equal(store.read('target').revision,0);assert.equal(store.read('source').revision,0);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM company_history').get().n,0);
});
test('PostgreSQL transfer locks in order, scopes all personal queries and rolls back on errors',async()=>{
  for(const owner of [null,'alice']){
    const queries=[];let released=false,failWrite=false;
    const client={release:()=>{released=true;},query:async(sql,args)=>{
      queries.push({sql,args});if(failWrite&&sql.startsWith('UPDATE'))throw new Error('write failed');
      return {rows:sql.startsWith('SELECT')?[{revision:0,body:args[0]==='source'?fixture():target()}]:[]};
    }},pool={connect:async()=>client};
    const result=await transferPostgres(pool,owner,request());assert.equal(result.revision,1);assert.ok(released);assert.equal(queries.at(-1).sql,'COMMIT');
    const locks=queries.filter(q=>q.sql.includes('FOR UPDATE'));assert.deepEqual(locks.map(q=>q.args[0]),['source','target']);
    if(owner)for(const q of queries.filter(q=>q.args)){assert.ok(q.sql.includes('user_id'));assert.ok(q.args.includes('alice'));assert.ok(q.sql.includes('personal_'));}
    queries.length=0;failWrite=true;await assert.rejects(transferPostgres(pool,owner,request()),/write failed/);assert.equal(queries.at(-1).sql,'ROLLBACK');
  }
});
test('import API preview is read-only, enforces both project permissions and records the move',async t=>{
  const store=memoryStore();let allowed=['target'];store.pinAccess=async()=>({role:'user',ids:allowed});
  const server=require('../src/server/server').createApp({cloud:true,store,auth:{authenticate:async()=>({id:'staff',method:'pin'})}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const base='http://127.0.0.1:'+server.address().port+'/api/projects/import?company=target';
  const send=body=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'&source=source')).status,404);
  assert.equal((await send({...request(),preview:false})).status,404);
  allowed=['source'];assert.equal((await send({...request(),preview:false})).status,404);
  allowed=['source','target'];const tree=await (await fetch(base+'&source=source')).json();assert.equal(tree.floors[0].racks[0].devices,2);assert.ok(!JSON.stringify(tree).includes('kept-private'));
  const preview=await send({...request(),preview:true});assert.equal(preview.status,200);assert.equal((await preview.json()).summary.racks,1);assert.equal(store.read('source').revision,0);
  const apply=await send({...request(),preview:false});assert.equal(apply.status,200);assert.equal((await apply.json()).revision,1);
  const entries=await require('../src/server/security-store').securityStore(store).list('shared');assert.equal(entries.length,1);assert.equal(entries[0].action,'project.move');
  assert.equal((await send({...request(),preview:false})).status,409);
});
