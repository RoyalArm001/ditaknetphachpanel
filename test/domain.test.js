const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../domain');
function fixture(){return {schema:2,company:'Փորձնական ընկերություն',floors:[{id:'f1',name:'1-ին հարկ',racks:[{id:'r1',name:'R-01',u:9,photo:'',location:'Միջանցք',devices:[{id:'d1',name:'PP-01',type:'panel',pos:8,height:2,color:'#397c78',model:'',portList:Array.from({length:24},(_,i)=>D.port(i+1,`p${i+1}`))},{id:'d2',name:'SW-01',type:'switch',pos:6,height:1,color:'#667744',model:'',portList:Array.from({length:24},(_,i)=>D.port(i+1,`s${i+1}`))}]}]},{id:'f2',name:'2-րդ հարկ',racks:[]}]};}
test('valid multi-U placement and empty state',()=>{D.validate(fixture());D.validate(D.empty());});
test('reject overlap, overflow and fractions',()=>{for(const pos of [6,9,1.5]){const s=fixture();s.floors[0].racks[0].devices[0].pos=pos;assert.throws(()=>D.validate(s));}});
test('one switch port accepts only one panel connection',()=>{const s=fixture(),p=D.ports(s)[0].p;p.status='used';p.switchPortId='s1';D.validate(s);const other=D.ports(s)[1].p;other.status='used';other.switchPortId='s1';assert.throws(()=>D.validate(s),/արդեն կապված/);});
test('invalid target, dangling floor and free cable are rejected',()=>{for(const patch of [{switchPortId:'missing',status:'used'},{floorId:'nope'},{cable:'C001'}]){const s=fixture();Object.assign(D.ports(s)[0].p,patch);assert.throws(()=>D.validate(s));}});
test('search destination, room, notes and link from both endpoints',()=>{const s=fixture(),p=D.ports(s)[0].p;Object.assign(p,{status:'used',switchPortId:'s1',floorId:'f2',room:'205',door:'աջ դուռ',notes:'կապույտ գիծ',cable:'C001'});D.validate(s);assert.equal(D.rows(s,{query:'205'}).length,2);assert.equal(D.rows(s,{query:'կապույտ'}).length,2);assert.equal(D.rows(s,{floor:'f2'}).length,2);const switchRow=D.rows(s,{query:'C001'}).find(x=>x.type==='switch');assert.equal(switchRow.status,'used');assert.match(switchRow.connection,/PP-01/);});
test('fault takes precedence and disconnect removes dangling links',()=>{const s=fixture(),p=D.ports(s)[0].p;Object.assign(p,{status:'fault',switchPortId:'s1'});assert.equal(D.rows(s,{status:'fault'}).length,1);s.floors[0].racks[0].devices.pop();D.disconnect(s,new Set(['s1']));D.validate(s);assert.equal(p.switchPortId,'');});
test('reject duplicate IDs, bad colors and executable photos',()=>{for(const fn of [s=>s.floors[1].id='f1',s=>s.floors[0].racks[0].photo='javascript:alert(1)',s=>s.floors[0].racks[0].devices[0].color='red;display:none']){const s=fixture();fn(s);assert.throws(()=>D.validate(s));}});
module.exports={fixture};
test('legacy ports without service or VLAN remain valid',()=>{const s=fixture();for(const {p} of D.ports(s)){delete p.service;delete p.vlan;}D.validate(s);assert.equal(D.rows(s)[0].service,'');assert.equal(D.rows(s)[0].vlan,'');});
test('service and VLAN follow the cable on both endpoints and are searchable',()=>{const s=fixture();Object.assign(D.ports(s)[0].p,{status:'used',switchPortId:'s1',service:'camera',vlan:'120'});D.validate(s);const rows=D.rows(s,{query:'120'});assert.equal(rows.length,2);assert.ok(rows.every(x=>x.service==='camera'&&x.vlan==='120'));assert.equal(D.rows(s,{query:'Տեսախցիկ'}).length,2);});
test('VLAN range and service values are validated',()=>{for(const vlan of ['0','4095','1.5','abc',20,null]){const s=fixture();D.ports(s)[0].p.vlan=vlan;assert.throws(()=>D.validate(s),/VLAN/);}for(const vlan of ['','1','4094']){const s=fixture();D.ports(s)[0].p.vlan=vlan;D.validate(s);}const s=fixture();D.ports(s)[0].p.service='unknown';assert.throws(()=>D.validate(s),/նշանակություն/);});
test('company colors validate, preserve defaults and reach 3D links',()=>{
  const s=fixture();s.serviceColors={wifi:'#ffffff','':'#123456'};D.validate(s);
  assert.equal(D.serviceColor(s,'wifi'),'#ffffff');assert.equal(D.serviceColor(D.empty(),'wifi'),'#2563b0');
  Object.assign(D.ports(s)[0].p,{service:'wifi',status:'used',switchPortId:'s1'});
  assert.equal(require('../rack3d').buildScene(s,'r1').links[0].color,'#ffffff');
  for(const value of [{wifi:'red'},{unknown:'#ffffff'},[],null]){s.serviceColors=value;assert.throws(()=>D.validate(s));}
});
