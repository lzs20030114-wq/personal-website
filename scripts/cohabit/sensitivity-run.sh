#!/bin/bash
# 敏感性分析（2026-11-09，项目二_人猫同台lab.md §14.31）：猫的节奏 3 个数 + 访客节奏 5 个数，各上下调一半；
# 每档 6 人 4 猫 · 1800 s · 32 种子（分四段并行）· 只跑引导开 / 关两档。基准 = 现行规则全开（§14.30 第五步）。
#   用法：bash scripts/cohabit/sensitivity-run.sh <输出目录>
#   汇总：node scripts/cohabit/sensitivity-table.mjs <基准.json> 标签=<输出目录>/<档>.json ...
set -e
D=${1:?输出目录}
mkdir -p "$D"
cd "$(dirname "$0")/../.."
run() { # 档名 猫的覆盖 节奏的覆盖
  local n=$1 cp=$2 pp=$3
  for i in 0 1 2 3; do
    ARMS=guided,off SEED0=$((100 + 8 * i)) node scripts/cohabit/guide-effect.mjs 1800 8 6 4 "$D/${n}_$i.json" "$cp" "$pp" > "$D/${n}_$i.log" 2>&1 &
  done
  wait
  node scripts/cohabit/guide-merge.mjs "$D/$n.json" "$D/${n}_0.json" "$D/${n}_1.json" "$D/${n}_2.json" "$D/${n}_3.json" > "$D/$n.txt" 2>&1
  echo "$n done $(date +%T)"
}
run catSit-  '{"sit":1.5}' '{}'
run catSit+  '{"sit":4.5}' '{}'
run catLie-  '{"lie":9}' '{}'
run catLie+  '{"lie":27}' '{}'
run catRoam- '{"roamP":0.25}' '{}'
run catRoam+ '{"roamP":0.75}' '{}'
run pause-   '{}' '{"pause":{"min":1.5,"max":6}}'
run pause+   '{}' '{"pause":{"min":4.5,"max":18}}'
run sitP-    '{}' '{"sitP":0.175}'
run sitP+    '{}' '{"sitP":0.525}'
run sitLen-  '{}' '{"sit":{"min":300,"max":900}}'
run sitLen+  '{}' '{"sit":{"min":900,"max":2700}}'
run toCat-   '{}' '{"toCatP":0.25}'
run toCat+   '{}' '{"toCatP":0.75}'
run watch-   '{}' '{"watch":{"min":5,"max":15}}'
run watch+   '{}' '{"watch":{"min":15,"max":45}}'
