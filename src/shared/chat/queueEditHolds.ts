/** 書き直している印の持ち時間（画面はこれより短い間隔で知らせ直す。画面が閉じた・落ちたときは、この時間で外れて送る） */
export const EDIT_HOLD_TTL_MS = 20_000;

/**
 * 送信待ちの指示のうち、画面でいま書き直している（書き直す欄を開いている）もの（チャットごと。保存しない）。
 * 自動で送る次の指示を書き直している間は、送らずに書き直しが終わるのを待つ（runnerQueue.ts の sendNextQueued）。
 * 画面は書き直す欄を開いている指示の一覧を丸ごと知らせ、開いている間は知らせ直す。知らせが途絶えたら（画面を閉じた・落ちた）
 * ttlMs で外す（勝手に止まったままにしないため）。外れた・変わったら onChange で知らせる
 */
export class QueueEditHolds {
  private readonly holds = new Map<number, Set<string>>();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly onChange: (runId: number) => void,
    private readonly ttlMs = EDIT_HOLD_TTL_MS,
  ) {}

  /** 書き直している指示を丸ごと置き換える（空なら外す）。持ち時間はここから数え直す */
  set(runId: number, ids: string[]) {
    clearTimeout(this.timers.get(runId));
    this.timers.delete(runId);
    if (ids.length === 0) this.holds.delete(runId);
    else {
      this.holds.set(runId, new Set(ids));
      const timer = setTimeout(() => this.set(runId, []), this.ttlMs);
      // アプリを終えるときに、この待ちでプロセスを引き止めない
      timer.unref?.();
      this.timers.set(runId, timer);
    }
    this.onChange(runId);
  }

  /** その指示を書き直しているか */
  isHeld(runId: number, id: string): boolean {
    return this.holds.get(runId)?.has(id) ?? false;
  }

  /** 書き直している指示の ID */
  idsOf(runId: number): string[] {
    return [...(this.holds.get(runId) ?? [])];
  }

  /** チャットを消したとき（知らせない） */
  forget(runId: number) {
    clearTimeout(this.timers.get(runId));
    this.timers.delete(runId);
    this.holds.delete(runId);
  }
}
