'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const locales=require('../src/shared/locales');

test('map inspector styles enforce no horizontal scrolling and wrap actions',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/client/css/maps.css'),'utf8');
  assert.ok(css.includes('.map-inspector{max-height:calc(100% - 200px);overflow-y:auto;overflow-x:hidden'),'map-inspector has overflow-x: hidden');
  assert.ok(css.includes('.map-inspector-actions{display:flex;flex-wrap:wrap'),'map-inspector-actions wraps buttons instead of overflowing horizontally');
  assert.ok(css.includes('.map-panel-preview{width:320px;max-width:calc(100% - 40px);overflow-x:hidden'),'map-panel-preview prevents horizontal overflow');
  assert.ok(css.includes('.map-title-edit-btn'),'map-title-edit-btn styles exist for quick inline title editing');
});

test('map inspector markup and actions include quick title rename button and handler',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../src/client/js/maps.js'),'utf8');
  assert.ok(js.includes('data-map-action="edit-endpoint-name"'),'maps.js has edit-endpoint-name action trigger');
  assert.ok(js.includes('map-title-edit-btn'),'maps.js renders pencil button next to endpoint title');
  assert.ok(js.includes('function editEndpointName()'),'maps.js defines editEndpointName handler');
  assert.ok(js.includes("if(action==='edit-endpoint-name'){editEndpointName();return;}"),'maps.js routes click to editEndpointName');
});

test('translations exist for quick name editing in EN and RU',()=>{
  assert.ok(locales['Խմբագրել անվանումը'], 'Խմբագրել անվանումը translated');
  assert.equal(locales['Խմբագրել անվանումը'][0], 'Edit name');
  assert.equal(locales['Խմբագրել անվանումը'][1], 'Редактировать название');

  assert.ok(locales['Անվանումը թարմացվեց'], 'Անվանումը թարմացվեց translated');
  assert.equal(locales['Անվանումը թարմացվեց'][0], 'Name updated');
  assert.equal(locales['Անվանումը թարմացվեց'][1], 'Название обновлено');
});
