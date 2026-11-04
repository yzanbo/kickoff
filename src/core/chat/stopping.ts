import type { Bus } from "../bus.js";
import type { Store } from "../db/store.js";

/**
 * 止めるよう頼んで、まだ終わっていないチャット（Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで。
 * ふつうは 2 秒ほど、応じなければ SDK が 5 秒後に強制終了する）。画面はこの間、停止ボタンを「停止中…」にする（SSE の chat_stopping と詳細の stopping）
 */
export class ChatStopping {
  private readonly chats = new Set<number>();

  constructor(private readonly deps: { store: Store; bus?: Bus }) {}

  /** 止めるよう頼んだ（2 回目以降は知らせない） */
  begin(chatId: number) {
    if (this.chats.has(chatId)) return;
    this.chats.add(chatId);
    this.publish(chatId, true);
  }

  /** 作業が終わった（止めるよう頼んでいなければ何もしない） */
  end(chatId: number) {
    if (this.chats.delete(chatId)) this.publish(chatId, false);
  }

  has(chatId: number): boolean {
    return this.chats.has(chatId);
  }

  private publish(chatId: number, stopping: boolean) {
    const chat = this.deps.store.getChat(chatId);
    if (chat) this.deps.bus?.publish({ type: "chat_stopping", project_id: chat.project_id, chat_id: chatId, stopping });
  }
}
