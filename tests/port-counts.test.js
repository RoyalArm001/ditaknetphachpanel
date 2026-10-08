'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/shared/domain');

const stateWithPanel=portCount=>{
  const ports=Array.from({length:portCount},(_,i)=>D.port(i+1,`port-${i+1}`));
  return {...D.empty(),floors:[{id:'floor-1',name:'1-ին հարկ',racks:[{id:'rack-1',name:'Rack A',u:12,location:'',photo:'',devices:[{id:'panel-1',name:'PP-01',type:'panel',model:'',color:'#397c78',pos:1,height:1,portList:ports}]}]}]};
};

test('manual patch panel port counts are accepted within the supported range',()=>{
  assert.doesNotThrow(()=>D.validate(stateWithPanel(6)));
  assert.doesNotThrow(()=>D.validate(stateWithPanel(96)));
  assert.throws(()=>D.validate(stateWithPanel(97)));
});
