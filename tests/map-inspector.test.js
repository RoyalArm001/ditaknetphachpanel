'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const locales=require('../src/shared/locales');

test('map inspector styles enforce fixed card layout with no vertical or horizontal container scrolling and wrap actions',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/client/css/maps.css'),'utf8');
  assert.ok(css.includes('.map-inspector{max-height:none;overflow:hidden!important;overflow-y:hidden!important;overflow-x:hidden!important'),'map-inspector has overflow: hidden and no vertical/horizontal container scrolling');
  assert.ok(css.includes('.map-inspector-actions{display:grid;grid-template-columns:1fr auto auto'),'map-inspector-actions uses strict grid layout instead of overflowing horizontally');
  assert.ok(css.includes('.map-inspector-actions>.map-action-full{grid-column:1/-1;width:100%}'),'primary action spans full width');
  assert.ok(css.includes('.map-panel-preview{width:320px;max-width:calc(100% - 40px);overflow-x:hidden'),'map-panel-preview prevents horizontal overflow');
  assert.ok(css.includes('.map-title-edit-btn'),'map-title-edit-btn styles exist for quick inline title editing');
  assert.ok(css.includes('grid-template-columns:110px minmax(0,1fr)'),'dl columns provide at least 110px so port count label is not truncated');
  assert.ok(css.includes('.map-inspector{position:absolute;left:10px'),'map-inspector is positioned on the left');
  assert.ok(css.includes('@keyframes map-inspector-slide-in{from{transform:translateX(calc(-100% - 24px))'),'inspector slides in from the left');
  assert.ok(css.includes('body.map-view #content:not(:fullscreen) .map-topbar{display:none!important}'),'non-fullscreen topbar is hidden so project text does not bleed into inspector');
  assert.ok(css.includes('z-index:12'),'inspector has z-index 12 to remain cleanly above map overlays');
});

test('map inspector markup and actions include quick title rename button and handler',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../src/client/js/maps.js'),'utf8');
  assert.ok(js.includes('data-map-action="edit-endpoint-name"'),'maps.js has edit-endpoint-name action trigger');
  assert.ok(js.includes('map-title-edit-btn'),'maps.js renders pencil button next to endpoint title');
  assert.ok(js.includes('function editEndpointName()'),'maps.js defines editEndpointName handler');
  assert.ok(js.includes("if(action==='edit-endpoint-name'){editEndpointName();return;}"),'maps.js routes click to editEndpointName');
  assert.ok(js.includes('host.scrollLeft=0;'),'maps.js resets host.scrollLeft to 0 to prevent horizontal offset');
  assert.ok(js.includes('host.scrollTop=0;'),'maps.js resets host.scrollTop to 0 to prevent vertical offset');
  assert.ok(js.includes("if(view.selectedMarkerIds.size>1){"),'maps.js correctly checks selectedMarkerIds.size without TDZ error');
  assert.ok(js.includes('if(mapBar)mapBar.hidden=!isFullscreen;'),'maps.js hides mapBar when not in fullscreen');
});

test('translations exist for quick name editing in EN and RU',()=>{
  assert.ok(locales['Խմբագրել անվանումը'], 'Խմբագրել անվանումը translated');
  assert.equal(locales['Խմբագրել անվանումը'][0], 'Edit name');
  assert.equal(locales['Խմբագրել անվանումը'][1], 'Редактировать название');

  assert.ok(locales['Անվանումը թարմացվեց'], 'Անվանումը թարմացվեց translated');
  assert.equal(locales['Անվանումը թարմացվեց'][0], 'Name updated');
  assert.equal(locales['Անվանումը թարմացվեց'][1], 'Название обновлено');
});
