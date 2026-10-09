'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const PDFDocument=require('pdfkit');
const H=require('../src/shared/handover-pdf');
const I18n=require('../src/shared/i18n');
const {fixture}=require('./fixtures/handover');
const font=path.join(__dirname,'../assets/fonts/DejaVuSans.ttf');

test('PDF selection isolates floors, areas, racks, custom types and invalid IDs',()=>{
  const state=fixture();
  assert.equal(H.select(state).devices.length,5);
  assert.deepEqual(H.select(state,{floorId:'minus-one'}).plans.map(p=>p.id),['Gym','Office']);
  assert.deepEqual(H.select(state,{floorId:'plus-one'}).plans.map(p=>p.id),['Upper']);
  assert.deepEqual(H.select(state,{planId:'Gym'}).devices.map(x=>x.d.id),['Panel A','Switch A']);
  assert.deepEqual(H.select(state,{rackId:'rack-b'}).plans.map(p=>p.id),['Office']);
  assert.deepEqual(H.select(state,{rackId:'rack-b'}).devices.map(x=>x.d.id),['Panel B','UPS B']);
  assert.deepEqual(H.select(state,{deviceType:'ups'}).devices.map(x=>x.d.id),['UPS B']);
  assert.deepEqual(H.select(state,{planId:'missing'}).devices,[]);
  assert.deepEqual(H.select(state,{floorId:'plus-one',planId:'Gym'}).devices,[]);
  assert.equal(H.select(state,{planId:'Gym',deviceType:'switch'}).plans[0].selectedMarkers.length,1);
});

test('PDF output contains selected models, type, IP and labels in all languages without credentials',async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  for(const language of ['hy','en','ru']){
    const chunks=await H.create(PDFDocument,fixture(),{font,tr:I18n.forLanguage(language),kind:'all',planId:'Gym',date:new Date('2026-10-09T00:00:00Z')});
    const task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks)),useSystemFonts:true,isEvalSupported:false}),doc=await task.promise;
    try{
      const pages=[];
      for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const content=await page.getTextContent();pages.push(content.items.map(x=>x.str).join(' '));}
      const text=pages.join('\n');
      assert.match(text,/CAT6-A/);assert.match(text,/SW-24-PoE/);assert.match(text,/192\.168\.1\.2/);assert.match(text,/WiFi B zone/);
      assert.ok(text.includes(I18n.forLanguage(language)('Սվիչ')));
      assert.doesNotMatch(text,/CAT6-B|CAT6-C|UPS-1500|NEVER-EXPORT-THIS/);
      assert.ok(pages[0].includes('Gym'));assert.ok(pages[0].includes('2026-10-09'));
    }finally{await task.destroy();}
  }
});

test('large patch panels split schematics into pages inside the printable area',async()=>{
  const D=require('../src/shared/domain'),state=fixture(),device=state.floors[0].racks[0].devices[0];
  device.portList=Array.from({length:120},(_,i)=>D.port(i+1,`large-${i}`));
  const chunks=await H.create(PDFDocument,state,{font,tr:I18n.forLanguage('en'),kind:'devices',deviceId:device.id});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks))}),doc=await task.promise;
  try{let schematics=0;for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();if(content.items.some(x=>x.str.includes('Patch panel diagram'))){schematics++;for(const item of content.items){assert.ok(item.transform[4]>=31&&item.transform[4]+item.width<=812,`Text outside page: ${item.str}`);assert.ok(item.transform[5]>10&&item.transform[5]<580,`Text outside page: ${item.str}`);}}}assert.equal(schematics,2);}finally{await task.destroy();}
});

test('shared PDF uses rack selection and accepts project-defined device types',async()=>{
  const {DatabaseSync}=require('node:sqlite'),{createApp}=require('../src/server/server');
  const db=new DatabaseSync(':memory:'),state=fixture();
  const server=createApp({cloud:true,auth:{authenticate:async()=>({id:'test-user'})},store:{db,read:async()=>({state,revision:1}),close(){}},font});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(base+'/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'devices',floorId:'minus-one',rackId:'rack-b',planId:'',deviceId:'',deviceType:'ups',language:'en',days:7,revision:1})});
    assert.equal(response.status,201,await response.clone().text());
    const {token}=await response.json(),pdf=await fetch(base+'/api/shared/'+token);
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(await pdf.arrayBuffer())}),doc=await task.promise;
    try{let text='';for(let i=1;i<=doc.numPages;i++)text+=(await (await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');assert.match(text,/UPS-1500/);assert.doesNotMatch(text,/CAT6-A|CAT6-C|SW-24-PoE/);}finally{await task.destroy();}
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
