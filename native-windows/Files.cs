using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Xml;
using System.Xml.Linq;
namespace MyPatch;
public static class Files {
    static readonly XNamespace X="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    static XDocument Xml(ZipArchiveEntry entry){if(entry.Length>32*1024*1024)throw new Exception("File too large");using var stream=entry.Open();using var reader=XmlReader.Create(stream,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=32*1024*1024});return XDocument.Load(reader);}
    public static JsonObject ReadBackup(string file){
        string text;if(System.IO.Path.GetExtension(file).Equals(".xlsx",StringComparison.OrdinalIgnoreCase)){
            using var archive=ZipFile.OpenRead(file);var wb=Xml(archive.GetEntry("xl/workbook.xml")!);var sheet=wb.Descendants(X+"sheet").FirstOrDefault(x=>(string?)x.Attribute("name")=="MyPatch Recovery")??throw new Exception("My Patch backup not found");
            var relId=(string?)sheet.Attribute(XNamespace.Get("http://schemas.openxmlformats.org/officeDocument/2006/relationships")+"id");var rel=Xml(archive.GetEntry("xl/_rels/workbook.xml.rels")!).Descendants().First(x=>(string?)x.Attribute("Id")==relId);var target=((string)rel.Attribute("Target")!).TrimStart('/');if(!target.StartsWith("xl/"))target="xl/"+target;
            var shared=archive.GetEntry("xl/sharedStrings.xml") is { } strings?Xml(strings).Descendants(X+"si").Select(x=>string.Concat(x.Descendants(X+"t").Select(t=>t.Value))).ToArray():[];
            var rows=Xml(archive.GetEntry(target)!).Descendants(X+"row").Select(r=>r.Elements(X+"c").Select(c=>(string?)c.Attribute("t")=="s"?shared[int.Parse(c.Element(X+"v")!.Value)]:(string?)c.Attribute("t")=="inlineStr"?string.Concat(c.Descendants(X+"t").Select(x=>x.Value)):c.Element(X+"v")?.Value??"").ToArray()).ToArray();
            if(rows.Length==0||rows[0][0]!="mypatch-backup")throw new Exception("Invalid backup");text=string.Concat(rows.Skip(1).Select(r=>r.FirstOrDefault()??""));
        }else{if(new FileInfo(file).Length>24*1024*1024)throw new Exception("File too large");text=File.ReadAllText(file);}
        var node=JsonNode.Parse(text)!;return (node["state"]??node).AsObject();
    }
    public static void WriteBackup(string file,JsonObject state,JsonArray rows){
        var data=new JsonObject{["schema"]=2,["state"]=state.DeepClone(),["exportedAt"]=DateTime.UtcNow.ToString("O")};
        if(!file.EndsWith(".xlsx",StringComparison.OrdinalIgnoreCase)){File.WriteAllText(file,data.ToJsonString(new(){WriteIndented=true}),Encoding.UTF8);return;}
        var temporary=file+"."+Guid.NewGuid()+".tmp";using var archive=ZipFile.Open(temporary,ZipArchiveMode.Create);void Write(string name,string text){using var writer=new StreamWriter(archive.CreateEntry(name).Open(),new UTF8Encoding(false));writer.Write(text);}
        Write("[Content_Types].xml","<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>");
        Write("_rels/.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"r1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
        Write("xl/workbook.xml","<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Connections\" sheetId=\"1\" r:id=\"r1\"/><sheet name=\"MyPatch Recovery\" sheetId=\"2\" state=\"veryHidden\" r:id=\"r2\"/></sheets></workbook>");
        Write("xl/_rels/workbook.xml.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"r1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"r2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/></Relationships>");
        string Sheet(IEnumerable<string[]> lines){int row=0;return new XDocument(new XElement(X+"worksheet",new XElement(X+"sheetData",lines.Select(line=>new XElement(X+"row",new XAttribute("r",++row),line.Select((value,col)=>new XElement(X+"c",new XAttribute("r",(char)('A'+col)+row.ToString()),new XAttribute("t","inlineStr"),new XElement(X+"is",new XElement(X+"t",new XAttribute(XNamespace.Xml+"space","preserve"),value))))))))).ToString();}
        string[] fields=["floor","rack","device","port","switchName","switchPort","status","service","cable","room","door","side","vlan","connection","notes"];
        Write("xl/worksheets/sheet1.xml",Sheet(new[]{fields}.Concat(rows.Objects().Select(r=>fields.Select(r.S).ToArray()))));
        var json=data.ToJsonString();var chunks=new List<string[]>{new[]{"mypatch-backup","1"}};for(var at=0;at<json.Length;){var end=Math.Min(at+16000,json.Length);if(end<json.Length&&char.IsHighSurrogate(json[end-1]))end--;chunks.Add([json[at..end]]);at=end;}Write("xl/worksheets/sheet2.xml",Sheet(chunks));archive.Dispose();File.Move(temporary,file,true);
    }
    public static BitmapSource Image(string data){var bytes=Convert.FromBase64String(data[(data.IndexOf(',')+1)..]);var image=new BitmapImage();using var stream=new MemoryStream(bytes);image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.StreamSource=stream;image.EndInit();image.Freeze();return image;}
    public static async Task<(string Data,int Width,int Height)> LoadPlan(string file,int page){
        file=Path.GetFullPath(file).Replace('/','\\');
        BitmapSource image;if(file.EndsWith(".pdf",StringComparison.OrdinalIgnoreCase)){
            var source=await Windows.Storage.StorageFile.GetFileFromPathAsync(file);var pdf=await Windows.Data.Pdf.PdfDocument.LoadFromFileAsync(source);if(page<1||page>pdf.PageCount)throw new Exception("PDF page not found");using var p=pdf.GetPage((uint)page-1);using var stream=new Windows.Storage.Streams.InMemoryRandomAccessStream();var scale=2400/Math.Max(p.Size.Width,p.Size.Height);await p.RenderToStreamAsync(stream,new Windows.Data.Pdf.PdfPageRenderOptions{DestinationWidth=(uint)(p.Size.Width*scale),DestinationHeight=(uint)(p.Size.Height*scale)});using var reader=new Windows.Storage.Streams.DataReader(stream.GetInputStreamAt(0));await reader.LoadAsync((uint)stream.Size);var bytes=new byte[stream.Size];reader.ReadBytes(bytes);image=Image("data:image/png;base64,"+Convert.ToBase64String(bytes));
        }else{var bytes=await File.ReadAllBytesAsync(file);image=Image("data:image/png;base64,"+Convert.ToBase64String(bytes));}
        double factor=Math.Min(1,2400d/Math.Max(image.PixelWidth,image.PixelHeight));for(int i=0;i<8;i++){
            var resized=new TransformedBitmap(image,new ScaleTransform(factor,factor));var encoder=new JpegBitmapEncoder{QualityLevel=85};encoder.Frames.Add(BitmapFrame.Create(resized));using var output=new MemoryStream();encoder.Save(output);var data="data:image/jpeg;base64,"+Convert.ToBase64String(output.ToArray());if(data.Length<=2500000)return(data,resized.PixelWidth,resized.PixelHeight);factor*=.8;
        }throw new Exception("Image too large");
    }
}
