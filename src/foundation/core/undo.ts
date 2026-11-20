// 失敗したときに戻す手順を足していき、まとめて流す（用意 → 確定 → 失敗なら戻す、の「戻す」。チャットの withIdleChat が使う）
import type { Log } from "@/foundation/core/kernel";

export class Undo {
  private steps: (() => Promise<void> | void)[] = [];

  /** 戻すときに流す手順の記録先（戻す手順の失敗は握りつぶして warn に書く） */
  constructor(private readonly log: Pick<Log, "warn">) {}

  /** 戻す手順を足す */
  add(fn: () => Promise<void> | void): void {
    this.steps.push(fn);
  }

  /** 足した順の逆に流す（途中で失敗しても残りを流す。流したら空にするので、2 回目は何もしない） */
  async run(): Promise<void> {
    const steps = this.steps.reverse();
    this.steps = [];
    for (const step of steps) {
      try {
        await step();
      } catch (e) {
        this.log.warn("戻す手順が失敗しました", e);
      }
    }
  }
}
