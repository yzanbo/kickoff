// 1 回の実行に使うもの（ExecutionDeps）・実行の依頼（TurnRequest）と、実行（run/turn/）が使う上の機能の中身を 1 か所から渡す仮の口。
// 実行のファイルは上の機能を直に読まず、ここだけを読む（上の機能を読む辺をこのファイルに閉じ込める。P5-4 の TurnContributor で登録の形にしたら消す）
import type { TerminalControl } from "@/features/terminal/core/control";
import type { WorktreeEnvService } from "@/features/worktrees/core/env/service";
import type { ApprovalCenter } from "./approvals";
import type { Bus } from "@/foundation/core/bus";
import type { Clock } from "@/foundation/core/clock";
import type { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import type { UsageMonitor } from "@/features/ai/core/index";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { TrashCommand } from "@/features/trash/core/command";
import type { SessionTrash } from "./sessionSwitch";
import type { Store } from "@/features/chat/core/stores";
import type { ProviderId } from "@shared/settings/types";
import type { UploadStore } from "@/features/attachments/core/uploads";
import type { McpToolHost } from "@/foundation/core/aiTools/host";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import type { TurnContributor } from "@/features/chat/core/run/turn/contributor";
export type { TurnRequest } from "@/features/chat/core/run/turn/contributor";
import type { ChatAttachments } from "./ports";

export { knownModel } from "@/features/ai/core/providers/modelCatalog";
export type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";

/** 実行に使うもの（殻から受け取る） */
export interface ExecutionDeps {
  /** 時計（作業を始めた時刻・圧縮を始めた時刻。省けば本物） */
  clock?: Pick<Clock, "iso">;
  store: Store;
  approvals: ApprovalCenter;
  providers: Record<ProviderId, AgentProvider>;
  uploads?: UploadStore;
  /** 添付の口（保存先・送る文に添付のパスを書き添える。attachments が実装する。なければ添えない） */
  attachments?: ChatAttachments;
  bus?: Bus;
  /** 使用状況の見張り（AI の get_usage が読み、実行中の支払いの知らせを渡す。なければ get_usage は使えないと返し、知らせは見ない） */
  usage?: UsageMonitor;
  /** チャットが作業中か（AI の update_chat が、作業中の子チャットを親から外すのを断る。Runner が渡す。なければ作業中とみなさない） */
  isBusy?: (chatId: number) => boolean;
  /**
   * AI に渡す kickoff-trash（rm の代わりに Kickoff のゴミ箱へ入れる。trash/command.ts）。あれば PATH などを渡す（rm・git clean などを断る守りは guard が付ける）。
   * なければ（置けなかった・テスト）渡さない
   */
  trashCommand?: TrashCommand;
  /** 乗り換えた古い会話記録をゴミ箱へ入れる（なければ乗り換えても古い記録は残す） */
  sessionTrash?: SessionTrash;
  /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat。Runner を作ったあとで useChatRemover が渡す。なければそのツールを出さない） */
  chatRemover?: ChatRemover;
  /** コアの MCP サーバー（AI の操作ツールを実行ごとの鍵で出す。なければツールを出さない（テスト）） */
  toolHost?: Pick<McpToolHost, "open">;
  /** 上の機能が出した AI のツールの組（組み立てが全部の機能の CoreFeature.aiTools を集めて渡す。chat の組と同じ並びで出す） */
  aiTools?: readonly AiToolGroup[];
  /** AI の API キー（設定でログインの仕方を API キーにした AI に渡す。なければいつもサブスク） */
  providerKeys?: ProviderKeyVault;
  /** 上の機能が登録した、実行に足すもの（chat.api.addTurnContributor。登録の順に並べ、実行ごとに order の順に集める） */
  contributors?: TurnContributor[];
}

/** 殻が AI の予約した作業場所の移動（作業の終わり）とルートに使う上の機能の口（attach が渡す。1 回の実行は使わない。P5-5 で作業の終わりの予約と作業場所を作る口に替えたら消す） */
export interface ShellUpperDeps {
  /** ワークツリーの実行環境（移した先・作ったワークツリーにポートの帯を割り当てる） */
  worktreeEnvs?: WorktreeEnvService;
  /** 内蔵ターミナルの読み取り（移す前に、その作業場所で動いているシェルを確かめる） */
  terminals?: TerminalControl;
}
