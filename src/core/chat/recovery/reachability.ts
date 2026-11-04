/**
 * 通信が切れて止まったチャットを覚えておき、AI の API に届くようになったら知らせる（つながったら自動で再開するため）。
 * 待っているチャットがある間だけ、決まった間隔で確かめる
 */
export class ReconnectWatcher {
  private readonly waiting = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly opts: {
      /** AI の API に届くか */
      check: () => Promise<boolean>;
      /** 確かめる間隔 */
      intervalMs: number;
      /** つながった: 待っていたチャット（待つのをやめてから渡す） */
      onOnline: (chatIds: number[]) => void;
    },
  ) {}

  has(chatId: number): boolean {
    return this.waiting.has(chatId);
  }

  add(chatId: number) {
    this.waiting.add(chatId);
    this.schedule();
  }

  /** 待つのをやめる（待っていたら true） */
  remove(chatId: number): boolean {
    return this.waiting.delete(chatId);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule() {
    if (this.timer || this.stopped || this.waiting.size === 0) return;
    this.timer = setTimeout(() => void this.tick(), this.opts.intervalMs);
    // 待っているだけでアプリ（テスト）の終了を引き止めない
    this.timer.unref?.();
  }

  private async tick() {
    this.timer = undefined;
    if (this.waiting.size === 0 || this.stopped) return;
    const online = await this.opts.check().catch(() => false);
    if (online && !this.stopped && this.waiting.size > 0) {
      const chatIds = [...this.waiting];
      this.waiting.clear();
      this.opts.onOnline(chatIds);
    } else {
      this.schedule();
    }
  }
}

/** AI の API に届くか（返事があれば届いている。HTTPS の証明書で確かめるので、公衆 Wi-Fi のログイン画面に横取りされているときは false） */
export async function canReachApi(): Promise<boolean> {
  try {
    await fetch("https://api.anthropic.com/", { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}
