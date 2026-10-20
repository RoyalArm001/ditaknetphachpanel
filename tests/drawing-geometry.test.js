const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/shared/drawing-geometry');
const sheet={width:2000,height:1000,nodes:[],routes:[],calibration:{a:{x:.1,y:.1},b:{x:.6,y:.1},meters:10}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('physical lengths respect image aspect ratio and require calibration',()=>{
  assert.equal(G.length([{x:0,y:0},{x:1,y:1}],{...sheet,calibration:undefined}),null);
  near(G.metersPerPixel(sheet),.01);
  near(G.length([{x:0,y:0},{x:1,y:1}],sheet),Math.sqrt(500));
  near(G.length([{x:0,y:0},{x:1,y:1}],{...sheet,zoom:20}),Math.sqrt(500));
});
test('orthogonal routes keep endpoints, remove duplicate corners, and measure actual path',()=>{
  const points=G.orthogonal([{x:.1,y:.2},{x:.1,y:.2},{x:.4,y:.7}]);
  assert.deepEqual(points,[{x:.1,y:.2},{x:.4,y:.2},{x:.4,y:.7}]);
  near(G.length(points,sheet),11);
  assert.ok(points.slice(1).every((p,i)=>p.x===points[i].x||p.y===points[i].y));
});
test('snap tolerance is in screen pixels; Alt-style disabling and node exclusion work',()=>{
  const s={...sheet,nodes:[{id:'n',x:.5,y:.5}]};
  assert.equal(G.snap({x:.503,y:.5},s,{zoom:1}).kind,'node');
  assert.equal(G.snap({x:.503,y:.5},s,{zoom:2}).kind,'');
  assert.equal(G.snap({x:.503,y:.5},s,{enabled:false}).kind,'');
  assert.equal(G.snap({x:.503,y:.5},s,{exclude:'n'}).kind,'');
  assert.deepEqual(G.snap({x:.503,y:.5},s,{origin:{x:.1,y:.1},ortho:true}).point,{x:.5,y:.5});
});
test('metric grid and axis lock respect real dimensions',()=>{
  near(G.gridPixels(sheet,.5),50);
  const p=G.snap({x:.113,y:.227},sheet,{grid:true,step:.5}).point;
  near(p.x,.125);near(p.y,.25);
  assert.deepEqual(G.snap({x:.4,y:.5},sheet,{origin:{x:.1,y:.2},ortho:true}).point,{x:.4,y:.2});
});
test('inserting a bend in a virtual elbow targets its original segment',()=>{
  const raw=[{x:.1,y:.1},{x:.4,y:.4},{x:.8,y:.8}];
  const hit=G.nearestSegment({x:.6,y:.41},raw,sheet,true);
  assert.equal(hit.index,1);near(hit.point.x,.6);near(hit.point.y,.4);
  const before=G.length(G.orthogonal(raw),sheet);
  raw.splice(hit.index+1,0,hit.point);
  near(G.length(G.orthogonal(raw),sheet),before);
});
