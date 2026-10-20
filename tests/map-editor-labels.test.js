'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(require.resolve('../src/client/js/maps'),'utf8'),context);
const layout=context.RackMaps.resolveLabelDirections;
const item=(id,x,y,width=40,iconWidth=30)=>({id,x,y,width,height:22,iconWidth,iconHeight:iconWidth});
const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+.01&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+.01;
test('isolated labels are centered below icons with the same 6px gap at every size',()=>{
 for(const size of [20,40,60]){
  const p=item('a',150,100,120,size),r=layout([p],{width:400,height:300}).get('a');
  assert.equal(r.dir,'down');assert.equal((r.left+r.right)/2,p.x);assert.equal(r.top-(p.y+size/2),6);
 }
});
test('dense labels avoid both actual text rectangles and enlarged neighboring icons',()=>{
 const items=[item('d16',120,50),item('d5',210,70),item('d9',200,130),item('camera',270,120,80),item('s3',105,260),item('s4',175,270),item('d8',280,225)];
 for(const size of [20,40]){
  const points=items.map(p=>({...p,iconWidth:size,iconHeight:size})),result=layout(points,{width:400,height:400});
  for(const [id,r] of result){
   for(const p of points)assert.ok(!overlap(r,{left:p.x-size/2,right:p.x+size/2,top:p.y-size/2,bottom:p.y+size/2}),id+' overlaps icon '+p.id);
   for(const [other,b] of result)if(other!==id)assert.ok(!overlap(r,b),id+' overlaps label '+other);
  }
 }
});
test('layout respects map edges, long translated names and visible anchor points',()=>{
 const p=item('a',150,170,130),anchor={left:130,right:170,top:105,bottom:140};
 const r=layout([p],{width:320,height:200},[anchor]).get('a');
 assert.equal(r.dir,'right');assert.ok(r.right<=320);assert.ok(!overlap(r,anchor));assert.equal((r.top+r.bottom)/2,p.y);
});
test('selection/render order does not change layout, including a 200-device map',()=>{
 const points=Array.from({length:200},(_,i)=>item(String(i),80+(i%20)*150,70+Math.floor(i/20)*100,80));
 const bounds={width:3100,height:1100},a=layout(points,bounds),b=layout([...points].reverse(),bounds);
 assert.equal(JSON.stringify([...a]),JSON.stringify([...b]));assert.ok([...a.values()].every(p=>p.dir==='down'));
});

test('a shared SVG keeps all eight device names readable around its common position',()=>{
 const points=Array.from({length:8},(_,i)=>item(String(i),250,220,54));
 const result=layout(points,{width:500,height:450});
 for(const [id,rect] of result){
  assert.ok(rect.left>=0&&rect.right<=500&&rect.top>=0&&rect.bottom<=450);
  for(const [other,box] of result)if(other!==id)assert.ok(!overlap(rect,box),id+' overlaps '+other);
 }
});
