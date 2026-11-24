// チャットの店（chatStore.ts）がサーバーの知らせを当てる（店にあるチャットのものだけ。見る部品がなくても当てる）
import type { BusEvent } from "@shared/foundation/contract";
import { streamingEffectOf } from "@shared/chat/streamingRules";
import { detailChatIdOf, reduceChatDetail, type ChatDetailState } from "./chatDetail";
import type { createStreamOps } from "./chatStream";
import type { Entry, Published } from "./chatStoreTypes";

interface ApplyDeps {
  entries: ReadonlyMap<number, Entry>;
  now: () => number;
  stream: ReturnType<typeof createStreamOps>;
  load: (e: Entry, all?: boolean) => Promise<void>;
  mark: (e: Entry, channel: Published) => void;
  changed: (e: Entry, prev: ChatDetailState) => void;
}

export function createApply({ entries, now, stream, load, mark, changed }: ApplyDeps) {
  return (event: BusEvent): void => {
    if (event.type === "chat_subagent") {
      const e = entries.get(event.chat_id);
      if (!e) return;
      // 作業 ID ごとに覚える（再開すると呼び出し ID が変わるため。行へのまとめ方は collectSubagents が決める）
      const at = new Date(now()).toISOString();
      e.progress = { progress: { ...e.progress.progress, [event.subagent.task_id]: event.subagent }, progressAt: { ...e.progress.progressAt, [event.subagent.task_id]: at } };
      mark(e, "progress");
      return;
    }
    // 書いている途中の返答を足す・消す（スマホ・コアと同じ決まり）。中身を読む前は、読めたあとに当て直す分として積むだけ
    const effect = streamingEffectOf(event);
    const id = effect?.chatId ?? detailChatIdOf(event);
    const e = id === null ? undefined : entries.get(id);
    if (!e) return;
    e.replay?.push(event);
    if (!e.loaded) return;
    // 途中の文を先に消してから記録を足す（同じ差し替えで、確定した返答が入り途中の文が消える）
    if (effect) stream.apply(e, effect);
    if (event.type === "chat_delta") return;
    // 末尾より前で巻き戻した: 索引が作り直しになるので、末尾から読み直す
    if (event.type === "chat_events_deleted" && e.detail.range.tailStart > 0 && event.from_event_id < e.detail.range.tailStart && e.replay === null) {
      void load(e, true);
      return;
    }
    // チャット自身は知っているチャットが直す（ここでは見せ直すだけ）
    if (event.type === "chat") return mark(e, "detail");
    const prev = e.detail;
    e.detail = reduceChatDetail(prev, event, e.chatId);
    changed(e, prev);

  };
}
