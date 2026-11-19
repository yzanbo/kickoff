// 機能のルートが受ける値の束（乗せ替えの途中の仮の形。組み立ては @/app/core/legacy.ts。機能ごとの createX に分けたら消す）
import type { Bus } from "@/foundation/core/bus";
import type { AgentProvider } from "@/features/ai/core/providers/index";
import type { Store } from "@/foundation/core/db/store";
import type { ApprovalCenter } from "@/features/chat/core/approvals";
import type { Runner } from "@/features/chat/core/runner";
import type { UploadStore } from "@/features/attachments/core/uploads";
import type { NoteService } from "@/features/notes/core/notes";
import type { DatabaseService } from "@/features/database/core/service";
import type { SessionsUsedElsewhere } from "@/features/chat/core/sessions/siblingSessions";
import type { UserViewRegistry } from "@/features/userView/core/registry";
import type { RemoteImageService } from "@/features/remoteImages/core/service";
import type { ProviderId } from "@shared/types";

export interface ServerDeps {
  store: Store;
  bus: Bus;
  /** いまの書きかけの返答（chat の段 chatDeltaStage が持つ。チャットの詳細の streaming_text） */
  streamingText(chatId: number): string | null;
  providers: Record<ProviderId, AgentProvider>;
  runner: Runner;
  approvals: ApprovalCenter;
  uploads: UploadStore;
  /** プロジェクトのノート（保存先はプロジェクトの外） */
  notes: NoteService;
  /** DB クライアント（接続の登録・木・テーブル・SQL。DB の処理は別のプロセスの DB ワーカーで動かす） */
  databases: DatabaseService;
  /** チャット欄の外の画像（表示を許可したホストと、取ってきた画像の覚え） */
  remoteImages: RemoteImageService;
  /** 利用者が見ているもの（この Mac の画面のウィンドウごとと、チャットごとの送ったときの様子。AI の get_user_view。userView/registry.ts） */
  userViews: UserViewRegistry;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（どのチャットも使っていない会話記録の一覧から除く。省けば調べない） */
  sessionsElsewhere?: SessionsUsedElsewhere;
}
