using System.IO;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
namespace MyPatch;
public partial class MainWindow:Window {
    readonly LocalDatabase db;readonly Domain domain=new();readonly CloudClient cloud;
    JsonObject state=J.NewProject("");ProjectInfo? project;string page="overview",selectedId="",language;bool syncing,conflicted,connecting;
    readonly ComboBox projects=new(){MinWidth=230,DisplayMemberPath="Name",Margin=new Thickness(4),Padding=new Thickness(8)};
    readonly TreeView tree=new(){Background=Brushes.Transparent,BorderThickness=new Thickness(0),Padding=new Thickness(8)};
    readonly ContentControl body=new();readonly TextBlock status=Ui.Text("Տեղային բազա"),live=Ui.Text("");
    readonly StackPanel navigation=new();readonly Stack<JsonObject> undo=new(),redo=new();
    readonly DispatcherTimer timer=new(){Interval=TimeSpan.FromSeconds(5)};CancellationTokenSource? presence;
    public MainWindow(string directory){
        db=new(directory);language=db.Setting("language","hy");Ui.T=x=>domain.Translate(x,language);Ui.Theme(db.Setting("dark")=="true");
        var clientId=db.Setting("clientId");if(clientId==""){clientId=J.Id();db.SettingSave("clientId",clientId);}cloud=new(directory,clientId);
        Title="My Patch · Native Windows";Width=1480;Height=940;MinWidth=1000;MinHeight=680;WindowStartupLocation=WindowStartupLocation.CenterScreen;
        BuildShell();RefreshProjects();timer.Tick+=async(_,_)=>await Sync();timer.Start();
        Loaded+=async(_,_)=>{if(cloud.Scope!=""){connecting=true;try{await cloud.Resume();await LoadCloud();StartPresence();}catch(Exception e){Status("Cloud · "+e.Message);}finally{connecting=false;}}};
        Closing+=(_,_)=>{timer.Stop();presence?.Cancel();};Closed+=(_,_)=>{cloud.Dispose();db.Dispose();};
        CommandBindings.Add(new CommandBinding(ApplicationCommands.Undo,(_,_)=>Undo(),(_,e)=>e.CanExecute=undo.Count>0));
        CommandBindings.Add(new CommandBinding(ApplicationCommands.Redo,(_,_)=>Redo(),(_,e)=>e.CanExecute=redo.Count>0));
    }
    void BuildShell(){
        var root=new DockPanel();Content=root;
        var top=Ui.Bar(Ui.Text("▤  My Patch",22),projects,Ui.Button("Նոր ընկերություն",NewProject,true),Ui.Button("Ներմուծել",Import),Ui.Button("Պահուստային պատճեն",Export),Ui.AsyncButton("Cloud",Login),Ui.AsyncButton("Համաժամացնել",()=>Sync(true)),Ui.Button("↶",Undo),Ui.Button("↷",Redo));top.Margin=new Thickness(16,10,16,2);DockPanel.SetDock(top,Dock.Top);root.Children.Add(top);
        projects.SelectionChanged+=(_,_)=>{if(projects.SelectedItem is ProjectInfo p&&p.Key!=project?.Key)LoadProject(p);};
        var bottom=new DockPanel{Margin=new Thickness(14,6,14,6)};DockPanel.SetDock(live,Dock.Right);bottom.Children.Add(live);bottom.Children.Add(status);DockPanel.SetDock(bottom,Dock.Bottom);root.Children.Add(bottom);
        var left=new DockPanel{Width=245,Background=Ui.B("#dce9e8")};DockPanel.SetDock(left,Dock.Left);root.Children.Add(left);
        foreach(var (key,label) in new[]{("overview","Ընդհանուր տեսք"),("floors","Հարկեր և ռաքեր"),("map","Քարտեզ"),("networks","Ցանցեր և VLAN"),("reports","Հաշվետվություններ"),("settings","Կարգավորումներ")})navigation.Children.Add(Ui.Button(label,()=>Navigate(key)));
        navigation.Margin=new Thickness(12);DockPanel.SetDock(navigation,Dock.Top);left.Children.Add(navigation);left.Children.Add(tree);
        tree.SelectedItemChanged+=(_,_)=>{if(tree.SelectedItem is TreeViewItem item&&item.Tag is string id){selectedId=id;Navigate("floors");}};
        body.Margin=new Thickness(22,12,22,14);root.Children.Add(body);
    }
    void Status(string text){status.Text=Ui.T(text);}
    public JsonObject State=>state;public Domain Logic=>domain;public string T(string s)=>Ui.T(s);
    void RefreshProjects(string? key=null){var items=db.List().Where(p=>p.Scope=="local"||p.Scope==cloud.Scope).ToList();projects.ItemsSource=items;projects.SelectedItem=items.FirstOrDefault(p=>p.Key==(key??project?.Key))??items.FirstOrDefault();if(projects.SelectedItem==null){project=null;state=J.NewProject("");Render();}}
    void LoadProject(ProjectInfo info){project=info;state=db.Load(info.Key).State;selectedId="";undo.Clear();redo.Clear();conflicted=false;Render();}
    void Navigate(string key){page=key;Render();}
    void Render(){
        tree.Items.Clear();foreach(var f in state.A("floors").Objects()){var fi=new TreeViewItem{Header=f.S("name"),Tag=f.S("id"),IsExpanded=true};foreach(var r in f.A("racks").Objects()){var ri=new TreeViewItem{Header="▤ "+r.S("name"),Tag=r.S("id"),IsExpanded=r.S("id")==selectedId};foreach(var d in r.A("devices").Objects())ri.Items.Add(new TreeViewItem{Header=d.S("name"),Tag=d.S("id")});fi.Items.Add(ri);}tree.Items.Add(fi);}
        if(project==null){body.Content=Ui.Stack(Ui.Text("My Patch",34),Ui.Text("Առանձին Windows աշխատանքային տարածք",20),Ui.Text("Ստեղծեք տեղային նախագիծ, ներմուծեք պահուստային ֆայլը կամ միացեք ձեր cloud հաշվին։"),Ui.Bar(Ui.Button("Նոր ընկերություն",NewProject,true),Ui.Button("Ներմուծել",Import),Ui.AsyncButton("Cloud",Login)));return;}
        body.Content=page switch{"floors"=>Floors(),"map"=>new MapEditor(this),"networks"=>Networks(),"reports"=>Reports(),"settings"=>Settings(),_=>Overview()};
        Status(project.Scope=="local"?"Պահված է սարքում":conflicted?"Cloud · փոփոխությունների բախում․ տեղային տարբերակը պահպանված է":project.Dirty?"Տեղային փոփոխությունները սպասում են cloud-ին":"Cloud · համաժամացված");
    }
    public void Change(Action<JsonObject> action,bool render=true){if(project==null)return;var next=state.Copy();action(next);domain.Validate(next);undo.Push(state.Copy());redo.Clear();SaveState(next);if(render)Render();}
    void SaveState(JsonObject next){if(project==null)return;var baseline=db.Load(project.Key).Baseline;db.Put(project.Key,next,project.Scope,project.RemoteId,project.Revision,project.Scope!="local",baseline);state=next;project=project with{Name=next.S("company"),Dirty=project.Scope!="local"};Status("Պահված է սարքում");}
    void Undo(){if(undo.Count==0)return;redo.Push(state.Copy());SaveState(undo.Pop());Render();}
    void Redo(){if(redo.Count==0)return;undo.Push(state.Copy());SaveState(redo.Pop());Render();}
    async Task ResolveConflict(){
        if(project==null||project.Scope!=cloud.Scope)return;
        if(!Ui.Confirm("Cloud-ում և այս սարքում նույն դաշտը փոփոխվել է։ Պահպանե՞լ ձեր տարբերակը որպես առանձին տեղային նախագիծ և բացել cloud-ի տարբերակը։"))return;
        var selected=project;var scope=cloud.Scope;syncing=true;
        try{var result=await cloud.Send("/api/state",company:selected.RemoteId);if(project?.Key!=selected.Key||cloud.Scope!=scope)return;var remote=(JsonObject)result["state"]!;domain.Validate(remote);var copy=state.Copy();copy["company"]=copy.S("company")+" · local "+DateTime.Now.ToString("yyyy-MM-dd HH:mm");db.Put(J.Id(),copy);db.Put(selected.Key,remote,scope,selected.RemoteId,result.I("revision"));conflicted=false;RefreshProjects(selected.Key);}
        finally{syncing=false;}
    }
    async Task Logout(){if(syncing||connecting)return;connecting=true;presence?.Cancel();try{await cloud.Send("/api/live/leave?client="+cloud.ClientId,"POST",new JsonObject());}catch{}try{await cloud.Logout();}finally{connecting=false;live.Text="";project=null;RefreshProjects();}}
    void NewProject(){new Form("Նոր ընկերություն",v=>{var name=v.S("name");if(name=="")throw new Exception("Անվանումը պարտադիր է");var next=J.NewProject(name);for(var i=1;i<=Math.Clamp(v.I("count",1),1,200);i++)next.A("floors").Add(new JsonObject{["id"]=J.Id(),["name"]=i.ToString(),["racks"]=new JsonArray()});domain.Validate(next);var key=J.Id();db.Put(key,next);RefreshProjects(key);}).Text("name","Անվանում").Text("count","Հարկերի քանակ","1").Note("Նախագիծը կպահպանվի այս համակարգչում։ Cloud տեղափոխելը կատարվում է առանձին հրամանով։").Run();}
    void Import(){var file=new OpenFileDialog{Filter="My Patch backup|*.json;*.xlsx"};if(file.ShowDialog()!=true)return;var incoming=Files.ReadBackup(file.FileName);domain.Validate(incoming);var key=J.Id();db.Put(key,incoming);RefreshProjects(key);}
    void Export(){if(project==null)return;var dialog=new SaveFileDialog{FileName=SafeName(state.S("company")),Filter="My Patch JSON|*.json|My Patch Excel|*.xlsx"};if(dialog.ShowDialog()==true)Files.WriteBackup(dialog.FileName,state,domain.Rows(state));}
    static string SafeName(string name)=>string.Concat(name.Select(c=>Path.GetInvalidFileNameChars().Contains(c)?'_':c));
    UIElement Overview(){var all=J.Devices(state).ToList();return Ui.Scroll(Ui.Stack(Ui.Text(state.S("company"),30),Ui.Text("Windows · "+(project!.Scope=="local"?"SQLite / Offline":"Cloud + SQLite"),13),Ui.Bar(Ui.Card(Ui.Text(T("Հարկեր")+"\n"+state.A("floors").Count,24)),Ui.Card(Ui.Text(T("Ռաքեր")+"\n"+state.A("floors").Objects().Sum(f=>f.A("racks").Count),24)),Ui.Card(Ui.Text(T("Սարքեր")+"\n"+all.Count,24)),Ui.Card(Ui.Text(T("Պորտեր")+"\n"+all.Sum(d=>d.d.A("portList").Count),24))),Ui.Bar(Ui.Button("Ավելացնել հարկ",()=>EditFloor(null),true),Ui.Button("Քարտեզ",()=>Navigate("map")),Ui.Button("Հաշվետվություններ",()=>Navigate("reports"))),Ui.Text("Նախագծի կառուցվածքը",20),Ui.Table(all.Select(x=>new{Floor=x.f.S("name"),Rack=x.r.S("name"),Device=x.d.S("name"),Model=x.d.S("model"),Type=x.d.S("type"),Ports=x.d.A("portList").Count})))) ;}
    async Task Login(){if(syncing||connecting)return;string mode="pin",login="",password="";var form=new Form("Cloud · Մուտք",v=>{mode=v.S("mode");login=v.S("login");password=v.S("password");}).Choice("mode","Մուտքի տեսակ",[("pin","Թիմի PIN"),("account","Անձնական հաշիվ"),("account-pin","Անձնական PIN"),("team-account","Թիմային հաշիվ")]).Text("login","PIN / Էլ․ փոստ").Text("password","Գաղտնաբառ","",true);if(!form.Run())return;connecting=true;presence?.Cancel();try{await cloud.Login(mode,login,password);project=null;RefreshProjects();await LoadCloud();StartPresence();}finally{connecting=false;}}
    async Task LoadCloud(){var scope=cloud.Scope;var list=(JsonArray)await cloud.Send("/api/companies");foreach(var info in list.Objects()){if(cloud.Scope!=scope)return;var key=scope+":"+info.S("id");var old=db.List().FirstOrDefault(x=>x.Key==key);if(old?.Dirty==true)continue;var data=await cloud.Send("/api/state",company:info.S("id"));if(cloud.Scope!=scope)return;old=db.List().FirstOrDefault(x=>x.Key==key);if(old?.Dirty==true)continue;var remote=(JsonObject)data["state"]!;domain.Validate(remote);if(old==null||old.Revision!=data.I("revision"))db.Put(key,remote,scope,info.S("id"),data.I("revision"));}RefreshProjects();}
    void StartPresence(){presence?.Cancel();presence=new();_ = cloud.Presence(payload=>Dispatcher.BeginInvoke(()=>{live.Text="LIVE · "+payload.I("online");live.ToolTip=string.Join("\n",payload.A("users").Objects().Select(u=>u.S("name")));if(!syncing&&OwnedWindows.Count==0)_=Sync();}),presence.Token);}
    async Task Sync(bool explicitRequest=false){
        if(syncing||connecting||OwnedWindows.Count>0||project==null||project.Scope=="local"||cloud.Scope!=project.Scope)return;
        if(conflicted){if(explicitRequest)await ResolveConflict();return;}
        syncing=true;var selected=project;try{
            var current=(JsonObject)await cloud.Send("/api/state",company:selected.RemoteId);if(project?.Key!=selected.Key)return;var remote=(JsonObject)current["state"]!;var revision=current.I("revision");domain.Validate(remote);
            if(project.Dirty){var baseline=db.Load(project.Key).Baseline;var merged=domain.Merge(baseline,state,remote);domain.Validate(merged);var submitted=merged.Copy();var localBeforeSubmit=state.Copy();var result=await cloud.Send("/api/state","PUT",new(){["state"]=merged,["revision"]=revision},project.RemoteId);if(project?.Key!=selected.Key)return;var accepted=result["state"] as JsonObject??submitted;var next=domain.Merge(localBeforeSubmit,state,accepted);var pending=next.ToJsonString()!=accepted.ToJsonString();db.Put(project.Key,next,project.Scope,project.RemoteId,result.I("revision"),pending,accepted);state=next;project=project with{Revision=result.I("revision"),Dirty=pending};Render();}
            else if(revision!=project.Revision){db.Put(project.Key,remote,project.Scope,project.RemoteId,revision);state=remote;project=project with{Revision=revision};undo.Clear();redo.Clear();Render();}
            else Status("Cloud · համաժամացված");
        }catch(Exception e){if(e.Message.Contains("conflict",StringComparison.OrdinalIgnoreCase)||e is CloudError{Status:409})conflicted=true;Status("Cloud · "+e.Message+" · Տեղային տվյալները պահպանված են");if(explicitRequest)Ui.Error(e);}finally{syncing=false;}
    }
}
