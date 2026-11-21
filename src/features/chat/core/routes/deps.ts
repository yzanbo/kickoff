// チャットのルートが受ける値（createChat が組む。チャットより上の機能の口は、使う形だけを書くか ExecutionDeps から引く）
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
  /** 利用者が見ているもの（チャットごとの送ったときの様子） */
  userViews: NonNullable<ExecutionDeps["userViews"]>;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（どのチャットも使っていない会話記録の一覧から除く。省けば調べない） */
  sessionsElsewhere?: SessionsUsedElsewhere;
  trashBin: TrashApi;
  /** 作業場所の移動の確かめと、新しいワークツリーの実行環境 */
  worktreeEnvs: NonNullable<ShellUpperDeps["worktreeEnvs"]>;
  /** 片付けを予約したワークツリー */
  worktreeFinisher: { reservedFolders(): Set<string> };
  terminals: NonNullable<ExecutionDeps["terminals"]>;
  /** 分岐したチャットに外の画像の覚えを写す */
  remoteImages: { copyChat(fromChatId: number, toChatId: number): Promise<void> };
}
