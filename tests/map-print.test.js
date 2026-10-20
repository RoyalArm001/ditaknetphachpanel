'use strict';
const hasSourceSnippet=require('./helpers/source-snippet');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const locales=require('../src/shared/locales');

test('map print styles enforce clean landscape orientation, center canvas, and hide UI chrome',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/client/css/maps.css'),'utf8');
  assert.ok(css.includes('@media print'),'@media print rule exists in maps.css');
  assert.ok(css.includes('size: landscape'),'@page specifies landscape orientation');
  assert.ok(css.includes('.map-canvas'),'canvas styling exists for print');
  assert.ok(css.includes('transform: none !important'),'print resets canvas transform');
  assert.ok(css.includes('margin: 0 auto !important'),'print centers canvas');
  assert.ok(css.includes('.map-bottom-toolbar'),'bottom toolbar is hidden in print');
  assert.ok(css.includes('.map-view-tools'),'view tools are hidden in print');
  assert.ok(css.includes('.map-topbar'),'topbar is hidden in print');
  assert.ok(css.includes('print-color-adjust: exact !important'),'exact print color adjustment is enabled');
});

test('map marker label directions support 4-way collision avoidance styles',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/client/css/maps.css'),'utf8');
  assert.ok(css.includes('.map-marker-label[data-dir=up]'),'up direction styling exists');
  assert.ok(css.includes('.map-marker-label[data-dir=down]'),'down direction styling exists');
  assert.ok(css.includes('.map-marker-label[data-dir=left]'),'left direction styling exists');
  assert.ok(css.includes('.map-marker-label[data-dir=right]'),'right direction styling exists');
});

test('maps.js includes printer icon, print action button and resolveLabelDirections',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../src/client/js/maps.js'),'utf8');
  assert.ok(hasSourceSnippet(js,'printer:'),'printer path exists in paths');
  assert.ok(hasSourceSnippet(js,'data-map-action="print"'),'print button exists in top actions');
  assert.ok(hasSourceSnippet(js,"if(action==='print'){window.print();return;}"),'print action triggers window.print');
  assert.ok(hasSourceSnippet(js,'resolveLabelDirections'),'resolveLabelDirections is defined to prevent label collisions');
  assert.ok(hasSourceSnippet(js,'data-dir='),'label element receives data-dir attribute');
});

test('translations exist for printing floor plan in EN and RU',()=>{
  assert.ok(locales['Տպել հատակագիծը'], 'Տպել հատակագիծը exists');
  assert.equal(locales['Տպել հատակագիծը'][0], 'Print floor plan');
  assert.equal(locales['Տպել հատակագիծը'][1], 'Печать плана этажа');
});
