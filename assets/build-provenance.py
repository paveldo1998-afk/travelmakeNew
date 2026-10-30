"""Record provenance and checksums for the locally shipped public assets."""
from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parent
upstream=json.loads((root.parent/'docs/design-work/photos/ASSET_SOURCES.json').read_text(encoding='utf-8'))
names={'candidate-36664010.jpg':['kyoto.jpg','candidate-36664010.jpg'], 'positano-coast.jpg':['amalfi.jpg','positano-coast.jpg'], 'barcelona-guell.jpg':['barcelona.jpg','barcelona-guell.jpg'], 'kyoto-alley.jpg':['kyoto-alley.jpg'], 'kiyomizu-dera.jpg':['temple.jpg','kiyomizu-dera.jpg'], 'japanese-breakfast.jpg':['breakfast.jpg','japanese-breakfast.jpg']}
photos=[]
for source in upstream['assets']:
    for filename in names.get(source['file'],[]):
        photo=dict(source)
        photo['source_asset']=source['file']
        photo['file']=filename
        photo['sha256']=hashlib.sha256((root/'photos'/filename).read_bytes()).hexdigest()
        photos.append(photo)
(root/'photos/SOURCES.json').write_text(json.dumps({'note':upstream['note'],'assets':photos},ensure_ascii=False,indent=2),encoding='utf-8')
fonts=[]
for family,filename,source,license_file,changes in [
 ('Golos Text','golos-text.woff2','https://raw.githubusercontent.com/google/fonts/main/ofl/golostext/GolosText%5Bwght%5D.ttf','GolosText-OFL.txt','Lossless webfont format conversion from upstream variable TTF using fontTools; full character set retained'),
 ('Lora','lora.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora%5Bwght%5D.ttf','Lora-OFL.txt','Original upstream font bytes; no modification')]:
    fonts.append({'family':family,'file':filename,'source':source,'license':'SIL Open Font License 1.1','license_file':license_file,'changes':changes,'sha256':hashlib.sha256((root/'fonts'/filename).read_bytes()).hexdigest(),'verified':'2026-10-30'})
(root/'fonts/SOURCES.json').write_text(json.dumps({'fonts':fonts},ensure_ascii=False,indent=2),encoding='utf-8')
(root/'icons/SOURCES.json').write_text(json.dumps({'author':'TravelOrganizer implementation','source':'Original geometric artwork; favicon.svg and assets/build-icons.py','external_artwork':False,'meaning':'Travel suitcase and direction accent','icons':[{ 'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((root/'icons').glob('*.png'))]},ensure_ascii=False,indent=2),encoding='utf-8')
print('Recorded photo, font, and original icon provenance.')
