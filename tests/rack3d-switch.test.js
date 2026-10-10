'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/shared/domain'),R=require('../src/client/js/rack3d');
function fixture(count,sfp=4){const ports=Array.from({length:count+sfp},(_,i)=>D.port(i+1,'sw'+i));ports[0].status='used';return {...D.empty(),floors:[{id:'f',name:'Floor',racks:[{id:'rack',name:'Rack',u:6,devices:[{id:'switch',name:'Switch',type:'switch',pos:4,height:1,color:'#555555',sfpCount:sfp,portList:ports}]}]}]};}
test('switch copper ports remain paired and SFP cages are separate for all supported sizes',()=>{
 for(const count of [4,6,8,12,16,24,48]){
  const scene=R.buildScene(fixture(count),'rack'),copper=scene.points.filter(p=>!p.optical),optical=scene.points.filter(p=>p.optical);
  assert.equal(optical.length,4);assert.equal(copper.length,count);assert.ok(scene.points.every(p=>p.switch&&!p.panel));
  for(let i=0;i<count;i+=2){assert.equal(copper[i].point[0],copper[i+1].point[0]);assert.ok(copper[i].point[1]>copper[i+1].point[1]);}
  assert.ok(Math.min(...optical.map(p=>p.point[0]-p.width/2))>Math.max(...copper.map(p=>p.point[0]+p.width/2)));
  assert.ok(optical.every(p=>p.point[0]+p.width/2<1));
 }
});
test('animation pauses on request, reduced motion, hidden page and offscreen; destroy releases callbacks',t=>{
 const originals={window:global.window,document:global.document,IntersectionObserver:global.IntersectionObserver};
 t.after(()=>{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete global[key];else global[key]=value;}});
 const callbacks=new Map(),events=new Map(),motionEvents=new Map();let next=0,intersection,disconnected=false,paint=0;
 const motion={matches:false,addEventListener:(key,fn)=>motionEvents.set(key,fn),removeEventListener:key=>motionEvents.delete(key)};
 global.window={devicePixelRatio:1,matchMedia:()=>motion,requestAnimationFrame:fn=>{callbacks.set(++next,fn);return next;},cancelAnimationFrame:id=>callbacks.delete(id)};
 global.document={hidden:false,addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)};
 global.IntersectionObserver=class{constructor(fn){intersection=fn;}observe(){}disconnect(){disconnected=true;}};
 const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get(target,key){return key in target?target[key]:(...args)=>{if(key==='fill')paint++;for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg));};},set(target,key,value){target[key]=value;return true;}});
 const canvas={clientWidth:900,clientHeight:700,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0})};
 const frame=time=>{const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn(time);};
 const controller=R.mount(canvas,R.buildScene(fixture(24),'rack'));assert.equal(callbacks.size,1);
 const initial=paint;frame(100);assert.ok(paint>initial);const rendered=paint;frame(110);assert.equal(paint,rendered);assert.equal(callbacks.size,1);
 assert.equal(controller.toggleAnimation(),false);assert.equal(callbacks.size,0);assert.equal(controller.toggleAnimation(),true);assert.equal(callbacks.size,1);
 global.document.hidden=true;events.get('visibilitychange')();assert.equal(callbacks.size,0);global.document.hidden=false;events.get('visibilitychange')();assert.equal(callbacks.size,1);
 motion.matches=true;motionEvents.get('change')();assert.equal(callbacks.size,0);motion.matches=false;motionEvents.get('change')();assert.equal(callbacks.size,1);
 intersection([{isIntersecting:false}]);assert.equal(callbacks.size,0);intersection([{isIntersecting:true}]);assert.equal(callbacks.size,1);
 controller.destroy();assert.equal(callbacks.size,0);assert.equal(events.size,0);assert.equal(motionEvents.size,0);assert.ok(disconnected);
});
