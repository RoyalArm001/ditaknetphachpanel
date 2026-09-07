const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
test('opening index from disk redirects to server without a file API request',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const vc=new VirtualConsole(),errors=[];
  vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'file:///E:/MyPachpanel/index.html',runScripts:'outside-only',virtualConsole:vc});
  try{
    const w=dom.window;let fetches=0;
    w.matchMedia=()=>({matches:false,addEventListener(){}});
    w.fetch=()=>{fetches++;throw new Error('Must not request file API');};
    w.eval(fs.readFileSync(path.join(__dirname,'../domain.js'),'utf8'));
    w.eval(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'));
    assert.equal(fetches,0);
    assert.equal(w.document.querySelector('#content a').href,'http://localhost:3000/');
    assert.match(w.document.querySelector('#content').textContent,/Start-RackMap.cmd/);
    // JSDOM cannot perform a navigation; this event proves replace() was reached.
    assert.equal(errors.length,1);assert.match(errors[0],/Not implemented: navigation/);
  }finally{dom.window.close();}
});
