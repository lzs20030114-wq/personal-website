# 其他作品素材：从作者电脑上的原位文件读取 → 网页尺寸 webp → public/other/<slug>/。
# 原文件（含压缩包）只读不写；压缩包内的文件在内存里读，不解压落盘。
# 选图依据 = 作品集旧作_整合清单_2026-10-25.md 每项的「主图 / 其余推荐图」；站上去向见 其他作品_素材整理.md。
# 用法：python -I scripts/other-works/build_assets.py public/other
import sys, os, io, zipfile, math
sys.stdout.reconfigure(encoding='utf-8')
import fitz
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = None

OUT = sys.argv[1]
D = 'D:/桌面/'
W = 'C:/Users/35827/Documents/xwechat_files/wxid_ywudjhwah91622_18c3/msg/file/'
HK = D + '霍普杯/202510霍普杯/\u201c霍普杯 排版标注\u201d文件夹/\u201c霍普杯 排版标注\u201d文件夹/'
DFOF = W + '2025-12/综合设计2 李梓硕.zip'
HOUSE = W + '2025-10/李梓硕2021011394).zip'
PHOTO_LONG = 2000            # 渲染图 / 照片：长边上限
BOARD_PX = 6_500_000         # 图版 / 图纸：总像素上限（窄长图版按面积缩，不按长边，免得字糊）
BOARD_LONG = 5000

