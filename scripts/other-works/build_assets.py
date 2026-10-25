# 其他作品素材：从作者电脑上的原位文件读取 → 网页尺寸 webp → public/other/<slug>/。
# 原文件（含压缩包）只读不写；压缩包内的文件在内存里读，不解压落盘。
# 选图原则（2026-10-25 第二版，用户「去研究真正的正文……把重要的渲染图拿出来，而不是全都在最终图版里截图」）：
# 优先用单独存档的渲染图、照片、PDF 内嵌原图、PPT 素材；只有本机没有单独存档的（The Patrick、新浪潮、
# Design for our future、聲型），才从图版 / 页面图像里裁出单张效果图。逐张去向见 其他作品_素材整理.md。
# 用法：python -I scripts/other-works/build_assets.py public/other
#      （输出目录里本脚本没有生成的旧 webp 会被删掉，只限 ITEMS 里出现过的作品目录）
import sys, os, io, zipfile, math
sys.stdout.reconfigure(encoding='utf-8')
import fitz
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = None

OUT = sys.argv[1]
D = 'D:/桌面/'
W = 'C:/Users/35827/Documents/xwechat_files/wxid_ywudjhwah91622_18c3/msg/file/'
TMP = D + '临时作品集/'
THESIS = D + '申请/项目pdf/毕业论文(1).pdf'
HK = D + '霍普杯/202510霍普杯/\u201c霍普杯 排版标注\u201d文件夹/\u201c霍普杯 排版标注\u201d文件夹/'
HKR = D + '霍普杯/202510霍普杯/霍普渲染图/'
PAT = TMP + '专五 图片/李梓硕 The Patrick _页面_'
CANE = TMP + '6.26 倪子皓 李梓硕 专六最终成果/'
WAVE1 = W + '2023-06/专业设计二.png'
WAVE2 = W + '2023-06/专二(3).png'
DFOF = W + '2025-12/综合设计2 李梓硕.zip'
DFOF_BOARD = '综合设计2 李梓硕/综2总图.png'
HOUSE = W + '2025-10/李梓硕2021011394).zip'
HOUSE_PPT = '李梓硕 2021011394.pptx'
B365 = TMP + '设计表达2/设计表达2/李梓硕 设计表达（2）.pdf'
KIT = D + '李梓硕 作品集/人因交互厨房/'
KPAPER = D + '2025DF智慧厨房会议论文/图片/'
SOUND = TMP + '声形/声形_页面_'
PHOTO_LONG = 2000            # 渲染图 / 照片：长边上限
BOARD_PX = 6_500_000         # 图版 / 图纸：总像素上限（窄长图版按面积缩，不按长边，免得字糊）
BOARD_LONG = 5000


def pat(page, box=None):
    p = f'{PAT}{page:02d}_图像_0001.jpg'
    return ('imgcrop', p, box) if box else ('img', p)


