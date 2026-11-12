// docker events は「Docker」タブを見ている画面があるときだけ 1 本立てる（画面が 20 秒ごとに「見ています」を送る貸し出し。
// どこからも 45 秒届かなければ止める）。変わったら 300ms まとめて知らせる。events が終わったら（エンジンが止まった）5 秒ごとに調べて立て直す
import type { DockerCli } from "./cli.js";
import type { StreamedCommand } from "../system/stream.js";

/** 「見ています」が届かなくなってから止めるまで */
export const WATCH_LEASE_MS = 45_000;
/** 変化の知らせをまとめる時間 */
const DEBOUNCE_MS = 300;
/** エンジンが止まっている間に調べ直す間隔 */
const ENGINE_POLL_MS = 5_000;
/** 期限切れを見る間隔 */
const SWEEP_MS = 10_000;

export class DockerEvents {
  /** プロジェクトの ID → 最後に「見ています」が届いた時刻 */
  private readonly leases = new Map<number, number>();
  private stream: StreamedCommand | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cli: DockerCli,
    /** 変わったときに、見ているプロジェクトへ知らせる */
    private readonly onChange: (projectIds: number[]) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** いま docker events を受けているか（テストと確かめ用） */
  get running(): boolean {
    return this.stream !== null;
  }

  /** 見ています（期限を延ばし、止まっていれば立てる） */
  lease(projectId: number) {
    this.leases.set(projectId, this.now());
    this.sweepTimer ??= setInterval(() => this.sweep(), SWEEP_MS);
    this.sweepTimer.unref();
    if (!this.stream && !this.pollTimer) this.start();
  }

  /** 期限の切れた貸し出しを消し、だれも見ていなければ止める */
  sweep() {
    const limit = this.now() - WATCH_LEASE_MS;
    for (const [id, at] of this.leases) if (at < limit) this.leases.delete(id);
    if (this.leases.size === 0) this.stop();
  }

  private start() {
    const stream = this.cli.stream(["events", "--format", "json", "--filter", "type=container"], { onLine: () => this.schedule() });
    if (!stream) return;
    this.stream = stream;
    void stream.done.then(({ stopped }) => {
      if (this.stream !== stream) return;
      this.stream = null;
      if (stopped || this.leases.size === 0) return;
      // エンジンが止まった: 画面に知らせて「Docker が動いていません」を出させ、戻るまで 5 秒ごとに調べる
      this.notify();
      this.poll();
    });
  }

  private poll() {
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      if (this.leases.size === 0) return;
      if (await this.cli.engineUp()) {
        this.notify();
        this.start();
      } else this.poll();
    }, ENGINE_POLL_MS);
    this.pollTimer.unref();
  }

  private schedule() {
    if (this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.notify();
    }, DEBOUNCE_MS);
  }

  private notify() {
    if (this.leases.size) this.onChange([...this.leases.keys()]);
  }

  /** 止める（だれも見ていない・コアを閉じる） */
  stop() {
    this.leases.clear();
    this.stream?.stop();
    this.stream = null;
    for (const t of [this.debounce, this.pollTimer]) if (t) clearTimeout(t);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.debounce = this.pollTimer = this.sweepTimer = null;
  }
}