# (slug, 文件名, 类别, 来源)
# 来源 = ('img', 路径) | ('pdf', 路径, 页) | ('crop', 路径, 页, y0, y1)
#      | ('zipimg', 压缩包, 包内名) | ('zippdf', 压缩包, 包内名, 页) | ('zippptx', 压缩包, 包内 pptx, pptx 内媒体)
ITEMS = [
  ('floating-terrain', '01-cover', 'photo', ('img', D+'临时作品集/场景 5.png')),
  ('floating-terrain', '02-final-board', 'board', ('img', D+'申请/项目pdf/毕设图版(2) (1).jpg')),
  ('floating-terrain', '03-form-generation', 'board', ('img', D+'临时作品集/图片(3).png')),
  ('floating-terrain', '04-axonometric', 'board', ('img', D+'临时作品集/图片(2).png')),
  ('floating-terrain', '05-scene-aerial', 'photo', ('img', D+'临时作品集/场景 2.png')),
  ('floating-terrain', '06-scene-ground', 'photo', ('img', D+'临时作品集/场景 4.png')),
  ('floating-terrain', '07-model-overall', 'photo', ('img', D+'临时作品集/毕设照片/毕设照片/IMG_5117.JPG')),
  ('floating-terrain', '08-model-roof', 'photo', ('img', D+'临时作品集/毕设照片/毕设照片/IMG_5183.JPG')),
  ('floating-terrain', '09-zoning', 'board', ('pdf', D+'申请/项目pdf/毕业答辩.pdf', 12)),
  ('floating-terrain', '10-section', 'board', ('pdf', D+'临时作品集/毕设施工图/剖1.pdf', 1)),

  ('hongkong-facade', '01-cover', 'photo', ('img', HK+'Links/首图.png')),
  ('hongkong-facade', '02-board-strategy', 'board', ('pdf', HK+'霍普杯 排版标注.pdf', 2)),
  ('hongkong-facade', '03-board-structure', 'board', ('pdf', HK+'霍普杯 排版标注.pdf', 3)),
  ('hongkong-facade', '04-aerial', 'photo', ('img', HK+'Links/鸟瞰.png')),
  ('hongkong-facade', '05-section', 'board', ('img', HK+'Links/剖面.png')),
  ('hongkong-facade', '06-elevation', 'board', ('img', HK+'Links/立面.png')),
  ('hongkong-facade', '07-scene-day', 'photo', ('img', HK+'Links/场景 14.png')),

  ('the-patrick', '01-cover', 'board', ('img', D+'临时作品集/专五 图片/李梓硕 The Patrick _页面_09_图像_0001.jpg')),
  ('the-patrick', '02-concept', 'board', ('img', D+'临时作品集/李梓硕 The Patrick/李梓硕 The Patrick 3.png')),
  ('the-patrick', '03-plans-sections', 'board', ('pdf', D+'临时作品集/李梓硕 The Patrick .pdf', 5)),
  ('the-patrick', '04-materials', 'board', ('pdf', D+'临时作品集/李梓硕 The Patrick .pdf', 7)),
  ('the-patrick', '05-view-sofa', 'board', ('pdf', D+'临时作品集/李梓硕 The Patrick .pdf', 10)),
  ('the-patrick', '06-view-window', 'board', ('pdf', D+'临时作品集/李梓硕 The Patrick .pdf', 11)),

  ('under-cane', '01-cover', 'photo', ('img', D+'临时作品集/6.26 倪子皓 李梓硕 专六最终成果/图片/图片(4).png')),
  ('under-cane', '02-path', 'photo', ('img', D+'临时作品集/6.26 倪子皓 李梓硕 专六最终成果/图片/图片(6).png')),
  ('under-cane', '03-bridge', 'photo', ('img', D+'临时作品集/6.26 倪子皓 李梓硕 专六最终成果/图片/桥7.png')),
  ('under-cane', '04-dusk', 'photo', ('img', D+'临时作品集/6.26 倪子皓 李梓硕 专六最终成果/图片/场景5.png')),
  ('under-cane', '05-board-1', 'board', ('img', D+'临时作品集/6.26 倪子皓 李梓硕 专六最终成果/展板/专业设计6_页面_1.jpg')),
  ('under-cane', '06-board-2', 'board', ('img', D+'临时作品集/6.26 倪子皓 李梓硕 专六最终成果/展板/专业设计6_页面_2.jpg')),

  ('new-wave-film-club', '01-board', 'board', ('img', W+'2023-06/专业设计二.png')),

  ('design-for-our-future', '01-board', 'board', ('zipimg', DFOF, '综合设计2 李梓硕/综2总图.png')),
  ('design-for-our-future', '02-model', 'photo', ('zipimg', DFOF, '综合设计2 李梓硕/1.jpg')),

  ('b365-office', '01-section-materials', 'board', ('pdf', D+'临时作品集/设计表达2/设计表达2/李梓硕 设计表达（2）.pdf', 13)),
  ('b365-office', '02-plan-1f', 'board', ('pdf', D+'临时作品集/设计表达2/设计表达2/李梓硕 设计表达（2）.pdf', 5)),
  ('b365-office', '03-plan-2f', 'board', ('pdf', D+'临时作品集/设计表达2/设计表达2/李梓硕 设计表达（2）.pdf', 6)),
  ('b365-office', '04-stair-details', 'board', ('pdf', D+'临时作品集/设计表达2/设计表达2/李梓硕 设计表达（2）.pdf', 18)),
  ('b365-office', '05-wall-details', 'board', ('pdf', D+'临时作品集/设计表达2/设计表达2/李梓硕 设计表达（2）.pdf', 19)),

  ('family-house', '01-plan', 'board', ('zippdf', HOUSE, '1.平面布置图.pdf', 1)),
  ('family-house', '02-sketch-relations', 'photo', ('zippptx', HOUSE, '李梓硕 2021011394.pptx', 'ppt/media/image1.jpeg')),
  ('family-house', '03-details', 'board', ('zippdf', HOUSE, '5.节点图.pdf', 1)),
  ('family-house', '04-axonometric', 'board', ('zippdf', HOUSE, '6.轴测图.pdf', 1)),

  ('co-evolving-kitchen', '01-cover', 'photo', ('crop', D+'李梓硕 作品集/人因交互厨房/图版.pdf', 1, 0.705, 1.0)),
  ('co-evolving-kitchen', '02-workflow', 'board', ('crop', D+'李梓硕 作品集/人因交互厨房/图版.pdf', 1, 0.195, 0.300)),
  ('co-evolving-kitchen', '03-board', 'board', ('pdf', D+'李梓硕 作品集/人因交互厨房/图版.pdf', 1)),
  ('co-evolving-kitchen', '04-system-map', 'board', ('img', D+'李梓硕 作品集/人因交互厨房/思维导图.png')),

  ('bamboo-installation', '01-cover', 'photo', ('img', D+'临时作品集/IMG_1134.jpeg')),
  ('bamboo-installation', '02-weave', 'photo', ('img', D+'临时作品集/IMG_1022.jpeg')),
  ('bamboo-installation', '03-site', 'photo', ('img', D+'临时作品集/IMG_1035.jpeg')),

  ('shape-of-sound', '01-cover', 'board', ('img', D+'临时作品集/声形/声形_页面_4.jpg')),
  ('shape-of-sound', '02-form', 'board', ('img', D+'临时作品集/声形/声形_页面_3.jpg')),
  ('shape-of-sound', '03-concept', 'board', ('img', D+'临时作品集/声形/声形_页面_2.jpg')),
]


