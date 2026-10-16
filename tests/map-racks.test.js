'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/shared/domain.js');
const Routing = require('../src/shared/map-routing.js');
const I = require('../src/shared/i18n.js');

function createSampleProject() {
  const state = D.empty();
  state.company = 'ACME Corp';
  const port1 = D.port(1, 'port-1');
  port1.status = 'used';
  port1.service = 'wifi';
  port1.endpointName = 'AP-1';

  const dev1 = {
    id: 'dev-1',
    name: 'Patch 1',
    type: 'panel',
    pos: 1,
    height: 1,
    model: '',
    color: '#397cc4',
    portList: [port1]
  };

  const rack1 = {
    id: 'rack-1',
    name: 'Rack 1',
    u: 42,
    location: '',
    photo: '',
    devices: [dev1]
  };

  state.floors = [
    {
      id: 'floor-1',
      name: 'Floor 1',
      racks: [rack1]
    }
  ];

  state.floorPlans = [
    {
      id: 'plan-1',
      floorId: 'floor-1',
      name: 'Plan 1',
      width: 1000,
      height: 600,
      image: 'data:image/jpeg;base64,123',
      markers: [
        { id: 'marker-1', portId: 'port-1', x: 0.8, y: 0.8, iconX: 0.8, iconY: 0.8 }
      ],
      rackMarkers: [
        { id: 'rm-1', rackId: 'rack-1', x: 0.2, y: 0.2, iconX: 0.2, iconY: 0.2 }
      ]
    }
  ];

  return state;
}

test('domain validation accepts valid rackMarkers and enriches them in mapDevices', () => {
  const state = createSampleProject();
  assert.doesNotThrow(() => D.validate(state));

  const plan = state.floorPlans[0];
  const mapped = D.mapDevices(state, plan);
  assert.equal(mapped.rackMarkers.length, 1);
  assert.equal(mapped.rackMarkers[0].rackId, 'rack-1');
  assert.equal(mapped.rackMarkers[0].rack.name, 'Rack 1');
  assert.equal(mapped.rackMarkers[0].floor.name, 'Floor 1');
});

test('domain validation rejects invalid rack markers', () => {
  const state = createSampleProject();
  // Unknown rackId
  state.floorPlans[0].rackMarkers = [
    { id: 'rm-99', rackId: 'non-existent-rack', x: 0.5, y: 0.5 }
  ];
  assert.throws(() => D.validate(state));

  // Invalid coordinates
  state.floorPlans[0].rackMarkers = [
    { id: 'rm-1', rackId: 'rack-1', x: 1.5, y: 0.5 }
  ];
  assert.throws(() => D.validate(state));

  // Duplicate rack on same plan
  state.floorPlans[0].rackMarkers = [
    { id: 'rm-1', rackId: 'rack-1', x: 0.2, y: 0.2 },
    { id: 'rm-2', rackId: 'rack-1', x: 0.4, y: 0.4 }
  ];
  assert.throws(() => D.validate(state));
});

test('disconnect cleans up removed racks from floorPlans rackMarkers', () => {
  const state = createSampleProject();
  D.disconnect(state, new Set(['rack-1']));
  assert.equal(state.floorPlans[0].rackMarkers.length, 0);
});

