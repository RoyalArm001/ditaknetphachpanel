'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/shared/domain');
const {inspect}=require('../src/shared/connection-report');

const device=(id,type,ports,pos=1)=>({id,name:id,type,model:'',color:'#397c78',pos,height:1,portList:ports.map((status,i)=>({...D.port(i+1,`${id}-${i+1}`),status}))});
const fixture=()=>{
  const state=D.empty();
  state.floors=[{id:'floor',name:'Floor',racks:[
    {id:'rack-a',name:'A',u:12,location:'',photo:'',devices:[device('panel-a','panel',['used','used','used','used'],1),device('switch-a','switch',['used','used'],2)]},
    {id:'rack-b',name:'B',u:12,location:'',photo:'',devices:[device('panel-b','panel',['used'],1),device('switch-b','switch',['used'],2)]}
  ]}];
  return state;
};

test('connection audit separates linked, unlinked, duplicate and invalid links',()=>{
  const state=fixture();
  const [a,b]=state.floors[0].racks;
  a.devices[0].portList[0].switchPortId='switch-a-1';
  a.devices[0].portList[1].switchPortId='switch-a-1';
  a.devices[0].portList[2].switchPortId='missing';
  b.devices[0].portList[0].switchPortId='switch-b-1';
  const result=inspect(state);
  assert.deepEqual(result.summary,{linked:1,unlinked:2,duplicate:2,wrong:1});
  assert.deepEqual(result.records.find(row=>row.id==='panel-a-2').issues,['duplicate']);
  assert.deepEqual(result.records.find(row=>row.id==='panel-a-3').issues,['wrong']);
  assert.equal(result.records.find(row=>row.id==='switch-b-1'),undefined);
});

test('rack audit includes a cross-rack link and excludes unrelated racks',()=>{
  const state=fixture();
  const [a,b]=state.floors[0].racks;
  a.devices[0].portList[0].switchPortId='switch-b-1';
  const result=inspect(state,'rack-b');
  assert.equal(result.summary.linked,1);
  assert.equal(result.records.some(row=>row.id==='panel-a-1'),true);
  assert.equal(result.records.some(row=>row.id==='panel-a-2'),false);
});

test('connection audit flags links originating from a network device',()=>{
  const state=fixture();
  state.floors[0].racks[0].devices[1].portList[0].switchPortId='switch-b-1';
  assert.deepEqual(inspect(state).records.find(row=>row.id==='switch-a-1').issues,['wrong']);
});

test('router port connects to a switch port without errors',()=>{
  const state=fixture();
  const rack=state.floors[0].racks[0];
  rack.devices[0].pos=1;
  rack.devices[1].pos=2;
  const router=device('router-1','router',['used','used']);
  router.pos=3;
  rack.devices.push(router);
  router.portList[0].switchPortId='switch-a-1';
  D.validate(state);
  const result=inspect(state);
  assert.equal(result.records.find(row=>row.id==='router-1-1')?.issues.length,0);
  const rows=D.rows(state);
  assert.equal(rows.find(x=>x.p.id==='router-1-1').status,'used');
  assert.equal(rows.find(x=>x.p.id==='switch-a-1').status,'used');
});

