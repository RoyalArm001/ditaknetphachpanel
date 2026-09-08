'use strict';
function normalizeEnv(source=process.env){
  const env={...source};
  for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','POSTGRES_URL','POSTGRES_URL_NON_POOLING','POSTGRES_SSL_CA','POSTGRES_SSL_CA_PEM']){
    const aliases=[key,'NEXT_PUBLIC_'+key,'supabase_'+key,'NEXT_PUBLIC_supabase_'+key];
    env[key]=aliases.map(x=>source[x]).find(x=>typeof x==='string'&&x.trim())?.trim();
  }
  return env;
}
function publicConfig(source=process.env){
  const env=normalizeEnv(source),missing=[];
  if(!env.POSTGRES_URL&&!env.POSTGRES_URL_NON_POOLING)missing.push('POSTGRES_URL');
  if(!env.SUPABASE_URL)missing.push('SUPABASE_URL');
  if(!env.SUPABASE_PUBLISHABLE_KEY&&!env.SUPABASE_ANON_KEY)missing.push('SUPABASE_PUBLISHABLE_KEY');
  return {cloud:true,authRequired:true,pinEnabled:!!env.RACKMAP_PIN_HASH,accountEnabled:!!env.SUPABASE_URL&&(!!env.SUPABASE_PUBLISHABLE_KEY||!!env.SUPABASE_ANON_KEY),maxStateBytes:4194304,setupRequired:missing.length>0,missing};
}
module.exports={normalizeEnv,publicConfig};
