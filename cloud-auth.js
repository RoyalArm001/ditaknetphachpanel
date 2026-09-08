'use strict';
function createAuth(env=process.env,fetcher=fetch){
  env=require('./env-config').normalizeEnv(env);
  const base=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL;
  const key=env.SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key||new URL(base).protocol!=='https:')throw new Error('Supabase HTTPS URL and publishable key are required');
  const allowed=new Set((env.RACKMAP_ALLOWED_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean));
  const permitted=user=>!!user?.id&&(env.RACKMAP_AUTH_ACCESS==='all-authenticated'||allowed.has(user.id)||user.app_metadata?.rackmap_access===true);
  const request=async(path,options={})=>{
    const response=await fetcher(base+'/auth/v1/'+path,{...options,headers:{apikey:key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
    if(!response.ok)return null;return response.json();
  };
  const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>{const at=x.indexOf('=');return at<0?['','']:[x.slice(0,at).trim(),x.slice(at+1).trim()];}));
  const setSession=(res,session)=>res.setHeader('Set-Cookie',[
    `rackmap_access=${session.access_token}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.min(session.expires_in||3600,3600)}`,
    `rackmap_refresh=${session.refresh_token}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
  ]);
  const clear=res=>res.setHeader('Set-Cookie',['rackmap_access=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0','rackmap_refresh=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
  async function authenticate(req,res){
    const token=req.headers.authorization?.replace(/^Bearer /i,'')||cookies(req).rackmap_access;
    let user=token?await request('user',{headers:{Authorization:'Bearer '+token}}):null;
    if(!user&&!req.headers.authorization&&cookies(req).rackmap_refresh){
      const session=await request('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:cookies(req).rackmap_refresh})});
      if(session?.access_token){user=await request('user',{headers:{Authorization:'Bearer '+session.access_token}});if(permitted(user))setSession(res,session);}
    }
    return permitted(user)?{id:user.id,email:user.email}:null;
  }
  return {authenticate,clear,
    login:async(res,email,password)=>{
      if(typeof email!=='string'||typeof password!=='string'||email.length>320||password.length>1024)return false;
      const session=await request('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
      if(!session?.access_token)return false;
      const user=await request('user',{headers:{Authorization:'Bearer '+session.access_token}});
      if(!permitted(user))return false;setSession(res,session);return {id:user.id,email:user.email};
    }
  };
}
module.exports={createAuth};
