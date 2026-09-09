'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{once}=require('node:events');
const D=require('../domain');
(async()=>{
  const server=require('../server').createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'mypatch-visual-'))});server.listen(0,'127.0.0.1');await once(server,'listening');
  const browser=await chromium.launch({channel:'chrome',headless:true}),out=path.resolve('test-output/visual');fs.mkdirSync(out,{recursive:true});
  const base='http://127.0.0.1:'+server.address().port,failures=[],errors=[];let checked=0;
  const fixture={...D.empty(),company:'Review Company',floors:[{id:'f',name:'Floor 1',racks:[{id:'r',name:'Rack A',u:6,location:'Office',photo:'',devices:[{id:'d',name:'PP-01',type:'panel',pos:6,height:1,color:'#174e50',model:'24 ports',portList:Array.from({length:24},(_,i)=>D.port(i+1,'p'+i))}]}]}]};
  async function inspect(page,name,screenshot=false){
    await page.evaluate(()=>document.fonts.ready);
    await page.addScriptTag({url:base+'/__audit/axe.js'});
    const result=await page.evaluate(async()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,violations:(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}))}));
    if(result.overflow||result.violations.length)failures.push({page:name,...result});
    if(screenshot)await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});checked++;
  }
  try{
    for(const width of [390,768,1440])for(const lang of ['hy','en','ru']){
      const context=await browser.newContext({viewport:{width,height:940}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.route(base+'/__audit/axe.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('axe-core/axe.min.js'))}));
      await page.goto(base);await page.locator('.welcome').waitFor();await page.selectOption('#languageSelect',lang);
      await inspect(page,`welcome-${width}-${lang}`,lang==='hy');
      assert.equal(await page.locator('.welcome-options>section').count(),3);
      await page.click('[data-action=welcome-import]');await inspect(page,`restore-${width}-${lang}`);
      await page.click('[data-action=account-recover]');await inspect(page,`recover-${width}-${lang}`);
      await page.click('[data-action=account-signup]');await inspect(page,`signup-${width}-${lang}`,width===390&&lang==='en');
      await page.fill('#email','unfinished@example.test');await page.fill('#password','unfinished-test-password');
      await page.selectOption('#languageSelect',lang==='en'?'ru':'en');assert.equal(await page.inputValue('#email'),'unfinished@example.test');assert.equal(await page.locator('#password').getAttribute('autocomplete'),'new-password');
      await page.click('[data-action=welcome-home]');await page.click('[data-action=welcome-personal]');await page.locator('#setupForm').waitFor();
      await page.evaluate(async state=>{const current=await PersonalStore.request('/api/state');await PersonalStore.request('/api/state',{method:'PUT',body:JSON.stringify({state,revision:current.revision})});},fixture);
      await page.reload();await page.click('[data-action=welcome-personal]');await page.locator('.stats').waitFor();
      await page.selectOption('#languageSelect',lang);
      for(const route of ['overview','floors','search','reports','settings','rack/r']){
        await page.evaluate(route=>{location.hash=route;},route);await page.waitForTimeout(100);
        await inspect(page,`${route.replace('/','-')}-${width}-${lang}`,width===1440&&lang==='en'&&['settings','rack/r'].includes(route));
      }
      await page.click('.mini-port');await page.locator('#portForm').waitFor();await inspect(page,`editor-${width}-${lang}`,width===390&&lang==='hy');
      await context.close();
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checked,errors,failures},null,2));console.log(JSON.stringify({checked,errors,failures:failures.length,report:path.join(out,'report.json')}));
    if(errors.length||failures.length)process.exitCode=1;
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checked,errors,failures},null,2));await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
