'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),D=require('../src/shared/domain');
test('catalog search filters by device type and all case-insensitive search terms',()=>{
 const s=D.empty(),results=D.searchDeviceModels('switch','MIKROTIK 24',s);
 assert.ok(results.length>0);assert.ok(results.every(m=>m.type==='switch'&&/24/.test(m.name)&&/mikrotik/i.test(m.name)));
 assert.equal(D.searchDeviceModels('router','no-such-model',s).length,0);
});
test('custom model counts, zero copper and PoE+ round trip and replace case-insensitive duplicates',()=>{
 const s=D.empty();D.saveDeviceModel(s,{type:'switch',name:' Custom optical ',ports:0,sfp:6,height:2,modelType:'poe-plus'});
 D.validate(s);assert.deepEqual(D.modelDefaults('switch','custom OPTICAL',JSON.parse(JSON.stringify(s))),{ports:0,height:2,sfpCount:6,modelType:'poe-plus'});
 D.saveDeviceModel(s,{type:'switch',name:'CUSTOM optical',ports:7,sfp:3,height:1});assert.equal(s.deviceModels.length,1);
 assert.equal(D.modelDefaults('switch','custom optical',s).ports,7);assert.equal(D.modelDefaults('router','custom optical',s),null);
});
test('saved overrides take precedence over presets without modifying built-ins',()=>{
 const name='MikroTik CRS326-24G-2S+RM',s=D.empty(),before=D.modelDefaults('switch',name,s);
 D.saveDeviceModel(s,{type:'switch',name,ports:20,sfp:3,height:2});
 assert.equal(D.modelDefaults('switch',name,s).ports,20);assert.equal(D.deviceModels('switch',s).filter(m=>m.name===name).length,1);
 assert.deepEqual(D.modelDefaults('switch',name,D.empty()),before);
});
test('previously used custom device models supply dimensions for reuse',()=>{
 const s={...D.empty(),floors:[{id:'f',name:'1',racks:[{id:'r',name:'R',u:42,location:'',photo:'',devices:[{id:'d',name:'SW',type:'switch',model:'Office custom',height:1,pos:1,color:'#397c78',sfpCount:3,portList:Array.from({length:10},(_,i)=>D.port(i+1,'p'+i))}]}]}]};
 assert.deepEqual(D.modelDefaults('switch','Office custom',s),{ports:7,height:1,sfpCount:3,modelType:'none'});
 assert.equal(D.searchDeviceModels('router','Office',s).length,0);
});
test('invalid model configurations cannot be saved or imported',()=>{
 const base={type:'router',name:'Custom router',ports:8,sfp:2,height:1};
 for(const extra of [{ports:-1},{ports:1.5},{ports:96,sfp:1},{ports:0,sfp:0},{sfp:NaN},{sfp:17},{height:0},{height:61},{name:''},{name:'x'.repeat(81)},{type:'missing'}]){
  const s=D.empty();assert.throws(()=>D.saveDeviceModel(s,{...base,...extra}));assert.equal(s.deviceModels,undefined);
 }
 for(const extra of [{ports:-1},{ports:1.5},{ports:96,sfp:1},{sfp:17},{height:0}])assert.throws(()=>D.validate({...D.empty(),deviceModels:[{...base,...extra}]}));
});
test('device auto and effective colors provide distinct palettes and resolve legacy defaults',()=>{
 const patch1={id:'p1',name:'Patch 1',type:'panel',color:'#397c78'};
 const patch2={id:'p2',name:'Patch 2',type:'panel',color:'#397c78'};
 const router={id:'r1',name:'Router 1',type:'router',color:'#397c78'};
 const sw1={id:'s1',name:'Switch 1',type:'switch',color:'#397c78'};
 const rackDevices=[patch1,patch2,router,sw1];

 const cPatch1=D.effectiveDeviceColor(patch1,rackDevices);
 const cPatch2=D.effectiveDeviceColor(patch2,rackDevices);
 const cRouter=D.effectiveDeviceColor(router,rackDevices);
 const cSw1=D.effectiveDeviceColor(sw1,rackDevices);

 assert.notEqual(cPatch1,cPatch2,'Patch 1 and Patch 2 must have distinct colors');
 assert.notEqual(cPatch1,cRouter,'Patch and Router must have distinct colors');
 assert.notEqual(cPatch1,cSw1,'Patch and Switch must have distinct colors');
 assert.notEqual(cRouter,cSw1,'Router and Switch must have distinct colors');

 const customDev={id:'c1',name:'Custom',type:'switch',color:'#123456'};
 assert.equal(D.effectiveDeviceColor(customDev,rackDevices),'#123456','Custom explicit hex color must be preserved');
});

