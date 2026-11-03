import type { AgentProvider } from "./providers/types.js";
import type { Runner } from "./runner.js";
import type { Store } from "./store.js";
import type { Attachment, ProviderId, Run, RunOptions } from "./types.js";

/** 作業中なので巻き戻せない（ルートで 409） */
export class RunBusyError extends Error {
  constructor() {
    super("作業中は巻き戻せません。終わってから（または中断してから）行ってください");
  }
}

/**
 * チャットを、自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す。
 * その発言より前の、いちばん近い作業の終わり（result イベントの session_id / message_id）から会話を分岐して新しいセッションにし
 * （なければ最初の発言なので、セッションを空にして最初から）、その発言から後ろの記録を消してから、ふつうの送信と同じ流れで送る。
 * 添付は元の発言のものを引き継ぐ。ファイルの変更は戻さない。
 * 作業中なら RunBusyError（409）、巻き戻せない発言・プロバイダーなら Error（400）を投げる
 */
export async function rewindRun(
  deps: { store: Store; runner: Runner; providers: Record<ProviderId, AgentProvider> },
  run: Run,
  input: { eventId: number; text: string; options: RunOptions; cwd: string },
): Promise<Run> {
  const { store, runner, providers } = deps;
  if (runner.isBusy(run.id)) throw new RunBusyError();
  const events = store.listEvents(run.id);
  const index = events.findIndex((e) => e.id === input.eventId);
  const target = events[index];
  if (target?.type !== "user") throw new Error("自分の発言のところからだけ巻き戻せます");
  const attachments = (target.data as { attachments?: Attachment[] }).attachments ?? [];
  if (!input.text && attachments.length === 0) throw new Error("メッセージか添付ファイルが必要です");

  // その発言より前の、いちばん近い、最後まで終わった作業の終わり（分岐できる時点）。なければ最初から。
  // 止めた・失敗した作業の終わりの message_id はセッションに残っていないことがあり、そこからは分岐できないので飛ばす
  const point = events
    .slice(0, index)
    .reverse()
    .map((e) => (e.type === "result" ? (e.data as { status?: string; session_id?: string; message_id?: string }) : undefined))
    .find((d) => d?.status === "completed" && d.session_id && d.message_id);
  let sessionId: string | null = null;
  if (point) {
    const provider = providers[run.provider];
    if (!provider.fork) throw new Error(`${provider.label} は巻き戻しに対応していません`);
    sessionId = await provider.fork(point.session_id!, point.message_id!, input.cwd);
  }
  // 分岐している間に送られていたら、記録を消さずにやめる
  if (runner.isBusy(run.id)) throw new RunBusyError();

  runner.clearQueued(run.id);
  store.deleteEventsFrom(run.id, target.id);
  // コンテキストの大きさは、次の応答まで分からない
  store.updateRun(run.id, { session_id: sessionId, context_tokens: null });
  store.addEvent(run.id, { type: "notice", message: "この発言から巻き戻して送り直しました（ファイルの変更は戻していません）" });
  return runner.send(run.id, input.text, input.options, attachments);
}
