'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/shared/domain');
const cloudBackups=require('../src/server/cloud-backups');

test('allCatalogModels returns presets across categories with ports and heights', () => {
  const state=D.empty();
  const models=D.allCatalogModels(state);
  assert.ok(models.length >= 25, 'Should have rich set of preset models');
  
  const ciscoSwitch=models.find(m => m.name === 'Cisco Catalyst 2960-24TT');
  assert.ok(ciscoSwitch);
  assert.equal(ciscoSwitch.ports, 24);
  assert.equal(ciscoSwitch.height, 1);
  assert.equal(ciscoSwitch.sfp, 2);

  const mikrotikPoe=models.find(m => m.name === 'MikroTik CRS328-24P-4S+RM (PoE+)');
  assert.ok(mikrotikPoe);
  assert.equal(mikrotikPoe.poe, true);
  assert.equal(mikrotikPoe.sfp, 4);

  const odfPanel=models.find(m => m.name.includes('Optical ODF 24-Port'));
  assert.ok(odfPanel);
  assert.equal(odfPanel.ports, 24);

  const server=models.find(m => m.name.includes('Dell PowerEdge R740'));
  assert.ok(server);
  assert.equal(server.height, 2);

  const nvr=models.find(m => m.name.includes('NVR 16-Channel'));
  assert.ok(nvr);
  assert.equal(nvr.ports, 16);
});

test('custom models defined on types or deviceModels appear in allCatalogModels', () => {
  const state=D.empty();
  state.deviceTypes = [
    {
      id: 'dvr',
      name: 'DVR',
      models: [
        { name: 'Hikvision TurboHD 16', ports: 16, height: 1, sfp: 0 }
      ]
    }
  ];
  state.deviceModels = [
    { type: 'switch', name: 'Custom Edge Switch 24', ports: 24, height: 1, sfp: 2, poe: true }
  ];

  const models=D.allCatalogModels(state);
  assert.ok(models.some(m => m.name === 'Hikvision TurboHD 16' && m.typeId === 'dvr'));
  assert.ok(models.some(m => m.name === 'Custom Edge Switch 24' && m.typeId === 'switch'));
});

test('cloud backupList enforces 72-hour window and space/user filtering', async () => {
  const queries=[];
  const mockPool={
    async query(sql, params){
      queries.push({sql, params});
      assert.ok(sql.includes("interval '72 hours'"), 'Must query within 72 hour retention');
      assert.ok(sql.includes("WHERE p.space=$1 AND p.user_id=$2"), 'Must enforce space and userId filter');
      return {
        rows: [
          { id: 'bk-1', created_at: new Date().toISOString(), project_count: 2, size_bytes: 4096, space: params[0], revision: 5 }
        ]
      };
    }
  };

  const sharedList=await cloudBackups.backupList(mockPool, 'shared', '', 'comp-1');
  assert.equal(sharedList.length, 1);
  assert.equal(sharedList[0].id, 'bk-1');
  assert.equal(queries[0].params[0], 'shared');
  assert.equal(queries[0].params[1], '');

  const accountList=await cloudBackups.backupList(mockPool, 'account', 'user-42', 'comp-1');
  assert.equal(accountList.length, 1);
  assert.equal(queries[1].params[0], 'account');
  assert.equal(queries[1].params[1], 'user-42');

  await assert.rejects(
    cloudBackups.backupList(mockPool, 'account', ''),
    /owner required/i
  );
});

test('cloud backupPreview retrieves snapshot details and validates structure', async () => {
  const mockPool={
    async query(sql, params){
      assert.ok(sql.includes("WHERE p.space=$1 AND p.user_id=$2 AND b.id=$3 AND p.company_id=$4"));
      const testState=D.empty();
      testState.company='Test Corp';
      testState.floors=[{id:'f1',name:'Floor 1',racks:[{id:'r1',name:'Rack 1',u:42,devices:[{id:'d1',name:'Sw1',type:'switch',pos:1,height:1,portList:[]}]}]}];
      return {
        rows: [
          { revision: 12, company_id: 'comp-1', created_at: new Date().toISOString(), body: testState }
        ]
      };
    }
  };

  const preview=await cloudBackups.backupPreview(mockPool, 'shared', '', 'bk-123', 'comp-1');
  assert.ok(preview);
  assert.equal(preview.company, 'Test Corp');
  assert.equal(preview.revision, 12);
  assert.equal(preview.floorsCount, 1);
  assert.equal(preview.racksCount, 1);
  assert.equal(preview.devicesCount, 1);
});

test('cloud backupList and backupPreview return graceful defaults on missing table', async () => {
  const missingTablePool={
    async query(){
      const err=new Error('relation does not exist');
      err.code='42P01';
      throw err;
    }
  };

  const list=await cloudBackups.backupList(missingTablePool, 'shared', '', 'comp-1');
  assert.deepEqual(list, []);

  const preview=await cloudBackups.backupPreview(missingTablePool, 'shared', '', 'bk-999', 'comp-1');
  assert.equal(preview, null);
});
