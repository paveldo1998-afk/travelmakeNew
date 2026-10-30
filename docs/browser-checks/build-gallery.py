"""Gallery of real browser captures; originals and reference remain untouched."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

root=Path(__file__).resolve().parent
names=['01-trips','02-overview','03-packing','04-plan','05-documents','06-tasks','07-discussions','08-budget']
labels=['Мои поездки','Обзор поездки','Сборы','План по дням','Документы','Задачи','Обсуждения','Бюджет']
sheet=Image.new('RGB',(1680,1910),'#e9dfcf')
draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
draw.text((24,16),'TravelOrganizer PWA · настоящие снимки браузера · 390 x 844',fill='#2e281f',font=font)
draw.text((24,52),'Отдельный деморежим: все поездки, участники и записи синтетические. Никаких рамок устройств.',fill='#6f6455',font=small)
for i,(name,label) in enumerate(zip(names,labels)):
    x=24+(i%4)*414;y=100+(i//4)*910
    draw.text((x,y),f'{i+1:02} · {label}',fill='#2e281f',font=font)
    im=Image.open(root/'main'/f'{name}.png').convert('RGB')
    assert im.size==(390,844),im.size
    sheet.paste(im,(x,y+36))
sheet.save(root/'eight-screens.png',optimize=True)
scenarios=sorted(p.name for p in (root/'scenarios').glob('*.png'))
extra=sorted(p.name for p in (root/'extra').glob('*.png'))
(root/'gallery-files.json').write_text(json.dumps({'scenarios':scenarios,'extra':extra},indent=2),encoding='utf-8')
print('Built real-browser contact sheet and gallery file index.')
