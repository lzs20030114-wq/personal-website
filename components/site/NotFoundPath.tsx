'use client';

import { useEffect, useState } from 'react';

/**
 * 404 页 meta 行里的「读者要找的那个地址」（MAPPING §88）。404 是静态预渲染的，服务端不知道是哪个地址，
 * 所以挂载后才读 location——首帧不出，不会水合不一致。
 */
export function NotFoundPath() {
  const [path, setPath] = useState('');
  useEffect(() => {
    const raw = window.location.pathname;
    let shown = raw;
    try {
      shown = decodeURI(raw); // 中文路径照原样显示；坏的转义（%E0%A4 之类）就显示原文
    } catch {
      /* 保留原文 */
    }
    setPath(shown);
  }, []);
  if (!path || path === '/') return null;
  return <span className="nf-path">{path}</span>;
}
