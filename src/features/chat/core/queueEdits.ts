import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";

/**
 * 1 つのチャットの送信待ちのうち、画面でいま書き直している（書き直す欄を開いている）指示（ChatRuntime が持つ。保存しない）。
 * 自動で送る次の指示を書き直している間は、送らずに書き直しが終わるのを待つ（runnerQueue.ts の sendNextQueued）。
 * 画面は書き直す欄を開いている指示の一覧を丸ごと知らせ、開いている間は知らせ直す。知らせが途絶えたら（画面を閉じた・落ちた）
 * ttlMs で外す（勝手に止まったままにしないため）。外れた・変わったら onChange で知らせる
 */
export class QueueEdits {
  private ids = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onChange: () => void,
    private readonly ttlMs = EDIT_HOLD_TTL_MS,
  ) {}

  /** 書き直している指示を丸ごと置き換える（空なら外す）。持ち時間はここから数え直す */
  set(ids: string[]) {
    this.stopTimer();
    this.ids = new Set(ids);
    if (ids.length > 0) {
      this.timer = setTimeout(() => this.set([]), this.ttlMs);
      // アプリを終えるときに、この待ちでプロセスを引き止めない
      this.timer.unref?.();
    }
    this.onChange();
  }

  /** その指示を書き直しているか */
  has(id: string): boolean {
    return this.ids.has(id);
  }

  /** チャットを消したとき（知らせない） */
  dispose() {
    this.stopTimer();
    this.ids.clear();
  }

  private stopTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
