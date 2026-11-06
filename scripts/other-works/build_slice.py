# The Slice 素材（2026-11-06，作者交来课程汇报 PPT 与任务书 PDF）→ 网页尺寸 webp → public/other/the-slice/。
# 原文件只读；PPT 按压缩包读，媒体在内存里解码，不解压落盘。任务书 PDF 里的图是竞赛方和网上的场地资料，不转。
# 尺寸档与 build_assets.py 相同：渲染图长边 2000（质量 80），图版 / 线稿总像素 650 万、长边 5000（质量 82）。
# 用法：python -I scripts/other-works/build_slice.py public/other/the-slice
import sys, os, io, zipfile, math
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

OUT = sys.argv[1]
PPT = 'D:/桌面/临时作品集/专业设计4 - 倪子皓 李梓硕.pptx'
PHOTO_LONG, BOARD_PX, BOARD_LONG = 2000, 6_500_000, 5000

# (输出名, 类别, PPT 媒体, 裁切比例 x0 y0 x1 y1 | None)
ITEMS = [
  ('01-cover', 'photo', 'image5.png', None),                               # 屋顶平面放在修道院上的轴测
  ('02-elevation-shadow', 'board', 'image1.jpeg', (0.03, 0.2, 0.86, 0.68)),  # 去掉下面的白地
  ('03-under-the-plane', 'photo', 'image6.png', None),
  ('04-exploded', 'board', 'image3.png', (0.34, 0, 0.66, 1)),              # PPT 页面两侧的白边不要
  ('05-axon-north', 'board', 'image15.jpeg', None),
  ('06-axon-south', 'board', 'image16.jpeg', None),
  ('07-axon-roof', 'board', 'image17.jpeg', None),
  ('08-plan-ground', 'board', 'image18.jpeg', None),
  ('09-plan-roof', 'board', 'image19.jpeg', None),
  ('10-elevation-east', 'board', 'image20.jpeg', (0, 0.2, 1, 0.92)),
  ('11-elevation-west', 'board', 'image21.jpeg', (0, 0.2, 1, 0.92)),
  ('12-elevation-north', 'board', 'image22.jpeg', (0, 0.28, 1, 1)),
  ('13-elevation-south', 'board', 'image23.jpeg', (0, 0.32, 1, 1)),
  ('14-hall', 'photo', 'image8.png', None),
  ('15-dining', 'photo', 'image10.png', None),
  ('16-open-dining', 'photo', 'image14.png', None),
  ('17-bar', 'photo', 'image11.png', None),
  ('18-lounge', 'photo', 'image7.png', None),
  ('19-passage', 'photo', 'image12.png', None),
  ('20-stair', 'photo', 'image9.png', None),
  ('21-roof-slopes', 'photo', 'image13.png', None),
  ('22-sight-lines', 'board', 'image2.png', (0.672, 0.862, 0.985, 0.985)),  # 只有图版上有，从图版裁
  ('23-plan-render', 'photo', 'image4.png', None),
  ('24-board', 'board', 'image2.png', None),
]


def fit(im, kind):
    w, h = im.size
    if kind == 'photo':
        s = min(1, PHOTO_LONG / max(w, h))
    else:
        s = min(1, BOARD_LONG / max(w, h), math.sqrt(BOARD_PX / (w * h)))
    return im if s >= 1 else im.resize((round(w * s), round(h * s)), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith('.webp'):
        os.remove(os.path.join(OUT, f))
z = zipfile.ZipFile(PPT)
total = 0
for name, kind, media, box in ITEMS:
    im = Image.open(io.BytesIO(z.read('ppt/media/' + media)))
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    im = im.convert('RGB')
    if box:
        w, h = im.size
        im = im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))
    im = fit(im, kind)
    p = os.path.join(OUT, name + '.webp')
    im.save(p, 'WEBP', quality=80 if kind == 'photo' else 82, method=6)  # 重新编码，不带元数据
    total += os.path.getsize(p)
    print(name, im.size[0], im.size[1], os.path.getsize(p) // 1024, 'KB')
print('total', total // 1024, 'KB')
