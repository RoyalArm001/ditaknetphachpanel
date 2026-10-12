'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/shared/domain');
test('device modal separates panel/router/switch fields, fills presets, and preserves manual edits',()=>{
 const nodes=new Map(),rack={id:'rack',u:42,devices:[]},state=D.empty();
 const node=(id,value='')=>{if(nodes.has(id))return nodes.get(id);const field={hidden:false,insertAdjacentHTML(){}};const n={value:String(value),options:[],closest:()=>field,set innerHTML(html){if(html.startsWith('{"items"')){const data=JSON.parse(html);this.options=data.items.map(([value])=>({value:String(value)}));this.value=String(data.value);}}};nodes.set(id,n);return n;};
 const tr=(s,...values)=>Array.isArray(s)?s.reduce((out,x,i)=>out+x+(values[i]??''),''):s;
 const context={D,state,findDevice:()=>null,findRack:()=>({r:rack}),racks:()=>[],tr,esc:String,
  input:(id,label,value)=>{node(id,value);return '';},select:(id,label,items,value)=>{const n=node(id,value);n.options=items.map(([value])=>({value:String(value)}));return '';},
  opts:(items,value)=>JSON.stringify({items,value}),modal:()=>{},button:()=>'',
  $:selector=>node(selector.slice(1))};
 const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function deviceModal('),source.indexOf('function deviceDetail(')),context);
 context.deviceModal(null,'rack');
 assert.equal(node('modelType').disabled,true);assert.equal(node('sfpCount').disabled,true);
 assert.ok(node('modelPreset').options.some(o=>o.value==='Cat6 UTP 48-Port 2U'));
 assert.ok(!node('modelPreset').options.some(o=>o.value.includes('CCR2004')));
 node('type').value='router';node('type').onchange();assert.equal(node('modelType').disabled,true);assert.equal(node('sfpCount').disabled,false);
 node('modelSearch').value='mikrotik 2004';node('modelSearch').oninput();assert.equal(node('modelPreset').options.length,2);
 node('modelSearch').value='not in catalog';node('modelSearch').oninput();assert.equal(node('modelPreset').options.length,1);
 node('modelSearch').value='';node('modelSearch').oninput();
 node('modelPreset').value='MikroTik CCR2004-16G-2S+';node('modelPreset').onchange();
 assert.equal(node('count').value,'16');assert.equal(Number(node('sfpCount').value),2);
 node('count').value='8';node('model').onchange();assert.equal(node('count').value,'8');
 node('type').value='switch';node('type').onchange();assert.equal(node('modelType').disabled,false);
 node('model').value='My own switch';node('model').oninput();assert.equal(node('model').value,'My own switch');assert.equal(node('modelPreset').value,'');
 node('count').value='custom';node('count').onchange();node('customCount').value='7';node('sfpCount').value='3';node('model').onchange();
 assert.equal(node('customCount').value,'7');assert.equal(node('sfpCount').value,'3');assert.equal(node('customCount').disabled,false);
});

test('editing a saved model keeps manual counts and preserves port identities when resizing',()=>{
 const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8'),nodes=new Map();
 const device={id:'dev',name:'SW',type:'switch',model:'MikroTik CRS326-24G-2S+RM',pos:1,height:1,color:'#397c78',sfpCount:3,modelType:'none',portList:Array.from({length:10},(_,i)=>D.port(i+1,'p'+i))};
 device.portList[6].endpointName='Camera';device.portList[6].status='used';
 const rack={id:'rack',name:'Rack',u:42,location:'',photo:'',devices:[device]},state={...D.empty(),company:'Test',floors:[{id:'floor',name:'1',racks:[rack]}]};
 let submit,seq=0,current=state;
 const node=(id,value='')=>{if(nodes.has(id))return nodes.get(id);const field={insertAdjacentHTML(){}};const n={value:String(value),options:[],closest:()=>field,set innerHTML(html){if(html.startsWith('{"items"')){const data=JSON.parse(html);this.options=data.items.map(([value])=>({value:String(value)}));this.value=String(data.value);}}};nodes.set(id,n);return n;};
 const context={D,state,findDevice:()=>({d:device,r:rack}),findRack:()=>({r:rack}),racks:()=>[],tr:(s,...v)=>Array.isArray(s)?s.reduce((o,p,i)=>o+p+(v[i]??''),''):s,esc:String,uid:()=>`new${++seq}`,
  input:(id,label,value)=>{node(id,value);return '';},select:(id,label,items,value)=>{const n=node(id,value);n.options=items.map(([value])=>({value:String(value)}));return '';},opts:(items,value)=>JSON.stringify({items,value}),modal:(title,body,cb)=>{submit=cb;},button:()=>'',
  commit:cb=>{const next=structuredClone(current);cb(next);D.validate(next);current=next;},$:selector=>node(selector.slice(1))};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function deviceModal('),source.indexOf('function deviceDetail(')),context);context.deviceModal('dev','rack');
 node('model').onchange();assert.equal(node('count').value,'custom');assert.equal(Number(node('customCount').value),7);assert.equal(Number(node('sfpCount').value),3);
 const values={name:'SW',type:'switch',model:device.model,pos:'1',height:'1',color:'#397c78',count:'custom',customCount:'5',sfpCount:'3',modelType:'none'};
 assert.throws(()=>submit({get:key=>values[key]??null}),/պորտ/);assert.equal(current.floors[0].racks[0].devices[0].portList.length,10);
 values.customCount='8';submit({get:key=>values[key]??null});
 const result=current.floors[0].racks[0].devices[0];assert.equal(result.portList.length,11);
 assert.deepEqual(Array.from(result.portList.slice(-3),p=>p.id),['p7','p8','p9']);assert.equal(result.portList[6].endpointName,'Camera');assert.deepEqual(Array.from(result.portList,p=>p.number),Array.from({length:11},(_,i)=>i+1));
});
