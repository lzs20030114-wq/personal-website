import type { CSSProperties } from 'react';

/**
 * 一组一个平面符号，由细方点组成。原稿与生成步骤见 design-ref/work-pixel-scenes。
 * 印记（MAPPING §64）：挂在每个组面板里、卡片下方的留白带，跟卡片走同一条轨道；
 * 位置、尺寸、显隐全在 home.css（.hs-wg__mark）。未登记的组只留空带。
 */
const GROUP_SCENE: Record<string, string> = {
  selected: 'interactive-space',
  'interaction-research': 'interaction-research',
  'landscape-urban': 'landscape-urban',
  interiors: 'interiors',
  'architecture-construction': 'architecture-construction',
  installations: 'installations',
};

export function WorkMark({ group, style }: { group: string; style?: CSSProperties }) {
  const scene = GROUP_SCENE[group];
  const url = scene ? `url('/home/work-scenes/${scene}.svg')` : undefined;
  return (
    <div className="hs-wg__mark" data-work-theme={group} style={style} aria-hidden="true">
      {url ? <div className="hs-wg__mark-img" style={{ maskImage: url, WebkitMaskImage: url }} /> : null}
    </div>
  );
}
