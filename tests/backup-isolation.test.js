'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/shared/domain');
const {projectBackups,backupStatus}=require('../src/server/cloud-backups');

test('backup owner and space parameters isolate shared and account queries',async()=>{
  const calls=[];
  const mockPool={
    query:async(sql,params)=>{
      calls.push({sql,params});
      if(sql.includes('SELECT DISTINCT ON(p.revision)')){
        const [space,userId,companyId]=params;
        return {
          rows:[
            {revision:1,saved_at:'2026-10-09T01:00:00Z',space,user_id:userId,company_id:companyId}
          ]
        };
      }
      if(sql.includes('SELECT p.body')){
        const [space,userId,companyId,revision]=params;
        return {
          rows:[
            {body:{company:'Isolated '+space,schema:2,floors:[],networks:[]}}
          ]
        };
      }
      return {rows:[]};
    }
  };

  // 1. Shared workspace query
  const sharedBackups=projectBackups(mockPool,'shared','');
  const sharedHistory=await sharedBackups.history('company-123',[]);
  assert.equal(sharedHistory.length,1);
  assert.equal(calls[0].params[0],'shared');
  assert.equal(calls[0].params[1],'');
  assert.equal(calls[0].params[2],'company-123');

  // 2. Account workspace requires userId
  assert.throws(()=>projectBackups(mockPool,'account',''),/Backup owner required/);

  // 3. Account workspace query with userId
  const accountBackups=projectBackups(mockPool,'account','user-xyz');
  const accountHistory=await accountBackups.history('company-456',[]);
  assert.equal(accountHistory.length,1);
  assert.equal(calls[1].params[0],'account');
  assert.equal(calls[1].params[1],'user-xyz');
  assert.equal(calls[1].params[2],'company-456');

  // 4. Version retrieval verifies isolation parameters
  const sharedVer=await sharedBackups.version('company-123',1);
  assert.equal(sharedVer.state.company,'Isolated shared');
  assert.equal(calls[2].params[0],'shared');
  assert.equal(calls[2].params[1],'');
  assert.equal(calls[2].params[2],'company-123');
  assert.equal(calls[2].params[3],1);

  const accountVer=await accountBackups.version('company-456',1);
  assert.equal(accountVer.state.company,'Isolated account');
  assert.equal(calls[3].params[0],'account');
  assert.equal(calls[3].params[1],'user-xyz');
  assert.equal(calls[3].params[2],'company-456');
  assert.equal(calls[3].params[3],1);
});

test('backupStatus returns healthy metrics and handles table-not-found gracefully',async()=>{
  const mockPool={
    query:async(sql)=>{
      if(sql.includes('cron.job'))return {rows:[{enabled:true,last_backup:'2026-10-09T06:00:00Z',healthy:true}]};
      return {rows:[]};
    }
  };
  const status=await backupStatus(mockPool);
  assert.equal(status.enabled,true);
  assert.equal(status.healthy,true);
  assert.equal(status.retentionHours,72);
  assert.equal(status.intervalHours,1);

  const missingPool={
    query:async()=>{
      const err=new Error('Table missing');
      err.code='42P01';
      throw err;
    }
  };
  const fallback=await backupStatus(missingPool);
  assert.equal(fallback.enabled,false);
  assert.equal(fallback.healthy,false);
  assert.equal(fallback.last_backup,null);
});

test('custom device types can define custom models and validate properly',async()=>{
  const state=D.empty();
  state.deviceTypes=[
    {
      id:'custom-dvr',
      name:'DVR Recorder',
      models:[
        {name:'Hikvision 16-ch 2U',ports:16,height:2,sfp:0,poe:false},
        {name:'Hikvision 32-ch 3U',ports:32,height:3,sfp:2,poe:false}
      ]
    }
  ];
  D.validate(state);

  const models=D.deviceModels('custom-dvr',state);
  assert.equal(models.length,2);
  assert.equal(models[0].name,'Hikvision 16-ch 2U');
  assert.equal(models[0].ports,16);
  assert.equal(models[0].height,2);

  const defs=D.modelDefaults('custom-dvr','Hikvision 16-ch 2U',state);
  assert.notEqual(defs,null);
  assert.equal(defs.ports,16);
  assert.equal(defs.height,2);
  assert.equal(defs.sfpCount,0);
});
