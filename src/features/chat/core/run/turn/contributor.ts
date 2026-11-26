// 1 回の実行に足すものの登録の形（TurnContributor）。上の機能が createX の中で chat.api.addTurnContributor で登録し、実行は order の順に集める（params.ts の collectTurnParts）。
// AI のツールはここに入れない（defineAiTool と CoreFeature.aiTools だけ）
import type { ChatEvent, ChatEventData } from "@shared/chat/chatEvent";
import type { Chat, ChatStatus } from "@shared/chat/types";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { Project } from "@shared/projects/types";
import type { PreCompactRequest, ProviderCallbacks, ProviderTurnResult, SandboxPlan, ToolGate } from "@/features/ai/core/index";
import type { TurnKind } from "@/features/chat/core/run/machine/types";
import type { TurnMarks } from "@/features/chat/core/run/machine/marks";
import type { PromptSection } from "@/features/chat/core/prompt/sections";

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

/** 1 回の作業の値の入れ物（contributor と AI のツールが同じものを使う。AiTurn.perTurn と同じ） */
export type PerTurn = <T>(key: string, init: () => T) => T;

/** turnProjects が 1 回の作業の値の入れ物に置くキー */
const TURN_PROJECTS_KEY = "chat:projects";

/** この実行のプロジェクトの一覧（chat・notes・guard の contributor が同じ一覧を見る。1 回の実行で 1 回だけ読む） */
export const turnProjects = (perTurn: PerTurn, list: () => Project[]): Project[] => perTurn(TURN_PROJECTS_KEY, list);

/** 1 回の実行の文脈（contribute に渡す） */
export interface TurnContext {
  chat: Chat;
  project: Project;
  /** 作業場所（本体のフォルダかワークツリー） */
  cwd: string;
  kind: TurnKind;
  request: TurnRequest;
  /** 記録から導く印（前の圧縮のあとで圧縮前指示を送ったかなど） */
  marks: TurnMarks;
  signal: AbortSignal;
  requestApproval: ProviderCallbacks["requestApproval"];
  perTurn: PerTurn;
  /** この実行の記録に足す（お知らせなど） */
  record(event: ChatEventData): void;
}

/** 集めたフォルダ（contributeWithDirs に渡す） */
export interface TurnDirs {
  readableDirs: string[];
  readOnlyDirs: string[];
  writableDirs: string[];
}

/** 中の実行に渡す指定の直し（会話を作り直してもう 1 回動かすときの、文脈と再開するセッション） */
export type TurnRunPatch = (p: { turnContext: string | null; resumeSessionId: string | null }) => { turnContext: string | null; resumeSessionId: string | null };

/** プロバイダーを動かす（patch で指定を直して動かせる） */
export type TurnRun = (patch?: TurnRunPatch) => Promise<ProviderTurnResult>;

/** 1 つの contributor が 1 回の実行に足すもの（どれも省ける） */
export interface TurnParts {
  /** 子プロセスの環境変数（後の order が上書き: worktrees 10 → github 20 → chat 30） */
  env?: Record<string, string>;
  /** 読めるフォルダに足す（additionalDirectories） */
  readableDirs?: string[];
  /** 読めるが書かせないフォルダ（砂場の readOnlyDirs） */
  readOnlyDirs?: string[];
  /** 書けるフォルダ（書き込み先の守り・砂場。ノートのフォルダ） */
  writableDirs?: string[];
  promptSections?: PromptSection[];
  /** 指示に添える文脈（家系 10 → 作業場所の移動の知らせ 20 → 一度だけ添える知らせ 30 の順につなぐ） */
  turnContext?: string | null;
  /** 守りの門・Bash の砂場・エージェントのプロセスを知らせる口（guard だけが出す。2 つ出たら実行を失敗で止める） */
  gate?: ToolGate;
  sandbox?: SandboxPlan | null;
  sandboxOff?: boolean;
  onAgentSpawned?: (pid: number) => void;
  /** 自動の圧縮の前に足す圧縮前指示（compact だけが出す） */
  preCompact?: PreCompactRequest | null;
  /** プロバイダーを動かすところを包む（引き継ぎの印・診断の開け閉め）。先の order が外側 */
  around?: (run: TurnRun) => Promise<ProviderTurnResult>;
  /** 記録を足したとき（AI が出した記録） */
  onRecord?: (event: ChatEvent) => void;
}

export interface TurnContributor {
  name: string;
  order: number;
  contribute(ctx: TurnContext): TurnParts | null | Promise<TurnParts | null>;
  /** ほかの contributor のフォルダを読んでから足すもの（守りの門・砂場。全部の contribute のあとに order の順に呼ぶ） */
  contributeWithDirs?(ctx: TurnContext, dirs: TurnDirs): TurnParts | null | Promise<TurnParts | null>;
  /** 送る・伝える指示の後ろに添える文（届かなかったサブエージェントの報告。渡したら次からは返さない。なければ null） */
  messageNote?(chatId: number, text: string): Promise<MessageNote | null>;
  /**
   * 作業の終わりにすること（結果を書いたあと。失敗でも、集める前に失敗・中断したときも 1 回）。後の order から（内側から）呼ぶ。
   * 投げると、結果を書いたあとならその作業を失敗にする
   */
  afterTurn?(end: TurnEndInfo): Promise<void>;
}

/** 指示の後ろに添える文と、自分の発言の記録に残す印（handover = 渡したサブエージェントの報告の行のキー） */
export interface MessageNote {
  text: string;
  handover?: string[];
}

/** 作業の終わりの様子（afterTurn に渡す） */
export interface TurnEndInfo {
  chatId: number;
  request: TurnRequest;
  status: ChatStatus;
  network: boolean;
  /** プロバイダーが返したセッション（失敗で投げたときは null） */
  sessionId: string | null;
  /** 失敗の理由（プロバイダーの error・投げた失敗の文。なければ null） */
  error: string | null;
  /** この実行より前の最後の記録の ID */
  since: number;
  /** 作業場所（決める前に失敗したら null） */
  cwd: string | null;
  perTurn: PerTurn;
}
