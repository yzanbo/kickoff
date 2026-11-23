import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { ChatRunner } from "@/features/chat/core/run/runner";
import type { ChatStoreDeps } from "./stores";
import { providerFeatureMissing, type FileRewindResult } from "@shared/ai/types";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Chat, ChatOptionsPatch } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import { lockedBefore } from "@shared/chat/boundaries";
import { asInvalid, Invalid } from "@/foundation/core/errors";
import { forkFrom, resumePointBefore, sessionAt } from "./sessionPoints";

type RewindDeps = { store: Pick<ChatStoreDeps, "chats" | "events" | "projects">; runner: ChatRunner; providers: Record<ProviderId, AgentProvider> };

/** 区切り（作業場所の移動・AI の切り替え）の手前の発言なら断る（会話もファイルも戻せない） */
function requireUnlocked(events: ChatEvent[], eventId: number, action: "rewind" | "files") {
  const locked = lockedBefore(events, eventId, action);
  if (locked) throw new Invalid(locked);
}

/**
 * チャットを、自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す。
 * その発言より前の、いちばん近い作業の終わり（result イベントの session_id / message_id）から会話を分岐して新しいセッションにし
 * （なければ最初の発言なので、セッションを空にして最初から）、その発言から後ろの記録を消してから、ふつうの送信と同じ流れで送る。
 * 添付は元の発言のものを引き継ぐ。restoreFiles なら、分岐する前にファイルもその発言を送る前の状態に戻す（rewindFiles。
 * ファイルの記録は元のセッションにあるため、先に戻す）。分岐している間も作業中に数え（withIdleChat）、確かめ直しで断ったら記録を消さない。
 * 作業中なら 409、巻き戻せない発言・プロバイダー・ファイルを戻せないなら 400
 */
export async function rewindChat(deps: RewindDeps, chat: Chat, input: { eventId: number; text: string; options: ChatOptionsPatch; cwd: string; restoreFiles?: boolean }): Promise<Chat> {
  const { store, runner, providers } = deps;
  runner.requireIdle(chat.id, "巻き戻し");
  const events = store.events.list(chat.id);
  const index = events.findIndex((e) => e.id === input.eventId);
  const target = events[index];
  if (target?.type !== "user") throw new Invalid("自分の発言のところからだけ巻き戻せます");
  requireUnlocked(events, target.id, "rewind");
  const attachments = target.data.attachments ?? [];
  if (!input.text && attachments.length === 0) throw new Invalid("メッセージか添付ファイルが必要です");

  return runner.withIdleChat(
    chat.id,
    "send",
    "巻き戻し",
    async ({ still, release }) => {
      // その発言より前の、いちばん近い、最後まで終わった作業の終わり（分岐できる時点）。なければ（間でコンテキストを消去していても）最初から
      const point = resumePointBefore(events, index);
      // ファイルも戻す: 分岐すると新しいセッションになり、ファイルの記録は元のセッションにしか残らないので先に戻す
      const restored = input.restoreFiles ? await restoreFiles(deps, chat, events, index, { cwd: input.cwd, dryRun: false }) : undefined;
      const sessionId = point?.session_id && point.message_id ? await forkFrom(providers[chat.provider], { session_id: point.session_id, message_id: point.message_id }, input.cwd) : null;
      // 分岐している間に状態が変わっていたら、記録を消さずにやめる
      still();
      release();
      runner.clearQueued(chat.id);
      store.events.deleteFrom(chat.id, target.id);
      // コンテキストの大きさは、次の応答まで分からない
      store.chats.update(chat.id, { session_id: sessionId, context_tokens: null });
      store.events.add(chat.id, {
        type: "notice",
        message: restored
          ? `この発言から巻き戻して送り直しました（ファイルもこの発言を送る前の状態に戻しました: ${restoredSummary(restored)}）`
          : "この発言から巻き戻して送り直しました（ファイルの変更は戻していません）",
      });
      return (await runner.message(chat.id, { text: input.text, options: input.options, attachments })).chat;
    },
    { check: false, conflict: "作業中のチャットは巻き戻しできません。終わってから（または中断してから）行ってください" },
  );
}

