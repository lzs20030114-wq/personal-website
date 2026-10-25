/* 最小正交光栅化核心：三角形 → 深度缓冲 + 面号缓冲。交接文档出图用。
   cc -O2 -shared -fPIC raster.c -o raster.so */
#include <math.h>
void raster(int W, int H, int n, const float *v, const int *ids, float *zb, int *ib) {
  for (int t = 0; t < n; t++) {
    const float *p = v + 9 * t;
    float x0 = p[0], y0 = p[1], z0 = p[2], x1 = p[3], y1 = p[4], z1 = p[5], x2 = p[6], y2 = p[7], z2 = p[8];
    float area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (fabsf(area) < 1e-12f) continue;
    int minx = (int)floorf(fminf(x0, fminf(x1, x2))), maxx = (int)ceilf(fmaxf(x0, fmaxf(x1, x2)));
    int miny = (int)floorf(fminf(y0, fminf(y1, y2))), maxy = (int)ceilf(fmaxf(y0, fmaxf(y1, y2)));
    if (minx < 0) minx = 0; if (miny < 0) miny = 0;
    if (maxx > W - 1) maxx = W - 1; if (maxy > H - 1) maxy = H - 1;
    float inv = 1.0f / area;
    for (int y = miny; y <= maxy; y++) {
      float py = y + 0.5f;
      for (int x = minx; x <= maxx; x++) {
        float px = x + 0.5f;
        float w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
        float w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
        float w2 = 1.0f - w0 - w1;
        if (w0 < -1e-6f || w1 < -1e-6f || w2 < -1e-6f) continue;
        float z = w0 * z0 + w1 * z1 + w2 * z2;
        int k = y * W + x;
        if (z < zb[k]) { zb[k] = z; ib[k] = ids[t]; }
      }
    }
  }
}
