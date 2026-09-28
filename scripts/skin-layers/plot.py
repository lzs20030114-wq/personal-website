"""Plot raw solver nodes at a shared world scale; no smoothing or per-frame recentering."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).parent / 'output'
rows = json.loads((root / 'calibration.json').read_text())
w, h, scale = 150, 345, .46
im = Image.new('RGB', (w * 8, h * 4), '#f3f1eb')
d = ImageDraw.Draw(im)
for case, row in enumerate(rows):
    frames = [f for f in row['frames'] if f['step'] % 100 == 0]
    for i, frame in enumerate(frames):
        x, y = (i % 8) * w, (case * 2 + i // 8) * h
        d.text((x + 9, y + 8), f"{row['kind']} / {frame['step']}", fill='#202832')
        pts = [(x + 35 + p[0] * scale, y + 28 + p[1] * scale) for p in frame['points']]
        d.line([(x+35,y+28),(x+35,y+h-8)],fill='#c4c3bd')
        d.line(pts, fill='#325f4b' if case == 0 else '#9a691e', width=2)
        d.line([(x,y+h-1),(x+w,y+h-1)],fill='#bbb')
im.save(root / 'process.png')
# Both final profiles use the SAME origin and scale; target is a separate dashed outline.
im = Image.new('RGB', (900, 570), '#f3f1eb')
d = ImageDraw.Draw(im)
for case, row in enumerate(rows):
    x = 110 + 440 * case
    transform = lambda p: (x + 2.2*p[0], 285 + 2.2*(p[1]-493.38))
    d.text((x-60,20), f"{row['kind']} | true profile / step 1500", fill='#202832')
    target = [transform([p[0], p[1] + 493.38]) for p in row['target']]
    d.line(target, fill='#c4b59c', width=7)
    d.line([(x,70),(x,510)], fill='#bbb')
    d.line([transform(p) for p in row['frames'][-1]['points']], fill='#325f4b' if case == 0 else '#9a691e',width=2)
    d.text((x-60,530), f"height {row['height']:.3f} / reach {row['reach']:.3f}",fill='#202832')
d.text((30,552), 'Wide pale line: target. Thin line: unsmoothed solver. Same world origin and scale.',fill='#555')
im.save(root/'terminal.png')