def zip_read(zpath, name):
    """按解码后的包内名取文件；这两个微信压缩包的文件名是 GBK 编码、没打 UTF-8 标记。"""
    z = zipfile.ZipFile(zpath)
    for i in z.infolist():
        n = i.filename
        if not (i.flag_bits & 0x800):
            try:
                n = n.encode('cp437').decode('gbk')
            except Exception:
                pass
        if n == name:
            return z.read(i)
    raise FileNotFoundError(f'{zpath} :: {name}')


def flatten(im):
    im = ImageOps.exif_transpose(im)
    if im.mode in ('RGBA', 'LA', 'P', 'PA'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert('RGB')


def render_page(doc, page, kind, y0=0.0, y1=1.0):
    pg = doc[page - 1]
    r = pg.rect
    clip = fitz.Rect(r.x0, r.y0 + r.height * y0, r.x1, r.y0 + r.height * y1)
    w, h = clip.width, clip.height
    if kind == 'board':
        zoom = min(math.sqrt(BOARD_PX / (w * h)), BOARD_LONG / max(w, h))
    else:
        zoom = PHOTO_LONG / max(w, h)
    pix = pg.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def fit(im, kind):
    w, h = im.size
    if kind == 'board':
        s = min(1.0, math.sqrt(BOARD_PX / (w * h)), BOARD_LONG / max(w, h))
    else:
        s = min(1.0, PHOTO_LONG / max(w, h))
    return im if s >= 1.0 else im.resize((round(w * s), round(h * s)), Image.LANCZOS)


def load(src, kind):
    k = src[0]
    if k == 'img':
        return flatten(Image.open(src[1]))
    if k == 'pdf':
        return render_page(fitz.open(src[1]), src[2], kind)
    if k == 'crop':
        return render_page(fitz.open(src[1]), src[2], kind, src[3], src[4])
    if k == 'zipimg':
        return flatten(Image.open(io.BytesIO(zip_read(src[1], src[2]))))
    if k == 'zippdf':
        return render_page(fitz.open(stream=zip_read(src[1], src[2]), filetype='pdf'), src[3], kind)
    if k == 'zippptx':
        pptx = zipfile.ZipFile(io.BytesIO(zip_read(src[1], src[2])))
        return flatten(Image.open(io.BytesIO(pptx.read(src[3]))))
    raise ValueError(k)


total = 0
for slug, name, kind, src in ITEMS:
    im = fit(load(src, kind), kind)
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    dst = os.path.join(OUT, slug, name + '.webp')
    # 不传 exif ⇒ 拍摄信息与可能的定位一并去掉
    im.save(dst, 'WEBP', quality=82 if kind == 'board' else 80, method=6)
    size = os.path.getsize(dst)
    total += size
    print(f'{slug}/{name}.webp\t{im.size[0]}x{im.size[1]}\t{size // 1024}KB')
print(f'total {len(ITEMS)} files, {total // 1024} KB')
