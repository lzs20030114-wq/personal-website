import type { CatCoat, HumanStyle, Tone } from '../../src/lib/space/figure';

/**
 * 方块人与方块猫的配色（2026-10-25 作者「人也改成方块风，和猫统一风格」）：几何只给每块零件一个颜色类别（figure.ts 的 Tone），
 * 颜色在这里。每种颜色给一对 [背光, 迎光]——着色器按法向在两者之间插值（gl3d MESH_FS），背光取迎光的约三成。
 *
 * 2026-10-27 作者「猫多几种花色，人看得出穿不同的衣服」：
 *   - 人：十二套穿着（OUTFITS），每套 = 几何（HumanStyle：上衣 / 下装 / 发型 / 帽子 / 眼镜 / 包）+ 这一套的颜色；
 *     按访客编号轮换。第 0 套就是此前那一个人（灰绿长袖、灰蓝长裤、深棕短发），布景里的小人用它，画面不变。
 *     色相仍取站内那几种灰调的绿、蓝、土黄、豆沙、米白，加深浅几档的黑灰，不跳出画面；肤色三档。
 *   - 猫：七种花色（COATS），几何在 figure.ts 的 CatCoat，这里是每种的颜色。黑猫比地面（迎光 0.24–0.29）暗一档，读成剪影。
 */
type RGB = [number, number, number];
const pair = (lite: RGB, k = 0.3): [RGB, RGB] => [[lite[0] * k, lite[1] * k, lite[2] * k], lite];

/** 眼睛（人的眼睛、猫的瞳孔）与高光：所有人、所有猫一样 */
const EYE: [RGB, RGB] = [[0.03, 0.03, 0.04], [0.1, 0.09, 0.1]];
const SHINE: [RGB, RGB] = [[0.8, 0.8, 0.8], [1, 1, 1]];

const SKIN = { light: [0.96, 0.8, 0.66] as RGB, mid: [0.9, 0.72, 0.57] as RGB, tan: [0.78, 0.58, 0.44] as RGB };
const HAIR = {
  darkBrown: [0.3, 0.22, 0.17] as RGB,
  black: [0.16, 0.14, 0.13] as RGB,
  chestnut: [0.55, 0.4, 0.27] as RGB,
  ash: [0.44, 0.38, 0.33] as RGB,
};
const C = {
  sage: [0.56, 0.72, 0.6] as RGB, // 灰绿
  mist: [0.55, 0.66, 0.82] as RGB, // 雾蓝
  terracotta: [0.86, 0.56, 0.44] as RGB, // 陶土
  mustard: [0.88, 0.76, 0.44] as RGB, // 芥黄
  lilac: [0.7, 0.62, 0.84] as RGB, // 淡紫
  cream: [0.9, 0.88, 0.84] as RGB, // 米白
  rose: [0.78, 0.56, 0.56] as RGB, // 豆沙
  camel: [0.72, 0.58, 0.4] as RGB, // 驼色
  navy: [0.24, 0.3, 0.42] as RGB, // 藏青
  denim: [0.4, 0.52, 0.66] as RGB, // 牛仔浅蓝
  jeans: [0.32, 0.42, 0.58] as RGB, // 牛仔裤
  slate: [0.34, 0.4, 0.52] as RGB, // 灰蓝（默认那条裤子）
  khaki: [0.64, 0.58, 0.44] as RGB, // 卡其
  grey: [0.56, 0.56, 0.55] as RGB,
  charcoal: [0.28, 0.27, 0.3] as RGB,
  black: [0.18, 0.18, 0.2] as RGB,
  white: [0.92, 0.92, 0.9] as RGB,
  olive: [0.46, 0.5, 0.34] as RGB,
  brick: [0.72, 0.38, 0.32] as RGB,
  shoeDark: [0.28, 0.26, 0.25] as RGB,
  shoeBrown: [0.42, 0.3, 0.22] as RGB,
  // 镜框：黑框围着深色眼睛会连成一副墨镜，故用金、玳瑁、银三种浅一些的
  gold: [0.82, 0.68, 0.38] as RGB,
  tortoise: [0.56, 0.36, 0.22] as RGB,
  silver: [0.78, 0.79, 0.82] as RGB,
};

