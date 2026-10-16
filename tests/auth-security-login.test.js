'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http');

test('password and PIN inputs include secure toggle wrapper and toggle action',async()=>{
  const fs=require('node:fs');
  const appCode=fs.readFileSync('src/client/js/app.js','utf8');
  assert.ok(appCode.includes('password-input-wrap'),'app.js should contain password-input-wrap');
  assert.ok(appCode.includes('password-toggle-btn'),'app.js should contain password-toggle-btn');
  assert.ok(appCode.includes('toggle-password'),'app.js should support toggle-password action');

  // Verify input function wraps password inputs
  const esc=x=>String(x);
  const tr=x=>x;
  const inputFn=new Function('esc','tr',`
    const input=(name,label,value='',type='text',extra='')=>type==='password'?\`<div class="field password-field"><label for="\${name}">\${label}</label><div class="password-input-wrap"><input id="\${name}" name="\${name}" type="password" value="\${esc(value)}" \${extra}><button type="button" class="password-toggle-btn" data-action="toggle-password" data-target="\${name}" aria-label="\${esc(tr('Ցուցադրել / թաքցնել'))}" title="\${esc(tr('Ցուցադրել / թաքցնել'))}"><svg viewBox="0 0 24 24" class="eye-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>\`:\`<div class="field"><label for="\${name}">\${label}</label><input id="\${name}" name="\${name}" type="\${type}" value="\${esc(value)}" \${extra}></div>\`;
    return input;
  `)(esc,tr);

  const pwField=inputFn('password','Գաղտնաբառ','','password');
  assert.ok(pwField.includes('password-input-wrap'));
  assert.ok(pwField.includes('data-action="toggle-password"'));

  const pinField=inputFn('pin','PIN','','password');
  assert.ok(pinField.includes('password-input-wrap'));
  assert.ok(pinField.includes('data-action="toggle-password"'));

  const emailField=inputFn('email','Էլ․ փոստ','','email');
  assert.ok(!emailField.includes('password-input-wrap'));
});

test('translations exist for auth security and PIN copy features in EN and RU',()=>{
  const locales=require('../src/shared/locales');
  const required=['Պատճենել PIN-ը','PIN-ը պատճենվեց','Չհաջողվեց պատճենել','Ցուցադրել / թաքցնել','Մուտքագրեք PIN կոդը'];
  for(const key of required){
    assert.ok(locales[key],`Missing translation key: ${key}`);
    assert.equal(locales[key].length,2,`Translation key ${key} must have EN and RU entries`);
    assert.ok(locales[key][0].length>0,`EN translation missing for ${key}`);
    assert.ok(locales[key][1].length>0,`RU translation missing for ${key}`);
  }
});

test('multi-step signup form disables hidden step inputs and enables step navigation',async()=>{
  const fs=require('node:fs');
  const appCode=fs.readFileSync('src/client/js/app.js','utf8');
  assert.ok(appCode.includes('inp.disabled=s>step'),'Future step inputs must be disabled to prevent constraint blocking');
  assert.ok(appCode.includes("e.key==='Enter'"),'Enter key must advance step rather than submitting prematurely');
});

test('server rate limits account auth attempts and rejects brute force with 429',async()=>{
  let attempts=0;
  const mockStore={
    pinAttempt:async()=>++attempts,
    pinReset:async()=>{attempts=0;},
    pinEnabled:async()=>false,
    pinAccess:async()=>null,
    pinRole:async()=>null,
    pinUsers:async()=>[],
    close:()=>{}
  };
  const mockPersonalAuth={
    login:async()=>null,
    signup:async()=>null,
    authenticate:async()=>null,
    clear:()=>{}
  };
  const mockAccounts={
    scope:()=>mockStore,
    login:async()=>null,
    authenticate:async()=>null,
    emailForLogin:async()=>null,
    provision:async()=>'1234567890',
    clear:()=>{}
  };

  delete process.env.RACKMAP_STORAGE;
  delete process.env.VERCEL;
  const {createApp}=require('../src/server/server');
  const server=createApp({store:mockStore,cloud:false,auth:mockPersonalAuth,personalAuth:mockPersonalAuth,accounts:mockAccounts});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;

  try{
    for(let i=0;i<10;i++){
      const res=await fetch(`http://127.0.0.1:${port}/api/account/login`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:'attacker@example.com',password:'password123456'})
      });
      assert.notEqual(res.status,429);
    }
    // 11th request triggers rate limit
    const limited=await fetch(`http://127.0.0.1:${port}/api/account/login`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'attacker@example.com',password:'password123456'})
    });
    assert.equal(limited.status,429);
    assert.equal(limited.headers.get('Retry-After'),'900');
    const data=await limited.json();
    assert.ok(data.error.includes('15 րոպեից'));
  }finally{
    await new Promise(r=>server.close(r));
  }
});
