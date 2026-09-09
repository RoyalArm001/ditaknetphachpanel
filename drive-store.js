'use strict';
// OAuth token stays in this closure. Files go directly from the browser to Drive.
globalThis.DriveStore=(()=>{
  const scope='https://www.googleapis.com/auth/drive.appdata';
  const tr=(...args)=>globalThis.RackI18n?.t(...args)||args[0];
  let token='',expiresAt=0,loading;
  function connected(){return !!token&&Date.now()<expiresAt;}
  async function prepare(){
    const response=await fetch('/api/config',{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(tr('Cloud կապ չկա'));
    const config=await response.json();
    if(!config.googleClientId)throw new Error(tr('Google Drive-ը դեռ ակտիվացված չէ։ Կայքի պատասխանատուն պետք է միացնի Google OAuth Client ID-ն։'));
    if(!globalThis.google?.accounts?.oauth2){
      loading||=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>{loading=null;script.remove();reject(new Error(tr('Google-ի կապը չբեռնվեց։ Կրկին փորձեք։')));};document.head.append(script);});
      await loading;
    }
    return config.googleClientId;
  }
  function connect(clientId){return new Promise((resolve,reject)=>{
    const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope,prompt:'select_account',callback:result=>{
      if(result.error||!google.accounts.oauth2.hasGrantedAllScopes(result,scope)){reject(new Error(tr('Google Drive-ի թույլտվությունը չի տրվել')));return;}
      token=result.access_token;expiresAt=Date.now()+Math.max(0,(Number(result.expires_in)||3600)-60)*1000;resolve();
    },error_callback:()=>reject(new Error(tr('Google-ի մուտքը չավարտվեց։ Կրկին փորձեք։')))});
    client.requestAccessToken();
  });}
  async function request(path,options={}){
    if(!connected())throw new Error(tr('Կրկին միացրեք Google Drive-ը'));
    const response=await fetch('https://www.googleapis.com/'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token},credentials:'omit',signal:AbortSignal.timeout(30000)});
    if(response.status===401){token='';throw new Error(tr('Կրկին միացրեք Google Drive-ը'));}
    if(!response.ok)throw new Error(tr('Google Drive-ի գործողությունը չհաջողվեց։ Կրկին փորձեք։'));
    return response;
  }
  async function list(){
    const query=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='application' and value='MyPatch' }",fields:'files(id,name,modifiedTime,size)',orderBy:'modifiedTime desc',pageSize:'100'});
    return (await(await request('drive/v3/files?'+query)).json()).files||[];
  }
  async function save(state){
    RackDomain.validate(state);
    const name='MyPatch-'+state.company+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const content=JSON.stringify({application:'MyPatch',schema:2,exportedAt:new Date().toISOString(),state});
    if(new Blob([content]).size>24*1024*1024)throw new Error(tr('Ֆայլը չափազանց մեծ է'));
    const boundary='mypatch_'+crypto.randomUUID();
    const metadata={name,parents:['appDataFolder'],appProperties:{application:'MyPatch'}};
    const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+content+'\r\n--'+boundary+'--']);
    return (await request('upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body})).json();
  }
  async function read(id){
    if(!/^[\w-]+$/.test(id))throw new Error(tr('Ֆայլը չի գտնվել'));
    const meta=await(await request('drive/v3/files/'+id+'?fields=appProperties,size,parents')).json();
    if(meta.appProperties?.application!=='MyPatch'||Number(meta.size)>24*1024*1024)throw new Error(tr('Ֆայլը չափազանց մեծ է կամ անհամատեղելի է'));
    const response=await request('drive/v3/files/'+id+'?alt=media');
    const data=await response.json();RackDomain.validate(data.state);return data;
  }
  function disconnect(){const previous=token;token='';expiresAt=0;if(previous)google.accounts.oauth2.revoke(previous,()=>{});}
  return {prepare,connect,connected,list,save,read,disconnect};
})();
