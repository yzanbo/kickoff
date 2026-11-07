import type { Chat, HandoffBody, HandoffResult } from "@shared/types";
import { UNTITLED_CHAT_TITLE } from "@shared/types";
import { lastReplyOfTurn } from "@shared/chat/handoff";
import type { Store } from "../db/store.js";
import type { Runner } from "./runner.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";

/**
 * 子チャットの作業の最後の返答を、直接の親チャットに渡す（引用・見出しは付けず、返答のまま）。via:
 * composer = 親の入力欄に入れる（入れるのは画面。ここは渡す文を返して記録するだけ）/ send = 今すぐ送る（親が作業していなければ送り、作業中なら伝える）/
 * queue = 親の送信待ちの最後に足す（作業していなくても送らない）。親の発言には出どころ handoff_from を付け、子には渡したことの記録 handoff を残す。
 * 親のないチャット・最後まで終わっていない作業・返答のない作業は 400、親が見つからなければ 404、親がアーカイブ済みなら 409
 */
export async function handOffToParent(deps: { store: Store; runner: Runner }, child: Chat, { via, turn_event_id }: HandoffBody): Promise<HandoffResult> {
  const { store, runner } = deps;
  if (child.parent_chat_id === null) throw new Invalid("親チャットのないチャットからは渡せません");
  const parent = store.chats.get(child.parent_chat_id);
  if (!parent) throw new NotFound("親チャットが見つかりません");
  if (parent.archived_at) throw new Conflict("親チャットはアーカイブされています（戻してから渡してください）");
  const events = store.events.list(child.id);
  const end = events.find((e) => e.id === turn_event_id);
  if (end?.type !== "result") throw new Invalid("作業の終わりのところからだけ渡せます");
  if (end.data.status !== "completed") throw new Invalid("止めた・失敗した作業の返答は渡せません");
  const text = lastReplyOfTurn(events, turn_event_id);
  if (text === null) throw new Invalid("この作業には渡す返答がありません");
  const marks = { handoff_from: { chat_id: child.id, title: child.title || UNTITLED_CHAT_TITLE } };
  let sent: HandoffResult["sent"] = null;
  if (via === "send") sent = await runner.tell(parent.id, text, {}, [], { marks });
  else if (via === "queue") {
    await runner.queueMessage(parent.id, text, {}, [], { hold: true, marks });
    sent = "queued";
  }
  store.events.add(child.id, { type: "handoff", via, parent_chat_id: parent.id, turn_event_id });
  return { text, parent_chat_id: parent.id, sent };
}
