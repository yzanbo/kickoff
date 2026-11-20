import type { Bus } from "@/foundation/core/bus";
import { errorMessage } from "@shared/foundation/errors";
import type { AgentProvider } from "@/features/ai/core/providers/index";
import type { OverageNote, PlanUsage } from "@shared/ai/types";
import { USAGE_REFRESH_MS } from "@shared/ai/usageRefresh";

/** 連続した再取得をまとめる最短間隔 */
const MIN_INTERVAL_MS = 15_000;

/**
 * プランの使用枠を定期的に取得して配信する。
 * エージェントの実行後など、使用量が変わりそうなタイミングでも refresh() を呼ぶ。
 */
export class UsageMonitor {
  private current: PlanUsage | undefined;
  private inflight: Promise<PlanUsage> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastFetch = 0;
  /** いま超過分で動いているかの最後の知らせ（実行中に AI が知らせる。取り直しても消さず、枠に空きが戻ったら外す） */
  private overage: OverageNote | null = null;

  constructor(
    private readonly provider: AgentProvider,
    private readonly bus: Bus,
  ) {}

  start() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), USAGE_REFRESH_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async get(): Promise<PlanUsage> {
    return this.current ?? this.refresh();
  }

  async refresh(force = false): Promise<PlanUsage> {
    if (this.inflight) return this.inflight;
    if (!force && this.current && Date.now() - this.lastFetch < MIN_INTERVAL_MS) return this.current;
    this.inflight = this.fetch().finally(() => (this.inflight = undefined));
    return this.inflight;
  }

  /**
   * いま超過分で動いているかを覚えて、変わったら配る（実行中の AI の知らせから）。
   * 超過分で動き始めたか（前は動いていなかった）を返す（チャットのお知らせに残すかを決めるため）
   */
  noteOverage(inUse: boolean): boolean {
    const started = inUse && !this.overage?.in_use;
    const changed = this.overage?.in_use !== inUse;
    this.overage = { in_use: inUse, observed_at: new Date().toISOString() };
    if (changed && this.current) {
      this.current = { ...this.current, overage: this.overage };
      this.bus.publish({ type: "usage", usage: this.current });
    }
    return started;
  }

  private async fetch(): Promise<PlanUsage> {
    this.lastFetch = Date.now();
    let usage: PlanUsage;
    try {
      if (!this.provider.usage) throw new Error(`${this.provider.label} は使用状況の取得に対応していません`);
      usage = await this.provider.usage();
    } catch (e) {
      // 取得に失敗しても直前の値は残し、エラーだけ添える
      const message = errorMessage(e);
      usage = this.current ? { ...this.current, error: message } : emptyUsage(this.provider, message);
    }
    // 枠に空きが戻った（上限に達した枠がない）なら、超過分ではもう動いていない（次の知らせを待たずに外す）
    if (this.overage?.in_use && usage.available && !reachedLimit(usage)) this.overage = { in_use: false, observed_at: usage.fetched_at };
    usage = { ...usage, overage: this.overage };
    this.current = usage;
    this.bus.publish({ type: "usage", usage });
    return usage;
  }
}

/** 上限に達した枠があるか（5 時間・週・モデル別の週のどれか） */
function reachedLimit(usage: PlanUsage): boolean {
  return [usage.five_hour, usage.seven_day, ...usage.model_weekly].some((w) => (w.utilization ?? 0) >= 100);
}

function emptyUsage(provider: AgentProvider, error: string): PlanUsage {
  return {
    provider: provider.id,
    provider_label: provider.label.replace(/ Code$/, ""),
    available: false,
    plan: null,
    five_hour: { key: "five_hour", label: "5時間", utilization: null, resets_at: null },
    seven_day: { key: "seven_day", label: "週", utilization: null, resets_at: null },
    model_weekly: [],
    fetched_at: new Date().toISOString(),
    error,
  };
}
