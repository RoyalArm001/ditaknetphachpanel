'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const appSource=fs.readFileSync(require.resolve('../src/client/js/app.js'),'utf8');

function setupReleaseEnv(){
  const fakeHtml={value:''};
  let modalTitle='',modalBody='';
  const elements=new Map();

  function makeEl(id){
    const el={
      id,
      isConnected:true,
      _html:'',
      children:[],
      listeners:{},
      dataset:{},
      hidden:false,
      get innerHTML(){return this._html;},
      set innerHTML(val){
        this._html=val;
        // mock simple querySelector / querySelectorAll
      },
      addEventListener(evt,fn){this.listeners[evt]=fn;},
      querySelector(sel){
        if(sel==='#releaseSearch')return elements.get('releaseSearch')||makeEl('releaseSearch');
        if(sel==='#releaseSearchCount')return elements.get('releaseSearchCount')||makeEl('releaseSearchCount');
        if(sel==='#releaseSearchEmpty')return elements.get('releaseSearchEmpty')||makeEl('releaseSearchEmpty');
        if(sel==='#releaseList')return elements.get('releaseList')||makeEl('releaseList');
        return null;
      },
      querySelectorAll(sel){
        if(sel==='.release-card')return Array.from(elements.values()).filter(x=>x.isCard);
        return [];
      }
    };
    elements.set(id,el);
    return el;
  }

  const host=makeEl('releaseHistory');
  const releaseData={
    version:'2.10.18',
    hy:{title:'Նոր թարմացում',changes:['Տեղադրման կոճակի կարգավորում','Նոր տարբերակների պատուհան']},
    en:{title:'App update',changes:['Install button suppression','New release modal view']},
    ru:{title:'Обновление',changes:['Скрытие кнопки установки','Новое окно версий']},
    date:'2026-10-10',
    history:[
      {
        version:'2.10.17',
        hy:{title:'Կարգավորումների էջ',changes:['Արդիականացված նավիգացիա']},
        date:'2026-10-09'
      },
      {
        version:'2.10.16',
        hy:{title:'3D Ռաք',changes:['Իրական 3D տեսք','EIA-310 ռելսեր']},
        date:'2026-10-08'
      }
    ]
  };

  const context={
    esc:s=>String(s).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`),
    tr:s=>s,
    modal:(title,body)=>{modalTitle=title;modalBody=body;},
    $:sel=>sel==='#releaseHistory'?host:elements.get(sel.replace('#','')),
    fetch:async url=>{
      if(url==='/release.json')return {ok:true,json:async()=>releaseData};
      throw new Error('Not found');
    },
    AbortSignal:{timeout:()=>({})},
    Intl,Date,Array,Set,String,Number,
    globalThis:{RackI18n:{language:'hy'}},
    actions:{}
  };

  const codeSegment=appSource.slice(
    appSource.indexOf('let releaseCatalog=null;'),
    appSource.indexOf('function renderSettings(){')
  )+`\nactions['release-modal']=ver=>showReleaseModal(ver);\n`;

  vm.createContext(context);
  vm.runInContext(codeSegment,context);

  return {context,host,releaseData,getModal:()=>({title:modalTitle,body:modalBody})};
}

test('renders all releases on one single page with summary and search bar',async()=>{
  const {context,host}=setupReleaseEnv();
  await context.renderReleaseHistory();
  assert.ok(host.innerHTML.includes('release-summary'),'contains release summary cards');
  assert.ok(host.innerHTML.includes('v2.10.18'),'contains current version 2.10.18');
  assert.ok(host.innerHTML.includes('v2.10.17'),'contains historical version 2.10.17');
  assert.ok(host.innerHTML.includes('v2.10.16'),'contains historical version 2.10.16');
  assert.ok(host.innerHTML.includes('id="releaseSearch"'),'contains real-time search bar');
  assert.ok(host.innerHTML.includes('data-action="release-modal"'),'each version has modal action');
});

test('clicking release or invoking release-modal opens modal window with change details',async()=>{
  const {context,getModal}=setupReleaseEnv();
  await context.renderReleaseHistory();
  
  context.actions['release-modal']('2.10.18');
  let modal=getModal();
  assert.ok(modal.title.includes('2.10.18'),'modal title contains version');
  assert.ok(modal.body.includes('Տեղադրման կոճակի կարգավորում'),'modal body includes change items');
  assert.ok(modal.body.includes('release-badge-current'),'current version has active badge');

  context.actions['release-modal']('2.10.16');
  modal=getModal();
  assert.ok(modal.title.includes('2.10.16'),'modal opens for older historical versions');
  assert.ok(modal.body.includes('EIA-310 ռելսեր'),'modal body includes specific historical change');
});
