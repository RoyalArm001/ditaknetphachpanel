'use strict';
function verify(current,revision,name){
  const error=(message,status)=>{const e=new Error(message);e.status=status;throw e;};
  if(!current)error('Նախագիծը չի գտնվել',404);
  if(current.revision!==revision)error('Նախագիծը փոխվել է։ Թարմացրեք էջը և կրկին փորձեք։',409);
  if(!name||name!==current.state.company)error('Հաստատման համար գրեք նախագծի ճշգրիտ անվանումը։',400);
}
async function removePostgres(pool,owner,id,revision,name){
  const client=await pool.connect(),personal=owner!==null,table=personal?'rackmap.personal_companies':'rackmap.companies',history=personal?'rackmap.personal_history':'rackmap.company_history';
  const params=personal?[id,owner]:[id],where=personal?'id=$1 AND user_id=$2':'id=$1';
  try{
    await client.query('BEGIN');
    const row=(await client.query(`SELECT revision,body FROM ${table} WHERE ${where} FOR UPDATE`,params)).rows[0];
    verify(row&&{revision:Number(row.revision),state:row.body},revision,name);
    await client.query('DELETE FROM rackmap.view_links WHERE scope=$1 AND company_id=$2',[personal?'personal:account:'+owner:'team',id]);
    await client.query(`DELETE FROM ${history} WHERE company_id=$1${personal?' AND user_id=$2':''}`,params);
    await client.query(`DELETE FROM ${table} WHERE ${where}`,params);
    await client.query('COMMIT');return {ok:true};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
function removeLocal(db,read,id,revision,name){
  db.exec('BEGIN IMMEDIATE');
  try{
    verify(read(id),revision,name);
    db.prepare("DELETE FROM view_links WHERE scope='team' AND company_id=?").run(id);
    db.prepare('DELETE FROM company_history WHERE company_id=?').run(id);
    db.prepare('DELETE FROM companies WHERE id=?').run(id);
    db.exec('COMMIT');return {ok:true};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={verify,removePostgres,removeLocal};
