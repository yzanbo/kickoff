// 1 つの本体（Mac の Kickoff）への API。呼び手は端末に開いた口の取り決めから作る（createClient）。端末のトークンを Authorization: Bearer で送り、
// 版の見出しで自分の API の版を伝える。失敗は ApiError（状態と印 code。mobile_off・device_read_only・client_too_old など）で投げ、画面が文を出し分ける
import { approvalContract, chatContract, chatQueueContract, chatTurnContract } from "@shared/chat/contract";
import { devicesContract } from "@shared/devices/contract";
import { createClient, urlOf, type SendRequest } from "@shared/foundation/contract";
import { API_VERSION_HEADER } from "@shared/foundation/api/version";
import { serverContract } from "@shared/foundation/serverContract";
import { notificationsContract } from "@shared/notifications/contract";
import { projectContract } from "@shared/projects/contract";
import { terminalContract } from "@shared/terminal/contract";
import { workplaceMoveContract } from "@shared/workplaceMove/contract";
import { APP_API_VERSION } from "./version";

/** 本体が断ったとき（code は本体の印。なければ null） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

/** 本体への道（Tailscale Serve の https の URL と、この本体の端末のトークン） */
export interface HostAccess {
  url: string;
  token: string;
}

/** 頼みに付ける見出し（トークンと API の版） */
export const authHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}`, [API_VERSION_HEADER]: String(APP_API_VERSION) });

/** スマホが呼ぶ口の取り決め（端末に開いた口だけを使う。開いていない口は本体が断る） */
const HOST_CONTRACT = { ...serverContract, ...projectContract, ...chatContract, ...approvalContract, ...chatTurnContract, ...chatQueueContract, ...workplaceMoveContract, ...terminalContract, ...devicesContract, ...notificationsContract };

/** 本体の呼び手（api は取り決めのキーで呼ぶ。ターミナルの WebSocket は URL だけ作り、見出しはつなぐときに authHeaders で付ける） */
export function createHostApi(access: HostAccess, fetchFn: typeof fetch = fetch) {
  const send = async (req: SendRequest): Promise<unknown> => {
    const res = await fetchFn(`${access.url}${req.path}`, {
      method: req.method,
      headers: { ...authHeaders(access.token), ...(req.body === undefined ? {} : { "content-type": "application/json" }) },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    if (res.status === 204) return undefined;
    const json = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (!res.ok) throw new ApiError(res.status, json?.error ?? `本体が ${res.status} を返しました`, json?.code ?? null);
    return json;
  };
  return {
    access,
    api: createClient(HOST_CONTRACT, send),
    terminalSocketUrl: (key: string, cols: number, rows: number) => `${access.url.replace(/^http/, "ws")}${urlOf("GET /api/terminals/:key/ws", { params: { key }, query: { cols, rows } })}`,
  };
}

export type HostApi = ReturnType<typeof createHostApi>;
