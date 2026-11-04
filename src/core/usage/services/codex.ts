import os from "node:os";
import path from "node:path";
import type { ServiceUsage } from "@shared/types";
import { defineFetcher, emailOf, fetchJsonOr, isExpired, isoFromSeconds, jwtClaims, jwtExpiry, readJsonFile, usageResult, usageWindow } from "./common.js";

const result = usageResult({ id: "codex", label: "Codex" });
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
/** 期限が書かれていないとき、ログインを更新したとみなす日数（Codex と同じ 8 日） */
const STALE_DAYS = 8;

interface CodexAuth {
  OPENAI_API_KEY?: string | null;
  tokens?: { id_token?: string; access_token?: string; account_id?: string } | null;
  last_refresh?: string;
}

interface RawWindow {
  used_percent?: number;
  reset_at?: number;
  limit_window_seconds?: number;
}

export interface CodexUsageResponse {
  plan_type?: string;
  rate_limit?: { primary_window?: RawWindow | null; secondary_window?: RawWindow | null } | null;
  credits?: { has_credits?: boolean; unlimited?: boolean; balance?: number | null } | null;
}

/** 枠の長さ（秒）から名前を付ける（5 時間・週・30 日。それ以外は時間か日） */
function windowLabel(seconds: number | undefined, fallback: string): string {
  if (!seconds) return fallback;
  if (seconds === 18_000) return "5時間";
  if (seconds === 604_800) return "週";
  if (seconds === 2_592_000) return "30日";
  return seconds % 86_400 === 0 ? `${seconds / 86_400}日` : `${Math.round(seconds / 3600)}時間`;
}

/** Codex の使用状況の応答を Kickoff の形にする */
export function parseCodexUsage(body: CodexUsageResponse, account: string | null, planHint: string | null): ServiceUsage {
  const windows = [
    ["primary", body.rate_limit?.primary_window, "5時間"],
    ["secondary", body.rate_limit?.secondary_window, "週"],
  ] as const;
  const notes: string[] = [];
  const credits = body.credits;
  if (credits?.unlimited) notes.push("クレジット: 無制限");
  else if (credits?.has_credits && typeof credits.balance === "number") notes.push(`クレジット残り ${credits.balance}`);
  return result.ok({
    plan: body.plan_type ?? planHint,
    account,
    windows: windows.flatMap(([key, raw, fallback]) =>
      raw ? [usageWindow(key, windowLabel(raw.limit_window_seconds, fallback), raw.used_percent ?? null, isoFromSeconds(raw.reset_at))] : [],
    ),
    notes,
  });
}

/** Codex（ChatGPT のプラン）の 5 時間・週の枠。~/.codex/auth.json を読むだけで、ログインの更新は Codex に任せる */
async function fetchCodexUsage(): Promise<ServiceUsage> {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const auth = readJsonFile<CodexAuth>(path.join(home, "auth.json"));
  const tokens = auth?.tokens;
  if (!tokens?.access_token) {
    return result.unavailable(
      auth?.OPENAI_API_KEY ? "API キーで使っているため、プランの使用枠はありません" : "Codex にログインしていません（ターミナルで `codex login`）",
    );
  }
  const idClaims = tokens.id_token ? jwtClaims(tokens.id_token) : null;
  const account = emailOf(idClaims);
  const authClaim = jwtClaims(tokens.access_token)?.["https://api.openai.com/auth"] as { chatgpt_plan_type?: string } | undefined;
  const plan = authClaim?.chatgpt_plan_type ?? null;

  // 期限が切れていたら問い合わせない（更新すると Codex 側のログインが使えなくなるので、Kickoff では更新しない）
  const expiresAt = jwtExpiry(tokens.access_token);
  const lastRefresh = auth?.last_refresh ? Date.parse(auth.last_refresh) : NaN;
  const stale = expiresAt !== null ? isExpired(expiresAt, 5 * 60_000) : !(Date.now() - lastRefresh < STALE_DAYS * 86_400_000);
  const refreshHint = "Codex のログインの更新が必要です。Codex（CLI かアプリ）を一度起動すると更新され、ここにも出ます";
  if (stale) return result.error(refreshHint, { plan, account });

  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/json",
    "User-Agent": "codex-cli",
    ...(tokens.account_id ? { "ChatGPT-Account-Id": tokens.account_id } : {}),
  };
  // 401 はログインの期限切れ（Kickoff では更新しない）
  return fetchJsonOr<CodexUsageResponse, ServiceUsage>(USAGE_URL, { headers }, (body) => parseCodexUsage(body, account, plan), {
    401: () => result.error(refreshHint, { plan, account }),
  });
}

export const codexUsage = defineFetcher(result, fetchCodexUsage);
