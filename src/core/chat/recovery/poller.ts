/**
 * 待っているものがある間だけ、決まった間隔で tick を呼ぶ（止まったあとの再開の条件を確かめる。つながったか・枠が戻る時刻を過ぎたか）。
 * active が false を返す間は止まり、start で動き直す。待つだけでアプリ（テスト）の終了を引き止めない
 */
export class Poller {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ticking = false;
  private stopped = false;

  constructor(
    private readonly opts: {
      intervalMs: number;
      /** まだ待っているものがあるか */
      active: () => boolean;
      /** 確かめる（失敗しても、次の間隔でまた確かめる） */
      tick: () => void | Promise<void>;
    },
  ) {}

  /** 動いていなければ、次に確かめるのを予約する（待っているものがなければ何もしない） */
  start() {
    if (this.timer || this.ticking || this.stopped || !this.opts.active()) return;
    this.timer = setTimeout(() => void this.run(), this.opts.intervalMs);
    this.timer.unref?.();
  }

  /** アプリを終えるとき（もう確かめない） */
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async run() {
    this.timer = undefined;
    this.ticking = true;
    try {
      await this.opts.tick();
    } catch {
      // 確かめられなかった: 次の間隔でまた確かめる
    } finally {
      this.ticking = false;
    }
    this.start();
  }
}
