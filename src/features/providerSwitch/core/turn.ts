// AI の切り替えが 1 回の実行に足すもの（contributor "providerSwitch"・order 40）: 切り替えたあとの最初の指示に引き継ぎの資料を添え（ほかの文脈のあと）、
// 動かす直前に送信中の印を取る。前の AI のセッションが消えていたと確定したら、会話を作り直して新しいセッションでもう 1 回動かす。
// 作業の終わりに、届いたら引き継ぎを外し、送ったあとの失敗・中断は受信不明に、送る前に止まったら再試行待ちにする（集める前に失敗・中断したときも）
import type { ProviderTurnResult } from "@/features/ai/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import { appendSections, type Store, type TurnContributor } from "@/features/chat/core/index";
import { errorMessage } from "@shared/foundation/errors";
import { retryProviderHandoffPreparation } from "./providerSwitch";

/** この作業の引き継ぎ（始めたときの保留と、送信中の印を取ったか）を置く作業の値の鍵 */
const HANDOFF_KEY = "providerSwitch.handoff";
type HandoffTurn = { handoff: ReturnType<Store["chatProviderHandoffs"]["get"]>; claimed: boolean };

export function handoffTurnParts(d: { store: Store; uploads?: UploadStore }): TurnContributor {
  const { store } = d;
  return {
    name: "providerSwitch",
    order: 40,
    contribute({ chat, request, signal, perTurn, record }) {
      const turn = perTurn<HandoffTurn>(HANDOFF_KEY, () => ({ handoff: store.chatProviderHandoffs.get(chat.id), claimed: false }));
      const { handoff } = turn;
      if (!handoff) return null;
      const claimedEventId = request.claimedHandoffEventId;
      if (request.compact || (handoff.state !== "ready" && !(handoff.state === "sending" && handoff.eventId === claimedEventId)) || handoff.provider !== chat.provider) throw new Error("AI の引き継ぎを確認するまで、この操作はできません");
      return {
        around: async (run): Promise<ProviderTurnResult> => {
          if (claimedEventId === handoff.eventId) {
            const current = store.chatProviderHandoffs.get(chat.id);
            if (!current || current.eventId !== handoff.eventId || current.provider !== chat.provider || current.state !== "sending") throw new Error("AI の引き継ぎ状態が変わったため、送信を中止しました");
          } else if (!store.chatProviderHandoffs.claim(chat.id, handoff.eventId, chat.provider)) throw new Error("AI の引き継ぎ状態が変わったため、送信を中止しました");
          turn.claimed = true;
          const first = await run((p) => ({ ...p, turnContext: appendSections(p.turnContext, handoff.context) }));
          if (!first.resumeSessionMissing || first.status !== "failed" || !chat.session_id || first.sessionId !== chat.session_id || signal.aborted) return first;
          // 「再開要求の段階で履歴がない」と確定した場合は、まだ利用者の指示は送られていない。
          if (!store.providerSwitch.markSessionMissing(chat.id, handoff.eventId, chat.provider, chat.session_id)) throw new Error("AI のセッション状態が変わったため再開を中止しました");
          turn.claimed = false;
          record({ type: "notice", message: "以前の AI のセッションが見つからなかったため、新しいセッションを作ります。以前のセッションにしかない文脈は引き継げません。" });
          if (!d.uploads) throw new Error("添付の保存先がないため、会話の引き継ぎを準備できません");
          // 再準備と送信中の印を同時に保存する。終了が割り込んでも、元の指示を飛ばして次へ進まない。
          const retry = await retryProviderHandoffPreparation({ store, uploads: d.uploads, requireIdle: () => {} }, chat.id, true);
          turn.claimed = true;
          if (retry.warning) record({ type: "notice", message: retry.warning });
          if (signal.aborted) throw new Error("新しいセッションの準備中に中断しました");
          const prepared = store.chatProviderHandoffs.get(chat.id);
          if (!prepared || prepared.eventId !== handoff.eventId || prepared.state !== "sending") throw new Error("AI の引き継ぎ状態が変わったため再開を中止しました");
          return await run((p) => ({ ...p, resumeSessionId: null, turnContext: appendSections(p.turnContext, prepared.context) }));
        },
      };
    },
    async afterTurn({ chatId, request, status, sessionId, error, perTurn }) {
      // 集める前に失敗・中断したときは、始めたときの保留を読む（送信中の印はまだ取っていない）
      const { handoff, claimed } = perTurn<HandoffTurn>(HANDOFF_KEY, () => ({ handoff: store.chatProviderHandoffs.get(chatId), claimed: false }));
      if (!handoff) return;
      if (claimed && status === "completed" && sessionId) {
        const last = store.events.recent(chatId, 1)[0];
        let delivered: boolean;
        try {
          delivered = last?.type === "result" && store.providerSwitch.complete(chatId, handoff.eventId, handoff.provider, sessionId);
        } catch (e) {
          // 引き継ぎを外せなかったら受信不明にして、その作業を失敗にする
          store.chatProviderHandoffs.markUncertain(chatId, handoff.eventId, errorMessage(e));
          throw e;
        }
        if (!delivered) store.chatProviderHandoffs.markUncertain(chatId, handoff.eventId, "AI の引き継ぎ完了を確認できませんでした");
      } else if (claimed) {
        store.chatProviderHandoffs.markUncertain(chatId, handoff.eventId, error ?? "AI が指示を受け取ったか確認できません");
      } else {
        const reason = error ?? "AI に引き継ぐ前に作業が止まりました";
        if (request.claimedHandoffEventId === handoff.eventId) store.chatProviderHandoffs.blockBeforeSend(chatId, handoff.eventId, reason);
        else store.chatProviderHandoffs.blockReady(chatId, handoff.eventId, reason);
      }
    },
  };
}
