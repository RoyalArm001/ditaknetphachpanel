'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verify,apply,e2e}=require('../scripts/apply-backup-migration');
function poolMock({active=true,secondLock=false,connectError=false}={}){
 const clients=[];return {clients,async query(sql){return {rows:sql.includes('cron.job')?[{active,schedule:'0 * * * *',command:'SELECT rackmap.capture_automatic_backup();'}]:[{source:"pg_try_advisory_xact_lock(hashtext('hourly_cloud_backup'))"}]};},async connect(){if(connectError&&clients.length)throw new Error('Connection failed');const index=clients.length,client={commands:[],released:false,async query(sql){this.commands.push(sql);return {rows:[{acquired:index===0||secondLock}]};},release(){this.released=true;}};clients.push(client);return client;}};
}
test('backup verification checks cron and real cross-transaction lock exclusion, releasing both clients',async()=>{
 const pool=poolMock();assert.deepEqual(await verify(pool),{cron:true,advisoryLock:true});
 assert.ok(pool.clients.every(c=>c.released&&c.commands.at(-1)==='ROLLBACK'));
 await assert.rejects(verify(poolMock({active:false})),/job verification/);
 const broken=poolMock({secondLock:true});await assert.rejects(verify(broken),/contention/);assert.ok(broken.clients.every(c=>c.released));
 const disconnected=poolMock({connectError:true});await assert.rejects(verify(disconnected),/Connection/);assert.ok(disconnected.clients[0].released);
});
test('migration runner rolls back and releases client on SQL failure',async()=>{
 const commands=[];let released=false;
 const pool={query:async()=>({rows:[{version:9}]}),connect:async()=>({async query(sql){commands.push(sql);if(sql.includes('CREATE EXTENSION'))throw new Error('pg_cron unavailable');},release(){released=true;}})};
 await assert.rejects(apply(pool),/pg_cron/);assert.equal(commands.at(-1),'ROLLBACK');assert.ok(released);
});
test('cloud E2E refuses missing credentials and requires newly created snapshot in authenticated list',async t=>{
 const pool={query:async()=>({rows:[{id:42}]})};
 await assert.rejects(e2e(pool,{}),/CLOUD_VERIFY/);
 await assert.rejects(e2e(pool,{CLOUD_VERIFY_URL:'http://example.test',CLOUD_VERIFY_COOKIE:'secret'}),/HTTPS/);
 const env={CLOUD_VERIFY_URL:'https://example.test',CLOUD_VERIFY_COOKIE:'secret',CLOUD_VERIFY_SPACE:'account',CLOUD_VERIFY_COMPANY:'own'};
 let listed=true;
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url.searchParams.get('space'),'account');assert.equal(url.searchParams.get('company'),'own');assert.equal(options.redirect,'error');assert.equal(options.headers.Cookie,'secret');return {ok:true,json:async()=>url.pathname.endsWith('status')?{enabled:true,healthy:true}:listed?[{id:'42'}]:[]};});
 assert.deepEqual(await e2e(pool,env),{snapshotCreated:true,statusHealthy:true,snapshotListed:true});
 listed=false;await assert.rejects(e2e(pool,env),/missing/);
});
