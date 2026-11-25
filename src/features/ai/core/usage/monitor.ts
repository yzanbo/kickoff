// 使用状況の見張り（AI ごとの使用状況 ProviderUsage を 1 つの形で持つ。取り方は各 AI のフォルダの usage.ts で、作るときに受ける）
import type { Bus } from "@/foundation/core/bus";
import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";
import { errorMessage } from "@shared/foundation/errors";
import { providerCan } from "@shared/ai/providers";
import { exhaustedResetOf, limitReachedOf, type PayAsYouGo, type ProviderUsage, type SpendingNote } from "@shared/ai/usage";
import { USAGE_REFRESH_MS } from "@shared/ai/usageRefresh";
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";
import { applySpending, NO_PAY_AS_YOU_GO } from "./spending";

/** AI ごとの取り方（ない AI は一覧に出さない） */
export type UsageFetchers = Partial<Record<ProviderId, () => Promise<ProviderUsage>>>;

/** 連続した取り直しをまとめる最短間隔（プランの枠） */
const MIN_INTERVAL_MS = 15_000;

/** プランの使用枠を下の帯に出し、1 分ごとと実行のあとに取り直す AI（Claude） */
const isPlan = (id: ProviderId) => providerCan(id, "plan_usage");

/** 取れなかったときの結果（前の値がないとき） */
const failedUsage = (provider: ProviderId, message: string, at: string): ProviderUsage => ({
  provider,
  status: "error",
  plan: null,
  account: null,
  windows: [],
  notes: [],
  pay_as_you_go: null,
  message,
  fetched_at: at,
});

/** 支払いの様子（引かれているか・確かめた時刻）を取得の結果に重ねる */
function withSpending(usage: ProviderUsage, spend: PayAsYouGo | null): ProviderUsage {
  if (!spend) return usage;
  return { ...usage, pay_as_you_go: { ...(usage.pay_as_you_go ?? NO_PAY_AS_YOU_GO), spending: spend.spending, checked_at: spend.checked_at } };
}

/**
 * 使用状況を AI ごとに取って配る。プランの枠（Claude）は 1 分ごとと実行のあとに取り（15 秒以内の続けての取得はまとめる）、
 * 取得に失敗しても直前の値を残して理由を添える。ほかの AI は一覧などを頼まれたときに取り、終わったものから配る（取得の時間も鮮度に数える）。
 * 支払いの様子（超過分・クレジット）は実行中の知らせと取得を重ねる（spending.ts）
 */
export class UsageMonitor {
  private readonly latest = new Map<ProviderId, ProviderUsage>();
  private readonly spend = new Map<ProviderId, PayAsYouGo>();
  private readonly inflight = new Map<ProviderId, Promise<ProviderUsage>>();
  private readonly lastFetch = new Map<ProviderId, number>();
  private list: { at: number; usages: ProviderUsage[] } | undefined;
  private listInflight: { force: boolean; loading: Promise<ProviderUsage[]> } | undefined;
  private timer: TimerHandle | undefined;

  constructor(
    private readonly bus: Pick<Bus, "publish"> | undefined,
    private readonly fetchers: UsageFetchers,
    private readonly clock: Clock = systemClock,
  ) {}

  start() {
    this.refreshPolled();
    this.timer = this.clock.setInterval(() => this.refreshPolled(), USAGE_REFRESH_MS);
  }

  stop() {
    this.clock.clearInterval(this.timer);
  }

  /** 見張っている AI（プランの枠）を取り直す（実行のあとなど、使用量が変わりそうなとき） */
  refreshPolled(): void {
    for (const id of PROVIDER_IDS) if (isPlan(id) && this.fetchers[id]) void this.refresh(id);
  }

  /** 最後に取った使用状況（まだなければ null） */
  get(id: ProviderId): ProviderUsage | null {
    return this.latest.get(id) ?? null;
  }

  /** いまの使用状況（まだ取っていなければ取る） */
  current(id: ProviderId): Promise<ProviderUsage> {
    return this.latest.has(id) ? Promise.resolve(this.latest.get(id)!) : this.refresh(id);
  }

  /** 取り直す（進んでいる取得には相乗りする。force でなければ 15 秒以内は前の値） */
  refresh(id: ProviderId, force = false): Promise<ProviderUsage> {
    const running = this.inflight.get(id);
    if (running) return running;
    const latest = this.latest.get(id);
    if (!force && latest && this.clock.now() - (this.lastFetch.get(id) ?? 0) < MIN_INTERVAL_MS) return Promise.resolve(latest);
    const fetching = this.fetch(id).finally(() => this.inflight.delete(id));
    this.inflight.set(id, fetching);
    return fetching;
  }

