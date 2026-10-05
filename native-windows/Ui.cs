using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Text.Json.Nodes;
namespace MyPatch;
public static class Ui {
    public static Func<string,string> T=x=>x;
    public static Brush B(string color)=>new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
    public static TextBlock Text(string text,double size=14,string? color=null)=>new(){Text=T(text),FontSize=size,TextWrapping=TextWrapping.Wrap,Foreground=color==null?(Application.Current.Resources["Ink"] as Brush??B("#193e44")):B(color),Margin=new Thickness(0,3,0,7)};
    public static Button Button(string text,Action action,bool primary=false){var b=new Button{Content=new TextBlock{Text=T(text),TextWrapping=TextWrapping.Wrap,TextAlignment=TextAlignment.Center},Margin=new Thickness(0,0,8,6),Padding=new Thickness(13,9,13,9),MinHeight=36};if(primary){b.Background=B("#167f75");b.Foreground=Brushes.White;}b.Click+=(_,_)=>{try{action();}catch(Exception ex){Error(ex);}};return b;}
    public static Button AsyncButton(string text,Func<Task> action,bool primary=false){var b=Button(text,()=>{},primary);b.Click+=async(_,_)=>{b.IsEnabled=false;try{await action();}catch(Exception ex){Error(ex);}finally{b.IsEnabled=true;}};return b;}
    public static void Error(Exception ex)=>MessageBox.Show(ex.Message,T("Սխալ"),MessageBoxButton.OK,MessageBoxImage.Warning);
    public static bool Confirm(string text)=>MessageBox.Show(T(text),"My Patch",MessageBoxButton.YesNo,MessageBoxImage.Question)==MessageBoxResult.Yes;
    public static StackPanel Stack(params UIElement[] children){var panel=new StackPanel();foreach(var child in children)panel.Children.Add(child);return panel;}
    public static WrapPanel Bar(params UIElement[] children){var panel=new WrapPanel{Margin=new Thickness(0,6,0,8)};foreach(var child in children)panel.Children.Add(child);return panel;}
    public static Border Card(UIElement child)=>new(){Child=child,Padding=new Thickness(18),Margin=new Thickness(0,0,0,14),CornerRadius=new CornerRadius(10),BorderBrush=B("#ccdada"),BorderThickness=new Thickness(1),Background=(Brush)Application.Current.Resources["Surface"]};
    public static ScrollViewer Scroll(UIElement child)=>new(){Content=child,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
    public static ComboBox Select(IEnumerable<(string Id,string Name)> options,string selected="",double width=200){var c=new ComboBox{MinWidth=width,Margin=new Thickness(0,0,8,6),Padding=new Thickness(8),DisplayMemberPath="Value",SelectedValuePath="Key"};c.ItemsSource=options.Select(o=>new KeyValuePair<string,string>(o.Id,T(o.Name))).ToList();c.SelectedValue=selected;if(c.SelectedIndex<0&&c.Items.Count>0)c.SelectedIndex=0;return c;}
    public static string Value(ComboBox c)=>c.SelectedValue?.ToString()??"";
    public static DataGrid Table(IEnumerable<object> rows)=>new(){ItemsSource=rows,IsReadOnly=true,AutoGenerateColumns=true,CanUserAddRows=false,CanUserDeleteRows=false,MinHeight=120,HeadersVisibility=DataGridHeadersVisibility.Column,GridLinesVisibility=DataGridGridLinesVisibility.Horizontal,RowHeight=34,SelectionMode=DataGridSelectionMode.Single};
    public static void Theme(bool dark){var r=Application.Current.Resources;r["Surface"]=B(dark?"#1c3039":"#ffffff");r["Background"]=B(dark?"#102027":"#eff4f5");r["Ink"]=B(dark?"#e3eef1":"#193e44");
        var window=new Style(typeof(Window));window.Setters.Add(new Setter(Control.FontFamilyProperty,new FontFamily("Segoe UI")));window.Setters.Add(new Setter(Control.FontSizeProperty,14d));window.Setters.Add(new Setter(Control.BackgroundProperty,r["Background"]));window.Setters.Add(new Setter(Control.ForegroundProperty,r["Ink"]));r[typeof(Window)]=window;
        foreach(var type in new[]{typeof(TextBox),typeof(PasswordBox),typeof(ComboBox),typeof(Button)}){var style=new Style(type);style.Setters.Add(new Setter(Control.FontSizeProperty,14d));style.Setters.Add(new Setter(Control.PaddingProperty,new Thickness(9,6,9,6)));style.Setters.Add(new Setter(Control.ForegroundProperty,B("#193e44")));style.Setters.Add(new Setter(Control.BackgroundProperty,Brushes.White));r[type]=style;}
        var buttons=new Style(typeof(Button),(Style)r[typeof(Button)]);buttons.Setters.Add(new Setter(Control.BorderBrushProperty,B("#bfcecf")));buttons.Setters.Add(new Setter(Control.BorderThicknessProperty,new Thickness(1)));
        var border=new FrameworkElementFactory(typeof(Border));border.SetValue(Border.CornerRadiusProperty,new CornerRadius(6));
        foreach(var pair in new[]{(Border.BackgroundProperty,"Background"),(Border.BorderBrushProperty,"BorderBrush"),(Border.BorderThicknessProperty,"BorderThickness"),(Border.PaddingProperty,"Padding")})border.SetBinding(pair.Item1,new System.Windows.Data.Binding(pair.Item2){RelativeSource=System.Windows.Data.RelativeSource.TemplatedParent});
        var presenter=new FrameworkElementFactory(typeof(ContentPresenter));presenter.SetValue(FrameworkElement.HorizontalAlignmentProperty,HorizontalAlignment.Center);presenter.SetValue(FrameworkElement.VerticalAlignmentProperty,VerticalAlignment.Center);border.AppendChild(presenter);buttons.Setters.Add(new Setter(Control.TemplateProperty,new ControlTemplate(typeof(Button)){VisualTree=border}));
        var hover=new Trigger{Property=UIElement.IsMouseOverProperty,Value=true};hover.Setters.Add(new Setter(Control.BorderBrushProperty,B("#168a80")));buttons.Triggers.Add(hover);
        var disabled=new Trigger{Property=UIElement.IsEnabledProperty,Value=false};disabled.Setters.Add(new Setter(UIElement.OpacityProperty,.5));buttons.Triggers.Add(disabled);
        r[typeof(Button)]=buttons;
    }
}
public sealed class Form:Window {
    readonly StackPanel fields=new();readonly Dictionary<string,Func<string>> values=new();readonly Action<JsonObject> apply;
    public Form(string title,Action<JsonObject> apply){Title=Ui.T(title);this.apply=apply;Width=580;MaxHeight=850;SizeToContent=SizeToContent.Height;WindowStartupLocation=WindowStartupLocation.CenterOwner;Owner=Application.Current.MainWindow;var panel=Ui.Stack(Ui.Text(title,23),fields);panel.Margin=new Thickness(24);Content=Ui.Scroll(panel);}
    public Form Text(string key,string label,string value="",bool password=false){fields.Children.Add(Ui.Text(label,12));if(password){var t=new PasswordBox{Password=value,Margin=new Thickness(0,0,0,12)};fields.Children.Add(t);values[key]=()=>t.Password;}else{var t=new TextBox{Text=value,Margin=new Thickness(0,0,0,12),MaxLength=key=="notes"?2000:200};fields.Children.Add(t);values[key]=()=>t.Text.Trim();}return this;}
    public Form Choice(string key,string label,IEnumerable<(string Id,string Name)> items,string selected=""){fields.Children.Add(Ui.Text(label,12));var c=Ui.Select(items,selected);fields.Children.Add(c);values[key]=()=>Ui.Value(c);return this;}
    public Form Checklist(string key,string label,IEnumerable<(string Id,string Name)> items,IEnumerable<string> selected){fields.Children.Add(Ui.Text(label,12));var selection=selected.ToHashSet();var checks=new List<(string Id,CheckBox Box)>();foreach(var item in items){var box=new CheckBox{Content=item.Name,IsChecked=selection.Contains(item.Id),Margin=new Thickness(0,4,0,4)};fields.Children.Add(box);checks.Add((item.Id,box));}values[key]=()=>string.Join(',',checks.Where(x=>x.Box.IsChecked==true).Select(x=>x.Id));return this;}
    public Form Note(string text){fields.Children.Add(Ui.Text(text,12));return this;}
    public Form Check(string key,string label,bool value){var c=new CheckBox{Content=Ui.T(label),IsChecked=value,Margin=new Thickness(0,8,0,14)};fields.Children.Add(c);values[key]=()=>c.IsChecked==true?"true":"false";return this;}
    public bool Run(){fields.Children.Add(Ui.Bar(Ui.Button("Փակել",()=>Close()),Ui.Button("Պահպանել",()=>{var data=new JsonObject();foreach(var x in values)data[x.Key]=x.Value();apply(data);DialogResult=true;},true)));return ShowDialog()==true;}
}
