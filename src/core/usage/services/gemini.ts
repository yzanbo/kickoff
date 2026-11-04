import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ServiceUsage, UsageWindow } from "@shared/types";
import { defineFetcher, emailOf, fetchJson, fetchJsonOr, isExpired, isoFromDate, jwtClaims, readJsonFile, usageResult, usageWindow } from "./common.js";

const result = usageResult({ id: "gemini", label: "Gemini" });
const CODE_ASSIST = "https://cloudcode-pa.googleapis.com/v1internal";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface OAuthCreds {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  /** ミリ秒 */
  expiry_date?: number;
}

export interface LoadCodeAssistResponse {
  currentTier?: { id?: string; name?: string } | null;
  paidTier?: { id?: string; name?: string } | null;
  ineligibleTiers?: { reasonCode?: string }[] | null;
  cloudaicompanionProject?: string | null;
}

export interface QuotaResponse {
  buckets?: { remainingFraction?: number; resetTime?: string; modelId?: string; tokenType?: string }[];
}

/** モデルの段階（Pro・Flash・Flash Lite）。その段階のモデルのうち、いちばん残りが少ないものを出す */
const TIERS = [
  ["pro", "Pro", (m: string) => m.includes("pro")],
  ["flash-lite", "Flash Lite", (m: string) => m.includes("flash-lite")],
  ["flash", "Flash", (m: string) => m.includes("flash") && !m.includes("flash-lite")],
] as const;

/** 契約の名前（paidTier の名前を優先。なければ段階の ID から） */
export function geminiPlan(load: LoadCodeAssistResponse, hostedDomain: boolean): string | null {
  if (load.paidTier?.name) return load.paidTier.name;
  const id = load.currentTier?.id;
  if (id === "standard-tier") return "Paid";
  if (id === "free-tier") return hostedDomain ? "Workspace" : "Free";
  if (id === "legacy-tier") return "Legacy";
  return load.currentTier?.name ?? null;
}

/** 個人向けの Google ログインが使えなくなったアカウントか（2026 年 6 月に終了） */
export const isConsumerShutdown = (load: LoadCodeAssistResponse) =>
  !load.currentTier && !load.paidTier?.name && (load.ineligibleTiers ?? []).some((t) => t.reasonCode === "UNSUPPORTED_CLIENT");

/** モデルごとの残り（割合）を、段階ごとの使用率にする */
export function parseGeminiQuota(quota: QuotaResponse, plan: string | null, account: string | null): ServiceUsage {
  const buckets = (quota.buckets ?? []).filter((b) => b.modelId && typeof b.remainingFraction === "number");
  const windows: UsageWindow[] = [];
  for (const [key, label, match] of TIERS) {
    const inTier = buckets.filter((b) => match(b.modelId!.toLowerCase()));
    if (inTier.length === 0) continue;
    const lowest = inTier.reduce((a, b) => (b.remainingFraction! < a.remainingFraction! ? b : a));
    windows.push(usageWindow(key, label, (1 - lowest.remainingFraction!) * 100, isoFromDate(lowest.resetTime)));
  }
  return result.ok({ plan, account, windows });
}

/** インストールされている Gemini CLI の、Google ログイン用の ID（ログインを更新するのに使う）。見つからなければ null */
function geminiClient(): { id: string; secret: string } | null {
  if (process.env.GEMINI_OAUTH_CLIENT_ID && process.env.GEMINI_OAUTH_CLIENT_SECRET) {
    return { id: process.env.GEMINI_OAUTH_CLIENT_ID, secret: process.env.GEMINI_OAUTH_CLIENT_SECRET };
  }
  const bin = (process.env.PATH ?? "").split(":").map((dir) => path.join(dir, "gemini")).find((p) => existsSync(p));
  if (!bin) return null;
  // gemini の実体（node_modules/@google/gemini-cli/...）から、パッケージのフォルダをたどる
  let dir = path.dirname(realpathSync(bin));
  while (dir !== path.dirname(dir) && path.basename(dir) !== "gemini-cli") dir = path.dirname(dir);
  if (path.basename(dir) !== "gemini-cli") return null;
  const candidates = [
    path.join(dir, "node_modules", "@google", "gemini-cli-core", "dist", "src", "code_assist", "oauth2.js"),
    path.join(dir, "..", "gemini-cli-core", "dist", "src", "code_assist", "oauth2.js"),
    ...jsFiles(path.join(dir, "bundle")),
    ...jsFiles(path.join(dir, "dist")),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const id = /\d+-[a-z0-9]+\.apps\.googleusercontent\.com/.exec(text)?.[0];
    const secret = /GOCSPX-[A-Za-z0-9_-]+/.exec(text)?.[0];
    if (id && secret) return { id, secret };
  }
  return null;
}

/** フォルダの直下の .js（大きすぎるものは除く） */
function jsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dir, f))
    .filter((f) => statSync(f).size < 30_000_000);
}

/** 期限が切れていれば、手元だけで更新する（Google の更新用トークンは使い回せるので、ファイルは書き換えない） */
async function accessToken(creds: OAuthCreds): Promise<string | null> {
  if (creds.access_token && !isExpired(creds.expiry_date ?? null)) return creds.access_token;
  const client = creds.refresh_token ? geminiClient() : null;
  if (!client || !creds.refresh_token) return null;
  const body = new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: creds.refresh_token, grant_type: "refresh_token" });
  const res = await fetchJson<{ access_token?: string }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.access_token ?? null;
}

/** Code Assist の API への POST（URL と指定） */
const postRequest = (method: string, token: string, body: unknown): [string, RequestInit] => [
  `${CODE_ASSIST}:${method}`,
  { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
];

/** Gemini CLI（Google ログイン）のモデルごとの枠。~/.gemini/oauth_creds.json を読む */
async function fetchGeminiUsage(): Promise<ServiceUsage> {
  const creds = readJsonFile<OAuthCreds>(path.join(os.homedir(), ".gemini", "oauth_creds.json"));
  if (!creds?.access_token && !creds?.refresh_token) {
    return result.unavailable("Gemini CLI に Google アカウントでログインしていません（ターミナルで `gemini`）");
  }
  const claims = creds.id_token ? jwtClaims(creds.id_token) : null;
  const account = emailOf(claims);
  const token = await accessToken(creds);
  if (!token) return result.error("Gemini CLI のログインの更新が必要です。Gemini CLI を一度起動すると更新されます", { account });

  const load = await fetchJson<LoadCodeAssistResponse>(...postRequest("loadCodeAssist", token, { metadata: { ideType: "GEMINI_CLI", pluginType: "GEMINI" } }));
  const plan = geminiPlan(load, typeof claims?.hd === "string");
  if (isConsumerShutdown(load)) {
    return result.unavailable("個人向けの Gemini CLI（Google ログイン）は 2026 年 6 月に終了しました（Workspace・Standard 以上の契約なら使えます）", { account });
  }
  // 403 は、この契約では枠を見られない
  return fetchJsonOr<QuotaResponse, ServiceUsage>(
    ...postRequest("retrieveUserQuota", token, load.cloudaicompanionProject ? { project: load.cloudaicompanionProject } : {}),
    (quota) => parseGeminiQuota(quota, plan, account),
    { 403: () => result.unavailable("このアカウントの契約では、Gemini CLI の枠を見られません", { plan, account }) },
  );
}

export const geminiUsage = defineFetcher(result, fetchGeminiUsage);
