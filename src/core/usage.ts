import type { Bus } from "./bus.js";
import { errorMessage } from "./errors.js";
import type { AgentProvider } from "./providers/index.js";
import type { PlanUsage } from "./types.js";

const POLL_MS = 5 * 60_000;
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

  constructor(
    private readonly provider: AgentProvider,
    private readonly bus: Bus,
  ) {}

  start() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
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
    this.current = usage;
    this.bus.publish({ type: "usage", usage });
    return usage;
  }
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
