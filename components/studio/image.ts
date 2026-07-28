import { imageFileName } from '../../src/lib/studio/publish';

/**
 * 浏览器端的图片处理：**在上传之前**就把图缩到网页需要的尺寸并转成 WebP。
 *
 * 为什么在客户端压：图片是要提交进仓库的（存储方式 = 仓库，见 src/lib/studio/repo.ts），
 * 手机直出的 4MB 原图每传一张就把仓库永久变大 4MB——git 里删掉也还在历史里。
 * 压完通常 100–300KB，够一张日志插图用了。
 *
 * SVG 与 GIF 原样上传：前者本来就小且缩放无损，后者一进 canvas 就只剩第一帧。
 */

/** 长边上限：站上正文限宽 66ch（约 700px），2 倍屏也够用。 */
const MAX_EDGE = 1600;
const QUALITY = 0.85;
const PASSTHROUGH = new Set(['image/svg+xml', 'image/gif']);
/** 单张上限（压缩之后）——超过说明是超大截图或压缩失败，宁可让作者知道。 */
const MAX_ONE = 900 * 1024;

export type PreparedImage = {
  /** 最终文件名（提交到 public/log/ 下），站上引用即 `/log/<name>` */
  name: string;
  base64: string;
  /** 编辑器预览用（尚未提交，`/log/...` 还取不到） */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
};

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读不出这个文件'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('这不是浏览器能显示的图片格式'));
    img.src = url;
  });
}

function encoderType(): 'image/webp' | 'image/jpeg' {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';
}

export async function prepareImage(
  file: File,
  date: string,
  taken: string[],
): Promise<PreparedImage> {
  const original = await readDataUrl(file);
  const probe = await loadImage(original);
  const w0 = probe.naturalWidth || probe.width;
  const h0 = probe.naturalHeight || probe.height;
  if (!w0 || !h0) throw new Error('读不到图片尺寸');

  const passthrough = PASSTHROUGH.has(file.type);
  let dataUrl = original;
  let width = w0;
  let height = h0;

  if (!passthrough) {
    const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
    width = Math.max(1, Math.round(w0 * scale));
    height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('浏览器不给 canvas，换个浏览器再试');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(probe, 0, 0, width, height);
    dataUrl = canvas.toDataURL(encoderType(), QUALITY);
  }

  const comma = dataUrl.indexOf(',');
  const base64 = dataUrl.slice(comma + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_ONE) {
    throw new Error(
      `压缩后仍有 ${(bytes / 1024).toFixed(0)}KB，太大了（上限 ${MAX_ONE / 1024}KB）——先在本地裁一下再传`,
    );
  }

  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  const ext =
    mime === 'image/webp'
      ? 'webp'
      : mime === 'image/jpeg'
        ? 'jpg'
        : mime === 'image/png'
          ? 'png'
          : mime === 'image/gif'
            ? 'gif'
            : mime === 'image/svg+xml'
              ? 'svg'
              : 'bin';
  if (ext === 'bin') throw new Error(`不支持的图片类型：${mime}`);

  return {
    name: imageFileName(date, file.name, ext, taken),
    base64,
    dataUrl,
    width,
    height,
    bytes,
  };
}
