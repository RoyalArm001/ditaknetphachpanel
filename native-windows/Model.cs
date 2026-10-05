using System.IO;
using System.Reflection;
using System.Text.Json.Nodes;
using Jint;
namespace MyPatch;
public static class J {
    public static string S(this JsonNode? n,string key) => n?[key]?.ToString()??"";
    public static int I(this JsonNode? n,string key,int fallback=0)=>int.TryParse(n.S(key),out var i)?i:fallback;
    public static double D(this JsonNode? n,string key)=>double.TryParse(n.S(key),System.Globalization.NumberStyles.Any,System.Globalization.CultureInfo.InvariantCulture,out var d)?d:0;
    public static JsonArray A(this JsonNode? n,string key)=>n?[key] as JsonArray??new JsonArray();
    public static string Id()=>Guid.NewGuid().ToString();
    public static JsonObject O(string json)=>(JsonNode.Parse(json) as JsonObject)!;
    public static JsonObject Copy(this JsonObject n)=>(JsonObject)n.DeepClone();
    public static IEnumerable<JsonObject> Objects(this JsonArray a)=>a.OfType<JsonObject>();
    public static JsonObject NewProject(string name)=>new(){["schema"]=2,["company"]=name,["floors"]=new JsonArray(),["networks"]=new JsonArray(),["deviceTypes"]=new JsonArray()};
    public static IEnumerable<(JsonObject f,JsonObject r,JsonObject d)> Devices(JsonObject state)=>state.A("floors").Objects().SelectMany(f=>f.A("racks").Objects().SelectMany(r=>r.A("devices").Objects().Select(d=>(f,r,d))));
    public static IEnumerable<(JsonObject f,JsonObject r,JsonObject d,JsonObject p)> Ports(JsonObject state)=>Devices(state).SelectMany(x=>x.d.A("portList").Objects().Select(p=>(x.f,x.r,x.d,p)));
    public static JsonObject? Find(JsonObject state,string id)=>state.A("floors").Objects().Concat(state.A("floors").Objects().SelectMany(f=>f.A("racks").Objects())).Concat(Devices(state).Select(x=>x.d)).Concat(Ports(state).Select(x=>x.p)).Concat(state.A("floorPlans").Objects()).Concat(state.A("networks").Objects()).FirstOrDefault(n=>n.S("id")==id);
}
public sealed class Domain {
    readonly Engine engine;
    public Domain(){
        engine=new Engine(o=>o.TimeoutInterval(TimeSpan.FromSeconds(8)).LimitRecursion(160));
        engine.Execute("var module={exports:{}};");engine.Execute(Resource("domain.js"));engine.Execute("var D=module.exports;");
        engine.Execute(Resource("merge-state.js"));engine.Execute("var Merge=module.exports;");
        engine.Execute(Resource("locales.js"));engine.Execute("var Messages=module.exports;");
    }
    static string Resource(string name){var asm=Assembly.GetExecutingAssembly();using var stream=asm.GetManifestResourceStream(asm.GetManifestResourceNames().Single(x=>x.EndsWith("."+name)))!;using var reader=new StreamReader(stream);return reader.ReadToEnd();}
    public JsonNode Call(JsonObject state,string expression){engine.SetValue("input",state.ToJsonString());return JsonNode.Parse(engine.Evaluate("JSON.stringify((function(s){return "+expression+";})(JSON.parse(input)))").AsString())!;}
    public void Validate(JsonObject state)=>Call(state,"D.validate(s)");
    public JsonArray Rows(JsonObject state)=>(JsonArray)Call(state,"D.rows(s)");
    public JsonObject Map(JsonObject state,string planId)=>(JsonObject)Call(state,"D.mapDevices(s,(s.floorPlans||[]).find(p=>p.id==="+System.Text.Json.JsonSerializer.Serialize(planId)+"))");
    public JsonObject Merge(JsonObject baseline,JsonObject local,JsonObject remote){engine.SetValue("mergeInput",new JsonArray(baseline.DeepClone(),local.DeepClone(),remote.DeepClone()).ToJsonString());return J.O(engine.Evaluate("JSON.stringify(Merge.merge(...JSON.parse(mergeInput)))").AsString());}
    public string Translate(string text,string language){if(language=="hy")return text;engine.SetValue("phrase",text);var result=engine.Evaluate("Messages[phrase]?.["+(language=="en"?0:1)+"] || phrase");return result.AsString();}
    public string Label(JsonObject state,string service)=>state["serviceLabels"]?.S(service) is {Length:>0} custom?custom:state.A("serviceTypes").Objects().FirstOrDefault(n=>n.S("id")==service)?.S("name")??(service switch{"wifi"=>"Wi-Fi","camera"=>"Տեսախցիկ","access"=>"Մուտքի վերահսկում","phone"=>"Հեռախոս","internet"=>"Ինտերնետ",_=>"Չնշված"});
    public static JsonObject Port(int n)=>new(){["id"]=J.Id(),["number"]=n,["status"]="free",["cable"]="",["floorId"]="",["room"]="",["door"]="",["side"]="",["notes"]="",["switchPortId"]="",["service"]="",["vlan"]=""};
}
