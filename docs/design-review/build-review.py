"""Prepare a review of genuine Figma exports, never screenshots of a PWA.

Original references and exported screens are kept unchanged. Contact sheets
and interior crops are review derivatives only.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

root = Path(__file__).resolve().parent
names = ['01-trips', '02-overview', '03-packing', '04-plan', '05-documents', '06-tasks', '07-discussions', '08-budget']
labels = ['01 · Мои поездки', '02 · Обзор поездки', '03 · Сборы', '04 · План по дням', '05 · Документы', '06 · Задачи', '07 · Обсуждения', '08 · Бюджет']
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
sheet = Image.new('RGB', (4 * 414 + 24, 2 * 910 + 90), '#e9dfcf')
draw = ImageDraw.Draw(sheet)
draw.text((24, 18), 'TravelOrganizer · экспорт редактируемых макетов Figma · черновик для проверки', fill='#2e281f', font=font)
draw.text((24, 48), 'Не скриншоты PWA. Есть известные дефекты; исправление на холсте остановлено лимитом Figma Starter.', fill='#6f6455', font=small)
for i, (name, label) in enumerate(zip(names, labels)):
    x, y = 24 + (i % 4) * 414, 100 + (i // 4) * 910
    draw.text((x, y), label, fill='#2e281f', font=font)
    im = Image.open(root / (name + '.png')).convert('RGB')
    assert im.size == (390, 844)
    sheet.paste(im, (x, y + 36))
sheet.save(root / 'figma-eight-screens.png', optimize=True)

manifest = json.loads((root.parent / 'ui-reference/manifest.json').read_text(encoding='utf-8'))
crops = []
(root / 'reference-interiors').mkdir(exist_ok=True)
for name, panel in zip(names, manifest['panels']):
    source = Image.open(root.parent / 'ui-reference' / panel['file'])
    # Approximate inner content; exclude device sides, notch and outer base.
    bbox = (16, 34, source.width - 16, source.height - 18)
    cropped = source.crop(bbox)
    cropped.save(root / 'reference-interiors' / (name + '.png'))
    crops.append({'file': name + '.png', 'source': panel['file'], 'crop': bbox, 'purpose': 'Review derivative excluding decorative device; source unchanged'})
(root / 'reference-interiors/manifest.json').write_text(json.dumps(crops, ensure_ascii=False, indent=2), encoding='utf-8')
print('Created one contact sheet and eight review-only interior crops. Original exports remain 390x844.')
