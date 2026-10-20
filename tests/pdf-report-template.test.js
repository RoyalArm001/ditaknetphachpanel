'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const PDFDocument=require('pdfkit'),H=require('../src/shared/handover-pdf'),I18n=require('../src/shared/i18n');
const Connections=require('../src/shared/connection-report'),{fixture}=require('./fixtures/handover');
const font=path.join(__dirname,'../assets/fonts/DejaVuSans.ttf');
async function read(chunks){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(Buffer.concat(chunks))}),doc=await task.promise,pages=[];
  try{
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i),items=(await page.getTextContent()).items.filter(x=>x.str.trim());
      assert.ok(page.view[2]>page.view[3],'Reports use a landscape page for readable columns');
      for(const item of items){
        assert.ok(item.transform[4]>=31&&item.transform[4]+item.width<=811,'Text stays within page width: '+item.str);
        assert.ok(item.transform[5]>18&&item.transform[5]<page.view[3]-15,'Text stays within page height: '+item.str);
      }
      assert.ok(items.some(x=>x.str===`${i} / ${doc.numPages}`));
      assert.ok(items.some(x=>x.str==='Տնօրեն Վ․ Խաչատրայան'));
      pages.push(items.map(x=>x.str).join(' '));
    }
    return pages;
  }finally{await task.destroy();}
}
test('reports separate columns, retain endpoint names and summarize only consecutive empty free ports',async()=>{
  const state=fixture(),ports=state.floors[0].racks[0].devices[0].portList;
  ports[5].endpointName='R9.1';ports[8].vlan='20';ports[11].notes='Keep this note';ports[14].status='fault';
  const pages=await read(await H.createPortReport(PDFDocument,state,{font,tr:I18n.forLanguage('en'),filters:{rack:'rack-a',type:'panel'}}));
  const text=pages.join(' ');
  for(const expected of ['Device / purpose','Cable','Location','Connection','VLAN','Status','R9.1','Keep this note','16-24','Unused ports'])assert.ok(text.includes(expected),expected);
  assert.ok(!text.includes('4-24'),'Named, VLAN, noted and faulty ports cannot disappear in a free range');
  assert.doesNotMatch(text,/Panel B|Panel C|NEVER-EXPORT-THIS/);
  assert.ok(pages.length<=2,'Blank ports do not inflate a compact report');
});
test('every continuation repeats device and column headings in all report languages',async()=>{
  for(const language of ['hy','en','ru']){
    const state=fixture(),tr=I18n.forLanguage(language),panel=state.floors[0].racks[0].devices[0];
    panel.portList.forEach((port,i)=>{port.endpointName='Endpoint-'+(i+1);port.cable='CABLE-'+(i+1);});
    const pages=await read(await H.createPortReport(PDFDocument,state,{font,tr,filters:{rack:'rack-a',type:'panel'}}));
    assert.ok(pages.length>1);
    for(const page of pages){assert.ok(page.includes('Panel A'));assert.ok(page.includes(tr('Մալուխ')));assert.ok(/Endpoint-\d+/.test(page),'No orphan header page');}
    const text=pages.join(' ');for(let i=1;i<=24;i++)assert.ok(text.includes('Endpoint-'+i));
  }
});
test('long names, long identifiers and multipage notes are wrapped without dropping their end',async()=>{
  const state=fixture(),row=state.floors[0].racks[0].devices[0].portList[0];
  state.company='Ընկերության երկար անվանում '.repeat(7);
  state.floors[0].name='Հարկի երկար անվանում '.repeat(6);state.floors[0].racks[0].name='Ռաքի երկար անվանում '.repeat(6);
  row.endpointName='Endpoint-X';row.cable='LONG-CABLE-'+('1234567890'.repeat(12))+'-END';
  row.notes=('Սարքի մանրամասն բացատրություն և միացման կարգը։ '.repeat(200))+'FINAL-NOTE-MARKER';
  const pages=await read(await H.createPortReport(PDFDocument,state,{font,tr:I18n.forLanguage('hy'),filters:{query:'Endpoint-X',type:'panel'}}));
  assert.ok(pages.length>1);const text=pages.join(' ');
  assert.ok(text.includes('FINAL-NOTE-MARKER'));assert.ok(text.includes('-END'));
  assert.doesNotMatch(text,/NEVER-EXPORT-THIS/);
});
test('empty selection is a single branded page and service filters keep their scope',async()=>{
  const state=fixture(),tr=I18n.forLanguage('en');
  const empty=await read(await H.createPortReport(PDFDocument,state,{font,tr,filters:{query:'no-such-endpoint'}}));
  assert.equal(empty.length,1);assert.ok(empty[0].includes(tr('Ընտրված ֆիլտրերով պորտեր չկան։')));
  const filtered=await read(await H.createPortReport(PDFDocument,state,{font,tr,filters:{rack:'rack-a',type:'panel',services:'wifi'}}));
  assert.ok(filtered.join(' ').includes('WiFi B zone'));assert.ok(!filtered.join(' ').includes('4-24'));
});
test('connection audit distinguishes duplicate, missing and unlinked peers with names and notes',async()=>{
  const state=fixture(),ports=state.floors[0].racks[0].devices[0].portList;
  ports[0].endpointName='Camera-C1';ports[1].switchPortId=ports[0].switchPortId;ports[2].switchPortId='missing';ports[2].notes='Repair cable connector';ports[3].status='used';
  const pages=await read(await H.createConnectionReport(PDFDocument,state,{font,tr:I18n.forLanguage('en'),report:Connections.inspect(state,'rack-a')}));
  const text=pages.join(' ');
  for(const expected of ['Camera-C1','Duplicate','Invalid link','Unlinked','Repair cable connector','Switch A'])assert.ok(text.includes(expected),expected);
  assert.doesNotMatch(text,/Panel B|UPS B|NEVER-EXPORT-THIS/);
});
