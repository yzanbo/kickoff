// チャットのルートが受ける値（createChat が組む。チャットより上の機能の口は、使う形だけを書くか ExecutionDeps から引く）
import type { Context } from "hono";
import type { Bus } from "@/foundation/core/bus";
import type { Store } from "@/features/chat/core/stores";
import type { AiApi } from "@/features/ai/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import type { ApprovalCenter } from "@/features/chat/core/approvals";
import type { ChatRunner } from "@/features/chat/core/run/runner";
import type { SessionsUsedElsewhere } from "@/features/chat/core/sessions/siblingSessions";
import type { ExecutionDeps, ShellUpperDeps } from "@/features/chat/core/turn";

export interface ChatRouteDeps {
  store: Store;
  bus: Bus;
  /** いまの書きかけの返答（chat の段 chatDeltaStage が持つ。チャットの詳細の streaming_text） */
  streamingText(chatId: number): string | null;
  providers: AiApi["providers"];
  runner: ChatRunner;
  approvals: ApprovalCenter;
  uploads: NonNullable<ExecutionDeps["uploads"]>;
  /** 送る指示を受けた（本文の user_view と、この Mac の画面から送ったか。上の機能が onUserSend で聞く） */
  userSent(c: Context, chatId: number, userView: unknown): void;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（どのチャットも使っていない会話記録の一覧から除く。省けば調べない） */
  sessionsElsewhere?: SessionsUsedElsewhere;
  trashBin: TrashApi;
  /** 作業場所の移動の確かめと、新しいワークツリーの実行環境 */
  worktreeEnvs: NonNullable<ShellUpperDeps["worktreeEnvs"]>;
  /** 片付けを予約したワークツリー */
  terminals: NonNullable<ShellUpperDeps["terminals"]>;
  /** 分岐したチャットに外の画像の覚えを写す */
  remoteImages: { copyChat(fromChatId: number, toChatId: number): Promise<void> };
}
