/** 一组一个平面符号，由细方点组成。原稿与生成步骤见 design-ref/work-pixel-scenes。 */
const GROUP_SCENE: Record<string, string> = {
  selected: 'interactive-space',
  'interaction-research': 'interaction-research',
  'landscape-urban': 'landscape-urban',
  interiors: 'interiors',
  'architecture-construction': 'architecture-construction',
  installations: 'installations',
};

export function WorkMosaic({ group, className = '', flow = false }: { group: string; className?: string; flow?: boolean }) {
  const scene = GROUP_SCENE[group];
  return (
    <div className={`hs-work-mosaic ${className}`} data-work-theme={group} data-work-flow={flow || undefined} aria-hidden="true">
      {scene ? (
        <div className="hs-work-mosaic__scene" style={{ maskImage: `url('/home/work-scenes/${scene}.svg')` }} />
      ) : null}
      <div className="hs-work-mosaic__wash" />
    </div>
  );
}
