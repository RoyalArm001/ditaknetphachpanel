'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/client/js/maps'),'utf8');
const font=fs.readFileSync(require.resolve('../assets/fonts/DejaVuSans.ttf'));

function setup(){
  const scripts=[],reports=[];
  const context=vm.createContext({
    Blob,Uint8Array,ArrayBuffer,
    document:{
      createElement(tag){assert.equal(tag,'script');return {remove(){this.removed=true;}};},
      head:{append(script){scripts.push(script);}}
    },
    fetch:async url=>{assert.equal(url,'/assets/DejaVuSans.ttf');return {ok:true,arrayBuffer:async()=>font};},
    RackHandover:{create:async(...args)=>{reports.push(args);return ['%PDF-test'];}}
  });
  vm.runInContext(source,context);
  return {context,scripts,reports,exportPdf:context.RackMaps.exportPdf,load(){context.PDFDocument=function PDFDocument(){};scripts.at(-1).onload();}};
}

test('cold PDF exports share one library load and reuse it for later exports',async()=>{
  const h=setup(),state={company:'Test'},options={floorId:'floor-2',mapPageSize:'A3'},tr=x=>x;
  const first=h.exportPdf(state,'maps','plan-1',tr,options);
  const second=h.exportPdf(state,'devices','',tr);
  const pending=Promise.all([first,second]);
  assert.equal(h.scripts.length,1);assert.equal(h.reports.length,0);assert.equal(h.scripts[0].src,'/pdfkit.js');
  h.load();
  for(const blob of await pending){assert.equal(blob.type,'application/pdf');assert.equal(await blob.text(),'%PDF-test');}
  assert.equal(h.reports[0][0],h.context.PDFDocument);assert.equal(h.reports[0][1],state);
  assert.equal(h.reports[0][2].floorId,'floor-2');assert.equal(h.reports[0][2].planId,'plan-1');assert.equal(h.reports[0][2].mapPageSize,'A3');
  assert.deepEqual(h.reports[0][2].font,new Uint8Array(font));
  await h.exportPdf(state,'all','',tr);
  assert.equal(h.scripts.length,1);assert.equal(h.reports.length,3);
});

test('failed library loads reject waiting exports and allow a fresh retry',async()=>{
  const h=setup(),tr=()=> 'Translated loading error';
  const failures=[h.exportPdf({},'maps','',tr),h.exportPdf({},'maps','',tr)].map(p=>assert.rejects(p,/Translated loading error/));
  assert.equal(h.scripts.length,1);h.scripts[0].onerror();await Promise.all(failures);
  assert.equal(h.scripts[0].removed,true);assert.equal(h.reports.length,0);
  const retry=h.exportPdf({},'maps','',tr);assert.equal(h.scripts.length,2);h.load();
  assert.equal((await retry).type,'application/pdf');
});

test('a loaded script without PDFDocument can be retried',async()=>{
  const h=setup(),failure=assert.rejects(h.exportPdf({},'maps','',()=> 'Translated loading error'),/Translated loading error/);
  h.scripts[0].onload();await failure;assert.equal(h.scripts[0].removed,true);
  const retry=h.exportPdf({},'maps','',x=>x);h.load();await retry;
  assert.equal(h.scripts.length,2);
});

test('a cold map export produces a readable Armenian PDF using the browser PDFKit bundle',async()=>{
  const h=setup(),{fixture}=require('./fixtures/handover'),I18n=require('../src/shared/i18n');
  const logo=fs.readFileSync(require.resolve('../assets/branding/smart-tech.png'));
  h.context.fetch=async url=>{
    assert.ok(['/assets/DejaVuSans.ttf','/assets/smart-tech.png'].includes(url));
    const bytes=url.endsWith('.ttf')?font:logo;
    return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  };
  for(const name of ['domain','map-label-layout','map-marker-groups','pdf-branding','handover-pdf']){
    vm.runInContext(fs.readFileSync(require.resolve('../src/shared/'+name),'utf8'),h.context);
  }
  const pending=h.exportPdf(fixture(),'maps','Gym',I18n.forLanguage('hy'));
  h.context.PDFDocument=require('pdfkit/js/pdfkit.standalone');h.scripts[0].onload();
  const blob=await pending,pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false});
  try{
    const doc=await task.promise;assert.equal(doc.numPages,1);
    const text=(await (await doc.getPage(1)).getTextContent()).items.map(item=>item.str).join(' ');
    assert.match(text,/Gym/);assert.match(text,/WiFi B zone/);assert.ok(text.includes(I18n.forLanguage('hy')('Քարտեզ')));
  }finally{await task.destroy();}
});
