using System.IO;
using System.Windows;
namespace MyPatch;
public static class Program {
    [STAThread] public static void Main(string[] args){
        using var instance=new Mutex(true,"Local\\MyPatchNative"+(args.Contains("--preview")?Environment.ProcessId.ToString():""),out var isNew);
        if(!isNew){MessageBox.Show("My Patch Native-ն արդեն բաց է։");return;}
        var app=new Application{ShutdownMode=ShutdownMode.OnMainWindowClose};
        app.DispatcherUnhandledException+=(_,e)=>{Ui.Error(e.Exception);e.Handled=true;};
        var preview=args.Contains("--preview");var data=preview?Path.Combine(Path.GetTempPath(),"MyPatchNativePreview"):Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MyPatchNative");
        Ui.Theme(false);
        try{var window=new MainWindow(data);app.MainWindow=window;if(preview){window.ShowInTaskbar=false;window.Left=-20000;window.Top=-20000;window.WindowStartupLocation=WindowStartupLocation.Manual;window.Loaded+=async(_,_)=>await window.Preview();}app.Run(window);}catch(Exception e){MessageBox.Show(e.ToString(),"My Patch Native");}
    }
}
