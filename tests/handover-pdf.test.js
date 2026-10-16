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

test('compact PDF has one page per map, no generated marker numbers or blank footer pages',async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const chunks=await H.create(PDFDocument,fixture(),{font,kind:'maps',tr:I18n.forLanguage('en')});
  const task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks))}),doc=await task.promise;
  try{
    assert.equal(doc.numPages,3);
    for(let i=1;i<=3;i++){
      const items=(await (await doc.getPage(i)).getTextContent()).items;
      assert.ok(items.some(x=>x.str===`${i} / 3`));
      assert.ok(!items.some(x=>/^\d+$/.test(x.str)&&x.transform[5]<475&&x.transform[5]>60),'No artificial marker number badges in the map');
    }
  }finally{await task.destroy();}
});

test('compact rack diagrams put cable names inside ports and numbers underneath',async()=>{
  const state=fixture();state.floors[0].racks[0].devices[0].portList[0].cable='Cable A-01';
  const chunks=await H.create(PDFDocument,state,{font,kind:'devices',rackId:'rack-a',tr:I18n.forLanguage('en')});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks))}),doc=await task.promise;
  try{
    assert.equal(doc.numPages,1,'Two 24-port devices fit on one page');
    const items=(await (await doc.getPage(1)).getTextContent()).items;
    const cable=items.find(x=>x.str==='Cable A-01');assert.ok(cable);
    assert.ok(items.some(x=>x.str==='1'&&x.transform[5]<cable.transform[5]&&cable.transform[5]-x.transform[5]<40));
    assert.ok(!items.some(x=>x.str==='Port connections'));
  }finally{await task.destroy();}
});

test('detailed lists remain available only when requested',async()=>{
  const chunks=await H.create(PDFDocument,fixture(),{font,kind:'maps',planId:'Gym',detailed:true,tr:I18n.forLanguage('en')});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks))}),doc=await task.promise;
  try{
    assert.equal(doc.numPages,5);
    for(let i=1;i<=doc.numPages;i++){
      const items=(await (await doc.getPage(i)).getTextContent()).items;
      assert.ok(items.some(x=>x.str===`${i} / 5`),'Every page is a numbered content page');
    }
  }finally{await task.destroy();}
});

test('A3 maps and A4 rack pages keep all text and footers within their own page bounds',async()=>{
  const chunks=await H.create(PDFDocument,fixture(),{font,kind:'all',planId:'Gym',mapPageSize:'A3',tr:I18n.forLanguage('en')});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks))}),doc=await task.promise;
  try{
    assert.equal(doc.numPages,2);
    assert.ok((await doc.getPage(1)).view[2]>1100);
    assert.ok((await doc.getPage(2)).view[2]<900);
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i),items=(await page.getTextContent()).items;
      assert.ok(items.some(x=>x.str===`${i} / 2`));
      for(const item of items){assert.ok(item.transform[4]>=31&&item.transform[4]+item.width<=page.view[2]-30,item.str);assert.ok(item.transform[5]>10&&item.transform[5]<page.view[3]-10,item.str);}
    }
    const content=(await (await doc.getPage(2)).getTextContent()).items.map(x=>x.str).join(' ');
    assert.ok(content.indexOf('Switch A')<content.indexOf('Panel A'),'Devices follow descending U positions');
  }finally{await task.destroy();}
});

test('dense map chooses A3 automatically and keeps every endpoint name',async()=>{
  const state=fixture(),D=require('../src/shared/domain'),panel=state.floors[0].racks[0].devices[0];
  panel.portList=Array.from({length:72},(_,i)=>({...D.port(i+1,'dense-'+i),endpointName:'Endpoint-'+String(i+1).padStart(3,'0'),status:'used',service:'wifi'}));
  state.floorPlans=state.floorPlans.slice(0,1);state.floorPlans[0].markers=panel.portList.map((p,i)=>({id:'m'+i,portId:p.id,x:.08+(i%9)*.1,y:.08+Math.floor(i/9)*.11}));
  const chunks=await H.create(PDFDocument,state,{font,kind:'maps',tr:I18n.forLanguage('en')});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks))}),doc=await task.promise;
  try{
    assert.equal(doc.numPages,1);const page=await doc.getPage(1);assert.ok(page.view[2]>1100);
    const text=(await page.getTextContent()).items.map(x=>x.str).join(' ');
    for(const p of panel.portList)assert.ok(text.includes(p.endpointName),p.endpointName);
  }finally{await task.destroy();}
});

test('map export follows project floor order and natural area-name order',()=>{
  const state=fixture(),base=state.floorPlans[0];state.floorPlans=[state.floorPlans[2],{...base,id:'z10',name:'Zone 10'},{...base,id:'z2',name:'Zone 2'}];
  assert.deepEqual(H.select(state).plans.map(p=>p.id),['z2','z10','Upper']);
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
