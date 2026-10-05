using System.IO;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
namespace MyPatch;
public partial class MainWindow {
    public async Task Preview(){
        try{
            var args=Environment.GetCommandLineArgs();var fixture=args.FirstOrDefault(x=>x.StartsWith("--fixture="))?[10..];var output=args.FirstOrDefault(x=>x.StartsWith("--output="))?[9..]??Path.GetTempPath();Directory.CreateDirectory(output);
            if(fixture!=null){var s=Files.ReadBackup(fixture);domain.Validate(s);db.Put("preview",s);RefreshProjects("preview");}
            var before=state.ToJsonString();Files.WriteBackup(Path.Combine(output,"native-roundtrip.json"),state,domain.Rows(state));var xlsx=Path.Combine(output,"native-roundtrip-"+Guid.NewGuid()+".xlsx");Files.WriteBackup(xlsx,state,domain.Rows(state));var restored=Files.ReadBackup(xlsx);domain.Validate(restored);if(restored.ToJsonString()!=before)throw new Exception("Backup round trip mismatch");
            Navigate("overview");await Task.Delay(150);Capture(Path.Combine(output,"native-overview.png"));
            Navigate("map");await Task.Delay(400);((MapEditor)body.Content).Draw();((MapEditor)body.Content).VerifyRendered();((MapEditor)body.Content).VerifyPlacement();Capture(Path.Combine(output,"native-map.png"));
            Navigate("reports");await Task.Delay(150);Capture(Path.Combine(output,"native-reports.png"));
            var plan=state.A("floorPlans").Objects().FirstOrDefault();if(plan!=null){var doc=MakeDocument(new(){["kind"]="all",["floorId"]=plan.S("floorId"),["planId"]=plan.S("id"),["deviceId"]="",["deviceType"]="all",["language"]="hy"});if(doc.Pages.Count==0)throw new Exception("Empty print document");PdfExport.Save(doc.DocumentPaginator,Path.Combine(output,"native-export.pdf"));var imported=await Files.LoadPlan(Path.Combine(output,"native-export.pdf"),1);if(imported.Width<100||imported.Height<100)throw new Exception("Invalid native PDF import");File.WriteAllBytes(Path.Combine(output,"native-pdf-page.jpg"),Convert.FromBase64String(imported.Data.Split(',')[1]));}
            using(var reopened=new LocalDatabase(db.Directory)){if(reopened.Load("preview").State.ToJsonString()!=state.ToJsonString())throw new Exception("SQLite persistence mismatch");}
            File.WriteAllText(Path.Combine(output,"native-check.txt"),"Native WPF UI rendered. Domain validation, reopened SQLite persistence, JSON/XLSX round trips, map placement/removal, filtered PDF export and native PDF import passed.");
        }catch(Exception e){var output=Environment.GetCommandLineArgs().FirstOrDefault(x=>x.StartsWith("--output="))?[9..]??Path.GetTempPath();File.WriteAllText(Path.Combine(output,"native-error.txt"),e.ToString());Environment.ExitCode=1;}
        finally{Close();}
    }
    void Capture(string file){UpdateLayout();var image=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);image.Render(this);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(image));using var stream=File.Create(file);encoder.Save(stream);}
}
