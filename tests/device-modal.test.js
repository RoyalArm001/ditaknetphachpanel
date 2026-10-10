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
 node('modelPreset').value='MikroTik CCR2004-16G-2S+';node('modelPreset').onchange();
 assert.equal(node('count').value,'16');assert.equal(Number(node('sfpCount').value),2);
 node('count').value='8';node('model').onchange();assert.equal(node('count').value,'8');
 node('type').value='switch';node('type').onchange();assert.equal(node('modelType').disabled,false);
 node('model').value='My own switch';node('model').oninput();assert.equal(node('model').value,'My own switch');assert.equal(node('modelPreset').value,'');
});
