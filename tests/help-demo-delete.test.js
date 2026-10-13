'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const D=require('../src/shared/domain'),{fixture,createStore}=require('../src/client/js/demo'),{removeLocal,removePostgres}=require('../src/server/project-delete');
test('demo fixture has valid floors, network links and independent in-memory edits',async()=>{
 const seed=fixture();D.validate(seed);assert.equal(seed.floors.length,2);assert.ok(D.ports(seed).some(x=>x.p.switchPortId));
 const a=createStore(seed),b=createStore(seed),first=await a.request('/api/state?company=demo');first.state.company='Changed';
 await a.request('/api/state?company=demo',{method:'PUT',body:JSON.stringify({state:first.state,revision:0})});
 assert.equal((await b.request('/api/state')).state.company,'Demo Office');assert.equal(seed.company,'Demo Office');
 await assert.rejects(a.request('/api/auth/logout',{method:'POST'}));await assert.rejects(a.request('/api/account/login',{method:'POST'}));
 a.reset();assert.equal((await a.request('/api/state')).state.company,'Demo Office');
});
test('help has deletion instructions and translations for every title and step',()=>{
 require('../src/client/js/help');const messages=require('../src/shared/locales');
 for(const [,title,steps] of RackHelp.articles){assert.equal(messages[title]?.length,2,title);for(const text of steps)assert.equal(messages[text]?.length,2,text);}
 assert.ok(RackHelp.html(x=>x,String).includes('/?demo=1'));
});
function memory(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE companies(id TEXT PRIMARY KEY,revision INTEGER,body TEXT);CREATE TABLE company_history(company_id TEXT,revision INTEGER,body TEXT);CREATE TABLE view_links(scope TEXT,company_id TEXT);');
 for(const id of ['a','b']){db.prepare('INSERT INTO companies VALUES(?,0,?)').run(id,JSON.stringify({...D.empty(),company:id}));db.prepare('INSERT INTO company_history VALUES(?,0,?)').run(id,'{}');db.prepare("INSERT INTO view_links VALUES('team',?)").run(id);}
 const read=id=>{const row=db.prepare('SELECT * FROM companies WHERE id=?').get(id);return row&&{revision:row.revision,state:JSON.parse(row.body)};};
 return {db,read,remove:(...args)=>removeLocal(db,read,...args),close:()=>db.close()};
}
test('project deletion checks name/revision and removes only its data, history and links',t=>{
 const store=memory();t.after(()=>store.close());
 assert.throws(()=>store.remove('a',0,'wrong'),e=>e.status===400);assert.throws(()=>store.remove('a',1,'a'),e=>e.status===409);
 store.remove('a',0,'a');assert.equal(store.read('a'),undefined);assert.equal(store.read('b').state.company,'b');
 assert.deepEqual(store.db.prepare('SELECT company_id FROM company_history').all().map(x=>x.company_id),['b']);
 assert.deepEqual(store.db.prepare('SELECT company_id FROM view_links').all().map(x=>x.company_id),['b']);
 store.remove('b',0,'b');assert.equal(store.db.prepare('SELECT count(*) AS n FROM companies').get().n,0);
});
test('failed project deletion restores history and viewing links',t=>{
 const store=memory();t.after(()=>store.close());store.db.exec("CREATE TRIGGER stop_delete BEFORE DELETE ON companies BEGIN SELECT RAISE(ABORT,'fail'); END;");
 assert.throws(()=>store.remove('a',0,'a'),/fail/);assert.ok(store.read('a'));assert.equal(store.db.prepare('SELECT count(*) AS n FROM company_history').get().n,2);assert.equal(store.db.prepare('SELECT count(*) AS n FROM view_links').get().n,2);
});
test('personal cloud deletion scopes every project query to its owner',async()=>{
 const calls=[];let released=false;const client={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT')?[{revision:2,body:{company:'Project'}}]:[]};},release:()=>{released=true;}};
 await removePostgres({connect:async()=>client},'owner','project',2,'Project');assert.ok(released);assert.equal(calls.at(-1).sql,'COMMIT');
 for(const call of calls.filter(x=>x.sql.includes('personal_'))){assert.ok(call.sql.includes('user_id'));assert.ok(call.args.includes('owner'));}
 assert.deepEqual(calls.find(x=>x.sql.includes('view_links')).args,['personal:account:owner','project']);
});
test('cloud deletion rejects staff and foreign origins and audits successful admin deletion',async t=>{
 const store=memory();let role='user';store.pinRole=async()=>role;
 const server=require('../src/server/server').createApp({cloud:true,store,auth:{authenticate:async()=>({id:'admin',method:'pin'})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const url='http://127.0.0.1:'+server.address().port+'/api/companies?company=a',request=extra=>fetch(url,{method:'DELETE',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify({name:'a',revision:0})});
 assert.equal((await request()).status,403);assert.ok(store.read('a'));role='admin';assert.equal((await request({Origin:'https://other.example'})).status,403);
 assert.equal((await request()).status,200);assert.equal(store.read('a'),undefined);const log=await require('../src/server/security-store').securityStore(store).list('shared');assert.equal(log[0].action,'company.delete');assert.equal(log[0].target,'a');
});
