// docker events は「Docker」タブを見ている画面があるときだけ 1 本立てる（画面が 20 秒ごとに「見ています」を送る貸し出し。
// どこからも 45 秒届かなければ止める）。変わったら 300ms まとめて知らせる。events が終わったら（エンジンが止まった）5 秒ごとに調べて立て直す
import type { DockerCli } from "./cli";
import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";
import type { StreamedCommand } from "@/foundation/core/system/stream";
import { createLease, type Lease } from "@/foundation/core/watch/lease";

/** 「見ています」が届かなくなってから止めるまで */
const WATCH_LEASE_MS = 45_000;
/** 変化の知らせをまとめる時間 */
const DEBOUNCE_MS = 300;
/** エンジンが止まっている間に調べ直す間隔 */
const ENGINE_POLL_MS = 5_000;
/** 期限切れを見る間隔 */
const SWEEP_MS = 10_000;

export class DockerEvents {
  /** 見ているプロジェクトの ID（最初の 1 つで立て、全部が外れたら止める） */
  private readonly leases: Lease<number>;
  private stream: StreamedCommand | null = null;
  private debounce: TimerHandle | null = null;
  private pollTimer: TimerHandle | null = null;
  private readonly enginePollMs: number;
  private readonly clock: Clock;

  constructor(
    private readonly cli: Pick<DockerCli, "stream" | "engineUp">,
    /** 変わったときに、見ているプロジェクトへ知らせる */
    private readonly onChange: (projectIds: number[]) => void,
    /** テストで差し替える（時計・エンジンを調べ直す間隔） */
    timing: { clock?: Clock; enginePollMs?: number } = {},
  ) {
    this.clock = timing.clock ?? systemClock;
    this.enginePollMs = timing.enginePollMs ?? ENGINE_POLL_MS;
    this.leases = createLease<number>({ ttlMs: WATCH_LEASE_MS, sweepMs: SWEEP_MS, clock: this.clock, onFirst: () => {}, onEmpty: () => this.halt() });
  }

  /** いま docker events を受けているか（テストと確かめ用） */
  get running(): boolean {
    return this.stream !== null;
  }

  /** 見ています（期限を延ばし、止まっていれば立てる） */
  lease(projectId: number) {
    this.leases.touch(projectId);
    if (!this.stream && !this.pollTimer) this.start();
  }

  private start() {
    const stream = this.cli.stream(["events", "--format", "json", "--filter", "type=container"], { onLine: () => this.schedule() });
    if (!stream) return;
    this.stream = stream;
    void stream.done.then(({ stopped }) => {
      if (this.stream !== stream) return;
      this.stream = null;
      if (stopped || this.leases.active.size === 0) return;
      // エンジンが止まった: 画面に知らせて「Docker が動いていません」を出させ、戻るまで 5 秒ごとに調べる
      this.notify();
      this.poll();
    });
  }

  private poll() {
    this.pollTimer = this.clock.setTimeout(async () => {
      this.pollTimer = null;
      if (this.leases.active.size === 0) return;
      if (await this.cli.engineUp()) {
        this.notify();
        this.start();
      } else this.poll();
    }, this.enginePollMs);
  }

  private schedule() {
    if (this.debounce) return;
    this.debounce = this.clock.setTimeout(() => {
      this.debounce = null;
      this.notify();
    }, DEBOUNCE_MS);
  }

  private notify() {
    if (this.leases.active.size) this.onChange([...this.leases.active]);
  }

  /** だれも見ていない: docker events と待ちを止める */
  private halt() {
    this.stream?.stop();
    this.stream = null;
    this.clock.clearTimeout(this.debounce);
    this.clock.clearTimeout(this.pollTimer);
    this.debounce = this.pollTimer = null;
  }

  /** 止める（コアを閉じる。貸し出しを全部返す） */
  stop() {
    for (const id of [...this.leases.active]) this.leases.release(id);
    this.halt();
  }
}
