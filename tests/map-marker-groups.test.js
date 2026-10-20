'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {group}=require('../src/shared/map-marker-groups');
const options={width:1000,height:600,diameter:20};
const item=(id,x,y=.5,kind='internet')=>({id,x,y,kind});
test('same-type SVGs group when their centers are within 70% of their rendered diameter',()=>{
  assert.equal(group([item('a',.5),item('b',.514)],options).length,1);
  assert.equal(group([item('a',.5),item('b',.5141)],options).length,2);
  assert.equal(group([item('a',.5),item('b',.5,.5,'wifi')],options).length,2);
  assert.equal(group([item('a',.5),item('b',.5)],options).length,1);
});
test('zoom, marker size and non-square plans use actual rendered distances',()=>{
  const points=[item('a',.5),item('b',.51)];
  assert.equal(group(points,options).length,1);
  assert.equal(group(points,{...options,width:2000,height:1200}).length,2);
  assert.equal(group(points,{...options,width:2000,height:1200,diameter:40}).length,1);
  assert.equal(group([item('a',.5,.5),item('b',.5,.52)],options).length,1);
  assert.equal(group([item('a',.5,.5),item('b',.5,.525)],options).length,2);
});
test('nearby chains never merge distant endpoints and grouping is deterministic without changing data',()=>{
  const points=[item('a',.4),item('b',.413),item('c',.426)],before=JSON.stringify(points);
  const a=group(points,options),b=group([...points].reverse(),options);
  assert.equal(a.length,2);assert.deepEqual(a,b);assert.equal(JSON.stringify(points),before);
  assert.equal(a[0].x,(.4+.413)/2);
});
test('200 devices remain selectable as 100 separate pairs',()=>{
  const points=Array.from({length:100},(_,i)=>[item(i+'a',.04+(i%10)*.1,.04+Math.floor(i/10)*.1),item(i+'b',.045+(i%10)*.1,.04+Math.floor(i/10)*.1)]).flat();
  const groups=group(points,options);
  assert.equal(groups.length,100);assert.ok(groups.every(g=>g.members.length===2));
  assert.equal(new Set(groups.flatMap(g=>g.members.map(m=>m.id))).size,200);
});
