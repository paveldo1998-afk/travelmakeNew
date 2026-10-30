"""Render original geometric TravelOrganizer icons; no AI or external artwork."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parent / 'icons'
out.mkdir(exist_ok=True)

def draw_icon(size, maskable=False):
    scale = 4
    canvas = Image.new('RGBA', (512*scale, 512*scale), '#FBF6EB' if maskable else (0,0,0,0))
    d = ImageDraw.Draw(canvas)
    S=lambda v: int(v*scale)
    def bounds(xy): return tuple(S(n) for n in xy)
    if not maskable: d.rounded_rectangle(bounds((0,0,512,512)), radius=S(112), fill='#FBF6EB')
    # The entire meaningful mark remains inside the maskable central 80%.
    # Green directional accent, suitcase handle, body, seams and wheels.
    if maskable:
        shrink=.86
        inner=Image.new('RGBA',(512*scale,512*scale),(0,0,0,0))
        dd=ImageDraw.Draw(inner)
    else: inner=canvas; dd=d
    dd.arc(bounds((214,102,298,186)),180,360,fill='#AD440C',width=S(20))
    dd.line(bounds((214,144,214,176)),fill='#AD440C',width=S(20))
    dd.line(bounds((298,144,298,176)),fill='#AD440C',width=S(20))
    dd.rounded_rectangle(bounds((156,176,356,396)),radius=S(38),outline='#AD440C',width=S(20))
    for x in (216,296): dd.line(bounds((x,220,x,350)),fill='#AD440C',width=S(20))
    for x in (184,328): dd.line(bounds((x,396,x,414)),fill='#AD440C',width=S(20))
    dd.polygon([bounds(p) for p in [(350,102),(424,78),(399,151),(381,122)]],fill='#316842')
    if maskable:
        edge=int(512*scale*shrink)
        inner=inner.resize((edge,edge),Image.Resampling.LANCZOS)
        canvas.alpha_composite(inner,((512*scale-edge)//2,(512*scale-edge)//2))
    return canvas.resize((size,size),Image.Resampling.LANCZOS)

for size in (192,512):
    draw_icon(size).save(out/f'icon-{size}.png',optimize=True)
    draw_icon(size,True).convert('RGB').save(out/f'maskable-{size}.png',optimize=True)
draw_icon(180,True).convert('RGB').save(out/'apple-touch-icon.png',optimize=True)
print('Rendered 192/512 regular and maskable icons plus 180 iOS icon.')
