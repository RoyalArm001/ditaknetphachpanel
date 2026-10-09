'use strict';
// All project reads must include both workspace and owner, including for empty histories.
function projectBackups(pool,space='shared',userId=''){
  if(!['shared','account'].includes(space)||space==='account'&&!userId)throw new Error('Backup owner required');
  const query=async(sql,args)=>{
    try{return (await pool.query(sql,[space,userId,...args])).rows;}
    catch(error){if(error.code==='42P01')return [];throw error;}
  };
  const from=`FROM rackmap.automatic_backup_projects p JOIN rackmap.automatic_backups b ON b.id=p.backup_id
    WHERE p.space=$1 AND p.user_id=$2 AND p.company_id=$3 AND b.created_at>=now()-interval '72 hours'`;
  return {
    async history(id,existing){
      const copies=await query(`SELECT DISTINCT ON(p.revision) p.revision,b.created_at AS saved_at ${from} ORDER BY p.revision DESC,b.created_at DESC`,[id]);
      const versions=new Map(copies.map(row=>[Number(row.revision),{...row,revision:Number(row.revision)}]));
      for(const row of existing)versions.set(Number(row.revision),{...row,revision:Number(row.revision)});
      return [...versions.values()].sort((a,b)=>b.revision-a.revision);
    },
    async version(id,revision){
      const rows=await query(`SELECT p.body ${from} AND p.revision=$4 ORDER BY b.created_at DESC LIMIT 1`,[id,revision]);
      return rows[0]?{state:rows[0].body}:null;
    }
  };
}
async function backupStatus(pool){
  try{
    const {rows}=await pool.query(`SELECT
      EXISTS(SELECT 1 FROM cron.job WHERE jobname='rackmap-hourly-backup' AND active AND schedule='0 * * * *' AND command='SELECT rackmap.capture_automatic_backup();') AS enabled,
      max(created_at) AS last_backup, max(created_at)>=now()-interval '90 minutes' AS healthy
      FROM rackmap.automatic_backups`);
    return {...rows[0],retentionHours:72,intervalHours:1};
  }catch(error){if(error.code==='42P01'||error.code==='3F000')return {enabled:false,healthy:false,last_backup:null};throw error;}
}
async function backupList(pool,space='shared',userId='',companyId=''){
  if(!['shared','account'].includes(space)||space==='account'&&!userId)throw new Error('Backup owner required');
  try{
    const {rows}=await pool.query(`SELECT b.id, b.created_at,
      count(p.company_id) AS project_count,
      coalesce(sum(length(p.body::text)),0) AS size_bytes,
      $1 AS space,
      max(CASE WHEN p.company_id=$3 THEN p.revision ELSE NULL END) AS revision
      FROM rackmap.automatic_backups b
      JOIN rackmap.automatic_backup_projects p ON p.backup_id=b.id
      WHERE p.space=$1 AND p.user_id=$2 AND b.created_at>=now()-interval '72 hours'
      GROUP BY b.id, b.created_at
      ORDER BY b.created_at DESC LIMIT 30`,[space,userId,companyId||'default']);
    return rows.map(r=>({
      id: r.id,
      created_at: r.created_at,
      project_count: Number(r.project_count),
      size_bytes: Number(r.size_bytes),
      space: r.space,
      revision: r.revision!==null?Number(r.revision):null
    }));
  }catch(error){if(error.code==='42P01'||error.code==='3F000')return [];throw error;}
}
async function backupPreview(pool,space='shared',userId='',backupId='',companyId=''){
  if(!['shared','account'].includes(space)||space==='account'&&!userId)throw new Error('Backup owner required');
  try{
    const {rows}=await pool.query(`SELECT p.revision, p.company_id, p.body, b.created_at
      FROM rackmap.automatic_backup_projects p
      JOIN rackmap.automatic_backups b ON b.id=p.backup_id
      WHERE p.space=$1 AND p.user_id=$2 AND b.id=$3 AND p.company_id=$4 AND b.created_at>=now()-interval '72 hours'
      LIMIT 1`,[space,userId,backupId,companyId||'default']);
    if(!rows[0])return null;
    const body=rows[0].body||{};
    return {
      backupId,
      companyId: rows[0].company_id,
      revision: Number(rows[0].revision),
      created_at: rows[0].created_at,
      company: body.company||'',
      floorsCount: Array.isArray(body.floors)?body.floors.length:0,
      racksCount: Array.isArray(body.floors)?body.floors.flatMap(f=>f.racks||[]).length:0,
      devicesCount: Array.isArray(body.floors)?body.floors.flatMap(f=>f.racks||[]).flatMap(r=>r.devices||[]).length:0,
      state: body
    };
  }catch(error){if(error.code==='42P01'||error.code==='3F000')return null;throw error;}
}
module.exports={projectBackups,backupStatus,backupList,backupPreview};
