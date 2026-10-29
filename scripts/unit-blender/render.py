"""渲染 build_scene.py 搭好的镜头（2026-10-29）。

    blender -b <unit.blend> --python scripts/unit-blender/render.py -- <scene 前缀> <out 目录> <engine> <pct> [帧号,… | all | a-b] [samples]

engine：WORKBENCH（几秒一张，查几何）/ EEVEE / CYCLES（成片）。pct = 分辨率百分比（相对 1920×1080）。
帧号给逗号分隔的列表出静帧；all / a-b 出 PNG 序列（之后用 ffmpeg 合成视频）。
"""

import bpy
import sys

argv = sys.argv[sys.argv.index('--') + 1:]
PREFIX, OUT, ENGINE, PCT = argv[0], argv[1], argv[2].upper(), int(argv[3])
FRAMES = argv[4] if len(argv) > 4 else '1'
SAMPLES = int(argv[5]) if len(argv) > 5 else 0
CAM = argv[6] if len(argv) > 6 and argv[6] != '-' else None      # 静帧机位的名字（省略 = 镜头自带的动画相机）
HIDE = argv[7].split(',') if len(argv) > 7 else []               # 按名字前缀隐藏（剖切用：天花板,天花方板）

sc = next(s for s in bpy.data.scenes if s.name.startswith(PREFIX))
bpy.context.window_manager.windows[0].scene = sc if bpy.context.window_manager.windows else None
sc.render.resolution_percentage = PCT
if CAM:
    sc.camera = bpy.data.objects[CAM]
for ob in sc.objects:
    if any(ob.name.startswith(h) for h in HIDE):
        ob.hide_render = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'

if ENGINE == 'WORKBENCH':
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_shadows = True
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sc.display.render_aa = '8'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
elif ENGINE == 'EEVEE':
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.eevee.taa_render_samples = SAMPLES or 32
    sc.eevee.use_shadows = True
    sc.eevee.use_raytracing = True
    sc.eevee.ray_tracing_options.resolution_scale = '2'
else:
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    if SAMPLES:
        sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.render.use_persistent_data = True


def render_frame(f, path):
    sc.frame_set(f)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)


if FRAMES == 'all' or '-' in FRAMES:
    a, b = (sc.frame_start, sc.frame_end) if FRAMES == 'all' else map(int, FRAMES.split('-'))
    sc.frame_start, sc.frame_end = a, b
    sc.render.filepath = f'{OUT}/f_'
    bpy.ops.render.render(animation=True, scene=sc.name)
else:
    for f in FRAMES.split(','):
        tag = f'_{CAM}' if CAM else ''
        render_frame(int(f), f'{OUT}/{PREFIX}{tag}_{ENGINE.lower()}_{int(f):04d}.png')
print('RENDER DONE')
