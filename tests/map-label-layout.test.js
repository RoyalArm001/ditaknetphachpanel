'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {layout}=require('../src/shared/map-label-layout');
const {pointer}=require('../src/shared/map-label-layout');
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

test('bounded map labels stay beside their markers instead of drifting across the page',()=>{
  const items=Array.from({length:32},(_,i)=>({id:String(i),x:200+(i%4),y:140+Math.floor(i/4),width:62,height:17,radius:10}));
  const obstacles=items.map(item=>({x:item.x-9,y:item.y-9,width:18,height:18}));
  const boxes=layout(items,{x:20,y:20,width:360,height:260},obstacles,2,32);
  for(const item of items){
    const box=boxes.get(item.id);
    assert.ok(box,'Every device keeps its label');
    assert.ok(Math.hypot(box.x+box.width/2-item.x,box.y+box.height/2-item.y)<=32,'Labels stay within the local map area');
  }
});

test('short label pointers aim at their own device from every side and corner',()=>{
  const box={x:100,y:80,width:70,height:20};
  for(const point of [{x:135,y:30},{x:135,y:150},{x:40,y:90},{x:230,y:90},{x:40,y:30},{x:230,y:30},{x:40,y:150},{x:230,y:150}]){
    const triangle=pointer(point,box,{radius:10}),[a,tip,b]=triangle;
    const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},dx=point.x-center.x,dy=point.y-center.y;
    assert.ok(Math.abs((tip.x-center.x)*dy-(tip.y-center.y)*dx)<1e-7,'Pointer aims exactly at the device');
    assert.ok((tip.x-center.x)*dx+(tip.y-center.y)*dy>0,'Pointer faces outward toward the device');
    assert.ok(Math.hypot(tip.x-center.x,tip.y-center.y)<=5.001,'Pointer stays short');
    for(const p of [a,b])assert.ok(p.x>=box.x&&p.x<=box.x+box.width&&p.y>=box.y&&p.y<=box.y+box.height,'Base remains on the label');
  }
});

test('label pointers stop before the icon and are omitted when there is no free gap',()=>{
  const point={x:100,y:100},box={x:80,y:115,width:40,height:15};
  const triangle=pointer(point,box,{radius:12});
  assert.ok(triangle);assert.ok(Math.hypot(triangle[1].x-point.x,triangle[1].y-point.y)>=13);
  assert.equal(pointer(point,{...box,y:110},{radius:12}),null);
  assert.equal(pointer(point,{x:80,y:90,width:40,height:20}),null);
});

test('PDF labels adapt to crowded circular devices without overlapping or moving far away',()=>{
  const items=Array.from({length:24},(_,i)=>({id:String(i),x:150+(i%4)*28,y:150+Math.floor(i/4)*28,width:20,height:12,radius:10}));
  const bounds={x:0,y:0,width:500,height:500},icons=items.map(p=>({x:p.x-9,y:p.y-9,width:18,height:18,cx:p.x,cy:p.y,radius:9}));
  const before=JSON.stringify(items),boxes=layout(items,bounds,icons,1,40,{minScale:5.5/7});
  assert.ok([...boxes.values()].some(b=>b.scale<1));
  for(const item of items){
    const box=boxes.get(item.id);assert.ok(box.scale>=5.5/7&&box.scale<=1);
    assert.ok(Math.hypot(box.x+box.width/2-item.x,box.y+box.height/2-item.y)<=40);
    for(const [other,b] of boxes)if(other!==item.id)assert.ok(!intersects(box,b));
    for(const icon of icons)assert.ok(Math.hypot(icon.cx-Math.max(box.x,Math.min(box.x+box.width,icon.cx)),icon.cy-Math.max(box.y,Math.min(box.y+box.height,icon.cy)))>=9);
  }
  assert.equal(JSON.stringify(items),before);
  assert.deepEqual(boxes,layout([...items].reverse(),bounds,icons,1,40,{minScale:5.5/7}));
});