# (slug, 文件名, 类别, 来源)
# 来源 = ('img', 路径) | ('imgcrop', 路径, (x0, y0, x1, y1) 比例) | ('pdf', 路径, 页) | ('crop', 路径, 页, y0, y1)
#      | ('imgdark', 路径)（透明底浅色线稿，垫深色底）| ('pdfimg', 路径, 页, xref)（PDF 内嵌原图） | ('zipimg', 压缩包, 包内名) | ('zipimgcrop', 压缩包, 包内名, 框)
#      | ('zippdf', 压缩包, 包内名, 页) | ('zippptx', 压缩包, 包内 pptx, pptx 内媒体)
ITEMS = [
  # ── 浮山界中：论文第 4 章的作者自摄 / 自绘图 + 高分辨率渲染 + 实体模型照片 + 施工图
  ('floating-terrain', '01-cover', 'photo', ('img', TMP+'场景 5.png')),
  ('floating-terrain', '02-site-axis', 'photo', ('pdfimg', THESIS, 31, 349)),
  ('floating-terrain', '03-site-traffic', 'photo', ('pdfimg', THESIS, 32, 357)),
  ('floating-terrain', '04-site-underpass', 'photo', ('pdfimg', THESIS, 32, 358)),
  ('floating-terrain', '05-site-people', 'photo', ('pdfimg', THESIS, 33, 361)),
  ('floating-terrain', '06-mountain-to-structure', 'board', ('pdfimg', THESIS, 41, 399)),
  ('floating-terrain', '07-elevated', 'board', ('pdfimg', THESIS, 40, 395)),
  ('floating-terrain', '08-form-generation', 'board', ('img', TMP+'图片(3).png')),
  ('floating-terrain', '09-axonometric', 'board', ('img', TMP+'图片(2).png')),
  ('floating-terrain', '10-zoning', 'board', ('pdfimg', THESIS, 44, 411)),
  ('floating-terrain', '11-scene-aerial', 'photo', ('img', TMP+'场景 2.png')),
  ('floating-terrain', '12-scene-ground', 'photo', ('img', TMP+'场景 4.png')),
  ('floating-terrain', '13-scene-3', 'photo', ('img', TMP+'场景 3.png')),
  ('floating-terrain', '14-scene-6', 'photo', ('img', TMP+'场景 6.png')),
  ('floating-terrain', '15-model-gate', 'photo', ('img', TMP+'毕设照片/毕设照片/IMG_5093.JPG')),
  ('floating-terrain', '16-model-overall', 'photo', ('img', TMP+'毕设照片/毕设照片/IMG_5117.JPG')),
  ('floating-terrain', '17-model-walkway', 'photo', ('img', TMP+'毕设照片/毕设照片/IMG_5106.JPG')),
  ('floating-terrain', '18-model-roof', 'photo', ('img', TMP+'毕设照片/毕设照片/IMG_5183.JPG')),
  ('floating-terrain', '19-model-gate-roof', 'photo', ('img', TMP+'毕设照片/毕设照片/IMG_5192.JPG')),
  ('floating-terrain', '20-section', 'board', ('pdf', TMP+'毕设施工图/剖1.pdf', 1)),
  ('floating-terrain', '21-final-board', 'board', ('img', D+'申请/项目pdf/毕设图版(2) (1).jpg')),

  # ── 霍普杯：渲染文件夹里的单张场景图 + 排版用的分析图原件
  ('hongkong-facade', '01-cover', 'photo', ('img', HK+'Links/首图.png')),
  ('hongkong-facade', '02-aerial', 'photo', ('img', HK+'Links/鸟瞰.png')),
  ('hongkong-facade', '03-site-plan', 'board', ('img', HK+'Links/2.png')),
  ('hongkong-facade', '04-elevation', 'board', ('img', HK+'Links/立面.png')),
  ('hongkong-facade', '05-section', 'board', ('img', HK+'Links/剖面.png')),
  ('hongkong-facade', '06-module', 'board', ('img', HK+'Links/methodology5.1.png')),
  ('hongkong-facade', '07-scene-up', 'photo', ('img', HKR+'渲染图/图片.png')),
  ('hongkong-facade', '08-scene-planting', 'photo', ('img', HKR+'渲染图/场景 14.png')),
  ('hongkong-facade', '09-scene-box', 'photo', ('img', HKR+'渲染图/场景 15.png')),
  ('hongkong-facade', '10-scene-bridges', 'photo', ('img', HKR+'场景 10.png')),
  ('hongkong-facade', '11-scene-tall', 'photo', ('img', HKR+'渲染图/场景 17.png')),
  ('hongkong-facade', '12-board-strategy', 'board', ('pdf', HK+'霍普杯 排版标注.pdf', 2)),
  ('hongkong-facade', '13-board-structure', 'board', ('pdf', HK+'霍普杯 排版标注.pdf', 3)),

  # ── The Patrick：每页是一整张图，效果图从页面左侧裁出（不带旁边的小图与平面）
  ('the-patrick', '01-cover', 'photo', pat(9, (0.034, 0.085, 0.455, 0.94))),
  ('the-patrick', '02-concept', 'board', ('img', TMP+'李梓硕 The Patrick/李梓硕 The Patrick 3.png')),
  ('the-patrick', '03-plans-sections', 'board', ('pdf', TMP+'李梓硕 The Patrick .pdf', 5)),
  ('the-patrick', '04-ceiling', 'board', ('pdf', TMP+'李梓硕 The Patrick .pdf', 6)),
  ('the-patrick', '05-materials', 'board', ('pdf', TMP+'李梓硕 The Patrick .pdf', 7)),
  ('the-patrick', '06-furniture', 'board', ('pdf', TMP+'李梓硕 The Patrick .pdf', 8)),
  ('the-patrick', '07-view-lounge', 'photo', pat(10, (0.034, 0.085, 0.455, 0.94))),
  ('the-patrick', '08-view-desk', 'photo', pat(11, (0.034, 0.085, 0.455, 0.94))),
  ('the-patrick', '09-view-dining', 'photo', pat(12, (0.034, 0.085, 0.455, 0.94))),
  ('the-patrick', '10-view-lounger', 'photo', pat(13, (0.034, 0.085, 0.455, 0.94))),

  # ── UNDER-CANE：图片文件夹里的渲染 + 区位图 + 一张梯田等高线线稿
  ('under-cane', '01-cover', 'photo', ('img', CANE+'图片/图片(4).png')),
  ('under-cane', '02-map', 'board', ('img', CANE+'图片/map-01.png')),
  ('under-cane', '03-site-model', 'photo', ('img', CANE+'图片/图片(1).png')),
  ('under-cane', '04-terraces', 'board', ('imgdark', CANE+'图片/ViewCapture20240626_064630.png')),  # 透明底白线，垫深色底
  ('under-cane', '05-hillside', 'photo', ('img', CANE+'图片/图片(5).png')),
  ('under-cane', '06-path', 'photo', ('img', CANE+'图片/图片(6).png')),
  ('under-cane', '07-frames', 'photo', ('img', CANE+'图片/图片(7).png')),
  ('under-cane', '08-entrance', 'photo', ('img', CANE+'图片/图片.png')),
  ('under-cane', '09-bridge', 'photo', ('img', CANE+'图片/桥7.png')),
  ('under-cane', '10-pool', 'photo', ('img', CANE+'图片/图片(2).png')),
  ('under-cane', '11-dusk', 'photo', ('img', CANE+'图片/场景5.png')),
  ('under-cane', '12-dusk-rooms', 'photo', ('img', CANE+'图片/场景 6.png')),
  ('under-cane', '13-board-1', 'board', ('img', CANE+'展板/专业设计6_页面_1.jpg')),
  ('under-cane', '14-board-2', 'board', ('img', CANE+'展板/专业设计6_页面_2.jpg')),

  # ── 新浪潮：本机只有两版图版，效果图与分析图从图版裁出
  ('new-wave-film-club', '01-cover', 'photo', ('imgcrop', WAVE2, (0.333, 0.668, 1.0, 0.772))),
  ('new-wave-film-club', '02-render-stairs', 'photo', ('imgcrop', WAVE1, (0.333, 0.655, 0.826, 0.892))),
  ('new-wave-film-club', '03-render-corner', 'photo', ('imgcrop', WAVE1, (0.828, 0.655, 1.0, 0.764))),
  ('new-wave-film-club', '04-render-tables', 'photo', ('imgcrop', WAVE1, (0.333, 0.895, 1.0, 0.994))),
  ('new-wave-film-club', '05-render-floor', 'photo', ('imgcrop', WAVE2, (0.333, 0.775, 1.0, 0.89))),
  ('new-wave-film-club', '06-axonometric', 'board', ('imgcrop', WAVE2, (0.236, 0.511, 0.997, 0.6425))),
  ('new-wave-film-club', '07-plans', 'board', ('imgcrop', WAVE2, (0.5, 0.425, 1.0, 0.508))),
  ('new-wave-film-club', '08-sections', 'board', ('imgcrop', WAVE1, (0.0, 0.512, 1.0, 0.64))),
  ('new-wave-film-club', '09-board', 'board', ('img', WAVE1)),

  # ── Design for our future：模型照片在压缩包里；效果图与分析图从图版裁出
  ('design-for-our-future', '01-cover', 'photo', ('zipimgcrop', DFOF, DFOF_BOARD, (0.274, 0.849, 0.985, 0.995))),
  ('design-for-our-future', '02-scenario', 'board', ('zipimgcrop', DFOF, DFOF_BOARD, (0.21, 0.025, 0.69, 0.195))),
  ('design-for-our-future', '03-plans', 'board', ('zipimgcrop', DFOF, DFOF_BOARD, (0.0, 0.195, 0.56, 0.42))),
  ('design-for-our-future', '04-exploded', 'board', ('zipimgcrop', DFOF, DFOF_BOARD, (0.58, 0.262, 1.0, 0.595))),
  ('design-for-our-future', '05-materials', 'board', ('zipimgcrop', DFOF, DFOF_BOARD, (0.0, 0.42, 0.54, 0.6))),
  ('design-for-our-future', '06-furniture', 'board', ('zipimgcrop', DFOF, DFOF_BOARD, (0.0, 0.605, 1.0, 0.69))),
  ('design-for-our-future', '07-render-kitchen', 'photo', ('zipimgcrop', DFOF, DFOF_BOARD, (0.0, 0.693, 0.48, 0.772))),
  ('design-for-our-future', '08-render-dining', 'photo', ('zipimgcrop', DFOF, DFOF_BOARD, (0.495, 0.693, 0.985, 0.772))),
  ('design-for-our-future', '09-render-study', 'photo', ('zipimgcrop', DFOF, DFOF_BOARD, (0.69, 0.177, 1.0, 0.243))),
  ('design-for-our-future', '10-model-front', 'photo', ('zipimg', DFOF, '综合设计2 李梓硕/1.jpg')),
  ('design-for-our-future', '11-model-top', 'photo', ('zipimg', DFOF, '综合设计2 李梓硕/顶视图.jpg')),
  ('design-for-our-future', '12-model-side', 'photo', ('zipimg', DFOF, '综合设计2 李梓硕/4.jpg')),
  ('design-for-our-future', '13-board', 'board', ('zipimg', DFOF, DFOF_BOARD)),

  # ── B365：施工图逐页
  ('b365-office', '01-section-materials', 'board', ('pdf', B365, 13)),
  ('b365-office', '02-plan-1f', 'board', ('pdf', B365, 5)),
  ('b365-office', '03-plan-2f', 'board', ('pdf', B365, 6)),
  ('b365-office', '04-stair-details', 'board', ('pdf', B365, 18)),
  ('b365-office', '05-wall-details', 'board', ('pdf', B365, 19)),

  # ── 五人家庭住宅：PPT 里的两张手绘 + 压缩包里的整套图纸
  ('family-house', '01-plan', 'board', ('zippdf', HOUSE, '1.平面布置图.pdf', 1)),
  ('family-house', '02-sketch-relations', 'photo', ('zippptx', HOUSE, HOUSE_PPT, 'ppt/media/image1.jpeg')),
  ('family-house', '03-sketch-layout', 'photo', ('zippptx', HOUSE, HOUSE_PPT, 'ppt/media/image2.png')),
  ('family-house', '04-elevations', 'board', ('zippdf', HOUSE, '2.立面图.pdf', 1)),
  ('family-house', '05-sections', 'board', ('zippdf', HOUSE, '3.剖面图.pdf', 1)),
  ('family-house', '06-details', 'board', ('zippdf', HOUSE, '5.节点图.pdf', 1)),
  ('family-house', '07-axonometric', 'board', ('zippdf', HOUSE, '6.轴测图.pdf', 1)),

  # ── Co-Evolving Kitchen：会议论文的原图 + 工作营图版
  ('co-evolving-kitchen', '01-cover', 'photo', ('crop', KIT+'图版.pdf', 1, 0.705, 1.0)),
  ('co-evolving-kitchen', '02-workflow', 'board', ('crop', KIT+'图版.pdf', 1, 0.195, 0.300)),
  ('co-evolving-kitchen', '03-system-map', 'board', ('img', KIT+'思维导图.png')),
  ('co-evolving-kitchen', '04-actions', 'board', ('img', KPAPER+'图3.jpg')),
  ('co-evolving-kitchen', '05-keypoints', 'board', ('img', KPAPER+'图2.jpg')),
  ('co-evolving-kitchen', '06-postures', 'board', ('img', KPAPER+'图4.jpg')),
  ('co-evolving-kitchen', '07-clustering', 'board', ('img', KPAPER+'图5.jpg')),
  ('co-evolving-kitchen', '08-lstm', 'board', ('img', KPAPER+'图6.jpg')),
  ('co-evolving-kitchen', '09-prototype', 'board', ('img', KPAPER+'图8.jpg')),
  ('co-evolving-kitchen', '10-rotation-1', 'photo', ('img', KPAPER+'图9-1.jpg')),
  ('co-evolving-kitchen', '11-rotation-2', 'photo', ('img', KPAPER+'图9-2.jpg')),
  ('co-evolving-kitchen', '12-rotation-3', 'photo', ('img', KPAPER+'图9-3.jpg')),
  ('co-evolving-kitchen', '13-board', 'board', ('pdf', KIT+'图版.pdf', 1)),

  # ── 竹编装置：现场照片
  ('bamboo-installation', '01-cover', 'photo', ('img', TMP+'IMG_1134.jpeg')),
  ('bamboo-installation', '02-weave', 'photo', ('img', TMP+'IMG_1022.jpeg')),
  ('bamboo-installation', '03-site', 'photo', ('img', TMP+'IMG_1035.jpeg')),
  ('bamboo-installation', '04-dusk', 'photo', ('img', TMP+'IMG_1105.jpeg')),

  # ── 聲型：第 4 页的四张效果图分开裁；第 2、3 页整页
  ('shape-of-sound', '01-cover', 'photo', ('imgcrop', SOUND+'4.jpg', (0.575, 0.0, 1.0, 0.335))),
  ('shape-of-sound', '02-render-corridor', 'photo', ('imgcrop', SOUND+'4.jpg', (0.0, 0.055, 0.575, 0.4))),
  ('shape-of-sound', '03-render-close', 'photo', ('imgcrop', SOUND+'4.jpg', (0.0, 0.51, 0.62, 1.0))),
  ('shape-of-sound', '04-render-wall', 'photo', ('imgcrop', SOUND+'4.jpg', (0.62, 0.555, 1.0, 0.915))),
  ('shape-of-sound', '05-form', 'board', ('img', SOUND+'3.jpg')),
  ('shape-of-sound', '06-concept', 'board', ('img', SOUND+'2.jpg')),
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


def flatten(im, bg_color=(255, 255, 255)):
    im = ImageOps.exif_transpose(im)
    if im.mode in ('RGBA', 'LA', 'P', 'PA'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, bg_color)
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert('RGB')


def crop_frac(im, box):
    w, h = im.size
    return im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))


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
    if k == 'imgdark':
        return flatten(Image.open(src[1]), (20, 29, 34))
    if k == 'imgcrop':
        return flatten(crop_frac(Image.open(src[1]), src[2]))
    if k == 'pdf':
        return render_page(fitz.open(src[1]), src[2], kind)
    if k == 'crop':
        return render_page(fitz.open(src[1]), src[2], kind, src[3], src[4])
    if k == 'pdfimg':
        doc = fitz.open(src[1])
        xrefs = [x[0] for x in doc[src[2] - 1].get_images(full=True)]
        assert src[3] in xrefs, f'{src[1]} 第 {src[2]} 页没有 xref {src[3]}'
        return flatten(Image.open(io.BytesIO(doc.extract_image(src[3])['image'])))
    if k == 'zipimg':
        return flatten(Image.open(io.BytesIO(zip_read(src[1], src[2]))))
    if k == 'zipimgcrop':
        return flatten(crop_frac(Image.open(io.BytesIO(zip_read(src[1], src[2]))), src[3]))
    if k == 'zippdf':
        return render_page(fitz.open(stream=zip_read(src[1], src[2]), filetype='pdf'), src[3], kind)
    if k == 'zippptx':
        pptx = zipfile.ZipFile(io.BytesIO(zip_read(src[1], src[2])))
        return flatten(Image.open(io.BytesIO(pptx.read(src[3]))))
    raise ValueError(k)


total = 0
made = {}
for slug, name, kind, src in ITEMS:
    im = fit(load(src, kind), kind)
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    dst = os.path.join(OUT, slug, name + '.webp')
    # 不传 exif ⇒ 拍摄信息与可能的定位一并去掉
    im.save(dst, 'WEBP', quality=82 if kind == 'board' else 80, method=6)
    size = os.path.getsize(dst)
    total += size
    made.setdefault(slug, set()).add(name + '.webp')
    print(f'{slug}/{name}.webp\t{im.size[0]}x{im.size[1]}\t{size // 1024}KB')

# 清掉上一版留下、这一版不再生成的图（只动 ITEMS 里出现过的作品目录）
for slug, names in made.items():
    for f in os.listdir(os.path.join(OUT, slug)):
        if f.endswith('.webp') and f not in names:
            os.remove(os.path.join(OUT, slug, f))
            print(f'removed {slug}/{f}')
print(f'total {len(ITEMS)} files, {total // 1024} KB')
