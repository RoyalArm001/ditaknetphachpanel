'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/shared/domain');
const I=require('../src/shared/i18n');

test('linked racks validate correctly and reject invalid configurations',()=>{
  const state=D.empty();
  const port1=D.port(1,'port-1');
  const rack1={id:'rack-1',name:'Main Rack',u:24,location:'',photo:'',devices:[{id:'dev-1',name:'PP-01',type:'panel',model:'',color:'#123456',pos:1,height:1,portList:[port1]}]};
  state.floors=[
    {id:'floor-1',name:'1st Floor',racks:[rack1]},
    {id:'floor-2',name:'2nd Floor',racks:[],linkedRackIds:['rack-1']}
  ];
  D.validate(state);

  // Non-existent rack rejection
  assert.throws(()=>D.validate({...state,floors:[state.floors[0],{id:'floor-2',name:'2nd Floor',racks:[],linkedRackIds:['non-existent']}]}));

  // Self-linking rejection
  assert.throws(()=>D.validate({...state,floors:[{...state.floors[0],linkedRackIds:['rack-1']},state.floors[1]]}));

  // Duplicate linked rack rejection
  assert.throws(()=>D.validate({...state,floors:[state.floors[0],{id:'floor-2',name:'2nd Floor',racks:[],linkedRackIds:['rack-1','rack-1']}]}));
});

test('mapDevices includes devices from linked racks on floor plans',()=>{
  const state=D.empty();
  const port1=D.port(1,'port-1');
  port1.status='used';
  port1.service='wifi';
  const rack1={id:'rack-1',name:'Main Rack',u:24,location:'',photo:'',devices:[{id:'dev-1',name:'PP-01',type:'panel',model:'',color:'#123456',pos:1,height:1,portList:[port1]}]};
  state.floors=[
    {id:'floor-1',name:'1st Floor',racks:[rack1]},
    {id:'floor-2',name:'2nd Floor',racks:[],linkedRackIds:['rack-1']}
  ];
  const plan2={id:'plan-2',name:'Floor 2 Plan',floorId:'floor-2',width:1000,height:800,image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',markers:[]};
  state.floorPlans=[plan2];
  D.validate(state);

  const res=D.mapDevices(state,plan2);
  assert.equal(res.devices.length,1);
  assert.equal(res.devices[0].p.id,'port-1');
});

test('disconnect cleans up removed racks from linkedRackIds',()=>{
  const state=D.empty();
  const port1=D.port(1,'port-1');
  const rack1={id:'rack-1',name:'Main Rack',u:24,location:'',photo:'',devices:[{id:'dev-1',name:'PP-01',type:'panel',model:'',color:'#123456',pos:1,height:1,portList:[port1]}]};
  state.floors=[
    {id:'floor-1',name:'1st Floor',racks:[rack1]},
    {id:'floor-2',name:'2nd Floor',racks:[],linkedRackIds:['rack-1']}
  ];
  D.validate(state);

  // Remove rack-1 from floor-1
  state.floors[0].racks=[];
  D.disconnect(state,new Set(['rack-1']));
  assert.deepEqual(state.floors[1].linkedRackIds,[]);
  D.validate(state);
});

test('translations exist for linked racks in EN and RU',()=>{
  const phrases=[
    'Կամ կցել առկա ռաք այլ հարկից',
    '— Ստեղծել նոր ռաք այս հարկում —',
    'Ընտրված ռաքը կկցվի այս հարկին որպես սպասարկող ռաք։ Կարող եք օգտագործել դրա պորտերն ու սարքերը այս հարկի հատակագծում։',
    'Ռաքը հաջողությամբ կցվեց հարկին',
    'Կցել առկա ռաք',
    'Կցել առկա ռաք հարկին',
    'Ընտրեք առկա ռաքը',
    'Կցելու համար այլ ռաք չկա',
    'Կցված',
    'կցված',
    'Կցված ռաք',
    'Անջատել այս հարկից',
    'Անջատե՞լ ռաքը',
    'Ռաքը կանջատվի այս հարկից։ Ֆիզիկական ռաքն ու սարքերը կմնան իրենց հիմնական հարկում։',
    'Ռաքն անջատվեց հարկից'
  ];
  for(const p of phrases){
    const en=I.forLanguage('en')(p);
    const ru=I.forLanguage('ru')(p);
    assert.ok(en&&!/[\u0531-\u0587]/.test(en),`EN translation for "${p}" should not contain Armenian: ${en}`);
    assert.ok(ru&&!/[\u0531-\u0587]/.test(ru),`RU translation for "${p}" should not contain Armenian: ${ru}`);
  }
});
