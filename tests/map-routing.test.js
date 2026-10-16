'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Routing=require('../src/shared/map-routing');

test('direct line of sight connects directly when there are no obstacles',()=>{
  const width=100,height=100,cols=50,rows=50;
  const data=new Uint8Array(width*height*4).fill(255); // White background
  const grid=Routing.createCollisionGrid(data,width,height,cols,rows);

  const tree=Routing.computeShortestPathTree(grid,0.8,0.5);
  const path=Routing.routeDeviceToRack(tree,0.2,0.5,grid.isWall);

  assert.equal(path.length,2);
  assert.equal(path[0].x,0.2);
  assert.equal(path[0].y,0.5);
  assert.equal(path[1].x,0.8);
  assert.equal(path[1].y,0.5);
});

test('cable path bypasses a black wall obstacle and routes around it',()=>{
  const width=100,height=100,cols=50,rows=50;
  const data=new Uint8Array(width*height*4).fill(255); // White background

  // Draw a vertical black wall at x=45..55 from y=0 down to y=75
  // leaving an open doorway from y=76..99
  for(let y=0;y<75;y++){
    for(let x=45;x<=55;x++){
      const idx=(y*width+x)*4;
      data[idx]=0;     // R
      data[idx+1]=0;   // G
      data[idx+2]=0;   // B
      data[idx+3]=255; // A
    }
  }

  const grid=Routing.createCollisionGrid(data,width,height,cols,rows);

  // Device at (0.2, 0.4) on left, Rack at (0.8, 0.4) on right
  const tree=Routing.computeShortestPathTree(grid,0.8,0.4);
  const path=Routing.routeDeviceToRack(tree,0.2,0.4,grid.isWall);

  // The path must bend around the wall opening (around y >= 0.75)
  assert.ok(path.length>2,'Path should have waypoint bends around the wall');
  const maxPathY=Math.max(...path.map(p=>p.y));
  assert.ok(maxPathY>=0.7,'Path should route down through the doorway opening below the wall');

  // Verify no point inside the wall is stepped on
  const wallMidX=0.5;
  for(let i=0;i<path.length-1;i++){
    const p1=path[i],p2=path[i+1];
    // If segment crosses x=0.5, it must be at y >= 0.70 (the open doorway)
    if((p1.x<=wallMidX&&p2.x>=wallMidX)||(p1.x>=wallMidX&&p2.x<=wallMidX)){
      const t=(wallMidX-p1.x)/(p2.x-p1.x);
      const crossY=p1.y+t*(p2.y-p1.y);
      assert.ok(crossY>=0.68,`Crossed wall at y=${crossY}, but wall extends to y=0.75`);
    }
  }
});
