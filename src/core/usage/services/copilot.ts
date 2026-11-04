import type { ServiceUsage, UsageWindow } from "@shared/types";
import { nonInteractiveEnv, runCommand } from "../../system/exec.js";
import { defineFetcher, fetchJsonOr, isoFromDate, usageResult, usageWindow } from "./common.js";

const result = usageResult({ id: "copilot", label: "GitHub Copilot" });
const USAGE_URL = "https://api.github.com/copilot_internal/user";

interface QuotaSnapshot {
  entitlement?: number;
  remaining?: number;
  percent_remaining?: number;
  unlimited?: boolean;
}

export interface CopilotUserResponse {
  login?: string;
  copilot_plan?: string;
  access_type_sku?: string;
  quota_reset_date?: string;
  quota_snapshots?: Partial<Record<"premium_interactions" | "chat" | "completions", QuotaSnapshot>> | null;
}

const QUOTA_LABELS = [
  ["premium_interactions", "プレミアムリクエスト（月）", "回"],
  ["chat", "チャット（月）", "回"],
  ["completions", "コード補完（月）", "回"],
] as const;

/** Copilot の応答を Kickoff の形にする（無制限の枠はメーターにせず、補足に書く） */
export function parseCopilotUsage(body: CopilotUserResponse): ServiceUsage {
  const account = body.login ?? null;
  const plan = body.copilot_plan ?? null;
  if (body.access_type_sku === "subscription_ended") return result.unavailable("Copilot の契約が終わっています", { plan, account });
  const snapshots = body.quota_snapshots ?? {};
  const resetsAt = isoFromDate(body.quota_reset_date);
  const windows: UsageWindow[] = [];
  const notes: string[] = [];
  for (const [key, label, unit] of QUOTA_LABELS) {
    const q = snapshots[key];
    if (!q) continue;
    if (q.unlimited) {
      notes.push(`${label.replace(/（月）$/, "")}: 無制限`);
      continue;
    }
    const used = typeof q.entitlement === "number" && typeof q.remaining === "number" ? q.entitlement - q.remaining : null;
    const percent = typeof q.percent_remaining === "number" ? 100 - q.percent_remaining : null;
    windows.push(usageWindow(key, label, percent, resetsAt, used !== null ? `${Math.round(used)} / ${q.entitlement} ${unit}` : undefined));
  }
  // 契約していないアカウントは、枠が 1 つも返らない
  if (windows.length === 0 && notes.length === 0) {
    return result.unavailable("このアカウントは Copilot を契約していません", { plan: null, account });
  }
  return result.ok({ plan, account, windows, notes });
}

/** gh のログイン（トークン）。gh がない・未ログインなら null */
async function ghToken(): Promise<string | null> {
  try {
    return (await runCommand("gh", ["auth", "token"], { timeout: 10_000, env: nonInteractiveEnv() })).trim() || null;
  } catch {
    return null;
  }
}

/** GitHub Copilot の月の枠（プレミアムリクエストなど）。gh のログインを使う */
async function fetchCopilotUsage(): Promise<ServiceUsage> {
  const token = await ghToken();
  if (!token) return result.unavailable("GitHub CLI（gh）でログインすると表示できます（ターミナルで `gh auth login`）");
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/json",
    "Editor-Version": "vscode/1.96.2",
    "Editor-Plugin-Version": "copilot-chat/0.26.7",
    "User-Agent": "GitHubCopilotChat/0.26.7",
    "X-Github-Api-Version": "2025-04-01",
  };
  // 401・404 は、このログインでは見られない（Copilot を契約していないアカウントなど）
  const notVisible = () => result.unavailable("gh のログインでは Copilot の使用状況を見られませんでした（Copilot を契約しているアカウントでログインしてください）");
  return fetchJsonOr<CopilotUserResponse, ServiceUsage>(USAGE_URL, { headers }, parseCopilotUsage, { 401: notVisible, 404: notVisible });
}

export const copilotUsage = defineFetcher(result, fetchCopilotUsage);
