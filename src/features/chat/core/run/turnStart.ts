// 殻の命令のうち、文を組み立ててから行うもの: 作業を動かす（start_turn）・いまの作業に「いま」を足す（tell）
import { randomUUID } from "node:crypto";
import { takePendingNote } from "@/features/chat/core/turn";
import { followupPrompt, nameOnFirstMessage } from "@/features/chat/core/input";
import type { Effect } from "@/features/chat/core/run/machine/types";
import { recordEvent } from "@/features/chat/core/run/record";
import { errorMessage } from "@shared/foundation/errors";
import { manualPreCompactMessage, postCompactMessage } from "@shared/chat/prompts";
import { marksOf } from "@shared/chat/handoff";
import type { ChatRun } from "./chatRun";
import type { RunShell } from "./shell";

/** 作業を動かす（指示なら文を組み立てて発言を記録してから。組み立てられなければ送信待ちの次へ進み、送った所に理由を返す・残す） */
export async function startTurn(shell: RunShell, chatId: number, run: ChatRun, effect: Extract<Effect, { do: "start_turn" }>): Promise<void> {
  const { store } = shell.deps;
  if (effect.turn === "compact" || effect.turn === "pre_compact") {
    store.chats.update(chatId, { status: "running", error: null });
    if (effect.turn === "compact") return void shell.execute(chatId, { chatId, prompt: "/compact", compact: true, ...(effect.trigger ? { compactTrigger: effect.trigger } : {}) }, "compact", effect.trigger ?? "manual");
    // この指示の作業の途中で自動の圧縮が来ても、もう足さない（記録から導く preCompactSent）。圧縮が終わるまで「いま」は預かる
    const messageUuid = randomUUID();
    recordEvent(store, run, { type: "user", text: effect.text!, pre_compact: true, message_uuid: messageUuid });
    return void shell.execute(chatId, { chatId, prompt: manualPreCompactMessage(effect.text!), promptId: messageUuid }, "pre_compact", "manual");
  }
  const m = effect.item!;
  const post = effect.turn === "post_compact";
  let prepared: Awaited<ReturnType<typeof followupPrompt>>;
  try {
    prepared = await followupPrompt(shell.deps, chatId, post ? postCompactMessage(m.text) : m.text, m.attachments);
  } catch (e) {
    // 送れなかった間に届いた指示（待ちの列）は取り残さない
    shell.dispatch(chatId, { type: "prepared", next: "send_next" });
    if (effect.from !== "user") store.events.add(chatId, { type: "error", message: `${effect.from === "queue" ? "待ちの指示を送れませんでした" : "圧縮のあとに指示を送れませんでした"}: ${errorMessage(e)}` });
    throw e;
  }
  // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（自動の再開から送ったときは続ける）。起動したときの再開の確かめで、作業を続けるかも聞かない
  shell.dispatch(chatId, { type: "forget_recovery" });
  shell.dispatch(chatId, { type: "forget_interrupted" });
  const messageUuid = randomUUID();
  // 聞かずに開いた子チャット（名前も発言もない）は、最初に送った文から名前を付ける
  if (!post) nameOnFirstMessage(shell.deps, chatId, m.text, m.attachments);
  recordEvent(store, run, { type: "user", text: m.text, ...(m.attachments.length ? { attachments: m.attachments } : {}), ...prepared.handover, ...(post ? { post_compact: true } : {}), ...marksOf(m), message_uuid: messageUuid });
  // チャット欄でモデルや権限モードを変えた場合は、この続きから反映する
  store.chats.update(chatId, { status: "running", error: null, unread: false, ...m.options });
  void shell.execute(chatId, { chatId, prompt: prepared.prompt, promptId: messageUuid }, effect.turn, null, effect.pauseAfter);
}

/**
 * いまの作業に「いま」を足す（文を組み立ててから。組み立てている間に作業が終わった・足せなくなった・次の命令が出たら足さない = 行は預かりに残る）。
 * まだ AI に伝えていない Kickoff からの知らせ（作業場所を移す予約の取り消しなど）があれば、頭に一度だけ添える
 */
export async function tellItem(shell: RunShell, chatId: number, run: ChatRun, { turnId, item }: Extract<Effect, { do: "tell" }>) {
  const { store } = shell.deps;
  const seq = ++run.tellSeq;
  const post = item.post_compact === true;
  const stale = () => {
    const { phase } = run.run;
    return seq !== run.tellSeq || phase.kind !== "turn" || phase.id !== turnId || phase.telling !== item.id;
  };
  let prepared: Awaited<ReturnType<typeof followupPrompt>>;
  try {
    prepared = await followupPrompt(shell.deps, chatId, post ? postCompactMessage(item.text) : item.text, item.attachments);
  } catch (e) {
    if (stale()) return;
    store.events.add(chatId, { type: "error", message: `圧縮のあとに指示を伝えられませんでした: ${errorMessage(e)}` });
    return void shell.dispatch(chatId, { type: "tell_result", id: item.id, ok: false, drop: true });
  }
  if (stale()) return;
  const messageUuid = randomUUID();
  const note = post ? null : run.pendingNote;
  const ok = Boolean(run.handle?.control?.tell(note ? `${note}\n\n${prepared.prompt}` : prepared.prompt, messageUuid));
  if (ok) {
    if (note && run.pendingNote === note) takePendingNote(run);
    // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（起動したときの再開の確かめで、作業を続けるかも聞かない）
    if (!post) {
      shell.dispatch(chatId, { type: "forget_recovery" });
      shell.dispatch(chatId, { type: "forget_interrupted" });
    }
    recordEvent(store, run, { type: "user", text: item.text, ...(item.attachments.length ? { attachments: item.attachments } : {}), ...prepared.handover, ...(post ? { post_compact: true } : {}), ...marksOf(item), message_uuid: messageUuid });
    if (!post && store.chats.get(chatId)?.unread) store.chats.setUnread(chatId, false);
    shell.markTold(chatId, item.id);
  }
  shell.dispatch(chatId, { type: "tell_result", id: item.id, ok });
}
