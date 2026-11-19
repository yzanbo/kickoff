// 機能のルートが受ける値の束（乗せ替えの途中の仮の形。組み立ては @/app/core/legacy.ts。機能ごとの createX に分けたら消す）
import type { Bus } from "@/foundation/core/bus";
import type { AgentProvider } from "@/features/ai/core/providers/index";
import type { Store } from "@/foundation/core/db/store";
import type { ServiceUsageMonitor } from "@/features/ai/core/usage/services/index";
import type { UsageMonitor } from "@/features/ai/core/usage/planUsage";
import type { ApprovalCenter } from "@/features/chat/core/approvals";
import type { Runner } from "@/features/chat/core/runner";
import type { UploadStore } from "@/features/attachments/core/uploads";
import type { VoiceService } from "@/features/voice/core/service";
import type { NoteService } from "@/features/notes/core/notes";
import type { DatabaseService } from "@/features/database/core/service";
import type { GitHubService } from "@/features/github/core/service";
import type { CiService } from "@/features/github/core/ci";
import type { DockerService } from "@/features/docker/core/service";
import type { PortWatch } from "@/features/ports/core/watch";
import type { WorktreeEnvService } from "@/features/worktrees/core/env/service";
import type { SessionsUsedElsewhere } from "@/features/chat/core/sessions/siblingSessions";
import type { WorktreeFinisher } from "@/features/worktrees/core/finish";
import type { UserViewRegistry } from "@/features/userView/core/registry";
import type { TrashService } from "@/features/trash/core/service";
import type { RemoteImageService } from "@/features/remoteImages/core/service";
import type { PairingCenter } from "@/features/devices/core/pairing";
import type { ViewingRegistry } from "@/features/notifications/core/viewing";
import type { TerminalSessions } from "@/features/terminal/core/sessions";
import type { WorktreePrWatch } from "@/features/github/core/prWatch";
import type { HeadWatch } from "@/features/worktrees/core/headWatch";
import type { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import type { GitHubAccount, ProviderId } from "@shared/types";

export interface ServerDeps {
  store: Store;
  bus: Bus;
  /** いまの書きかけの返答（chat の段 chatDeltaStage が持つ。チャットの詳細の streaming_text） */
  streamingText(chatId: number): string | null;
  providers: Record<ProviderId, AgentProvider>;
  usage: UsageMonitor;
  /** 設定の「使用状況」のサービスごとの使用状況 */
  serviceUsage: ServiceUsageMonitor;
  runner: Runner;
  approvals: ApprovalCenter;
  uploads: UploadStore;
  /** 音声入力の文字起こしとモデルの管理 */
  voice: VoiceService;
  /** プロジェクトのノート（保存先はプロジェクトの外） */
  notes: NoteService;
  /** ワークツリーの PR の見張り（マージ・マージせずに閉じたことの知らせ） */
  prWatch: WorktreePrWatch;
  /** ブランチの切り替え・ワークツリーの足し引きの見張り（一覧の API が見張りを一覧に合わせる） */
  headWatch: HeadWatch;
  /** DB クライアント（接続の登録・木・テーブル・SQL。DB の処理は別のプロセスの DB ワーカーで動かす） */
  databases: DatabaseService;
  /** GitHub タブ（連携先のリポジトリの issue・PR を読む） */
  github: GitHubService;
  /** CI の結果（GitHub Actions の実行・ログ・やり直し） */
  ci: CiService;
  /** Docker タブ（プロジェクトの compose の一覧・操作・docker events） */
  docker: DockerService;
  /** ワークツリーの実行環境（ポートの帯・組の名前） */
  worktreeEnvs: WorktreeEnvService;
  /** ポートを使っているプロセス（調べる・止める。実行が終わったときの見張り） */
  ports: PortWatch;
  /** スマホ連携のペアリング（使い捨ての番号・確かめを待っている頼み） */
  pairing: PairingCenter;
  /** いまだれが何を見ているか（通知を出すかの判断） */
  viewing: ViewingRegistry;
  /** gh に入っている GitHub のアカウント（設定の「GitHub」。テストでは差し替えて、gh を呼ばない。なければ gh auth status） */
  githubAccounts?: () => Promise<GitHubAccount[]>;
  /** Kickoff のゴミ箱（消したものを 3 日取っておき、元に戻せる。trash/service.ts） */
  trashBin: TrashService;
  /** チャット欄の外の画像（表示を許可したホストと、取ってきた画像の覚え） */
  remoteImages: RemoteImageService;
  /** ワークツリーの後始末（画面の「消す」と AI の finish_worktree。確かめ・控え・予約。worktrees/finish.ts） */
  worktreeFinisher: WorktreeFinisher;
  /** 利用者が見ているもの（この Mac の画面のウィンドウごとと、チャットごとの送ったときの様子。AI の get_user_view。userView/registry.ts） */
  userViews: UserViewRegistry;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（どのチャットも使っていない会話記録の一覧から除く。省けば調べない） */
  sessionsElsewhere?: SessionsUsedElsewhere;
  /** 内蔵ターミナルのシェル（スマホは WebSocket でつなぐ = routes/terminals.ts） */
  terminals: TerminalSessions;
  /** AI の API キー（暗号化して置く。置いたかだけを返す） */
  providerKeys: ProviderKeyVault;
  /** tailscale のコマンドの場所（OS の口。設定の Tailscale Serve の案内。テストでは偽物） */
  tailscaleCli: () => string | null;
  /** 待ち受けているアドレスとポート（接続の詳細の表示用） */
  listen?: { host: string; port: number };
}
