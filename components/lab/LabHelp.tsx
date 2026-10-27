'use client';

import { createContext, useContext } from 'react';

/**
 * 控件说明的去处（2026-10-25，用户「每一个词条点开都有解释有点冲突」）。
 * 此前每个控件名悬停 / 点开都弹一个浮框，浮框落在上一排按钮上面，挪鼠标去点按钮时一路弹一路盖。
 * 现在台架面板里的控件名只是名字：说明全部收进右侧说明栏的「控件」一节（稿里控件名本来就是普通文字），
 * 悬停 / 聚焦控件名只把那一条点亮，点一下打开说明栏并滚到那一条。没有任何东西盖在控件上。
 * 面板外（没有说明栏的地方）没有这个上下文，LabControlLabel 退回原来的浮框。
 */
export interface LabHelpEntry {
  /** 控件名（取自界面上的字，去掉跟在后面的读数） */
  name: string;
  /** 已按当前语言取好的说明 */
  text: string;
  /** 界面上那个控件名的元素：按它在页面里的先后排序 */
  el: HTMLElement;
}

export interface LabHelpApi {
  set(id: string, entry: LabHelpEntry | null): void;
  /** 悬停 / 聚焦（point）或点开（open）某一条；null = 移开 */
  focus(id: string | null, how?: 'point' | 'open'): void;
  /** 说明栏里那一条的 id，给控件名做 aria-describedby */
  entryId(id: string): string;
}

export const LabHelp = createContext<LabHelpApi | null>(null);
export const useLabHelp = () => useContext(LabHelp);

/** 控件名后面常跟着当前读数（「reach 1.50 m」「阈值 2 秒」），说明栏只列名字 */
export function helpName(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const cut = t.search(/\s[\d.±+−×-]/);
  return cut > 0 ? t.slice(0, cut) : t;
}
