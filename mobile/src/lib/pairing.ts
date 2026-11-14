// ペアリングの QR・手で打った番号の読み方。QR は本体の画面が出す <つなぐ先>/pair?code=…&host=<本体の ID>（@shared/devices/pairing の pairingLink）
import type { PairingClaimBody, PairingClaimResult, PairingPollResult } from "@shared/types";
import { API_VERSION_HEADER } from "@shared/api/version";
import { APP_API_VERSION } from "./version";

/** QR から読んだもの（つなぐ先の URL・使い捨ての番号・本体の ID） */
export interface PairingTarget {
  url: string;
  code: string;
  host_id: string | null;
}

/** つなぐ先の URL を整える（https だけ。末尾の / は落とす）。使えなければ null */
export function normalizeHostUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    // 平文の http は Android のアプリが既定で断る（Tailscale Serve の https を使う）
    if (url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** QR の文を読む（本体の画面の QR でなければ null） */
export function parsePairingLink(text: string): PairingTarget | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.pathname.endsWith("/pair")) return null;
  const code = url.searchParams.get("code")?.replace(/\D/g, "") ?? "";
  if (code.length !== 6) return null;
  const base = `${url.origin}${url.pathname.slice(0, -"/pair".length)}`;
  return { url: base, code, host_id: url.searchParams.get("host") };
}

/** 本体に「つなぎたい」と頼む（認証の外。番号の区切りの - は本体が読み飛ばす） */
export async function claimPairing(target: PairingTarget, name: string, fetchFn: typeof fetch = fetch): Promise<PairingClaimResult> {
  const res = await fetchFn(`${target.url}/pairing/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", [API_VERSION_HEADER]: String(APP_API_VERSION) },
    body: JSON.stringify({ code: target.code, name } satisfies PairingClaimBody),
  });
  const body = (await res.json().catch(() => ({}))) as PairingClaimResult & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `つなげません（${res.status}）`);
  return body;
}

/** 本体の画面で答えたかを聞く（つないだら、端末のトークンが 1 回だけ届く） */
export async function pollPairing(url: string, claim: PairingClaimResult, fetchFn: typeof fetch = fetch): Promise<PairingPollResult> {
  const res = await fetchFn(`${url}/pairing/requests/${encodeURIComponent(claim.request_id)}`, {
    method: "POST",
    headers: { "content-type": "application/json", [API_VERSION_HEADER]: String(APP_API_VERSION) },
    body: JSON.stringify({ secret: claim.secret }),
  });
  if (!res.ok) throw new Error(`結果を聞けません（${res.status}）`);
  return (await res.json()) as PairingPollResult;
}
