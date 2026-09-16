'use strict';
function createPresence(pool,{now=()=>Date.now()}={}){
  const memory=new Map(),key=(scope,actor,client)=>JSON.stringify([scope,actor,client]);
  return {
    async touch(scope,actor,client){
      if(pool){await pool.query('INSERT INTO rackmap.live_presence(scope,actor_id,client_id) VALUES($1,$2,$3) ON CONFLICT(scope,actor_id,client_id) DO UPDATE SET seen_at=now()',[scope,actor,client]);return;}
      memory.set(key(scope,actor,client),{scope,actor,at:now()});
    },
    async leave(scope,actor,client){if(pool)await pool.query('DELETE FROM rackmap.live_presence WHERE scope=$1 AND actor_id=$2 AND client_id=$3',[scope,actor,client]);else memory.delete(key(scope,actor,client));},
    async count(scope){
      if(pool)return Number((await pool.query("SELECT count(DISTINCT actor_id)::int AS total FROM rackmap.live_presence WHERE scope=$1 AND seen_at>now()-interval '30 seconds'",[scope])).rows[0].total);
      for(const [id,row] of memory)if(row.at<=now()-30000)memory.delete(id);
      return new Set([...memory.values()].filter(x=>x.scope===scope).map(x=>x.actor)).size;
    },
    async prune(){if(pool)await pool.query("DELETE FROM rackmap.live_presence WHERE seen_at<now()-interval '2 minutes'");}
  };
}
async function streamLive(req,res,{presence,scope,actor,client,store,duration=25000,interval=1000}){
  await presence.prune();await presence.touch(scope,actor,client);
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'});
  res.write('retry: 1000\n\n');res.flushHeaders?.();
  let stopped=false,timer,previous='',heartbeat=0;
  const finish=()=>{stopped=true;clearTimeout(timer);clearTimeout(deadline);};
  const deadline=setTimeout(()=>{finish();res.end();},duration);
  res.once('close',finish);
  async function tick(){
    if(stopped)return;
    try{
      if(Date.now()-heartbeat>=10000){await presence.touch(scope,actor,client);heartbeat=Date.now();}
      const [companies,online]=await Promise.all([store.list(),presence.count(scope)]);
      if(stopped)return;
      const payload=JSON.stringify({companies,online});
      if(payload!==previous){res.write('data: '+payload+'\n\n');previous=payload;}else res.write(': ping\n\n');
    }catch{finish();res.end();return;}
    if(!stopped)timer=setTimeout(tick,interval);
  }
  await tick();
}
module.exports={createPresence,streamLive};
