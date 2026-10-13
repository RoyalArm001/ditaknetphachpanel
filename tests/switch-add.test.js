'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/shared/domain');

test('D.nextDeviceName generates sequential unique names for all device types',()=>{
  const s=D.empty();
  assert.equal(D.nextDeviceName('switch',s),'SW-01');
  assert.equal(D.nextDeviceName('panel',s),'PP-01');
  assert.equal(D.nextDeviceName('router',s),'RT-01');
  assert.equal(D.nextDeviceName('server',s),'SRV-01');

  s.floors=[{id:'f',name:'1',racks:[{id:'r',name:'R',u:42,location:'',photo:'',devices:[
    {id:'d1',name:'SW-01',type:'switch',pos:1,height:1,color:'#333',portList:[D.port(1,'p1')]},
    {id:'d2',name:'sw-02',type:'switch',pos:2,height:1,color:'#333',portList:[D.port(1,'p2')]}
  ]}]}];
  assert.equal(D.nextDeviceName('switch',s),'SW-03');
  assert.equal(D.nextDeviceName('panel',s),'PP-01');
});

test('adding a switch via catalog-device-new pre-fills name, defaults modelType to none, and saves cleanly',()=>{
  const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
  const nodes=new Map();
  const rack={id:'rack-1',name:'Main Rack',u:24,location:'',photo:'',devices:[]};
  const state={...D.empty(),company:'Company',floors:[{id:'floor-1',name:'Floor 1',racks:[rack]}]};
  let submitModal=null,seq=0,current=state;

  const node=(id,value='')=>{
    if(nodes.has(id))return nodes.get(id);
    const field={hidden:false,insertAdjacentHTML(){}};
    const n={
      value:String(value),
      options:[],
      closest:()=>field,
      set innerHTML(html){
        if(html.startsWith('{"items"')){
          const data=JSON.parse(html);
          this.options=data.items.map(([val])=>({value:String(val)}));
          this.value=String(data.value);
        }
      }
    };
    nodes.set(id,n);
    return n;
  };

  const context={
    D,
    state,
    findDevice:()=>null,
    findRack:()=>({r:rack}),
    racks:()=>[{r:rack,f:state.floors[0]}],
    tr:(s,...v)=>Array.isArray(s)?s.reduce((o,p,i)=>o+p+(v[i]??''),''):s,
    esc:String,
    uid:()=>`id-${++seq}`,
    input:(id,label,value)=>{node(id,value);return '';},
    select:(id,label,items,value)=>{const n=node(id,value);n.options=items.map(([val])=>({value:String(val)}));return '';},
    secretInput:(id,label,value)=>{node(id,value);return '';},
    opts:(items,value)=>JSON.stringify({items,value}),
    modal:(title,body,cb)=>{submitModal=cb;},
    button:()=>'',
    toast:()=>{},
    commit:cb=>{const next=structuredClone(current);cb(next);D.validate(next);current=next;},
    $:selector=>node(selector.slice(1))
  };

  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function deviceModal('),source.indexOf('function deviceDetail(')),context);

  // Invoke switch add modal as catalog-device-new does
  context.deviceModal('','',undefined,{type:'switch',model:''});

  // Verify default name is SW-01 and modelType is 'none'
  assert.equal(node('name').value,'SW-01');
  assert.equal(node('modelType').value,'none');
  assert.equal(node('count').value,'24');
  assert.equal(node('sfpCount').value,'0');

  // Submit default values (simulating 1-click switch add)
  const formValues={
    targetRack:'rack-1',
    name:node('name').value,
    type:'switch',
    model:'',
    modelType:node('modelType').value,
    pos:node('pos').value,
    height:'1',
    count:node('count').value,
    customCount:'',
    sfpCount:node('sfpCount').value,
    color:'#397c78',
    initialStatus:node('initialStatus')?.value||'free',
    initialService:'',
    hostNetworkId:'',
    hostIp:'',
    hostUsername:'',
    hostPassword:''
  };

  submitModal({get:k=>formValues[k]??''});

  // Verify switch was successfully added to rack
  assert.equal(current.floors[0].racks[0].devices.length,1);
  const created=current.floors[0].racks[0].devices[0];
  assert.equal(created.name,'SW-01');
  assert.equal(created.type,'switch');
  assert.equal(created.modelType,'none');
  assert.equal(created.portList.length,24);
  assert.equal(created.sfpCount,0);
});

test('browser autofilled credentials without IP do not throw when adding a switch',()=>{
  const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
  const nodes=new Map();
  const rack={id:'rack-1',name:'Main Rack',u:24,location:'',photo:'',devices:[]};
  const net={id:'net-1',name:'Management',vlan:'10',ip:'192.168.10.1/24',hosts:[]};
  const state={...D.empty(),company:'Company',floors:[{id:'floor-1',name:'Floor 1',racks:[rack]}],networks:[net]};
  let submitModal=null,seq=0,current=state;

  const node=(id,value='')=>{
    if(nodes.has(id))return nodes.get(id);
    const field={hidden:false,insertAdjacentHTML(){}};
    const n={value:String(value),options:[],closest:()=>field,set innerHTML(html){}};
    nodes.set(id,n);
    return n;
  };

  const context={
    D,
    state,
    findDevice:()=>null,
    findRack:()=>({r:rack}),
    racks:()=>[{r:rack,f:state.floors[0]}],
    ensureNetworks:s=>s.networks,
    networkLabel:n=>n.name,
    tr:(s,...v)=>Array.isArray(s)?s.reduce((o,p,i)=>o+p+(v[i]??''),''):s,
    esc:String,
    uid:()=>`id-${++seq}`,
    input:(id,label,value)=>{node(id,value);return '';},
    select:(id,label,items,value)=>{const n=node(id,value);n.options=items.map(([val])=>({value:String(val)}));return '';},
    secretInput:(id,label,value)=>{node(id,value);return '';},
    opts:(items,value)=>JSON.stringify({items,value}),
    modal:(title,body,cb)=>{submitModal=cb;},
    button:()=>'',
    toast:()=>{},
    commit:cb=>{const next=structuredClone(current);cb(next);D.validate(next);current=next;},
    $:selector=>node(selector.slice(1))
  };

  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function deviceModal('),source.indexOf('function deviceDetail(')),context);

  context.deviceModal('','',undefined,{type:'switch',model:''});

  // Simulate browser autofilling username & password into the form
  const formValues={
    targetRack:'rack-1',
    name:'SW-01',
    type:'switch',
    model:'',
    modelType:'none',
    pos:'10',
    height:'1',
    count:'24',
    customCount:'',
    sfpCount:'0',
    color:'#397c78',
    initialStatus:'free',
    initialService:'',
    hostNetworkId:'',
    hostIp:'',
    hostUsername:'chrome-autofill-admin',
    hostPassword:'chrome-autofill-password'
  };

  // Must not throw error about missing network/IP
  assert.doesNotThrow(()=>submitModal({get:k=>formValues[k]??''}));
  assert.equal(current.floors[0].racks[0].devices.length,1);
});

test('optical switch with 26 SFP ports validates cleanly in domain and app',()=>{
  const rack={id:'rack-1',name:'Main Rack',u:24,location:'',photo:'',devices:[]};
  const s={...D.empty(),company:'Company',floors:[{id:'floor-1',name:'Floor 1',racks:[rack]}]};

  const ports=Array.from({length:26},(_,i)=>D.port(i+1,`p-${i+1}`));
  rack.devices.push({
    id:'dev-opt',
    name:'SW-OPT',
    type:'switch',
    model:'MikroTik CRS326-24S+2Q+RM (10G SFP+)',
    modelType:'none',
    pos:5,
    height:1,
    color:'#10b981',
    sfpCount:26,
    portList:ports
  });

  assert.doesNotThrow(()=>D.validate(s));
});