/** 戻したファイル（「2 個のファイル: README.md、a.ts」。多ければ頭の 5 個） */
function restoredSummary(r: FileRewindResult): string {
  const names = (r.files_changed ?? []).map((p) => p.slice(p.lastIndexOf("/") + 1));
  if (names.length === 0) return "変わったファイルはありませんでした";
  return `${names.length} 個のファイル: ${names.slice(0, 5).join("、")}${names.length > 5 ? " ほか" : ""}`;
}

/**
 * ファイルを、自分の発言を送る前の状態に戻す（会話はそのまま）。dryRun なら戻さずに、変わるファイルと行の増減だけを返す。
 * 戻せるのは、Claude Code の編集のツールで変えたファイルだけ
 * （コマンドで変えたもの・アプリの外で変えたものは戻らない）。戻したら、チャットにお知らせを残す。
 * 作業中なら 409、戻せない発言・プロバイダーなら 400
 */
export async function rewindFiles(deps: RewindDeps, chat: Chat, input: { eventId: number; cwd: string; dryRun: boolean }): Promise<FileRewindResult> {
  deps.runner.requireIdle(chat.id, "巻き戻し");
  const events = deps.store.events.list(chat.id);
  return restoreFiles(deps, chat, events, events.findIndex((e) => e.id === input.eventId), input);
}

/** events[index] の自分の発言を送る前の状態にファイルを戻す（rewindFiles の中身。作業中かは呼ぶ側が確かめる） */
async function restoreFiles(deps: RewindDeps, chat: Chat, events: ChatEvent[], index: number, input: { cwd: string; dryRun: boolean }): Promise<FileRewindResult> {
  const { store, providers } = deps;
  const target = events[index];
  if (target?.type !== "user") throw new Invalid("自分の発言のところからだけ戻せます");
  // 作業場所を移す前の発言は、ファイルの控えが元の作業場所のファイルを指すので戻さない
  requireUnlocked(events, target.id, "files");
  const provider = providers[chat.provider];
  if (!provider.rewindFiles) throw new Invalid(providerFeatureMissing(provider.label, "rewind_files"));
  // ファイルの記録は、その発言を送ったセッションにある（あとでコンテキストを消去していれば、消去の前のセッション）
  const sessionId = sessionAt(events, index, chat.session_id);
  if (!sessionId) throw new Invalid("この発言のときのファイルの記録がないため、ファイルは戻せません");
  const messageId = target.data.message_uuid;
  // 本当に戻したときの結果には、変わったファイルが付かないので、先に量を測っておく
  const preview = await provider.rewindFiles(sessionId, messageId, input.cwd, true).catch(asInvalid);
  if (!preview.can_rewind) throw new Invalid(rewindFailure(preview.error));
  if (input.dryRun) return preview;
  const done = await provider.rewindFiles(sessionId, messageId, input.cwd, false).catch(asInvalid);
  if (!done.can_rewind) throw new Invalid(rewindFailure(done.error));
  const result = { ...preview, ...done, files_changed: preview.files_changed, insertions: preview.insertions, deletions: preview.deletions };
  store.events.add(chat.id, { type: "notice", message: `ファイルを、この発言を送る前の状態に戻しました（${restoredSummary(result)}。会話はそのまま）` });
  return result;
}

/**
 * ファイルを戻せなかったときの文。その発言のファイルの控えが会話記録にない（Claude Code の「No file checkpoint」）ときは、
 * 長いチャットを直近の区切りだけに乗り換えたあと（sessionSwitch.ts）の古い発言かもしれないことを添える
 */
export function rewindFailure(error: string | undefined): string {
  const base = `ファイルを戻せませんでした${error ? `: ${error}` : ""}`;
  return error && /no file checkpoint/i.test(error)
    ? `${base}（この発言のファイルの控えが会話記録にありません。長いチャットは圧縮のあと直近 3 区切りの会話記録に乗り換えるので、それより前の発言へはファイルを戻せません）`
    : base;
}
