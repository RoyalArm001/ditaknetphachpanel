'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {layout}=require('../src/shared/map-label-layout');
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
test('dense labels remain readable, inside the page, clear of devices, without moving devices',()=>{
  const items=Array.from({length:48},(_,i)=>({id:String(i),x:370+(i%6)*5,y:210+Math.floor(i/6)*5,width:i%3?52:98,height:i%3?13:23,radius:10}));
  const original=JSON.stringify(items),bounds={x:33,y:122,width:776,height:408};
  const obstacles=items.map(p=>({x:p.x-9,y:p.y-9,width:18,height:18}));
  const boxes=[...layout(items,bounds,obstacles,2).values()];
  assert.ok(boxes.every(Boolean),'All 48 names fit on the export');
  for(const [i,box] of boxes.entries()){
    assert.ok(box.x>=bounds.x&&box.y>=bounds.y&&box.x+box.width<=bounds.x+bounds.width&&box.y+box.height<=bounds.y+bounds.height);
    assert.ok(obstacles.every(other=>!intersects(box,other)));
    assert.ok(boxes.slice(i+1).every(other=>!intersects(box,other)));
  }
  assert.equal(JSON.stringify(items),original);
  assert.deepEqual(layout(items,bounds,obstacles,2),layout(items,bounds,obstacles,2));
});
test('edge labels stay inside bounds; impossible labels do not cover other text',()=>{
  const bounds={x:0,y:0,width:320,height:160};
  const items=[{id:'left',x:0,y:0,width:90,height:24},{id:'right',x:320,y:160,width:90,height:24},{id:'oversized',x:20,y:20,width:321,height:24}];
  const boxes=layout(items,bounds);
  assert.equal(boxes.get('oversized'),null);
  assert.ok(boxes.get('left').x>=0&&boxes.get('right').x+90<=320);
  assert.ok(!intersects(boxes.get('left'),boxes.get('right')));
});
