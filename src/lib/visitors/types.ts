/** 访客事件只记录页面访问；IP 数量不等于人数。时间以服务端接收时间为准。 */
export type VisitorRecord = {
  id: string;
  visitedAt: string;
  path: string;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  referrer: string | null;
};

/** 日期为 Asia/Singapore (UTC+8) 的日历日期；空字符串表示不限。 */
export type VisitorFilters = {
  from: string;
  to: string;
  ip: string;
  path: string;
  page: number;
};

export type VisitorResult = {
  records: VisitorRecord[];
  total: number;
  uniqueIps: number;
  page: number;
  pageSize: number;
};
