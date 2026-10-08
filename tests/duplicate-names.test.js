'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/shared/domain');

const device=(id,name,portName='')=>({
  id,name,type:'panel',model:'',color:'#397c78',pos:1,height:1,
  portList:Array.from({length:12},(_,i)=>({...D.port(i+1,`${id}-port-${i+1}`),...(i===0&&portName?{status:'used',endpointName:portName}: {})}))
});
const project=()=>({...D.empty(),floors:[
  {id:'floor-1',name:'1-ին հարկ',racks:[{id:'rack-1',name:'Rack A',u:12,location:'',photo:'',devices:[]}]},
  {id:'floor-2',name:'2-րդ հարկ',racks:[{id:'rack-2',name:'Rack B',u:12,location:'',photo:'',devices:[]}]}
]});

test('device names are unique across racks regardless of case and spacing',()=>{
  const state=project();
  state.floors[0].racks[0].devices.push(device('device-1','Door'));
  state.floors[1].racks[0].devices.push(device('device-2','  dOoR  '));
  assert.throws(()=>D.validate(state),/Անվանումները պետք է տարբեր լինեն/);
});

test('endpoint names are unique across the project regardless of case',()=>{
  const state=project();
  state.floors[0].racks[0].devices.push(device('device-1','Panel 1','Door'));
  state.floors[1].racks[0].devices.push(device('device-2','Panel 2','door'));
  assert.throws(()=>D.validate(state),/Անվանումները պետք է տարբեր լինեն/);
});

test('different physical names remain valid',()=>{
  const state=project();
  state.floors[0].racks[0].devices.push(device('device-1','Door 1','Door A'));
  state.floors[1].racks[0].devices.push(device('device-2','Door 2','Door B'));
  assert.doesNotThrow(()=>D.validate(state));
});
