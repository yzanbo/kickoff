import { errorMessage } from "@shared/errors";
import type { PlanUsage, ServiceUsage } from "@shared/types";
import type { UsageMonitor } from "../planUsage.js";
import { codexUsage } from "./codex.js";
import { usageResult, type UsageFetcher } from "./common.js";
import { copilotUsage } from "./copilot.js";
import { cursorUsage } from "./cursor.js";
import { geminiUsage } from "./gemini.js";

/** 取り直すまでの間隔（設定を開いている間に画面が取りに来る。誰も見ていなければ取らない） */
const MAX_AGE_MS = 5 * 60_000;

const claude = usageResult({ id: "claude", label: "Claude Code" });

/** Claude のプランの使用枠（いつもの帯と同じもの）を、サービスの使用状況の形にする */
export function claudeServiceUsage(usage: PlanUsage): ServiceUsage {
  if (!usage.available) {
    return usage.error ? claude.error(usage.error, { plan: usage.plan }) : claude.unavailable("Claude のプランの使用枠を取得できませんでした（API キーで使っている場合は枠がありません）");
  }
  return {
    ...claude.ok({ plan: usage.plan, windows: [usage.five_hour, usage.seven_day, ...usage.model_weekly] }),
    fetched_at: usage.fetched_at,
    // 最新の取得に失敗しても直前の値は出し、理由を添える
    ...(usage.error ? { message: `最新の取得に失敗: ${usage.error}` } : {}),
  };
}

const SERVICE_FETCHERS: UsageFetcher[] = [codexUsage, copilotUsage, cursorUsage, geminiUsage];

/**
 * 設定の「使用状況」に並べる、サービスごとの使用状況（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）。
 * Claude はいつもの帯と同じ UsageMonitor の値を使い、ほかは頼まれたときに取る（各サービスのログイン情報は読むだけ）
 */
export class ServiceUsageMonitor {
  private cache: { at: number; list: ServiceUsage[] } | undefined;
  private inflight: Promise<ServiceUsage[]> | undefined;

  constructor(
    private readonly claude: Pick<UsageMonitor, "get" | "refresh">,
    private readonly fetchers: UsageFetcher[] = SERVICE_FETCHERS,
  ) {}

  async get(): Promise<ServiceUsage[]> {
    if (this.cache && Date.now() - this.cache.at < MAX_AGE_MS) return this.cache.list;
    return this.refresh(false);
  }

  /** force: Claude の枠も取り直す（「更新」ボタン） */
  refresh(force: boolean): Promise<ServiceUsage[]> {
    this.inflight ??= this.load(force).finally(() => (this.inflight = undefined));
    return this.inflight;
  }

  private async load(force: boolean): Promise<ServiceUsage[]> {
    const first = (force ? this.claude.refresh(true) : this.claude.get()).then(claudeServiceUsage, (e: unknown) => claude.error(errorMessage(e)));
    // 1 つが失敗・遅延しても、ほかのサービスは出す
    const others = this.fetchers.map((f) => f.fetch().catch((e: unknown) => usageResult(f).error(`取得できませんでした（${errorMessage(e)}）`)));
    const list = await Promise.all([first, ...others]);
    this.cache = { at: Date.now(), list };
    return list;
  }
}
