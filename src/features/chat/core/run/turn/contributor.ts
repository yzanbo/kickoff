// 1 回の実行に足すものの登録の形（TurnContributor）。上の機能が createX の中で chat.api.addTurnContributor で登録し、実行は order の順に集める（params.ts の collectTurnParts）。
// AI のツールはここに入れない（defineAiTool と CoreFeature.aiTools だけ）
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Chat, ChatStatus } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { PreCompactRequest, ProviderCallbacks, ProviderTurnResult, SandboxPlan, ToolGate } from "@/features/ai/core/index";
import type { TurnKind } from "@/features/chat/core/run/machine/types";

/** 1 回の実行の文脈（contribute に渡す） */
export interface TurnContext {
  chat: Chat;
  project: Project;
  /** 作業場所（本体のフォルダかワークツリー） */
  cwd: string;
  kind: TurnKind;
  signal: AbortSignal;
  requestApproval: ProviderCallbacks["requestApproval"];
}

/** システムプロンプトの 1 つの節 */
export interface PromptSection {
  /** 並び（chat 100・200・210、guard 220、browser 300、visuals 400、notes 500、chat 600）。同じ order は登録の順 */
  order: number;
  /** 見出し（"## ブラウザ" など）。null なら直前の節の続きの行（「作業の進め方」に足すゴミ箱・砂場の行） */
  heading: string | null;
  lines: string[];
}

/** 1 つの contributor が 1 回の実行に足すもの（どれも省ける） */
export interface TurnParts {
  /** 子プロセスの環境変数（後の order が上書き: worktrees 10 → github 20 → chat 30） */
  env?: Record<string, string>;
  /** 読めるフォルダに足す（additionalDirectories） */
  readableDirs?: string[];
  /** 読めるが書かせないフォルダ（砂場の readOnlyDirs・参照資料の守り） */
  readOnlyDirs?: string[];
  /** 書けるフォルダ（書き込み先の守り・砂場。ノートのフォルダ） */
  writableDirs?: string[];
  promptSections?: PromptSection[];
  /** 指示に添える文脈（家系 10 → 作業場所の移動の知らせ 20 → 一度だけ添える知らせ 30 → 引き継ぎの資料 40 の順につなぐ） */
  turnContext?: string | null;
  /** 守りの門・Bash の砂場（guard だけが出す。2 つ出たら実行を失敗で止める） */
  gate?: ToolGate;
  sandbox?: SandboxPlan | null;
  sandboxOff?: boolean;
  /** 自動の圧縮の前に足す圧縮前指示（compact だけが出す） */
  preCompact?: PreCompactRequest | null;
  /** プロバイダーを動かすところを包む（引き継ぎの印・診断の開け閉め）。先の order が外側 */
  around?: (run: () => Promise<ProviderTurnResult>) => Promise<ProviderTurnResult>;
  /** 記録を足したとき（AI が出した記録） */
  onRecord?: (event: ChatEvent) => void;
  /** 作業の終わりにすること（結果を書いたあと。失敗でも） */
  afterTurn?: (end: TurnEndInfo) => Promise<void>;
}

export interface TurnContributor {
  name: string;
  order: number;
  contribute(ctx: TurnContext): TurnParts | null | Promise<TurnParts | null>;
  /** 送る・伝える指示の後ろに添える文（届かなかったサブエージェントの報告。渡したら次からは返さない） */
  messageNote?(chatId: number, text: string): Promise<string>;
}

/** 作業の終わりの様子（afterTurn に渡す） */
export interface TurnEndInfo {
  chatId: number;
  status: ChatStatus;
  network: boolean;
  /** この実行より前の最後の記録の ID */
  since: number;
  cwd: string;
}