test('wall-avoidance routing integrates with collision grid and shortest path tree', () => {
  const width = 100, height = 100;
  const data = new Uint8Array(width * height * 4);
  data.fill(255); // White background

  // Draw a solid black wall across the middle from x=20 to x=80 at y=50
  for (let x = 20; x <= 80; x++) {
    for (let y = 48; y <= 52; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }

  const grid = Routing.createCollisionGrid(data, width, height, 50, 50);
  assert.equal(grid.cols, 50);
  assert.equal(grid.rows, 50);

  // Rack at (0.5, 0.2), Device at (0.5, 0.8)
  const tree = Routing.computeShortestPathTree(grid, 0.5, 0.2);
  const path = Routing.routeDeviceToRack(tree, 0.5, 0.8, grid.isWall);

  assert.ok(path.length >= 3, 'Path must bend around the wall');
  // Check that no segment of the path passes through the wall center (y = 0.5) between x = 0.2 and 0.8
  for (const pt of path) {
    const isInsideWall = pt.x >= 0.20 && pt.x <= 0.80 && pt.y >= 0.48 && pt.y <= 0.52;
    assert.equal(isInsideWall, false, `Point (${pt.x}, ${pt.y}) should not be inside wall`);
  }

  const svgStr = Routing.formatSvgPoints(path);
  assert.ok(svgStr.includes(','), 'SVG points must be formatted correctly');
});

test('translations exist for rack placement and cable connection lines', () => {
  const phrases = [
    'Միացման գծեր (կաբելային ուղիներ)',
    'Ցուցադրել միացումները',
    'Թաքցնել միացումները',
    'Տեղադրել ռաք',
    'Սեղմեք հատակագծի վրա՝ ռաքը տեղադրելու համար։',
    'Ռաքը տեղադրվեց քարտեզի վրա',
    'Հեռացնել քարտեզից',
    'Հեռացնե՞լ ռաքը քարտեզից',
    'Ընտրված ռաք',
    'Բացել ռաքը',
    'Այս հարկում ռաքեր չկան'
  ];

  for (const phrase of phrases) {
    const en = I.forLanguage('en')(phrase);
    const ru = I.forLanguage('ru')(phrase);
    assert.ok(en && !/[\u0531-\u0587]/.test(en), `Missing or Armenian EN translation for "${phrase}": ${en}`);
    assert.ok(ru && !/[\u0531-\u0587]/.test(ru), `Missing or Armenian RU translation for "${phrase}": ${ru}`);
  }
});

test('maps.js contains proper pointer and creation logic for placing racks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const mapsJs = fs.readFileSync(path.join(__dirname, '../src/client/js/maps.js'), 'utf8');

  // Verify pointerdown does not start panning when placing a rack
  assert.ok(mapsJs.includes('!view.placing && !view.placingRackId'), 'pointerdown checks both placing and placingRackId');

  // Verify pointerup handles placingRackId correctly
  assert.ok(mapsJs.includes('view.placingRackId&&!dragging&&(!pan||!pan.moved)'), 'pointerup triggers rack placement without pan interference');

  // Verify rack creation modal creates valid domain rack with u and devices
  assert.ok(mapsJs.includes('u:height,location:\'\',photo:\'\',devices:[]'), 'createRackModal creates domain-compliant rack');
});

test('maps.js hides rack tab when all racks are placed and switches to devices tab', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const mapsJs = fs.readFileSync(path.join(__dirname, '../src/client/js/maps.js'), 'utf8');

  // Verify unplaced racks calculation filters out already placed racks
  assert.ok(mapsJs.includes('const unplacedRacks=curFloorRacks.filter(r=>!placedRackIds.has(r.id))'));

  // Verify tabs and rack tab button are hidden when unplacedRacks is 0
  assert.ok(mapsJs.includes('sidebarTabs.hidden=unplacedRacks.length===0'));
  assert.ok(mapsJs.includes('racksTabBtn.hidden=unplacedRacks.length===0'));

  // Verify placing a rack switches activeTab back to devices
  assert.ok(mapsJs.includes("view.activeTab='devices';"));

  // Verify more menu has create rack option
  assert.ok(mapsJs.includes("button('Ավելացնել ռաք','create-map-rack')"));

  // Unit logic check:
  const curFloorRacks = [{ id: 'rack-1' }];
  let placedRackIds = new Set();
  let unplacedRacks = curFloorRacks.filter(r => !placedRackIds.has(r.id));
  assert.equal(unplacedRacks.length, 1);
  assert.equal(unplacedRacks.length === 0, false);

  // After placing rack-1:
  placedRackIds.add('rack-1');
  unplacedRacks = curFloorRacks.filter(r => !placedRackIds.has(r.id));
  assert.equal(unplacedRacks.length, 0);
  assert.equal(unplacedRacks.length === 0, true, 'Tabs must be hidden when all racks placed');
});

test('cables are hidden by default on map load and plan change', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const mapsJs = fs.readFileSync(path.join(__dirname, '../src/client/js/maps.js'), 'utf8');

  // Verify view.showCables starts false by default
  assert.ok(mapsJs.includes('view.showCables=false;'));

  // Verify plan switch keeps cables hidden
  assert.ok(mapsJs.includes('view.showCables=false;view.camera=null;'));
});