type PersonTone = 'skin' | 'hair' | 'shirt' | 'inner' | 'pants' | 'sock' | 'shoe' | 'hat' | 'bag' | 'frame';
export interface Outfit {
  /** 一句话（文档与守门用） */
  name: string;
  style: HumanStyle;
  colors: Record<PersonTone, RGB>;
}
/** 没用到的颜色类别给个中性灰（这一套的几何里没有那类零件，颜色不会被画出来） */
const outfit = (name: string, style: HumanStyle, colors: Partial<Record<PersonTone, RGB>>): Outfit => ({
  name,
  style,
  colors: { skin: SKIN.light, hair: HAIR.darkBrown, shirt: C.grey, inner: C.white, pants: C.slate, sock: C.white, shoe: C.shoeDark, hat: C.grey, bag: C.grey, frame: C.gold, ...colors },
});

export const OUTFITS: readonly Outfit[] = [
  outfit('灰绿长袖 · 灰蓝长裤 · 深棕短发（此前那一个人）', {}, { shirt: C.sage, pants: C.slate }),
  outfit('雾蓝连帽卫衣 · 黑裤 · 白球鞋', { top: 'hoodie', hair: 'short' }, { skin: SKIN.mid, hair: HAIR.black, shirt: C.mist, inner: [0.44, 0.53, 0.67], pants: C.black, shoe: C.white }),
  outfit('陶土色连衣裙 · 栗色长发', { top: 'tee', bottom: 'skirt', hair: 'long' }, { hair: HAIR.chestnut, shirt: C.terracotta, pants: C.terracotta, shoe: C.shoeBrown }),
  outfit('芥黄短袖 · 卡其短裤 · 白袜 · 藏青棒球帽', { top: 'tee', bottom: 'shorts', socks: true, hat: 'cap' }, { skin: SKIN.tan, hair: HAIR.black, shirt: C.mustard, pants: C.khaki, shoe: C.white, hat: C.navy }),
  outfit('藏青外套 · 米白内搭 · 灰西裤 · 金框眼镜', { top: 'jacket', glasses: true }, { shirt: C.navy, inner: C.cream, pants: C.grey, shoe: [0.2, 0.18, 0.17], frame: C.gold }),
  outfit('淡紫毛衣 · 炭灰裙 · 黑袜 · 丸子头', { bottom: 'skirt', socks: true, hair: 'bun' }, { skin: SKIN.mid, hair: HAIR.black, shirt: C.lilac, pants: C.charcoal, sock: C.black, shoe: [0.2, 0.18, 0.17] }),
  outfit('米白藏青条纹短袖 · 牛仔裤 · 橄榄绿双肩包', { top: 'tee', stripes: true, backpack: true }, { skin: SKIN.mid, hair: HAIR.black, shirt: C.white, inner: C.navy, pants: C.jeans, shoe: C.white, bag: C.olive }),
  outfit('驼色外套 · 黑内搭 · 黑裤 · 黑长发', { top: 'jacket', hair: 'long' }, { hair: HAIR.black, shirt: C.camel, inner: C.black, pants: C.black, shoe: [0.16, 0.15, 0.15] }),
  outfit('灰卫衣 · 深色牛仔裤 · 芥黄毛线帽 · 玳瑁框眼镜', { top: 'hoodie', hat: 'beanie', glasses: true }, { skin: SKIN.tan, hair: HAIR.ash, shirt: C.grey, inner: [0.46, 0.46, 0.45], pants: [0.26, 0.33, 0.45], shoe: C.white, hat: C.mustard, frame: C.tortoise }),
  outfit('黑短袖 · 灰短裤 · 白袜 · 马尾 · 砖红双肩包', { top: 'tee', bottom: 'shorts', socks: true, hair: 'ponytail', backpack: true }, { hair: HAIR.darkBrown, shirt: C.black, pants: C.grey, shoe: C.white, hat: C.brick, bag: C.brick }),
  outfit('豆沙长袖 · 卡其裤 · 灰棕长发 · 银框眼镜', { hair: 'long', glasses: true }, { skin: SKIN.mid, hair: HAIR.ash, shirt: C.rose, pants: C.khaki, shoe: C.shoeBrown, frame: C.silver }),
  outfit('牛仔外套 · 白内搭 · 黑裙 · 栗色马尾', { top: 'jacket', bottom: 'skirt', hair: 'ponytail' }, { skin: SKIN.tan, hair: HAIR.chestnut, shirt: C.denim, inner: C.white, pants: C.black, shoe: C.white, hat: C.black }),
];

/** 第几位访客穿哪一套（按编号轮换） */
export const outfitOf = (variant: number): Outfit => OUTFITS[((variant % OUTFITS.length) + OUTFITS.length) % OUTFITS.length];

