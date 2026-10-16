'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const D=require('../src/shared/domain'),{fixture}=require('./fixtures/handover');
const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');

test('selected unassigned ports and both ends of a connection expose pressed state',()=>{
  const state=fixture(),selectedPortIds=new Set(['Panel A-1','Panel A-10']);
  const elements=['Panel A-1','Panel A-10','Switch A-1','Switch A-2'].map(id=>({dataset:{id},classes:new Set(),attributes:{},style:{setProperty(){}},setAttribute(k,v){this.attributes[k]=v;}}));
  for(const el of elements)el.classList={remove:(...xs)=>xs.forEach(x=>el.classes.delete(x)),add:x=>el.classes.add(x),contains:x=>el.classes.has(x),toggle:(x,on)=>on?el.classes.add(x):el.classes.delete(x)};
  const paint=vm.runInNewContext('('+source.slice(source.indexOf('function paintPorts(){'),source.indexOf('function renderPortTools(){'))+')',{state,D,selectedPortIds,selectedPortId:'',document:{querySelectorAll:()=>elements}});
  paint();
  assert.deepEqual(elements.map(x=>x.attributes['aria-pressed']),['true','true','true','false']);
  assert.equal(elements[1].classes.has('port-selected'),true);
  selectedPortIds.delete('Panel A-1');paint();
  assert.deepEqual(elements.map(x=>x.attributes['aria-pressed']),['false','true','false','false']);
});

test('bulk purpose assignment updates selected router ports and preserves unselected ports',()=>{
  const state=fixture();state.floors[0].racks[1].devices[1].type='router';
  const ids=new Set(['Panel A-10','UPS B-1']);
  const begin=source.indexOf("'bulk-service':service=>{")+"'bulk-service':".length,end=source.indexOf("  'bulk-apply':",begin);
  const apply=vm.runInNewContext('('+source.slice(begin,end).trim().replace(/,$/,'')+')',{D,state,selectedPortIds:ids,selectedPortId:'',commit:fn=>fn(state),serviceVlan:()=>'',render(){}});
  apply('camera');
  assert.equal(D.ports(state).find(x=>x.p.id==='Panel A-10').p.service,'camera');
  assert.equal(D.ports(state).find(x=>x.p.id==='UPS B-1').p.service,'camera');
  assert.equal(D.ports(state).find(x=>x.p.id==='Panel A-1').p.service,'wifi');
  assert.equal(ids.size,0);
});
