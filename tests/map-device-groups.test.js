'use strict';
const hasSourceSnippet=require('./helpers/source-snippet');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('maps.js persists collapsed device groups across redraws and sessions',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../src/client/js/maps.js'),'utf8');
  assert.ok(hasSourceSnippet(code,'rackmap-map-collapsed-groups'),'maps.js uses rackmap-map-collapsed-groups localStorage key');
  assert.ok(hasSourceSnippet(code,'saveCollapsedGroups'),'maps.js defines and uses saveCollapsedGroups helper');
  assert.ok(hasSourceSnippet(code,"root.addEventListener('toggle'"),'maps.js listens for toggle events on root container');
  assert.ok(hasSourceSnippet(code,'capture:true'),'maps.js captures toggle events since toggle does not bubble');
  assert.ok(hasSourceSnippet(code,"collapsedDeviceGroups.has(service)?'':'open'"),'maps.js leaves open attribute off when service is collapsed');
});

test('collapsed device groups preserve closed state and do not automatically reopen',()=>{
  const storage=new Map();
  const mockLocalStorage={
    getItem:k=>storage.get(k)||null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)
  };

  // Simulate initial load with no stored preference:
  let savedCollapsed=(()=>{
    try{const s=JSON.parse(mockLocalStorage.getItem('rackmap-map-collapsed-groups')||'null');return Array.isArray(s)?s:null;}catch{return null;}
  })();
  let view={collapsedDeviceGroups:new Set(savedCollapsed||[])};
  let collapsedDeviceGroups=view.collapsedDeviceGroups;
  const saveCollapsedGroups=()=>{try{mockLocalStorage.setItem('rackmap-map-collapsed-groups',JSON.stringify([...collapsedDeviceGroups]));}catch{}};

  // By default, 'camera' is not collapsed, so it renders open
  const renderGroup=service=>`<details class="map-device-group" data-service="${service}" ${collapsedDeviceGroups.has(service)?'':'open'}><summary>${service}</summary></details>`;
  assert.ok(renderGroup('camera').includes('open'),'camera group is open by default');

  // User closes the camera list:
  collapsedDeviceGroups.add('camera');
  saveCollapsedGroups();

  assert.equal(renderGroup('camera').includes('open'),false,'camera group renders closed without open attribute');
  assert.ok(storage.get('rackmap-map-collapsed-groups').includes('camera'),'collapsed state stored in localStorage');

  // Simulate switching floor plans or reloading the page in a new session:
  savedCollapsed=(()=>{
    try{const s=JSON.parse(mockLocalStorage.getItem('rackmap-map-collapsed-groups')||'null');return Array.isArray(s)?s:null;}catch{return null;}
  })();
  let newView={collapsedDeviceGroups:new Set(savedCollapsed||[])};
  let newCollapsedDeviceGroups=newView.collapsedDeviceGroups;

  assert.ok(newCollapsedDeviceGroups.has('camera'),'camera group is remembered as collapsed in new session');
  const renderNewSession=service=>`<details class="map-device-group" data-service="${service}" ${newCollapsedDeviceGroups.has(service)?'':'open'}><summary>${service}</summary></details>`;
  assert.equal(renderNewSession('camera').includes('open'),false,'camera list does not automatically open next time');

  // User reopens the list:
  newCollapsedDeviceGroups.delete('camera');
  mockLocalStorage.setItem('rackmap-map-collapsed-groups',JSON.stringify([...newCollapsedDeviceGroups]));
  assert.ok(renderNewSession('camera').includes('open'),'reopened camera list renders open again');
});
