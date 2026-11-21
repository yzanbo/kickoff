// チャットのルートが受ける値（createChat が組む。チャットより上の機能の口は、使う形だけを書く）
import type { Context } from "hono";
import type { Bus } from "@/foundation/core/bus";
import type { Store } from "@/features/chat/core/stores";
import type { AiApi } from "@/features/ai/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import type { ApprovalCenter } from "@/features/chat/core/approvals";
import type { ChatRunner } from "@/features/chat/core/run/runner";
import type { SessionsUsedElsewhere } from "@/features/chat/core/sessions/siblingSessions";
import type { ChatAttachments, ProviderHandoffPort } from "@/features/chat/core/ports";
import type { WorkplaceKit } from "@/foundation/core/workplace/kit";

export interface ChatRouteDeps {
  store: Store;
  bus: Bus;
  /** いまの書きかけの返答（chat の段 chatDeltaStage が持つ。チャットの詳細の streaming_text） */
  streamingText(chatId: number): string | null;
  providers: AiApi["providers"];
  runner: ChatRunner;
  approvals: ApprovalCenter;
  /** AI を替えたあとの引き継ぎ（チャットが覚えている離れた AI のセッション） */
  providerHandoff: ProviderHandoffPort;
  /** 添付の口（回答に添付のパスを書き添える） */
  attachments: ChatAttachments;
  /** 送る指示を受けた（本文の user_view と、この Mac の画面から送ったか。上の機能が onUserSend で聞く） */
  userSent(c: Context, chatId: number, userView: unknown): void;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（どのチャットも使っていない会話記録の一覧から除く。省けば調べない） */
  sessionsElsewhere?: SessionsUsedElsewhere;
  trashBin: TrashApi;
  /** ワークツリーを作る人（新しいチャットの new_worktree_branch。作業場所の土台） */
  workplace: Pick<WorkplaceKit, "creator">;
}
