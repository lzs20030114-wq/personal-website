"""木板切割文件另出一份 DWG（AutoCAD 2000，单位 mm），用 ODA File Converter 从 DXF 转。

python3 scripts/skin-ring6/dwg.py <输出目录> [ODA File Converter 可执行文件]

ODA File Converter 是 Open Design Alliance 的免费转换器，不随仓库装。可执行文件按参数、
环境变量 ODA_CONVERTER、PATH 上的 ODAFileConverter 依次找。没有显示器时用 xvfb-run 跑。

转之前给 DXF 的一份副本补上 $MEASUREMENT = 1（公制）、$INSUNITS = 4（mm）：仓库里的
DXF 是 R12，没有这两个变量，转出来的 DWG 会是「无单位 + 英制」，有的激光软件导入时
会按英寸放大 25.4 倍。仓库里的 DXF 本身不改。

转完再把 DWG 转回 R12 DXF，逐个图元和原 DXF 比：图层、颜色、闭合、顶点（三位小数）
全部一致，单位是 mm，才写出 DWG。build.py 改了几何以后要重跑这一步。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter

NAME = "wood_880x450"
UNITS = "9\r\n$MEASUREMENT\r\n70\r\n1\r\n9\r\n$INSUNITS\r\n70\r\n4\r\n"
ACADVER = "$ACADVER\r\n1\r\nAC1009\r\n"


def find_converter(arg: str | None) -> str:
    for c in (arg, os.environ.get("ODA_CONVERTER"), shutil.which("ODAFileConverter")):
        if c and os.path.isfile(c):
            return c
    sys.exit("找不到 ODA File Converter：把可执行文件路径作为第二个参数传进来，或设 ODA_CONVERTER")


def convert(exe: str, src_dir: str, dst_dir: str, version: str, kind: str, pattern: str):
    """ODAFileConverter <输入目录> <输出目录> <版本> <DWG|DXF> <递归> <校验> <文件名过滤>"""
    cmd = [exe, src_dir, dst_dir, version, kind, "0", "1", pattern]
    if not os.environ.get("DISPLAY") and shutil.which("xvfb-run"):
        cmd = ["xvfb-run", "-a"] + cmd
    env = dict(os.environ, LANG="C.UTF-8")
    root = os.path.dirname(os.path.dirname(os.path.abspath(exe)))       # AppImage 解开后的 usr/
    if os.path.isdir(os.path.join(root, "lib")):
        env["LD_LIBRARY_PATH"] = os.path.join(root, "lib") + ":" + env.get("LD_LIBRARY_PATH", "")
        env["QT_PLUGIN_PATH"] = os.path.join(root, "plugins")
    subprocess.run(cmd, env=env, check=True, capture_output=True, timeout=300)


def entities(path: str):
    """R12 DXF 里 ENTITIES 段的多段线：(图层, 颜色, 闭合, 顶点)，另加 TABLES 里的图层颜色与头变量。"""
    tok = [t.strip() for t in open(path, encoding="latin-1").read().split("\n")]
    pairs = list(zip(tok[0::2], tok[1::2]))
    out, layers, header, cur, section, i = [], {}, {}, None, None, 0
    while i < len(pairs):
        code, val = pairs[i]
        if code == "9" and section == "HEADER":
            header[val] = pairs[i + 1][1]
        if code != "0":
            i += 1
            continue
        f, j = {}, i + 1
        while j < len(pairs) and pairs[j][0] != "0":
            f.setdefault(pairs[j][0], pairs[j][1])
            j += 1
        if val == "SECTION":                    # HEADER 段里整段都不是 0 组码，不能跳过去
            section = f.get("2")
            i += 1
            continue
        if val == "LAYER" and section == "TABLES":
            layers[f.get("2")] = f.get("62")
        elif val == "POLYLINE" and section == "ENTITIES":
            cur = (f.get("8"), f.get("62", "BYLAYER"), int(f.get("70", "0")) & 1, [])
        elif val == "VERTEX" and cur is not None:
            cur[3].append((round(float(f["10"]), 3), round(float(f["20"]), 3)))
        elif val == "SEQEND" and cur is not None:
            out.append((cur[0], cur[1], cur[2], tuple(cur[3])))
            cur = None
        elif section == "ENTITIES" and val not in ("ENDSEC", "EOF"):
            out.append((f.get("8"), val, 0, ()))
        i = j
    return out, layers, header


def main(out_dir: str, exe_arg: str | None = None) -> str:
    exe = find_converter(exe_arg)
    src = os.path.join(out_dir, f"{NAME}.dxf")
    text = open(src, encoding="ascii", newline="").read()
    assert text.count(ACADVER) == 1, "DXF 头和 cutfiles.write_dxf 写的对不上"
    with tempfile.TemporaryDirectory() as tmp:
        dirs = {k: os.path.join(tmp, k) for k in ("in", "dwg", "r12", "r2000")}
        for d in dirs.values():
            os.makedirs(d)
        with open(os.path.join(dirs["in"], f"{NAME}.dxf"), "w", encoding="ascii", newline="") as f:
            f.write(text.replace(ACADVER, ACADVER + UNITS))
        convert(exe, dirs["in"], dirs["dwg"], "ACAD2000", "DWG", "*.dxf")
        dwg = os.path.join(dirs["dwg"], f"{NAME}.dwg")
        with open(dwg, "rb") as f:
            assert f.read(6) == b"AC1015", "转出来的不是 AutoCAD 2000 格式"
        # 读回核对：几何转回 R12 比，单位转回 2000 看头变量（R12 没有 $INSUNITS）
        convert(exe, dirs["dwg"], dirs["r12"], "ACAD12", "DXF", "*.dwg")
        convert(exe, dirs["dwg"], dirs["r2000"], "ACAD2000", "DXF", "*.dwg")
        a, la, _ = entities(src)
        b, lb, _ = entities(os.path.join(dirs["r12"], f"{NAME}.dxf"))
        assert Counter(a) == Counter(b), "DWG 读回来的图元和 DXF 不一致"
        assert all(lb.get(k) == v for k, v in la.items()), (la, lb)
        _, _, hd = entities(os.path.join(dirs["r2000"], f"{NAME}.dxf"))
        assert hd.get("$INSUNITS") == "4" and hd.get("$MEASUREMENT") == "1", "DWG 的单位不是 mm"
        dst = os.path.join(out_dir, f"{NAME}.dwg")
        shutil.copyfile(dwg, dst)
    kinds = Counter((e[0], e[1]) for e in a)
    print(dst, dict(kinds), "layers", la)
    return dst


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
