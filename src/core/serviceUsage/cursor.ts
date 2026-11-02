import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ServiceUsage, UsageWindow } from "../types.js";
import {
  dollars,
  errorUsage,
  fetchJson,
  HttpStatusError,
  isExpired,
  isoFromDate,
  jwtClaims,
  jwtExpiry,
  okUsage,
  unavailableUsage,
  usageWindow,
  type UsageFetcher,
} from "./common.js";

const BASE = { id: "cursor", label: "Cursor" } as const;
const USAGE_URL = "https://cursor.com/api/usage-summary";
const STATE_DB = path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");

interface PlanUsage {
  used?: number;
  limit?: number;
  totalPercentUsed?: number;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
}

export interface CursorUsageSummary {
  billingCycleEnd?: string;
  membershipType?: string;
  isUnlimited?: boolean;
  individualUsage?: {
    plan?: PlanUsage | null;
    onDemand?: { enabled?: boolean; used?: number; limit?: number | null } | null;
  } | null;
}

/** Cursor の使用状況（今月の請求期間）の応答を Kickoff の形にする。金額はセント */
export function parseCursorUsage(body: CursorUsageSummary, account: string | null): ServiceUsage {
  const plan = body.individualUsage?.plan;
  const resetsAt = isoFromDate(body.billingCycleEnd);
  const windows: UsageWindow[] = [];
  const notes: string[] = [];
  if (body.isUnlimited) notes.push("無制限");
  if (plan) {
    const amount = typeof plan.used === "number" && typeof plan.limit === "number" && plan.limit > 0 ? `${dollars(plan.used)} / ${dollars(plan.limit)}` : undefined;
    windows.push(usageWindow("total", "今月の利用（合計）", plan.totalPercentUsed ?? null, resetsAt, amount));
    if (typeof plan.autoPercentUsed === "number") windows.push(usageWindow("auto", "Auto", plan.autoPercentUsed, resetsAt));
    if (typeof plan.apiPercentUsed === "number") windows.push(usageWindow("api", "モデルを指定", plan.apiPercentUsed, resetsAt));
  }
  const onDemand = body.individualUsage?.onDemand;
  if (onDemand?.enabled && typeof onDemand.used === "number") {
    notes.push(`オンデマンド ${dollars(onDemand.used)}${typeof onDemand.limit === "number" ? ` / ${dollars(onDemand.limit)}` : ""}`);
  }
  return okUsage(BASE, { plan: body.membershipType ?? null, account, windows, notes });
}

/** Cursor.app のログイン（state.vscdb の cursorAuth/*）。読むだけで、書き換えない */
function readCursorAuth(): { token: string | null; email: string | null } | null {
  if (!existsSync(STATE_DB)) return null;
  const db = new DatabaseSync(STATE_DB, { readOnly: true });
  try {
    const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key IN ('cursorAuth/accessToken', 'cursorAuth/cachedEmail')").all() as {
      key: string;
      value: unknown;
    }[];
    const text = (v: unknown) => (typeof v === "string" ? v : v instanceof Uint8Array ? Buffer.from(v).toString("utf8").replace(/\0/g, "") : null);
    const get = (key: string) => text(rows.find((r) => r.key === key)?.value);
    return { token: get("cursorAuth/accessToken"), email: get("cursorAuth/cachedEmail") };
  } finally {
    db.close();
  }
}

/** Cursor の今月の利用（合計・Auto・モデルを指定）。Cursor.app のログインを使う */
async function fetchCursorUsage(): Promise<ServiceUsage> {
  const auth = readCursorAuth();
  if (!auth?.token) return unavailableUsage(BASE, "Cursor にログインしていません（Cursor を開いてログインしてください）");
  const account = auth.email;
  // 新しい Cursor は、ログイン情報をキーチェーンの鍵で暗号化している
  if (auth.token.startsWith("cursor-safe-storage")) {
    return unavailableUsage(BASE, "この Cursor はログイン情報を暗号化して保存しているため、Kickoff からは読めません", { account });
  }
  const userId = String(jwtClaims(auth.token)?.sub ?? "").split("|").pop();
  if (!userId) return errorUsage(BASE, "Cursor のログイン情報を読めませんでした", { account });
  if (isExpired(jwtExpiry(auth.token))) return errorUsage(BASE, "Cursor のログインの期限が切れています。Cursor を開くと更新されます", { account });
  try {
    const body = await fetchJson<CursorUsageSummary>(USAGE_URL, {
      headers: { Cookie: `WorkosCursorSessionToken=${userId}%3A%3A${auth.token}`, Accept: "application/json" },
    });
    return parseCursorUsage(body, account);
  } catch (e) {
    if (e instanceof HttpStatusError && (e.status === 401 || e.status === 403)) {
      return errorUsage(BASE, "Cursor のログインが使えませんでした。Cursor を開いてログインし直してください", { account });
    }
    throw e;
  }
}

export const cursorUsage: UsageFetcher = { ...BASE, fetch: fetchCursorUsage };
