'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const D=require('../src/shared/domain');
const I=require('../src/shared/i18n');
const custom={id:'custom-office',name:'Office LAN',color:'#123456'};
const project=()=>({...D.empty(),serviceTypes:[{...custom}],hiddenServices:['camera']});

test('custom types survive backup round trips and project creation',()=>{
  const state=project();
  state.networks=[{id:'net-1',name:custom.id,vlan:'10',ip:['10.0.0.0/24'],hosts:[]}];
  D.validate(state);
  const restored=JSON.parse(JSON.stringify(state));
  D.validate(restored);
  assert.equal(D.serviceLabel(restored,custom.id),'Office LAN');
  assert.equal(D.serviceColor(restored,custom.id),'#123456');
  assert.equal(D.hasService(restored,'camera'),false);
  const created={...D.empty(),...D.projectStyle(restored)};
  D.validate(created);
  assert.deepEqual(created.serviceTypes,[custom]);
  assert.deepEqual(created.hiddenServices,['camera']);
  D.validate(D.empty());
  D.validate({...D.empty(),serviceLabels:{camera:'LAN',wifi:'LAN'}});
});

test('editing a type preserves references; deleting a used type is blocked',()=>{
  const state=project();
  state.networks=[{id:'net-1',name:custom.id,vlan:'10',ip:[],hosts:[]}];
  const changed={...D.projectStyle(state),serviceTypes:[{...custom,name:'Guest LAN',color:'#abcdef'}]};
  D.applyProjectStyle(state,changed);
  assert.equal(state.networks[0].name,custom.id);
  assert.equal(D.serviceLabel(state,custom.id),'Guest LAN');
  assert.equal(D.serviceColor(state,custom.id),'#abcdef');
  assert.throws(()=>D.applyProjectStyle(state,{...changed,serviceTypes:[]}));
  state.networks=[];
  D.applyProjectStyle(state,{...changed,serviceTypes:[]});
  D.validate(state);
  assert.equal(D.hasService(state,custom.id),false);
});

test('port assignment supports custom types and prevents deleting used defaults',()=>{
  const state=project();
  const port=D.port(1,'port-1');port.service=custom.id;
  state.floors=[{id:'floor-1',name:'Floor',racks:[{id:'rack-1',name:'Rack',u:10,location:'',photo:'',devices:[{id:'device-1',name:'Switch',type:'switch',model:'',color:'#123456',pos:1,height:1,portList:[port]}]}]}];
  D.validate(state);
  assert.equal(D.rows(state)[0].service,custom.id);
  assert.throws(()=>D.applyProjectStyle(state,{serviceTypes:[],hiddenServices:['camera']}));
  port.service='wifi';
  assert.throws(()=>D.applyProjectStyle(state,{...D.projectStyle(state),hiddenServices:['camera','wifi']}));
  port.service='';
  D.applyProjectStyle(state,{...D.projectStyle(state),hiddenServices:['camera','wifi']});
  D.validate(state);
  assert.equal(D.hasService(state,'wifi'),false);
  assert.equal(D.hasService(state,''),true);
});

test('invalid names, IDs, colors, duplicates and excess custom types are rejected',()=>{
  for(const bad of [{name:''},{id:'__proto__'},{color:'red'}])assert.throws(()=>D.validate({...D.empty(),serviceTypes:[{...custom,...bad}]}));
  assert.throws(()=>D.validate({...D.empty(),serviceTypes:[custom,custom]}));
  assert.throws(()=>D.validate({...D.empty(),serviceTypes:[custom,{...custom,id:'custom-other'}]}));
  assert.throws(()=>D.validate({...D.empty(),hiddenServices:['']}));
  assert.throws(()=>D.validate({...D.empty(),serviceTypes:Array.from({length:101},(_,i)=>({...custom,id:'custom-'+i,name:'Type '+i}))}));
});

test('editor opens directly, localizes controls and parses add/edit/delete fields',()=>{
  const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
  const code=source.slice(source.indexOf('function serviceStyleRow('),source.indexOf('const racks='));
  const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  for(const lang of ['hy','en','ru']){
    const ctx={RackI18n:{t:I.forLanguage(lang)},tr:I.forLanguage(lang),esc,input:(name,label,value)=>`<label>${esc(label)}</label><input name="${name}" value="${esc(value)}">`,button:(label,action)=>`<button data-action="${action}">${label}</button>`};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(require.resolve('../src/shared/domain'),'utf8'),ctx);
    ctx.D=ctx.RackDomain;
    vm.runInContext(code,ctx);
    ctx.D.validate({...ctx.D.empty(),serviceTypes:[{...custom,name:'Internet'}]});
    const state=project();state.serviceTypes[0].name='<Office>';
    const html=ctx.styleFields(state,true);
    assert.ok(!html.includes('<details'));
    assert.ok(html.includes('style-service-add'));
    assert.ok(html.includes('style-service-remove'));
    assert.ok(html.includes('&lt;Office>'));
    if(lang!=='hy')assert.ok(!/[\u0531-\u0587]/.test(html));
    const fd=new FormData();
    fd.append('style-service-key','');fd.append('style-service-color-none','#64748b');
    fd.append('style-service-key','custom-office');fd.append('style-service-label-custom-office','New name');fd.append('style-service-color-custom-office','#abcdef');
    const style=ctx.readStyle(fd);
    D.validate({...D.empty(),...style});
    assert.equal(style.serviceTypes[0].name,'New name');
    assert.equal(style.serviceTypes[0].color,'#abcdef');
    assert.ok(style.hiddenServices.includes('camera'));
  }
});
