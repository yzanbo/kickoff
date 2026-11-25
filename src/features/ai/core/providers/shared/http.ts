// 公式の配布情報（新しい CLI の版など）を読む HTTP の小道具
const TIMEOUT_MS = 15_000;
export const USER_AGENT = "Kickoff";

/** JSON を取ってくる（Accept は JSON を既定にする） */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()) as T;
}
