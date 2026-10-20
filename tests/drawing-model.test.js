const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/shared/domain'),M=require('../src/shared/drawing-model'),Merge=require('../src/shared/merge-state');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
function fixture(){
  const s=D.empty();s.company='Test';s.floors=[{id:'f1',name:'Floor 1',racks:[]},{id:'f2',name:'Floor 2',racks:[]}];
  s.drawings=[{id:'draft',name:'Office',floorId:'f2',sourceName:'office.pdf',image,width:1200,height:800,nodes:[
    {id:'n1',name:'R9.1',kind:'device',service:'internet',notes:'Desk',x:.2,y:.3},
    {id:'n2',name:'W1',kind:'device',service:'wifi',notes:'Ceiling',x:.5,y:.6},
    {id:'n3',name:'Rack',kind:'rack',service:'',notes:'',x:.9,y:.1}
  ],routes:[{id:'r1',name:'C1',notes:'Wall',from:'n1',to:'n3',points:[{x:.2,y:.1}]},{id:'r2',name:'C2',notes:'',from:'n2',to:'n3',points:[{x:.5,y:.1}]}]}];
  return s;
}
test('drafts persist without creating real inventory; validates types and routes',()=>{
  const s=fixture();D.validate(s);assert.equal(D.ports(s).length,0);
  const bad=structuredClone(s);bad.drawings[0].routes[0].to='missing';assert.throws(()=>D.validate(bad),/connection/);
  bad.drawings[0].routes[0].to='n3';bad.drawings[0].nodes[0].x=2;assert.throws(()=>D.validate(bad),/coordinates/);
});
test('export preserves floor, icons, cable bends and maps names to real port markers',()=>{
  const s=fixture(),source=structuredClone(s.drawings[0]);const plan=M.exportToMap(s,'draft',{floorId:'f2'},D);
  assert.equal(plan.floorId,'f2');assert.equal(plan.markers.length,2);assert.equal(plan.rackMarkers.length,1);
  assert.equal(D.mapDevices(s,plan).markers.length,2);
  const sheet=M.mapSheet(s,plan,D);assert.equal(sheet.nodes[0].name,'R9.1');
  assert.deepEqual(sheet.routes[0].points,source.routes[0].points);
  assert.deepEqual(M.routePoints(sheet.routes[0],sheet.nodes),[{x:.2,y:.3},{x:.2,y:.1},{x:.9,y:.1}]);
  assert.equal(s.floors[0].racks.length,0);assert.equal(s.floors[1].racks.length,1);
  assert.ok(D.ports(s).every(x=>x.p.floorId==='f2'&&x.p.status==='used'&&!x.p.switchPortId));
  D.validate(s);
});
test('map copy edits and repeat export never overwrite prior map or original drawing',()=>{
  const s=fixture(),plan=M.exportToMap(s,'draft',{floorId:'f2'},D),copy=M.mapSheet(s,plan,D);
  copy.nodes[0].x=.45;copy.nodes[0].name='R9.2';copy.routes[0].points[0].y=.25;
  M.updateMap(s,plan.id,copy,D);D.validate(s);
  assert.equal(plan.markers[0].iconX,.45);assert.equal(s.drawings[0].nodes[0].x,.2);
  assert.equal(s.drawings[0].nodes[0].name,'R9.1');
  const before=structuredClone(plan);const second=M.exportToMap(s,'draft',{floorId:'f2'},D);
  assert.notEqual(second.id,plan.id);assert.deepEqual(plan,before);assert.notEqual(second.name,plan.name);
  assert.equal(s.drawings[0].lastExportId,second.id);assert.equal(s.floorPlans.length,2);
});
test('existing rack export finds free U space and creates enough panels for 25 devices',()=>{
  const s=fixture(),d=s.drawings[0];d.nodes=Array.from({length:25},(_,i)=>({...d.nodes[0],id:'device'+i,name:'R'+i}));d.routes=[];
  const rack={id:'existing',name:'Existing',u:42,location:'',photo:'',devices:[{id:'sw',name:'SW',type:'switch',model:'',color:'#ffffff',height:1,pos:1,portList:[D.port(1,'swp')]}]};
  s.floors[1].racks.push(rack);M.exportToMap(s,d.id,{floorId:'f2',rackId:rack.id},D);
  assert.equal(rack.devices.length,3);assert.deepEqual(rack.devices.map(d=>d.pos),[1,2,3]);assert.equal(rack.devices[1].portList.length,24);D.validate(s);
});
test('device deletion removes draft routes; inventory deletion prunes transferred routes',()=>{
  const s=fixture(),plan=M.exportToMap(s,'draft',{floorId:'f2'},D);
  M.removeNode(s.drawings[0],'n3');assert.equal(s.drawings[0].routes.length,0);
  D.disconnect(s,new Set([plan.markers[0].portId]));assert.equal(plan.plannedRoutes.length,1);D.validate(s);
});
test('independent device edits merge through existing project synchronization',()=>{
  const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
  local.drawings[0].nodes[0].name='Changed name';remote.drawings[0].nodes[1].x=.8;
  const merged=Merge.merge(base,local,remote);D.validate(merged);
  assert.equal(merged.drawings[0].nodes[0].name,'Changed name');assert.equal(merged.drawings[0].nodes[1].x,.8);
});
test('transferred map routes keep valid marker references across project copy and move',()=>{
  const transfer=require('../src/server/project-transfer'),s=fixture();M.exportToMap(s,'draft',{floorId:'f2'},D);
  const target=D.empty();target.company='Target';
  for(const mode of ['copy','move']){
    const result=transfer.prepare({revision:0,state:s},{revision:0,state:target},{sourceId:'s',targetId:'t',sourceRevision:0,targetRevision:0,mode,rackIds:[s.floors[1].racks[0].id]});
    D.validate(result.source);D.validate(result.target);
    assert.equal(result.target.floorPlans[0].plannedRoutes.length,2);
  }
});
