using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
namespace MyPatch;
public partial class MainWindow {
    UIElement Floors(){
        var panel=Ui.Stack(Ui.Text(state.S("company")+" · "+T("Հարկեր և ռաքեր"),26),Ui.Bar(Ui.Button("Ավելացնել հարկ",()=>EditFloor(null),true)));
        var node=J.Find(state,selectedId);
        if(node?.ContainsKey("portList")==true){panel.Children.Add(DeviceView(node));return Ui.Scroll(panel);}
        if(node?.ContainsKey("devices")==true){var floor=state.A("floors").Objects().First(f=>f.A("racks").Contains(node));panel.Children.Add(RackView(floor,node));return Ui.Scroll(panel);}
        foreach(var f in state.A("floors").Objects().Where(f=>node==null||f.S("id")==selectedId)){
            var content=Ui.Stack(Ui.Text(f.S("name"),22),Ui.Bar(Ui.Button("Խմբագրել",()=>EditFloor(f)),Ui.Button("Ավելացնել ռաք",()=>EditRack(f,null)),Ui.Button("Ջնջել",()=>DeleteNode(f.S("id")))));
            foreach(var r in f.A("racks").Objects())content.Children.Add(Ui.Button("▤  "+r.S("name")+" · "+r.I("u")+"U · "+r.A("devices").Count,()=>{selectedId=r.S("id");Render();}));
            panel.Children.Add(Ui.Card(content));
        }return Ui.Scroll(panel);
    }
    UIElement RackView(JsonObject floor,JsonObject rack){
        var panel=Ui.Stack(Ui.Text(floor.S("name")+" / "+rack.S("name"),24),Ui.Bar(Ui.Button("Խմբագրել ռաքը",()=>EditRack(floor,rack)),Ui.Button("Ավելացնել սարք",()=>EditDevice(rack,null),true),Ui.Button("Ջնջել ռաքը",()=>DeleteNode(rack.S("id")))));
        var grid=new StackPanel{Background=Ui.B("#213b44")};
        for(int u=rack.I("u");u>=1;u--){var d=rack.A("devices").Objects().FirstOrDefault(d=>u>=d.I("pos")&&u<d.I("pos")+d.I("height"));if(d!=null&&u!=d.I("pos")+d.I("height")-1)continue;
            var row=new DockPanel{Margin=new Thickness(5)};var label=Ui.Text(u+"U",12,"#b6d6d6");label.Width=42;DockPanel.SetDock(label,Dock.Left);row.Children.Add(label);
            if(d==null)row.Children.Add(new Border{Height=25,BorderBrush=Ui.B("#4a6268"),BorderThickness=new Thickness(1)});
            else{var content=Ui.Stack(Ui.Button(d.S("name")+" · "+d.S("model"),()=>{selectedId=d.S("id");Render();}),PortFace(d));row.Children.Add(Ui.Card(content));}grid.Children.Add(row);
        }panel.Children.Add(grid);return panel;
    }
    UIElement DeviceView(JsonObject d){var rack=J.Devices(state).First(x=>x.d.S("id")==d.S("id")).r;var panel=Ui.Stack(Ui.Text(d.S("name")+" · "+d.S("model"),26),Ui.Bar(Ui.Button("Խմբագրել սարքը",()=>EditDevice(rack,d)),Ui.Button("Ջնջել սարքը",()=>DeleteNode(d.S("id"))),Ui.Button("Ռաք",()=>{selectedId=rack.S("id");Render();})),Ui.Card(PortFace(d)));foreach(var p in d.A("portList").Objects()){var row=Ui.Bar(Ui.Text(p.I("number").ToString(),16),Ui.Text(T(domain.Label(state,p.S("service")))+" · "+p.S("room")+" · "+p.S("cable")),Ui.Button("Խմբագրել",()=>EditPort(p.S("id"))));panel.Children.Add(row);}return panel;}
    public UIElement PortFace(JsonObject d,bool interactive=true){
        var layout=(JsonArray)domain.Call(state,"D.portLayout(D.devices(s).find(x=>x.d.id==="+System.Text.Json.JsonSerializer.Serialize(d.S("id"))+").d)");var rows=layout.OfType<JsonObject>().ToList();var grid=new Grid{Margin=new Thickness(8)};int columns=rows[0].I("columns"),height=rows[0].I("rows");for(var i=0;i<columns;i++)grid.ColumnDefinitions.Add(new ColumnDefinition());for(var i=0;i<height;i++)grid.RowDefinitions.Add(new RowDefinition{Height=new GridLength(48)});
        var statuses=domain.Rows(state).Objects().ToDictionary(r=>r["p"].S("id"),r=>r.S("status"));
        foreach(var row in rows){var p=(JsonObject)row["p"]!;var status=statuses[p.S("id")];var color=state["statusColors"]?.S(status) is {Length:>0} custom?custom:status switch{"used"=>"#397cc4","fault"=>"#d35352",_=>"#299c72"};var text=p.I("number")+(row["optical"]?.GetValue<bool>()==true?"\nSFP":"");var button=new Button{Content=text,Background=Ui.B(color),Foreground=Brushes.White,Padding=new Thickness(1),Margin=new Thickness(2),FontSize=11,ToolTip=T(domain.Label(state,p.S("service")))+" · "+p.S("room")};if(interactive)button.Click+=(_,_)=>EditPort(p.S("id"));Grid.SetColumn(button,row.I("column"));Grid.SetRow(button,row.I("row"));grid.Children.Add(button);}return grid;
    }
    void EditFloor(JsonObject? floor){new Form("Հարկ",v=>Change(s=>{if(floor==null)s.A("floors").Add(new JsonObject{["id"]=J.Id(),["name"]=v.S("name"),["racks"]=new JsonArray()});else J.Find(s,floor.S("id"))!["name"]=v.S("name");})).Text("name","Հարկի անվանում",floor?.S("name")??"").Run();}
    void EditRack(JsonObject floor,JsonObject? rack){new Form("Ռաք",v=>Change(s=>{var target=rack==null?new JsonObject{["id"]=J.Id(),["devices"]=new JsonArray(),["photo"]=""}:J.Find(s,rack.S("id"))!;target["name"]=v.S("name");target["u"]=v.I("u");target["location"]=v.S("location");if(rack==null)J.Find(s,floor.S("id"))!.A("racks").Add(target);})).Text("name","Անվանում",rack?.S("name")??"").Text("u","Բարձրություն U",rack?.S("u")??"42").Text("location","Տեղադրություն",rack?.S("location")??"").Run();}
    void EditDevice(JsonObject rack,JsonObject? device){
        new Form("Սարք",v=>Change(s=>{
            var target=device==null?new JsonObject{["id"]=J.Id()}:J.Find(s,device.S("id"))!;int copper=v.I("ports"),sfp=v.I("sfp"),total=copper+sfp;if(total<1||total>96||sfp<0||sfp>16)throw new Exception("Պորտերի քանակը սխալ է");
            var old=target.A("portList").Objects().ToList();int oldCopper=old.Count-target.I("sfpCount");var kept=old.Take(Math.Min(copper,oldCopper)).Concat(old.Skip(oldCopper).Take(sfp)).Select(p=>p.S("id")).ToHashSet();
            var removed=old.Where(p=>!kept.Contains(p.S("id"))).ToList();foreach(var p in removed)if(p.S("status")!="free"||new[]{"cable","notes","room","door","side","floorId","switchPortId","service","vlan"}.Any(k=>p.S(k)!="")||J.Ports(s).Any(x=>x.p.S("switchPortId")==p.S("id"))||s.A("floorPlans").Objects().Any(f=>f.A("markers").Objects().Any(m=>m.S("portId")==p.S("id"))))throw new Exception("Օգտագործվող պորտը չի կարելի հեռացնել");
            var ports=new JsonArray();for(int i=0;i<copper;i++)ports.Add(i<oldCopper?old[i].DeepClone():Domain.Port(i+1));for(int i=0;i<sfp;i++)ports.Add(i<old.Count-oldCopper?old[oldCopper+i].DeepClone():Domain.Port(copper+i+1));for(int i=0;i<ports.Count;i++)ports[i]!["number"]=i+1;
            target["portList"]=ports;target["sfpCount"]=sfp;target["name"]=v.S("name");target["type"]=v.S("type");target["model"]=v.S("model");target["modelType"]=v.S("poe");target["pos"]=v.I("pos");target["height"]=v.I("height");target["color"]=v.S("color");if(device==null)J.Find(s,rack.S("id"))!.A("devices").Add(target);
        })).Text("name","Անվանում",device?.S("name")??"").Choice("type","Սարքի տեսակ",DeviceTypes(),device?.S("type")??"panel").Text("model","Մոդել",device?.S("model")??"").Choice("poe","PoE",[("","Չնշված"),("none","No PoE"),("poe","PoE"),("poe-plus","PoE+")],device?.S("modelType")??"").Text("ports","Պորտեր",device==null?"24":(device.A("portList").Count-device.I("sfpCount")).ToString()).Text("sfp","SFP",device?.S("sfpCount") is {Length:>0} sfp?sfp:"0").Text("pos","U դիրք",device?.S("pos")??"1").Text("height","Բարձրություն U",device?.S("height")??"1").Text("color","Գույն",device?.S("color")??"#147d75").Run();
    }
    IEnumerable<(string,string)> DeviceTypes()=>new[]{("panel","Փաչ պանել"),("switch","Սվիչ"),("router","Ռաուտեր")}.Concat(state.A("deviceTypes").Objects().Where(x=>x.S("id")!="router").Select(x=>(x.S("id"),x.S("name"))));
    IEnumerable<(string,string)> Services()=>((JsonArray)domain.Call(state,"D.serviceEntries(s).map(([id,v])=>[id,v.label])")).OfType<JsonArray>().Select(a=>(a[0]!.ToString(),a[1]!.ToString()));
    public void EditPort(string id){
        var row=J.Ports(state).First(x=>x.p.S("id")==id);var p=row.p;var targets=new[]{("","—")}.Concat(J.Ports(state).Where(x=>x.d.S("type") is "switch" or "router").Select(x=>(x.p.S("id"),x.r.S("name")+" / "+x.d.S("name")+" / "+x.p.I("number"))));
        var form=new Form(row.d.S("name")+" / "+p.I("number"),v=>Change(s=>{var target=J.Find(s,id)!;foreach(var key in new[]{"status","service","cable","floorId","room","door","side","vlan","notes"})target[key]=v.S(key);target["switchPortId"]=v.S("switchPortId");})).Choice("status","Վիճակ",[("free","Ազատ"),("used","Զբաղված"),("fault","Անսարք")],p.S("status")).Choice("service","Նշանակություն",Services(),p.S("service")).Text("cable","Մալուխ",p.S("cable")).Choice("floorId","Նպատակակետի հարկ",new[]{("","—")}.Concat(state.A("floors").Objects().Select(f=>(f.S("id"),f.S("name")))),p.S("floorId")).Text("room","Սենյակ",p.S("room")).Text("door","Դուռ",p.S("door")).Text("side","Կողմ",p.S("side")).Text("vlan","VLAN",p.S("vlan"));if(row.d.S("type")=="panel")form.Choice("switchPortId","Սվիչի պորտ",targets,p.S("switchPortId"));form.Text("notes","Նշումներ",p.S("notes")).Run();
    }
    void DeleteNode(string id){if(!Ui.Confirm("Ջնջե՞լ ընտրված տարրը և դրա պարունակությունը։"))return;Change(s=>{
        var node=J.Find(s,id)!;var text=node.ToJsonString();var removedPorts=J.Ports(s).Where(x=>text.Contains('"'+x.p.S("id")+'"')).Select(x=>x.p.S("id")).ToHashSet();var removedDevices=J.Devices(s).Where(x=>text.Contains('"'+x.d.S("id")+'"')).Select(x=>x.d.S("id")).ToHashSet();
        foreach(var f in s.A("floors").Objects().ToList()){foreach(var r in f.A("racks").Objects().ToList()){foreach(var d in r.A("devices").Objects().ToList())if(d.S("id")==id)r.A("devices").Remove(d);if(r.S("id")==id)f.A("racks").Remove(r);}if(f.S("id")==id)s.A("floors").Remove(f);}
        foreach(var x in J.Ports(s)){if(removedPorts.Contains(x.p.S("switchPortId")))x.p["switchPortId"]="";if(x.p.S("floorId")==id)x.p["floorId"]="";}
        foreach(var plan in s.A("floorPlans").Objects()){foreach(var m in plan.A("markers").Objects().Where(m=>removedPorts.Contains(m.S("portId"))).ToList())plan.A("markers").Remove(m);if(plan.S("floorId")==id)plan["floorId"]="";}
        foreach(var n in s.A("networks").Objects())foreach(var h in n.A("hosts").Objects())if(removedDevices.Contains(h.S("deviceId")))h["deviceId"]="";selectedId="";
    });}
}
