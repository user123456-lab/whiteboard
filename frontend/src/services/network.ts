export interface NetworkInfo {
  lanIp: string;
  port: number;
  frontendPort: number;
}

/** 获取服务器网络信息 — 用于显示局域网访问地址 */
export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  const resp = await fetch('/api/network');
  if (!resp.ok) {
    throw new Error(`Network info request failed: ${resp.status}`);
  }
  return resp.json();
}
