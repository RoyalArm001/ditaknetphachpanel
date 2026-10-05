using System.Globalization;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Imaging;
namespace MyPatch;

// Print the native document to a portable PDF, including Armenian fonts, offline.
// Pages are rendered at 192 dpi so the installed font set does not affect readers.
public static class PdfExport {
    public static void Save(DocumentPaginator paginator,string file){
        paginator.ComputePageCount();if(paginator.PageCount<1)throw new Exception("Empty document");
        var temporary=file+"."+Guid.NewGuid()+".tmp";
        try{
            using(var stream=File.Create(temporary)){
                var offsets=new List<long>{0};
                void Write(string text){var bytes=Encoding.ASCII.GetBytes(text);stream.Write(bytes);}
                void Object(int id,string body){while(offsets.Count<=id)offsets.Add(0);offsets[id]=stream.Position;Write(id+" 0 obj\n"+body+"\nendobj\n");}
                void Data(int id,string dictionary,byte[] data){while(offsets.Count<=id)offsets.Add(0);offsets[id]=stream.Position;Write(id+" 0 obj\n<< "+dictionary+" /Length "+data.Length+" >>\nstream\n");stream.Write(data);Write("\nendstream\nendobj\n");}
                Write("%PDF-1.4\n");Object(1,"<< /Type /Catalog /Pages 2 0 R >>");Object(2,"<< /Type /Pages /Count "+paginator.PageCount+" /Kids ["+string.Join(" ",Enumerable.Range(0,paginator.PageCount).Select(i=>(3+3*i)+" 0 R"))+"] >>");
                for(int i=0;i<paginator.PageCount;i++){
                    var page=paginator.GetPage(i);var size=page.Size;
                    if(page.Visual is FrameworkElement element){element.Measure(size);element.Arrange(new Rect(size));element.UpdateLayout();}
                    var image=new RenderTargetBitmap((int)Math.Ceiling(size.Width*2),(int)Math.Ceiling(size.Height*2),192,192,PixelFormats.Pbgra32);image.Render(page.Visual);
                    var encoder=new JpegBitmapEncoder{QualityLevel=94};encoder.Frames.Add(BitmapFrame.Create(image));using var buffer=new MemoryStream();encoder.Save(buffer);
                    var pageId=3+3*i;var width=(size.Width*.75).ToString("0.###",CultureInfo.InvariantCulture);var height=(size.Height*.75).ToString("0.###",CultureInfo.InvariantCulture);
                    Object(pageId,$"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources << /XObject << /Im0 {pageId+1} 0 R >> >> /Contents {pageId+2} 0 R >>");
                    Data(pageId+1,$"/Type /XObject /Subtype /Image /Width {image.PixelWidth} /Height {image.PixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",buffer.ToArray());
                    Data(pageId+2,"",Encoding.ASCII.GetBytes($"q {width} 0 0 {height} 0 0 cm /Im0 Do Q"));
                }
                var xref=stream.Position;Write("xref\n0 "+offsets.Count+"\n0000000000 65535 f \n");foreach(var offset in offsets.Skip(1))Write(offset.ToString("D10",CultureInfo.InvariantCulture)+" 00000 n \n");Write($"trailer\n<< /Size {offsets.Count} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
            }
            File.Move(temporary,file,true);
        }finally{if(File.Exists(temporary))File.Delete(temporary);}
    }
}
