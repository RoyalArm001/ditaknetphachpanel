const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../src/shared/workspace-links');

test('editor root defaults to drawing while the main site keeps overview',()=>{
  assert.equal(W.defaultView('https://editor.ditaknet.com/'),'drawing');
  assert.equal(W.defaultView('https://editor.ditaknet.com/?company=one'),'drawing');
  assert.equal(W.defaultView('https://patch.ditaknet.com/'),'overview');
  assert.equal(W.defaultView('http://localhost:3000/'),'overview');
  assert.equal(W.isEditor('https://editor.ditaknet.com.example.org/'),false);
});

test('main site opens the exact HTTPS editor origin without project or session data in the URL',()=>{
  const entry=W.drawingEntry('https://patch.ditaknet.com/?token=private#map/one',{companyId:'a/b & c'});
  const target=new URL(entry.href);
  assert.equal(entry.external,true);assert.equal(target.origin,'https://editor.ditaknet.com');
  assert.equal(target.pathname,'/');assert.equal(target.search,'');assert.equal(target.hash,'');
  assert.equal(W.drawingEntry('https://patch.ditaknet.com/').href,'https://editor.ditaknet.com/');
});

test('previews and local installations retain drawing while the production demo can launch a clone',()=>{
  for(const url of ['https://editor.ditaknet.com/','http://localhost:3000/','http://192.168.1.10/','https://preview.vercel.app/','https://patch.ditaknet.com.example.org/']){
    assert.deepEqual(W.drawingEntry(url),{href:'#drawing',external:false});
  }
  assert.deepEqual(W.drawingEntry('https://patch.ditaknet.com/?demo=1',{demo:true}),{href:'https://editor.ditaknet.com/',external:true});
});