type CatTone = 'fur' | 'patch' | 'patch2' | 'stripe' | 'muzzle' | 'nose' | 'iris' | 'iris2';
export interface CoatLook {
  name: string;
  coat: CatCoat;
  colors: Record<CatTone, [RGB, RGB]>;
}
const PINK = pair([0.96, 0.56, 0.6], 0.42);
const WHITE_FUR: RGB = [0.95, 0.94, 0.91];
const BLACK_FUR: RGB = [0.15, 0.14, 0.15];
const coatLook = (name: string, coat: CatCoat, colors: Partial<Record<CatTone, [RGB, RGB]>>): CoatLook => ({
  name,
  coat,
  colors: { fur: pair([0.98, 0.7, 0.4]), patch: pair(BLACK_FUR), patch2: pair([0.95, 0.62, 0.32]), stripe: pair([0.8, 0.44, 0.17], 0.28), muzzle: pair([1, 0.94, 0.82], 0.36), nose: PINK, iris: pair([0.95, 0.72, 0.25], 0.4), iris2: pair([0.95, 0.72, 0.25], 0.4), ...colors },
});

/**
 * 七种花色。台架上第几只猫按出场顺序取第几种，每点一次「重来」往后轮两种：开场是作者点名的奶牛猫与狸花猫，
 * 再往后白猫与黑猫、三花与燕尾服、最后是此前那只橘猫。
 */
export const COATS: readonly CoatLook[] = [
  coatLook('奶牛猫（白底黑斑）', 'cow', { fur: pair(WHITE_FUR), patch: pair(BLACK_FUR, 0.5), muzzle: pair([1, 0.97, 0.94], 0.36) }),
  coatLook('狸花猫', 'tabby', { fur: pair([0.6, 0.54, 0.45]), stripe: pair([0.22, 0.18, 0.14], 0.4), muzzle: pair([0.96, 0.93, 0.86], 0.36), nose: pair([0.8, 0.48, 0.46], 0.42) }),
  coatLook('白猫（鸳鸯眼）', 'white', { fur: pair(WHITE_FUR), muzzle: pair([1, 0.98, 0.95], 0.36), iris: pair([0.45, 0.68, 0.92], 0.4), iris2: pair([0.95, 0.75, 0.3], 0.4) }),
  coatLook('黑猫', 'black', { fur: pair(BLACK_FUR, 0.5), muzzle: pair([0.2, 0.19, 0.2], 0.5), nose: pair([0.32, 0.26, 0.27], 0.5), iris: pair([0.95, 0.72, 0.25], 0.4) }),
  coatLook('三花', 'calico', { fur: pair(WHITE_FUR), patch: pair(BLACK_FUR, 0.5), patch2: pair([0.95, 0.62, 0.32]), muzzle: pair([1, 0.97, 0.94], 0.36) }),
  coatLook('燕尾服（黑底白胸）', 'tuxedo', { fur: pair(BLACK_FUR, 0.5), patch: pair(WHITE_FUR), muzzle: pair([1, 0.97, 0.94], 0.36), iris: pair([0.84, 0.86, 0.36], 0.4) }),
  coatLook('橘猫（虎斑，此前那一只）', 'ginger', {}),
];
export const coatOf = (i: number): CoatLook => COATS[((i % COATS.length) + COATS.length) % COATS.length];
const GINGER = COATS.find((c) => c.coat === 'ginger') as CoatLook;

/** 某位访客某类零件的颜色 [背光, 迎光] */
export function personColor(tone: Tone, variant: number): [RGB, RGB] {
  if (tone === 'eye') return EYE;
  if (tone === 'shine') return SHINE;
  const c = outfitOf(variant).colors[tone as PersonTone];
  if (!c) return pair(C.grey);
  return pair(c, tone === 'hair' || tone === 'frame' ? 0.4 : 0.3);
}

/** 某只猫某类零件的颜色 [背光, 迎光] */
export function catColor(tone: Tone, look: CoatLook): [RGB, RGB] {
  if (tone === 'eye') return EYE;
  if (tone === 'shine') return SHINE;
  return look.colors[tone as CatTone] ?? look.colors.fur;
}

/** 某类零件的颜色 [背光, 迎光]；人的零件按 variant 取那一套穿着，猫的零件取橘猫（布景里的小人与旧调用用它） */
export function toneColor(tone: Tone, variant = 0): [RGB, RGB] {
  if (tone === 'fur' || tone === 'patch' || tone === 'patch2' || tone === 'stripe' || tone === 'muzzle' || tone === 'nose' || tone === 'iris' || tone === 'iris2') return catColor(tone, GINGER);
  return personColor(tone, variant);
}
