'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/shared/domain'),R=require('../src/client/js/rack3d');
function fixture(count){const panel={id:'panel',name:'Cat6 panel',model:'Cat6 UTP',type:'panel',pos:1,height:count>24?2:1,color:'#397c78',portList:Array.from({length:count},(_,i)=>D.port(i+1,'p'+i))};const rack={id:'rack',name:'Rack',u:12,devices:[panel]};return {...D.empty(),floors:[{id:'floor',name:'Floor',racks:[rack]}]};}
test('3D patch panel sockets stay inside the chassis without overlapping for standard and custom counts',()=>{
 for(const count of [4,6,8,12,16,24,48,96,37]){
  const scene=R.buildScene(fixture(count),'rack'),box=scene.boxes[0];assert.equal(scene.points.length,count);assert.equal(box.min[2],.12);
  assert.equal(new Set(scene.points.map(p=>p.point[1])).size,Math.ceil(count/24));
  for(const p of scene.points){assert.ok(p.point[0]-p.width/2>box.min[0]);assert.ok(p.point[0]+p.width/2<box.max[0]);assert.ok(p.point[1]-p.height>box.min[1]);assert.ok(p.point[1]+p.height<box.max[1]);}
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){const a=scene.points[i],b=scene.points[j];if(a.point[1]===b.point[1])assert.ok(Math.abs(a.point[0]-b.point[0])>(a.width+b.width)/2);}
 }
});
test('cables retain exact socket anchors after multi-row panel layout',()=>{
 const state=fixture(48),rack=state.floors[0].racks[0];
 rack.devices.push({id:'switch',name:'Switch',type:'switch',pos:4,height:1,color:'#333333',portList:[D.port(1,'sw1')]});
 rack.devices[0].portList[47].switchPortId='sw1';const scene=R.buildScene(state,'rack');
 assert.deepEqual(scene.links[0].a,scene.points.find(p=>p.id==='p47').point);assert.deepEqual(scene.links[0].b,scene.points.find(p=>p.id==='sw1').point);
});
test('panel renderer supports front view, rotation, zoom and disposal',t=>{
 const old=global.window;global.window={devicePixelRatio:1};t.after(()=>{if(old===undefined)delete global.window;else global.window=old;});
 let shapes=0;const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})}, {get(target,key){return key in target?target[key]:(...args)=>{if(key==='fill')shapes++;for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg));};},set(target,key,value){target[key]=value;return true;}});
 const canvas={clientWidth:1000,clientHeight:800,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0})};
 const controller=R.mount(canvas,R.buildScene(fixture(48),'rack'));controller.front();controller.rotate(.3);controller.zoom(2);assert.ok(shapes>100);controller.destroy();assert.equal(canvas.onpointerdown,null);
});
