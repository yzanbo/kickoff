// 殻の窓口のうち、作業を動かす前の長い準備（新しいチャット・親の会話を写す・AI の切り替えと引き継ぎ）と、AI が予約した移動の取り消し（作業場所の移動は workplaceMove が withIdleChat を呼ぶ）
import { randomUUID } from "node:crypto";
import type { TurnRequest } from "@/features/chat/core/turn";
import { createChat, followupPrompt, type StartChatInput } from "@/features/chat/core/input";
import { holdOf, queuePaused } from "@/features/chat/core/run/machine/state";
import { recordEvent } from "@/features/chat/core/run/record";
import { handoffBlocksSwitch } from "@/features/chat/core/db/chatProviderHandoffs";
import { Conflict } from "@/foundation/core/errors";
import { errorMessage } from "@shared/foundation/errors";
import { providerCan } from "@shared/ai/providers";
import type { ProviderId } from "@shared/settings/types";
import type { Chat } from "@shared/chat/types";
import type { RunShell } from "./shell";
import { withIdleChat } from "./idle";
import type { TurnEndTasks } from "@/features/chat/core/turnEnd";

export function preparations(shell: RunShell, turnEnds: TurnEndTasks) {
  const { deps, runs } = shell;
  const { store } = deps;

  /**
   * 親の会話を写してから動かす（子チャット）。写す間（親の記録が大きいと数十秒）も作業中として数え（送る準備 inherit）、画面には
   * ChatLive.inheriting で「親の会話を引き継いでいます」を出す（写し終えるのを待たずに子チャットを作り、送った発言と作業中の行を出す）。
   * この間の「いま」は預かり、動かし始めたらその作業に伝える。止めたら、写し終えたところで動かさずに中断で終える。
   * 写せなければ、引き継がずに始めることをお知らせに残して動かす
   */
  const inheritThenExecute = (chatId: number, prepare: () => Promise<string>, item: TurnRequest) => {
    const run = runs.get(chatId);
    shell.dispatch(chatId, { type: "begin", why: "inherit" });
    void (async () => {
      let sessionId: string | null = null;
      try {
        sessionId = await prepare();
      } catch (e) {
        if (store.chats.get(chatId)) recordEvent(store, run, { type: "notice", message: `親の会話を引き継げませんでした（${errorMessage(e)}）。会話を引き継がずに始めます` });
      }
      // 写している間にチャットを消した・アプリを終える
      if (!store.chats.get(chatId) || shell.shuttingDown) {
        if (runs.peek(chatId)) shell.dispatch(chatId, { type: "prepared" });
        return;
      }
      if (sessionId) store.chats.update(chatId, { session_id: sessionId });
      void shell.execute(chatId, item, "message", null);
    })();
  };

  /** 送信前の引き継ぎ失敗をやり直す。すでに記録した指示は同じ発言として再開する。 */
  const retryProviderHandoff = async (chatId: number): Promise<{ warning: string | null }> => {
    shell.requireChat(chatId);
    shell.requireIdle(chatId, "AI の引き継ぎの再試行");
    const { providerSwitch: port } = deps;
    const pending = store.chatProviderHandoffs.get(chatId);
    if (!pending || pending.state !== "blocked") throw new Conflict("再試行できる AI の引き継ぎがありません");
    if (!port) throw new Conflict("添付の保存先がないため、引き継ぎを再試行できません");
    // 再試行できたら送信待ちの次を送る（記録した指示を送り直したら、その作業が段階を引き継ぐ）
    return withIdleChat(
      shell,
      chatId,
      "handoff_retry",
      "AI の引き継ぎの再試行",
      async ({ still }) => {
        let claimed = false;
        try {
          const attempt = store.events.list(chatId, { after: pending.eventId, types: ["user"], limit: 1 })[0];
          const prompt = attempt?.type === "user" ? (await followupPrompt(deps, chatId, attempt.data.text, attempt.data.attachments ?? [])).prompt : null;
          const result = await port.retry(chatId, attempt?.type === "user", still);
          claimed = attempt?.type === "user";
          if (attempt?.type === "user" && prompt !== null) {
            store.chats.update(chatId, { status: "running", error: null, unread: false });
            void shell.execute(chatId, { chatId, prompt, promptId: attempt.data.message_uuid, claimedHandoffEventId: pending.eventId }, "message", null);
          }
          return result;
        } catch (error) {
          // 再準備後の失敗でも、元の指示を飛ばして次の待ちを送らない。
          if (claimed) store.chatProviderHandoffs.blockBeforeSend(chatId, pending.eventId, errorMessage(error));
          else store.chatProviderHandoffs.blockReady(chatId, pending.eventId, errorMessage(error));
          throw error;
        }
      },
      { check: false, conflict: "チャットの状態が変わったため、再試行できません", next: (ok) => (ok ? "send_next" : undefined) },
    );
  };

  return {
    retryProviderHandoff,

    /** 新しいチャットを作ってすぐ動かす（親の会話を写すなら、写し終えてから）。作った直後から作業中に数える（最初の発言の下ごしらえの間に送られても、実行を 2 つ並べない） */
    async start(input: StartChatInput): Promise<Chat> {
      let made: number | null = null;
      const begin = (chatId: number) => {
        made = chatId;
        shell.dispatch(chatId, { type: "begin", why: input.prepareSession ? "inherit" : "send" });
      };
      const { chat, prompt, messageUuid } = await createChat(deps, input, begin).catch((e: unknown) => {
        if (made !== null) shell.dispatch(made, { type: "prepared" });
        throw e;
      });
      const item = { chatId: chat.id, prompt, promptId: messageUuid };
      if (input.prepareSession) inheritThenExecute(chat.id, input.prepareSession, item);
      else void shell.execute(chat.id, item, "message", null);
      return store.chats.get(chat.id)!;
    },

    /** 切り替えを排他的に準備する。確認中に送信待ちが変わった場合は古い内容で確定しない。 */
    async switchProvider(chatId: number, expectedProvider: ProviderId, target: ProviderId, requireConfirmation?: () => void): Promise<{ chat: Chat; warning: string | null }> {
      const chat = shell.requireChat(chatId);
      shell.requireIdle(chatId, "AI の切り替え");
      if (chat.provider !== expectedProvider || chat.provider === target || !providerCan(target, "switch") || !providerCan(chat.provider, "switch")) throw new Conflict("チャットの状態が変わったため、AI を切り替えられません");
      const blocked = handoffBlocksSwitch(store.chatProviderHandoffs.get(chatId), chat.provider);
      if (blocked) throw new Conflict(blocked);
      const { providerSwitch: port } = deps;
      if (!port) throw new Conflict("添付の保存先がないため、AI を切り替えられません");
      const run = runs.get(chatId);
      const queueWasPaused = queuePaused(run.run);
      const queuedIds = run.outbox.later.map((message) => message.id);
      return withIdleChat(
        shell,
        chatId,
        "switch_provider",
        "AI の切り替え",
        async ({ still }) => {
          const provider = deps.providers[target];
          const status = await provider.status();
          const auth = await deps.providerKeys?.authFor(target);
          if (!provider.implemented || !status.implemented || !status.installed) throw new Conflict("切り替え先の AI が利用できません");
          if (auth?.mode === "api_key" ? !auth.apiKey : !status.logged_in) throw new Conflict("切り替え先の AI にログインまたは API キーの設定が必要です");
          const requireStable = () => {
            still();
            requireConfirmation?.();
          };
          return port.commit({ chatId, expectedProvider, target, queueWasPaused, queuedIds }, requireStable);
        },
        { check: false, watchQueue: true, conflict: "送信待ちやチャットの状態が変わったため、AI を切り替えられません", next: (ok) => (ok ? "send_next" : undefined) },
      );
    },

    /** 受信不明時に利用者が重複の可能性を承知して再送を選んだ場合だけ実行する。 */
    async confirmResendProviderHandoff(chatId: number, eventId: number): Promise<{ warning: string | null }> {
      shell.requireChat(chatId);
      shell.requireIdle(chatId, "AI の引き継ぎの再送");
      if (!store.chatProviderHandoffs.confirmResend(chatId, eventId)) throw new Conflict("AI の引き継ぎ状態が変わりました。確認し直してください");
      return retryProviderHandoff(chatId);
    },

    /**
     * AI が予約した作業場所の移動を利用者が取り消す（画面・スマホの取り消し。会話にお知らせを残す。予約がなければ 409）。
     * 取り消したことは AI にも伝える: 作業中で足せるなら、いまの作業にその場で足す（次の切れ目で読む）。足せない（作業していない・圧縮の間・入力を閉じた）なら、
     * 知らせのためだけに動かさず、次に送るもの（新しい実行の文脈か、次に伝える発言の頭）に一度だけ添える
     */
    cancelWorkplaceMove(chatId: number) {
      const task = turnEnds.cancel(chatId, "move_workplace");
      if (!task) throw new Conflict("取り消す予約はありません（もう移したか、取り消しました）");
      const run = runs.get(chatId);
      recordEvent(store, run, { type: "notice", message: `AI が予約した「${task.label}へ移る」を取り消しました` });
      const note = task.cancelled?.();
      if (!note) return;
      const told = run.busy && holdOf(run.run) === null && Boolean(run.handle?.control?.tell(note, randomUUID()));
      if (!told) run.pendingNote = note;
    },

    /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ 409） */
    async stopBackgroundTask(chatId: number, taskId: string): Promise<void> {
      const control = runs.get(chatId).handle?.control;
      if (!control) throw new Conflict("このチャットは作業中ではありません");
      await control.stopTask(taskId);
    },
  };
}
