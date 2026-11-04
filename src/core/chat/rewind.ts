import type { AgentProvider } from "../providers/types.js";
import type { Runner } from "./runner.js";
import type { Store } from "../db/store.js";
import type { Attachment, FileRewindResult, ProviderId, Run, RunOptions } from "@shared/types";

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
 * 添付は元の発言のものを引き継ぐ。restoreFiles なら、分岐する前にファイルもその発言を送る前の状態に戻す（rewindFiles。
 * ファイルの記録は元のセッションにあるため、先に戻す）。
 * 作業中なら RunBusyError（409）、巻き戻せない発言・プロバイダー・ファイルを戻せないなら Error（400）を投げる
 */
export async function rewindRun(
  deps: { store: Store; runner: Runner; providers: Record<ProviderId, AgentProvider> },
  run: Run,
  input: { eventId: number; text: string; options: RunOptions; cwd: string; restoreFiles?: boolean },
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
  // ファイルも戻す: 分岐すると新しいセッションになり、ファイルの記録は元のセッションにしか残らないので先に戻す
  const restored = input.restoreFiles ? await rewindFiles(deps, run, { eventId: target.id, cwd: input.cwd, dryRun: false }) : undefined;
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
  store.addEvent(run.id, {
    type: "notice",
    message: restored
      ? `この発言から巻き戻して送り直しました（ファイルもこの発言を送る前の状態に戻しました: ${restoredSummary(restored)}）`
      : "この発言から巻き戻して送り直しました（ファイルの変更は戻していません）",
  });
  return runner.send(run.id, input.text, input.options, attachments);
}

/** 戻したファイル（「2 個のファイル: README.md、a.ts」。多ければ頭の 5 個） */
function restoredSummary(r: FileRewindResult): string {
  const names = (r.filesChanged ?? []).map((p) => p.slice(p.lastIndexOf("/") + 1));
  if (names.length === 0) return "変わったファイルはありませんでした";
  return `${names.length} 個のファイル: ${names.slice(0, 5).join("、")}${names.length > 5 ? " ほか" : ""}`;
}

/**
 * ファイルを、自分の発言を送る前の状態に戻す（会話はそのまま）。dryRun なら戻さずに、変わるファイルと行の増減だけを返す。
 * 戻せるのは、ファイルの記録を取り始めてから送った発言（記録の message_uuid があるもの）で、Claude Code の編集のツールで変えたファイルだけ
 * （コマンドで変えたもの・アプリの外で変えたものは戻らない）。戻したら、チャットにお知らせを残す。
 * 作業中なら RunBusyError（409）、戻せない発言・プロバイダーなら Error（400）
 */
export async function rewindFiles(
  deps: { store: Store; runner: Runner; providers: Record<ProviderId, AgentProvider> },
  run: Run,
  input: { eventId: number; cwd: string; dryRun: boolean },
): Promise<FileRewindResult> {
  const { store, runner, providers } = deps;
  if (runner.isBusy(run.id)) throw new RunBusyError();
  const target = store.listEvents(run.id).find((e) => e.id === input.eventId);
  if (target?.type !== "user") throw new Error("自分の発言のところからだけ戻せます");
  const messageId = (target.data as { message_uuid?: string }).message_uuid;
  const provider = providers[run.provider];
  if (!provider.rewindFiles) throw new Error(`${provider.label} はファイルを戻すのに対応していません`);
  if (!messageId || !run.session_id) throw new Error("この発言のときのファイルの記録がないため、ファイルは戻せません（戻せるのは、この機能を入れたあとに送った発言からです）");
  // 本当に戻したときの結果には、変わったファイルが付かないので、先に量を測っておく
  const preview = await provider.rewindFiles(run.session_id, messageId, input.cwd, true);
  if (!preview.canRewind) throw new Error(`ファイルを戻せませんでした${preview.error ? `: ${preview.error}` : ""}`);
  if (input.dryRun) return preview;
  const done = await provider.rewindFiles(run.session_id, messageId, input.cwd, false);
  if (!done.canRewind) throw new Error(`ファイルを戻せませんでした${done.error ? `: ${done.error}` : ""}`);
  const result = { ...preview, ...done, filesChanged: preview.filesChanged, insertions: preview.insertions, deletions: preview.deletions };
  store.addEvent(run.id, { type: "notice", message: `ファイルを、この発言を送る前の状態に戻しました（${restoredSummary(result)}。会話はそのまま）` });
  return result;
}

