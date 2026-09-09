const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{JSDOM}=require('jsdom');
const i18n=require('../i18n'),{parse}=require('acorn');
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail('UI did not settle');}

test('English and Russian cover all Armenian source text and preserve interpolated data',()=>{
  for(const lang of ['en','ru'])assert.doesNotMatch(i18n.translate(fs.readFileSync('index.html','utf8'),lang),/[\u0531-\u0587]/);
  for(const [key,values]of Object.entries(require('../locales'))){assert.ok(!key.includes('??'));assert.equal(values.length,2);for(const value of values)assert.ok(value&&!value.includes('??'),key);}
  const font=require('fontkit').openSync('assets/DejaVuSans.ttf');
  for(const char of 'Հայերեն English Русский')assert.ok(font.hasGlyphForCodePoint(char.codePointAt(0)),char);
  for(const file of ['app.js','domain.js','personal-store.js','drive-store.js','pwa.js','rack3d.js','server.js']){
    const ast=parse(fs.readFileSync(file,'utf8'),{ecmaVersion:'latest'});
    function walk(node){
      if(!node||typeof node!=='object')return;
      const text=node.type==='Literal'&&typeof node.value==='string'?node.value:node.type==='TemplateElement'?node.value.cooked:null;
      if(text&&/[\u0531-\u0587]/.test(text))for(const lang of ['en','ru'])assert.doesNotMatch(i18n.translate(text,lang),/[\u0531-\u0587]/,file+': '+text);
      for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
    }walk(ast);
  }
  for(const lang of ['en','ru']){
    const t=i18n.forLanguage(lang),name='Հարկեր <company>';
    assert.ok(t`Ընկերություն՝ ${name}`.endsWith(name));
  }
  assert.equal(i18n.translate('Հարկեր','invalid'),'Հարկեր');
});

test('language switching preserves setup input and company data, translates new dialogs and exports',async t=>{
  const server=require('../server').createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'rackmap-language-'))});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const dom=await JSDOM.fromURL(base,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,beforeParse(w){
    w.fetch=(url,options)=>fetch(new URL(url,base),options);w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;
    w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  }});
  t.after(async()=>{dom.window.close();await new Promise(r=>server.close(r));});
  const w=dom.window,$=q=>w.document.querySelector(q);
  async function language(lang){$('#languageSelect').value=lang;$('#languageSelect').dispatchEvent(new w.Event('change'));await until(()=>!$('#languageSelect').disabled);assert.equal(w.document.documentElement.lang,lang);}
  await until(()=>$('[data-action=welcome-personal]'));
  await language('ru');assert.equal($('#content h1').textContent,'Как вы хотите работать?');
  $('[data-action=welcome-shared]').click();
  await until(()=>$('#setupForm'));$('#company').value='Հարկեր';$('#count').value='2';
  await language('en');assert.equal($('#content h1').textContent,'Start with your building');assert.equal($('#company').value,'Հարկեր');assert.equal($('#count').value,'2');
  assert.equal($('.language-picker span').textContent,'Language');
  assert.equal(w.localStorage.getItem('rackmap-language'),'en');assert.equal(w.RackDomain.statuses.free,'Free');
  $('#setupForm').requestSubmit();await until(()=>$('.floor-card'));await language('ru');
  assert.equal($('#companyLabel').textContent,'Հարկեր');assert.equal(w.RackDomain.statuses.free,'Свободен');
  assert.equal((await(await fetch(base+'/api/state')).json()).state.company,'Հարկեր');
  $('[data-action=floor]').click();await until(()=>$('#dialog').open);assert.equal($('#dialogTitle').textContent,'Новый этаж');$('#dialog').close();
  await language('hy');assert.equal(w.RackDomain.statuses.free,'Ազատ');assert.match(w.document.title,/Ցանցային ռաքեր/);
  for(const [lang,header]of [['en','Floor'],['ru','Этаж']]){
    const response=await fetch(base+'/api/export.xlsx?lang='+lang);assert.equal(response.status,200);
    const book=new(require('exceljs').Workbook)();await book.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.equal(book.worksheets[0].getCell('A1').value,header);
    const pdf=await fetch(base+'/api/export.pdf?lang='+lang);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');
  }
});

test('saved language is restored without requiring browser storage',()=>{
  for(const saved of ['hy','en','ru','unknown']){
    const dom=new JSDOM('<html lang="hy"><title>Կարգավորումներ</title><body></body></html>',{url:'https://app.test',runScripts:'outside-only'});
    dom.window.localStorage.setItem('rackmap-language',saved);
    for(const file of ['locales.js','i18n.js'])dom.window.eval(fs.readFileSync(file,'utf8'));
    assert.equal(dom.window.document.documentElement.lang,saved==='unknown'?'hy':saved);dom.window.close();
  }
  const dom=new JSDOM('<html><body></body></html>',{runScripts:'outside-only'});
  for(const file of ['locales.js','i18n.js'])dom.window.eval(fs.readFileSync(file,'utf8'));
  assert.equal(dom.window.RackI18n.setLanguage('ru'),true);dom.window.close();
});

test('account-only cloud opens sign-in and keeps entered credentials when language changes',async()=>{
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://app.test/#settings',runScripts:'outside-only'}),w=dom.window,$=q=>w.document.querySelector(q);
  w.indexedDB=new(require('fake-indexeddb').IDBFactory)();w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const requests=[];w.fetch=async url=>{requests.push(url);return url==='/api/config'?new Response(JSON.stringify({cloud:true,authRequired:true,accountEnabled:true,pinEnabled:false})):new Response(JSON.stringify({error:'Մուտք գործեք Ditaknet-ի ձեր հաշվով'}),{status:401});};
  try{
    for(const file of ['locales.js','i18n.js','domain.js','personal-store.js','app.js'])w.eval(fs.readFileSync(file,'utf8'));
    await until(()=>$('[data-action=welcome-personal]'));$('[data-action=welcome-personal]').click();
    await until(()=>$('#setupForm'));w.location.hash='#settings';
    await until(()=>$('[data-action=connect-cloud]'));$('[data-action=connect-cloud]').click();await until(()=>$('#loginForm'));
    assert.ok($('#email'));assert.equal($('#pin'),null);assert.ok(!requests.some(x=>x.includes('/api/auth/pin')));
    $('#email').value='staff@example.test';$('#password').value='unsent-test';
    $('#languageSelect').value='ru';$('#languageSelect').dispatchEvent(new w.Event('change'));await until(()=>!$('#languageSelect').disabled);
    assert.equal($('#email').value,'staff@example.test');assert.equal($('#password').value,'unsent-test');assert.equal($('label[for=password]').textContent,'Пароль');
    assert.ok(!JSON.stringify(w.localStorage).includes('unsent-test'));
  }finally{w.close();}
});
