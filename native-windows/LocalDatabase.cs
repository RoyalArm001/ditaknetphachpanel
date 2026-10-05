using Microsoft.Data.Sqlite;
using System.IO;
using System.Text.Json.Nodes;
namespace MyPatch;
public record ProjectInfo(string Key,string Name,string Scope,string RemoteId,long Revision,bool Dirty);
public sealed class LocalDatabase:IDisposable {
    readonly SqliteConnection db;
    public string Directory {get;}
    public LocalDatabase(string directory){Directory=directory;System.IO.Directory.CreateDirectory(directory);db=new SqliteConnection("Data Source="+Path.Combine(directory,"projects.sqlite"));db.Open();Exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,scope TEXT NOT NULL,remote_id TEXT NOT NULL,revision INTEGER NOT NULL,dirty INTEGER NOT NULL,body TEXT NOT NULL,baseline TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,project_id TEXT NOT NULL,created TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);");}
    void Exec(string sql,params object[] args){using var cmd=Command(sql,args);cmd.ExecuteNonQuery();}
    SqliteCommand Command(string sql,params object[] args){var c=db.CreateCommand();c.CommandText=sql;for(int i=0;i<args.Length;i++)c.Parameters.AddWithValue("$"+i,args[i]);return c;}
    public List<ProjectInfo> List(){using var c=Command("SELECT id,name,scope,remote_id,revision,dirty FROM projects ORDER BY name");using var r=c.ExecuteReader();var list=new List<ProjectInfo>();while(r.Read())list.Add(new(r.GetString(0),r.GetString(1),r.GetString(2),r.GetString(3),r.GetInt64(4),r.GetInt64(5)!=0));return list;}
    public (JsonObject State,JsonObject Baseline) Load(string key){using var c=Command("SELECT body,baseline FROM projects WHERE id=$0",key);using var r=c.ExecuteReader();if(!r.Read())throw new Exception("Project not found");return (J.O(r.GetString(0)),J.O(r.GetString(1)));}
    public void Put(string key,JsonObject state,string scope="local",string remoteId="",long revision=0,bool dirty=false,JsonObject? baseline=null){
        using var tx=db.BeginTransaction();
        using(var h=Command("INSERT INTO history(project_id,created,body) SELECT id,$1,body FROM projects WHERE id=$0",key,DateTime.UtcNow.ToString("O"))){h.Transaction=tx;h.ExecuteNonQuery();}
        using(var c=Command("INSERT INTO projects VALUES($0,$1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,scope=excluded.scope,remote_id=excluded.remote_id,revision=excluded.revision,dirty=excluded.dirty,body=excluded.body,baseline=excluded.baseline",key,state.S("company"),scope,remoteId,revision,dirty?1:0,state.ToJsonString(),(baseline??state).ToJsonString())){c.Transaction=tx;c.ExecuteNonQuery();}tx.Commit();
    }
    public void Delete(string key)=>Exec("DELETE FROM projects WHERE id=$0",key);
    public List<(long Id,string Date)> History(string key){using var c=Command("SELECT id,created FROM history WHERE project_id=$0 ORDER BY id DESC LIMIT 100",key);using var r=c.ExecuteReader();var a=new List<(long,string)>();while(r.Read())a.Add((r.GetInt64(0),r.GetString(1)));return a;}
    public JsonObject Version(long id){using var c=Command("SELECT body FROM history WHERE id=$0",id);return J.O((string)c.ExecuteScalar()!);}
    public string Setting(string key,string fallback=""){using var c=Command("SELECT value FROM settings WHERE key=$0",key);return c.ExecuteScalar()?.ToString()??fallback;}
    public void SettingSave(string key,string value)=>Exec("INSERT INTO settings VALUES($0,$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",key,value);
    public void Backup(string target){using var copy=new SqliteConnection("Data Source="+target);copy.Open();db.BackupDatabase(copy);}
    public void Dispose()=>db.Dispose();
}
