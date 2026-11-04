import type { Bus } from "./bus.js";
import type { Store } from "./store.js";

/**
 * 止めるよう頼んで、まだ終わっていないチャット（Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで。
 * ふつうは 2 秒ほど、応じなければ SDK が 5 秒後に強制終了する）。画面はこの間、停止ボタンを「停止中…」にする（SSE の run_stopping と詳細の stopping）
 */
export class RunStopping {
  private readonly runs = new Set<number>();

  constructor(private readonly deps: { store: Store; bus?: Bus }) {}

  /** 止めるよう頼んだ（2 回目以降は知らせない） */
  begin(runId: number) {
    if (this.runs.has(runId)) return;
    this.runs.add(runId);
    this.publish(runId, true);
  }

  /** 作業が終わった（止めるよう頼んでいなければ何もしない） */
  end(runId: number) {
    if (this.runs.delete(runId)) this.publish(runId, false);
  }

  has(runId: number): boolean {
    return this.runs.has(runId);
  }

  private publish(runId: number, stopping: boolean) {
    const run = this.deps.store.getRun(runId);
    if (run) this.deps.bus?.publish({ type: "run_stopping", project_id: run.project_id, run_id: runId, stopping });
  }
}