  /** すべての AI の使用状況（1 分以内は前の一覧。そのあとに取り直した・知らせを重ねた AI は、その最新の値） */
  all(): Promise<ProviderUsage[]> {
    if (this.list && this.clock.now() - this.list.at < USAGE_REFRESH_MS) return Promise.resolve(this.list.usages.map((u) => this.latest.get(u.provider) ?? u));
    return this.refreshAll(false);
  }

  /** すべての AI を取り直す（force: プランの枠も間を空けずに取り直す。「更新」ボタンは、進んでいるふつうの取得に相乗りしない） */
  refreshAll(force: boolean): Promise<ProviderUsage[]> {
    const running = this.listInflight;
    if (running && (running.force || !force)) return running.loading;
    const current = {
      force,
      loading: this.loadAll(force).finally(() => {
        if (this.listInflight === current) this.listInflight = undefined;
      }),
    };
    this.listInflight = current;
    return current.loading;
  }

  /** 実行中の支払いの知らせを重ねる。引かれていなかったのが引かれ始めたかを返す（チャットのお知らせに残すかを決めるため） */
  noteSpending(id: ProviderId, note: SpendingNote): boolean {
    const step = applySpending(this.spend.get(id) ?? null, note, this.clock.iso());
    this.spend.set(id, step.next);
    const latest = this.latest.get(id);
    if (step.changed && latest) this.publish(isPlan(id) ? withSpending(latest, step.next) : { ...latest, pay_as_you_go: step.next });
    return step.started;
  }

  /** 使い切った枠が戻る時刻（AI が時刻を知らせなかったときに再開の決まりが読む。分からなければ null） */
  async limitResetAt(id: ProviderId): Promise<string | null> {
    try {
      return exhaustedResetOf(await this.current(id));
    } catch {
      return null;
    }
  }

  private async loadAll(force: boolean): Promise<ProviderUsage[]> {
    const startedAt = this.clock.now();
    const ids = PROVIDER_IDS.filter((id) => this.fetchers[id]);
    const usages = await Promise.all(ids.map((id) => (isPlan(id) && !force ? this.current(id) : this.refresh(id, force))));
    // あとから始めた取得（「更新」）が先に終わっていたら、古い一覧で上書きしない
    if (!this.list || this.list.at <= startedAt) this.list = { at: startedAt, usages };
    return usages;
  }

  private async fetch(id: ProviderId): Promise<ProviderUsage> {
    this.lastFetch.set(id, this.clock.now());
    let usage: ProviderUsage;
    try {
      const fetcher = this.fetchers[id];
      if (!fetcher) throw new Error(`${PROVIDER_LABELS[id]} は使用状況の取得に対応していません`);
      usage = await fetcher();
    } catch (e) {
      const message = errorMessage(e);
      const previous = this.latest.get(id);
      // プランの枠は、取得に失敗しても直前の値は残し、理由だけ添える
      usage = isPlan(id) ? (previous ? { ...previous, error: message } : failedUsage(id, message, this.clock.iso())) : failedUsage(id, `取得できませんでした（${message}）`, this.clock.iso());
    }
    const settled = this.settle(id, usage);
    this.publish(settled);
    return settled;
  }

  /**
   * 取得した値に支払いの様子を重ねる（枠に空きが戻ったら、超過分ではもう動いていない。クレジットは残りを比べる）。
   */
  private settle(id: ProviderId, usage: ProviderUsage): ProviderUsage {
    let spend = this.spend.get(id) ?? null;
    if (isPlan(id)) {
      if (spend?.spending && usage.status === "ok" && !usage.windows.some((w) => (w.utilization ?? 0) >= 100)) {
        spend = { ...spend, spending: null, checked_at: usage.fetched_at };
        this.spend.set(id, spend);
      }
      return withSpending(usage, spend);
    }
    const pay = usage.status === "ok" ? usage.pay_as_you_go : null;
    if (!pay) return usage;
    const note = { has_credits: pay.enabled, unlimited: pay.unlimited, balance: pay.balance, limit_reached: limitReachedOf(usage.windows.map((w) => w.utilization)) };
    const step = applySpending(spend, note, this.clock.iso());
    this.spend.set(id, step.next);
    return { ...usage, pay_as_you_go: step.next };
  }

  /** 最新の値にして、SSE の usage で配る */
  private publish(usage: ProviderUsage) {
    this.latest.set(usage.provider, usage);
    this.bus?.publish({ type: "usage", usage });
  }
}
