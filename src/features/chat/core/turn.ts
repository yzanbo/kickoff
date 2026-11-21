// 1 回の実行に使うもの（ExecutionDeps）・実行の依頼（TurnRequest）と、実行（run/turn/）が使う上の機能の中身を 1 か所から渡す仮の口。
// 実行のファイルは上の機能を直に読まず、ここだけを読む（上の機能を読む辺をこのファイルに閉じ込める。P5-4 の TurnContributor で登録の形にしたら消す）
import type { BrowserControl } from "@shared/browser/control";
import type { TerminalControl } from "@/features/terminal/core/control";
import type { WorktreeEnvService } from "@/features/worktrees/core/env/service";
import type { WorktreeFinisher } from "@/features/worktrees/core/finish";
import type { UserViewRegistry } from "@/features/userView/core/registry";
import type { ApprovalCenter } from "./approvals";
import type { Bus } from "@/foundation/core/bus";
import type { Clock } from "@/foundation/core/clock";
import type { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import type { AiWorkplaceDeps } from "@/features/workplaceMove/core/aiWorkplace";
import type { NoteService } from "@/features/notes/core/notes";
import type { DatabaseService } from "@/features/database/core/service";
import type { ToolGateFactory, UsageMonitor } from "@/features/ai/core/index";
import type { StartedChild } from "@/features/childChats/core/aiCreateChat";
import type { ChildChatInput } from "@/features/childChats/core/children";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { TrashCommand } from "@/features/trash/core/command";
import type { BashSandboxDeps } from "@/features/guard/core/sandbox/bashSandbox";
import type { SessionTrash } from "./sessionSwitch";
import type { Store } from "@/features/chat/core/stores";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import type { UploadStore } from "@/features/attachments/core/uploads";
import type { McpToolHost } from "@/foundation/core/aiTools/host";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import type { TurnContributor } from "@/features/chat/core/run/turn/contributor";
import type { ChatAttachments } from "./ports";

export { knownModel } from "@/features/ai/core/providers/modelCatalog";
export { TurnSandboxDiagnostics } from "@/features/guard/core/sandboxDiagnostics";
export { githubEnvForGit, runAsGitHubAccount } from "@/features/github/core/githubAccount";
export { chatContextNote, chatContextOf } from "@/features/childChats/core/context";
export { workplaceMoveContext } from "@/features/workplaceMove/core/workplaceMove";
export type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
export { bashSandboxFor, sandboxPromptLines } from "@/features/guard/core/sandbox/bashSandbox";
export { autoPreCompactParams, postCompactPromptOf, preCompactPromptOf } from "@/features/compact/core/preCompact";
export { retryProviderHandoffPreparation } from "@/features/providerSwitch/core/providerSwitch";

/** 実行に使うもの（殻から受け取る） */
export interface ExecutionDeps {
  /** 時計（作業を始めた時刻・圧縮を始めた時刻。省けば本物） */
  clock?: Pick<Clock, "iso">;
  /** OS の拒否ログを安全に読み取る口（実行ごとに診断を作る） */
  sandboxDiagnostics?: import("@/features/guard/core/sandboxDiagnosticsPlatform").SandboxDiagnosticsPlatform;
  store: Store;
  approvals: ApprovalCenter;
  providers: Record<ProviderId, AgentProvider>;
  uploads?: UploadStore;
  /** 添付の口（保存先・送る文に添付のパスを書き添える。attachments が実装する。なければ添えない） */
  attachments?: ChatAttachments;
  bus?: Bus;
  /** プロジェクトのノートのフォルダ（ノートのチャットで、AI にノートを読み書きさせるため。なければノートのチャットでもノートのフォルダを足さない） */
  noteDirOf?: (project: Project) => string;
  /** 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。なければ AI にブラウザのツールを出さない） */
  browser?: BrowserControl;
  /** 内蔵ターミナルの読み取り（デスクトップアプリのメインプロセスが渡す。なければ AI にターミナルのツールを出さない） */
  terminals?: TerminalControl;
  /** DB クライアント（AI に見せる接続があるプロジェクトで、AI に DB のツールを出す。なければ出さない） */
  databases?: DatabaseService;
  /** チャットを作る（Runner が渡す。チャットの AI にチャット（子・兄弟・親のないチャット）を作るツールを出す。なければ出さない） */
  startChat?: (from: Chat, input: ChildChatInput) => Promise<StartedChild>;
  /** ワークツリーの実行環境（作業場所がポートの帯を持つワークツリーなら、AI に PORT を渡す。なければ渡さない） */
  worktreeEnvs?: WorktreeEnvService;
  /** 使用状況の見張り（AI の get_usage が読み、実行中の支払いの知らせを渡す。なければ get_usage は使えないと返し、知らせは見ない） */
  usage?: UsageMonitor;
  /** ノート（AI の move_note が名前を変える・移す。なければそのツールは使えないと返す） */
  notes?: NoteService;
  /** チャットが作業中か（AI の update_chat が、作業中の子チャットを親から外すのを断る。Runner が渡す。なければ作業中とみなさない） */
  isBusy?: (chatId: number) => boolean;
  /**
   * AI に渡す kickoff-trash（rm の代わりに Kickoff のゴミ箱へ入れる。trash/command.ts）。あれば PATH などを渡し、rm・git clean などを断る守りを付ける。
   * なければ（置けなかった・テスト）付けない
   */
  trashCommand?: TrashCommand;
  /** 乗り換えた古い会話記録をゴミ箱へ入れる（なければ乗り換えても古い記録は残す） */
  sessionTrash?: SessionTrash;
  /** ワークツリーの後始末（AI の finish_worktree。Runner を作ったあとで attach が渡す。なければそのツールを出さない） */
  worktreeFinisher?: WorktreeFinisher;
  /** 利用者が見ているもの（AI の get_user_view が読む。なければそのツールを出さない） */
  userViews?: UserViewRegistry;
  /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat。Runner を作ったあとで useChatRemover が渡す。なければそのツールを出さない） */
  chatRemover?: ChatRemover;
  /** AI が作業場所を移す予約（Runner が渡す。なければ AI に move_workplace を出さない） */
  workplaceMoves?: AiWorkplaceDeps["reservations"];
  /** AI の Bash の砂場（OS ごとの決まり・通信の中継・ゴミ箱。なければ砂場にかけない（テスト）） */
  bashSandbox?: BashSandboxDeps;
  /** 実行ごとの守りの門を作る口（guard が出す。なければ権限モードだけで答える門） */
  toolGate?: ToolGateFactory;
  /** コアの MCP サーバー（AI の操作ツールを実行ごとの鍵で出す。なければツールを出さない（テスト）） */
  toolHost?: Pick<McpToolHost, "open">;
  /** 上の機能が出した AI のツールの組（組み立てが全部の機能の CoreFeature.aiTools を集めて渡す。chat の組と同じ並びで出す） */
  aiTools?: readonly AiToolGroup[];
  /** AI の API キー（設定でログインの仕方を API キーにした AI に渡す。なければいつもサブスク） */
  providerKeys?: ProviderKeyVault;
  /** 上の機能が登録した、実行に足すもの（chat.api.addTurnContributor。登録の順に並べ、実行ごとに order の順に集める） */
  contributors?: TurnContributor[];
}

/** 1 回の実行の依頼（送った指示。すぐ動かす） */
export interface TurnRequest {
  chatId: number;
  prompt: string;
  /** 指示の ID（自分の発言の記録の message_uuid。ファイルを戻すときの目印） */
  promptId?: string;
  /** 会話の要約（/compact）。発言・結果としては残さず、未読にもしない */
  compact?: boolean;
  /**
   * 圧縮のきっかけ（compact のとき。省けば手で圧縮した manual）。自動の圧縮の前の圧縮前指示の作業が、圧縮しないまま終わったときに
   * Runner が続けて圧縮する実行は auto（上限に近づいて Claude Code が始めようとした圧縮を、作業の終わりで済ませる）
   */
  compactTrigger?: CompactTrigger;
  /** 再試行時に資料と同時に取った送信中の印。ほかの操作へ渡さない。 */
  claimedHandoffEventId?: number;
}
