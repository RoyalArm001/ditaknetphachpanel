from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

OUT=Path(__file__).resolve().parents[1] / 'docs' / 'rack_network_system_plan.docx'
def shade(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)
def borders(cell):
    tcPr=cell._tc.get_or_add_tcPr(); b=tcPr.first_child_found_in('w:tcBorders')
    if b is None: b=OxmlElement('w:tcBorders'); tcPr.append(b)
    for e in ('top','left','bottom','right','insideH','insideV'):
        x=OxmlElement('w:'+e); x.set(qn('w:val'),'single'); x.set(qn('w:sz'),'4'); x.set(qn('w:color'),'D9D9D9'); b.append(x)
def style_table(t):
    t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for ri,row in enumerate(t.rows):
        for c in row.cells:
            c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; borders(c)
            for p in c.paragraphs:
                p.paragraph_format.space_after=Pt(3); p.paragraph_format.space_before=Pt(3)
                for r in p.runs: r.font.name='Arial'; r.font.size=Pt(8.5)
        if ri==0:
            for c in row.cells:
                shade(c,'1F4E78')
                for p in c.paragraphs:
                    for r in p.runs: r.font.bold=True; r.font.color.rgb=RGBColor(255,255,255)
doc=Document(); s=doc.sections[0]; s.top_margin=Inches(.7); s.bottom_margin=Inches(.7); s.left_margin=Inches(.7); s.right_margin=Inches(.7)
doc.styles['Normal'].font.name='Arial'; doc.styles['Normal'].font.size=Pt(10)
for n,z in [('Title',22),('Heading 1',16),('Heading 2',12)]: doc.styles[n].font.name='Arial'; doc.styles[n].font.size=Pt(z); doc.styles[n].font.color.rgb=RGBColor(0,0,0)
p=doc.add_paragraph(style='Title'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('Ցանցային ռաքերի և փաչ պանելների կառավարման ծրագրի պլան')
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run('Պահանջներ, էկրաններ, տվյալների կառուցվածք և իրականացման փուլեր'); r.italic=True
doc.add_paragraph('Այս փաստաթուղթը սահմանում է այն վեբ ծրագիրը, որը կօգնի կառավարել ընկերության շենքի հարկերը, ռաքերը, փաչ պանելները, սվիչները և մալուխների կապերը։ Նպատակը Excel-ից անցնելն է տեսողական, որոնելի և հաշվետվություններ ստեղծող համակարգի։')
doc.add_heading('1 Ծրագրի հաստատված տեսլականը',1)
for x in ['Բրաուզերով աշխատանք համակարգչով և հեռախոսով','Մեկ ընկերություն և շենքի հարկերի քանակի ընտրություն','Յուրաքանչյուր հարկում մեկ կամ մի քանի ռաք','Փաչ պանելներ և սվիչներ՝ ռաքի տեսողական դասավորությամբ','12, 24 կամ 48 պորտանոց փաչ պանելներ','Ռաքի լուսանկար՝ միայն դիտելու համար','Պորտերի գույներ՝ ազատ, զբաղված, անսարք','Որոնում ըստ սվիչի, պորտի, սարքի, սենյակի և հարկի','Excel և PDF արտահանում','Ավտոմատ և ձեռքով պահպանում']: doc.add_paragraph(x,style='List Bullet')
doc.add_heading('2 Հիմնական աշխատանքային հոսքը',1)
doc.add_paragraph('Ընկերություն → Շենք և հարկեր → Հարկի ռաքեր → Ռաքի չափ և լուսանկար → Սարքերի տեղադրում U դիրքով → Փաչ պանելի պորտեր → Սվիչի պորտերի կապ → Մալուխի տեղադրության տվյալներ → Որոնում և հաշվետվություն')
doc.add_heading('3 Էկրանների նախագծում',1)
t=doc.add_table(rows=1,cols=4); [setattr(t.rows[0].cells[i],'text',h) for i,h in enumerate(['Էկրան','Ինչ է անում','Հիմնական դաշտեր','Արդյունք'])]
rows=[('Գլխավոր վահանակ','Ցույց է տալիս ընկերությունը, հարկերը և ռաքերի քանակը','Ընկերություն, հարկերի քանակ','Արագ մուտք'),('Հարկերի քարտեզ','Ցույց է տալիս ռաքեր ունեցող հարկերը','Հարկի համար, ռաքերի ցանկ','Ընտրելի հարկ'),('Ռաքի էջ','Ցույց է տալիս լուսանկարը և տվյալները','Հարկ, տեղադրություն, անուն, U չափ','Ռաքի քարտ'),('Ռաքի տեսք','Տեղադրում է սարքերը U դիրքերով','Սարքի անուն, U դիրք, բարձրություն','Տեսողական դասավորություն'),('Փաչ պանելի էջ','Ցույց է տալիս 12/24/48 պորտերը','Պորտ, վիճակ, մալուխ, սվիչի կապ','Գունավոր պորտային քարտ'),('Մալուխի քարտ','Պահում է կապի ամբողջ ինֆորմացիան','Մալուխ, հարկ, սենյակ, դուռ, կողմ, նշումներ','Միացման ուղի'),('Որոնում','Գտնում է կապը','Սվիչ, պորտ, սարք, սենյակ, հարկ','Արդյունքների ցուցակ'),('Հաշվետվություններ','Արտահանում է տվյալները','Ֆիլտրեր','Excel կամ PDF')]
for row in rows:
    c=t.add_row().cells
    for i,v in enumerate(row): c[i].text=v
style_table(t)
doc.add_heading('4 Տվյալների կառուցվածք',1)
t=doc.add_table(rows=1,cols=3); [setattr(t.rows[0].cells[i],'text',h) for i,h in enumerate(['Օբյեկտ','Պարտադիր դաշտեր','Նշում'])]
rows=[('Company','id, name','Մեկ ընկերություն'),('Building','id, company_id, floor_count','Հարկերի թիվ'),('Floor','id, building_id, number, name','Յուրաքանչյուր հարկ'),('Rack','id, floor_id, name, U_height, photo','Մի քանի ռաք/հարկ'),('Device','id, rack_id, type, name, U_position, U_height','Փաչ պանել կամ սվիչ'),('PatchPanel','device_id, port_count','12, 24 կամ 48'),('PatchPort','panel_id, port_number, status','Ազատ/զբաղված/անսարք'),('SwitchPort','switch_id, port_number','Սվիչի պորտ'),('Cable','id, patch_port_id, switch_port_id, number, floor, room, door, side, notes','Մալուխի ամբողջ ուղին')]
for row in rows:
    c=t.add_row().cells
    for i,v in enumerate(row): c[i].text=v
style_table(t)
doc.add_heading('5 Գույներ և բիզնես կանոններ',1)
doc.add_paragraph('Կանաչը նշանակում է ազատ, կապույտը՝ զբաղված, կարմիրը՝ անսարք։ Ռաքի դասավորիչը ստուգում է, որ սարքի U դիրքը և բարձրությունը դուրս չգան ռաքի սահմաններից և չհամընկնեն այլ սարքի հետ։')
doc.add_heading('6 Իրականացման փուլեր և GPT մոդելներ',1)
t=doc.add_table(rows=1,cols=5); [setattr(t.rows[0].cells[i],'text',h) for i,h in enumerate(['Փուլ','Աշխատանք','Արդյունք','GPT մոդել','Մակարդակ'])]
ph=[('1 Պահանջների հաստատում','Դաշտեր, գույներ, օրինակներ, ընդունման չափանիշներ','Պահանջների փաստաթուղթ','GPT-5.6-Sol','Միջին'),('2 UX և էկրաններ','Վահանակի, հարկերի, ռաքի և պորտերի wireframe','Էկրանների սքեմա','GPT-5.6-Terra','Բարձր'),('3 Տվյալների բազա և API','Company, Building, Floor, Rack, Device, Port, Cable մոդելներ','Տվյալների շերտ','GPT-5.6-Sol','Բարձր'),('4 Հիմնական վեբ հավելված','CRUD գործողություններ բոլոր հիմնական օբյեկտների համար','Օգտագործելի MVP','GPT-5.6-Terra','Բարձր'),('5 Ռաքի դասավորիչ','U դիրքեր, ստանդարտ չափեր, բախումների ստուգում','Ճիշտ ռաքի տեսք','GPT-6-Astra','Շատ բարձր'),('6 Որոնում և կապեր','Փաչ պորտ–սվիչ պորտ կապ և որոնում','Արագ որոնում','GPT-5.6-Sol','Բարձր'),('7 Excel և PDF','Ֆիլտրերով հաշվետվություններ','Excel/PDF','GPT-5.6-Sol','Միջին'),('8 Պահպանում','Ավտոպահպանում, ձեռքով պահում, backup','Չկորչող տվյալներ','GPT-6-Astra','Բարձր'),('9 Թեստավորում','U բախումներ, պորտեր, որոնում, արտահանում','Թեստային հաշվետվություն','GPT-6-Astra','Շատ բարձր'),('10 Տեղակայում','Սերվեր/համակարգիչ և օգտագործման ուղեցույց','Աշխատող ծրագիր','GPT-5.6-Sol','Միջին')]
for row in ph:
    c=t.add_row().cells
    for i,v in enumerate(row): c[i].text=v
style_table(t)
doc.add_heading('7 GPT մոդելների օգտագործման կանոն',1)
doc.add_paragraph('GPT-5.6-Sol-ը հարմար է սովորական ծրագրավորման, CRUD էկրանների, տվյալների դաշտերի և հաշվետվությունների համար։ GPT-5.6-Terra-ն հարմար է ամբողջական վեբ հավելվածի ճարտարապետության և բաղադրիչների միացման համար։ GPT-6-Astra-ն պետք է կիրառել բարձր ճշգրտություն պահանջող մասերում՝ ռաքի ավտոմատ դասավորություն, բարդ վավերացումներ և վերջնական թեստավորում։')
doc.add_paragraph('Յուրաքանչյուր փուլում մոդելին պետք է տալ միայն տվյալ փուլի սահմանված աշխատանքը, պահանջել աշխատող արդյունք և ստուգել այն իրական ցանցային տվյալներով։')
doc.add_heading('8 Առաջին տարբերակի ընդունման չափանիշներ',1)
for x in ['Ստեղծվում է ընկերություն և նշվում է հարկերի քանակը։','Յուրաքանչյուր հարկում ավելացվում են մի քանի ռաքեր։','Ընտրվում է 12, 24 կամ 48 պորտանոց փաչ պանել։','Սվիչներն ու փաչ պանելները դասավորվում են U դիրքով և բարձրությամբ։','Պորտերի գույները փոխվում են ըստ վիճակի։','Մալուխը պահում է հարկ, սենյակ, դուռ, կողմ և նշումներ։','Որոնումը աշխատում է սվիչով, պորտով, սարքով, սենյակով և հարկով։','Հաշվետվությունը արտահանվում է Excel և PDF։','Տվյալները պահպանվում են ավտոմատ և ձեռքով։']: doc.add_paragraph(x,style='List Bullet')
doc.add_heading('9 Առաջարկվող տեխնիկական հիմք',1)
doc.add_paragraph('Առաջարկվում է responsive web application՝ React կամ Next.js ինտերֆեյսով, REST API-ով և SQLite կամ PostgreSQL տվյալների բազայով։ Եթե ծրագիրը պետք է աշխատի միայն տեղական ցանցում, առաջին տեղակայումը կարելի է անել մեկ Windows համակարգչի կամ ներքին սերվերի վրա։ Հետագայում կարելի է ավելացնել մուտքի համակարգ, QR պիտակներ, լուսանկարների կցում և փոփոխությունների պատմություն։')
doc.add_paragraph('Կարգավիճակ՝ նախնական հաստատված պլան։ Հաջորդ քայլը UX wireframe-ների և տվյալների բազայի վերջնական սխեմայի պատրաստումն է։')
doc.save(OUT); print(OUT)
