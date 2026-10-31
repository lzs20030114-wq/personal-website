# 绘画页素材（2026-10-30，作者在对话里分三批传来 24 张图：画作照片、数字绘画导出图、一张模型照片）
# → 网页尺寸 webp → public/other/drawings/。原图只读不写。
# 照片里拍进去的地板、桌面、画架、底下那张纸按像素框裁掉；画架上那幅有透视（上宽下窄），按四角拉正。
# 框是对着原图逐张量出来的（亮度剖面找纸边 / 画面边，再往里收几像素），不是自动识别。
# 用法：python -I scripts/other-works/build_drawings.py <原图目录> public/other/drawings
#      原图目录里的文件名就是对话上传时的名字（见 ITEMS 第二列）；作者换图时改这一列和框即可。
import sys, os
import numpy as np
from PIL import Image, ImageOps

SRC, OUT = sys.argv[1], sys.argv[2]
LONG = 2000                  # 长边上限（与 build_assets.py 的照片一档相同）

# (输出名, 原图文件名, 处理)
# 处理 = None | ('box', (x0, y0, x1, y1)) 像素框 | ('box', 框, [补纸区]) 先补后裁 | ('quad', (左上, 右上, 右下, 左下), (宽, 高)) 四角拉正
# 补纸区 = 原图坐标里一块只有空白纸的矩形：里面比纸色暗的东西（压在纸上的线缆和它的影子）按四周纸色补平，画一笔不碰
ITEMS = [
  # 封面：水彩，山下的村子与牦牛。纸放在桌上拍的，只留画面
  ('01-cover', '416cb310-image.jpg', ('box', (78, 125, 1962, 1405))),
  # 素描
  ('02-plaster-cast', '6af1e81e-image.jpg', ('box', (0, 0, 1600, 2084))),       # 底边一条暗影
  ('03-portrait', '28831e87-image.jpg', None),
  ('04-robe', 'b8068275-image.jpg', ('box', (70, 60, 1380, 1950), [(1040, 30, 1410, 240)])),  # 纸放在地上；右上角压着一根数据线
  ('05-seated', 'd76430e3-image.jpg', None),
  ('06-child', 'f75fda77-image.jpg', None),
  ('07-cat-asleep', '44cbac37-image.jpg', None),
  ('08-cap', 'd502121c-image.jpg', ('box', (0, 80, 1932, 2576))),               # 顶上露出上一张画的一角
  # 色彩
  ('09-roofs', '193e9c05-image.jpg', ('quad', ((60, 503), (1430, 503), (1383, 1816), (126, 1800)), (1310, 1300))),
  ('10-hillside', '8ff4700d-image.jpg', None),
  ('11-woods', '2802c9b8-image.jpg', None),
  ('12-bicycles', 'c5187f5b-image.jpg', ('box', (72, 132, 1925, 1425))),        # 油画棒，只留画面
  ('13-wall', 'ec73de96-image.jpg', ('box', (100, 128, 1885, 1462))),
  # 同一棵树
  ('14-tree-colour', 'c15da33d-image.jpg', ('box', (0, 0, 1778, 2576))),        # 右边一条纸边
  ('15-tree-ink', 'e3303168-image.jpg', None),
  # 线描
  ('16-counter', '2b3eb4a8-image.jpg', ('box', (55, 130, 1935, 1450))),         # 地砖与下面那张纸
  ('17-planters', 'e1f17fc3-image.jpg', ('box', (28, 30, 2010, 1455))),         # 桌面
  ('18-passage', 'd6f02625-image.jpg', ('box', (0, 45, 2576, 1932))),           # 顶上一块黑影
  ('19-cat-crocodile', 'e3882515-image.jpg', ('box', (0, 0, 1512, 1972))),      # 底边一条
  # 数字绘画
  ('20-two-people', '05fd57c4-image.png', ('box', (90, 220, 2590, 2012))),      # 截屏：去掉 Procreate 工具栏与主屏指示条
  ('21-laughing', '0e524323-image.jpg', None),
  ('22-armour', '955dba92-image.jpg', None),
  ('23-violet-eyes', 'e69b5133-image.jpg', None),
  ('25-pipes', '2.jpg', None),        # 2026-10-31 第四批：作者在对话里传的第 2、3 张（第 1 张是首页 About 肖像，不在本页）
  ('26-your-turn', '3.jpg', None),
  # 模型
  ('24-model', '5abaa187-image.jpg', None),
]


def quad_coeffs(src_pts, w, h):
    """PIL 透视变换系数：输出 (x, y) → 原图 (x', y')。"""
    dst = [(0, 0), (w, 0), (w, h), (0, h)]
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src_pts):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def clean(im, rects):
    """空白纸上的杂物补平：比纸色暗 14 以上的像素连同外扩 6 px 当作缺口，用四邻平均反复迭代（调和填充）补上。"""
    a = np.asarray(im).astype(float)
    for x0, y0, x1, y1 in rects:
        sub = a[y0:y1, x0:x1]
        g = sub.mean(axis=2)
        paper = np.percentile(g, 75)
        m = g < paper - 14
        for _ in range(6):   # 外扩，连影子的软边一起补
            m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
        m[0, :] = m[-1, :] = False
        m[:, 0] = m[:, -1] = False
        fill = sub.copy()
        fill[m] = sub[~m].mean(axis=0)
        for _ in range(1500):
            avg = (np.roll(fill, 1, 0) + np.roll(fill, -1, 0) + np.roll(fill, 1, 1) + np.roll(fill, -1, 1)) / 4
            fill[m] = avg[m]
        a[y0:y1, x0:x1] = fill
    return Image.fromarray(np.clip(a.round(), 0, 255).astype(np.uint8))


def load(name, op):
    im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, name)))
    if im.mode in ('RGBA', 'LA', 'P', 'PA'):
        rgba = im.convert('RGBA')
        im = Image.new('RGB', rgba.size, (255, 255, 255))
        im.paste(rgba, mask=rgba.split()[3])
    im = im.convert('RGB')
    if op is None:
        return im
    if op[0] == 'box':
        if len(op) > 2:
            im = clean(im, op[2])
        return im.crop(op[1])
    if op[0] == 'quad':
        (w, h) = op[2]
        return im.transform((w, h), Image.PERSPECTIVE, quad_coeffs(op[1], w, h), Image.BICUBIC)
    raise ValueError(op)


os.makedirs(OUT, exist_ok=True)
total = 0
names = set()
for out, name, op in ITEMS:
    im = load(name, op)
    s = min(1.0, LONG / max(im.size))
    if s < 1.0:
        im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
    dst = os.path.join(OUT, out + '.webp')
    # 不传 exif ⇒ 拍摄时间、机型与可能的定位一并去掉
    im.save(dst, 'WEBP', quality=82, method=6)
    size = os.path.getsize(dst)
    total += size
    names.add(out + '.webp')
    print(f'{out}.webp\t{im.size[0]}x{im.size[1]}\t{size // 1024}KB')

for f in os.listdir(OUT):
    if f.endswith('.webp') and f not in names:
        os.remove(os.path.join(OUT, f))
        print(f'removed {f}')
print(f'total {len(ITEMS)} files, {total // 1024} KB')
