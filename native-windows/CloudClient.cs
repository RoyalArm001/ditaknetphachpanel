using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace MyPatch;
public sealed class CloudError(int status,string message):Exception(message){public int Status=>status;}
public sealed class CloudClient:IDisposable {
    static readonly Uri Origin=new("https://patch.ditaknet.com");
    readonly HttpClient http;readonly CookieContainer cookies=new();readonly string vault;
    public string Space{get;private set;}="";
    public string UserId{get;private set;}="";
    public string Scope=>UserId==""?"":(Space=="account"?"account:":"team:")+UserId;
    public string ClientId{get;}
    public CloudClient(string directory,string clientId){ClientId=clientId;vault=Path.Combine(directory,"session.bin");http=new HttpClient(new HttpClientHandler{CookieContainer=cookies,AllowAutoRedirect=false}){BaseAddress=Origin,Timeout=TimeSpan.FromSeconds(40)};Load();}
    string Url(string path,string company=""){var parts=new List<string>();if(Space=="account")parts.Add("space=account");if(company!="")parts.Add("company="+Uri.EscapeDataString(company));return path+(path.Contains('?')?"&":"?")+string.Join("&",parts);}
    public async Task<JsonNode> Send(string path,string method="GET",JsonObject? body=null,string company="",CancellationToken ct=default){
        using var req=new HttpRequestMessage(new HttpMethod(method),Url(path,company));
        if(body!=null){var text=body.ToJsonString();if(Encoding.UTF8.GetByteCount(text)>4*1024*1024)throw new Exception("Cloud limit: 4 MB");req.Content=new StringContent(text,Encoding.UTF8,"application/json");}
        using var response=await http.SendAsync(req,ct);Save();var raw=await response.Content.ReadAsStringAsync(ct);JsonNode? result=null;try{result=JsonNode.Parse(raw);}catch{}
        if(!response.IsSuccessStatusCode)throw new CloudError((int)response.StatusCode,result?.S("error")??"Cloud connection failed");
        return result??new JsonObject();
    }
    public async Task Login(string mode,string login,string password){var oldSpace=Space;var oldUser=UserId;try{Space=mode is "account" or "account-pin"?"account":"";var result=await Send(mode=="pin"?"/api/auth/pin":mode=="account-pin"?"/api/account/recover":mode=="account"?"/api/account/login":"/api/auth/login","POST",mode.Contains("pin")?new(){["pin"]=login,["client"]=ClientId}:new(){["email"]=login,["password"]=password});UserId=result["user"].S("id");if(UserId=="")throw new Exception("Cloud session is missing its user ID");Save();}catch{Space=oldSpace;UserId=oldUser;Save();throw;}}
    public async Task Resume(){var result=await Send("/api/auth/session");UserId=result["user"].S("id");Save();}
    public async Task Logout(){try{await Send("/api/auth/logout","POST",new());}finally{UserId="";Space="";foreach(Cookie cookie in cookies.GetAllCookies())cookie.Expired=true;if(File.Exists(vault))File.Delete(vault);}}
    public async Task Presence(Action<JsonObject> changed,CancellationToken ct){
        while(!ct.IsCancellationRequested){try{using var req=new HttpRequestMessage(HttpMethod.Get,Url("/api/live?client="+ClientId));using var response=await http.SendAsync(req,HttpCompletionOption.ResponseHeadersRead,ct);if(!response.IsSuccessStatusCode)throw new CloudError((int)response.StatusCode,"Live unavailable");using var stream=await response.Content.ReadAsStreamAsync(ct);using var reader=new StreamReader(stream);while(!ct.IsCancellationRequested&&await reader.ReadLineAsync(ct) is { } line)if(line.StartsWith("data: "))changed(J.O(line[6..]));}catch(OperationCanceledException){break;}catch{try{await Task.Delay(3000,ct);}catch{break;}}}
    }
    record SessionCookie(string Name,string Value,string Path,DateTime Expires,bool Secure);
    void Save(){try{var data=JsonSerializer.SerializeToUtf8Bytes(new {space=Space,userId=UserId,cookies=cookies.GetAllCookies().Cast<Cookie>().Where(c=>!c.Expired).Select(c=>new SessionCookie(c.Name,c.Value,c.Path,c.Expires,c.Secure)).ToArray()});var encrypted=ProtectedData.Protect(data,null,DataProtectionScope.CurrentUser);File.WriteAllBytes(vault+".tmp",encrypted);File.Move(vault+".tmp",vault,true);}catch(IOException){} }
    void Load(){try{if(!File.Exists(vault))return;var data=ProtectedData.Unprotect(File.ReadAllBytes(vault),null,DataProtectionScope.CurrentUser);var json=JsonNode.Parse(data)!;Space=json.S("space");UserId=json.S("userId");foreach(var c in json.A("cookies").Deserialize<SessionCookie[]>()??[])cookies.Add(Origin,new Cookie(c.Name,c.Value,c.Path){Secure=c.Secure,HttpOnly=true,Expires=c.Expires});}catch{UserId="";Space="";}}
    public void Dispose()=>http.Dispose();
}
