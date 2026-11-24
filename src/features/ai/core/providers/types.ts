import type { Workplace } from "@/foundation/core/workplace/worktrees";
import type { Project } from "@shared/projects/types";
import type { ToolEndpoint } from "@/foundation/core/aiTools/host";
import type { ProviderAuth } from "./keys";
import type { FileRewindResult, ProviderCliStatus, SlashCommandOption, EffortDefault, ModelOption } from "@shared/ai/types";
import type { ProviderUsage, SpendingNote } from "@shared/ai/usage";
import type { ApprovalKind, ApprovalReply, RememberScope } from "@shared/ai/approvals";
import type { AgentEvent, CommandOutput, SubagentInfo, ApiRetryInfo, BackgroundState } from "@shared/ai/turnEvents";
import type { EffortLevel, PermissionMode, ProviderId } from "@shared/settings/types";

/**
 * エージェント実行基盤の抽象化。
 * Claude Code（Agent SDK）を最初の実装とし、Codex / Copilot / Cursor などは同じインターフェースで追加する。
 * AI の操作ツールはコアの MCP サーバー（ProviderTurnParams.tools）で渡し、プロバイダーごとに作らない。
 */
/**
 * 1 回だけ聞くときのモデルの段（ask。プロバイダーに依らない）: light = 軽い問い合わせ（名前・ブランチ名の案）/ standard = 文を書き直すなど質が要るもの。
 * どのモデルに当てるかはプロバイダーが決める（Claude は light = haiku・standard = sonnet）
 */
export type AskModel = "light" | "standard";

export interface AgentProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** false の場合は UI に「未対応」と表示し、実行を受け付けない */
  readonly implemented: boolean;
  /** CLI のインストール・ログイン状態 */
  status(): Promise<ProviderCliStatus>;
  /** 利用者のサブスクの使用枠（公式の CLI・SDK が認証する） */
  usage?(): Promise<ProviderUsage>;
  /** チャット欄で選べるモデルの一覧 */
  models?(): Promise<ModelOption[]>;
  /** チャット欄の / で出すコマンド（cwd のプロジェクトのコマンド・スキルも含む） */
  commands?(cwd: string): Promise<SlashCommandOption[]>;
  /**
   * ツールを使わずに 1 回だけ聞いて、答えの文を返す（チャットの名前・ノートの要約と AI の整理。チャットの記録には残さない。ask.ts）。
   * model: 軽い問い合わせは light（既定）、文を書き直すなど質が要るものは standard
   */
  ask?(prompt: string, options?: { model?: AskModel }): Promise<string>;
  /**
   * 会話を messageId の位置までで分けた、新しいセッションを作る（ここから分岐。対応していなければ未実装）。
   * keep は写す区切り（圧縮の印から次の印まで）の数: 同じ会話を続けるもの（分岐・巻き戻し）は既定の 3、子チャットは 1
   */
  fork?(sessionId: string, messageId: string, cwd: string, opts?: { keep?: number }): Promise<string>;
  /** 会話記録のファイル（Claude Code だけ。持たない口は未実装） */
  readonly sessions?: SessionStore;
  /**
   * サブエージェントの会話（依頼・発言・ツールと結果）を、記録から読む（「サブエージェントに子チャットで聞く」で添える。読めなければ空）。
   * sessionId はサブエージェントを動かした親のセッション、cwd はそのセッションを動かした作業フォルダ
   */
  subagentLog?(sessionId: string, agentId: string, cwd: string): Promise<SubagentLogItem[]>;
  /** ファイルを、その会話の自分の発言（messageId）を送る前の状態に戻す（dryRun なら戻さずに、変わる量だけを返す）。作業中でないときに呼ぶ */
  rewindFiles?(sessionId: string, messageId: string, cwd: string, dryRun: boolean): Promise<FileRewindResult>;
  /**
   * ブラウザでログインを始める（CLI が自分でログインの戻り先を受け、資格情報を CLI の置き場に書く。Kickoff は資格情報を持たない）。
   * 開く URL と、終わりを待つ口・やめる口を返す。ブラウザでのログインを持たないプロバイダーは未実装
   */
  login?(): Promise<ProviderLogin>;
  /** 推論の深さを指定しないとき（既定）に CLI が使う深さを設定から求める（読むだけ。対応していなければ未実装） */
  effortDefault?(model: string | null, cwd: string): Promise<EffortDefault>;
  /** CLI の決まりでいつも書ける場所（Claude Code の計画とメモリ。持たない AI は省く。書き込み先の守りが聞かずに通す） */
  readonly writeExceptions?: WriteExceptions;
  /** 1 ターン分（ユーザーの 1 メッセージに対する応答完了まで）を実行する */
  run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult>;
}

/** 始めたブラウザでのログイン（login の答え） */
export interface ProviderLogin {
  /** 利用者のブラウザで開く URL */
  authUrl: string;
  /** ログインの終わり（成功なら true。失敗・やめたら理由で reject） */
  completed: Promise<true>;
  /** やめる */
  cancel(): void;
}

/** サブエージェントの会話の 1 つ分（プロバイダーによらない形。user は依頼と、あとから伝えた指示） */
export type SubagentLogItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; input: unknown; result: string | null; isError: boolean };

/** 自動の圧縮の前に足す圧縮前指示（ProviderTurnParams.preCompact。文はどれも chat が作る） */
export interface PreCompactRequest {
  message: string;
  contextWindow: number;
  contextTokens: number | null;
  nudge: string;
  doneMark: string;
}

export interface ProviderTurnParams {
  cwd: string;
  prompt: string;
  /** 指示の ID（自分の発言の記録の message_uuid。ファイルをこの発言の時点に戻すときの目印） */
  promptId?: string;
  /** 手で頼んだ圧縮（prompt は "/compact"。Claude Code はその文で、ほかの CLI はこの印で圧縮の口を呼ぶ） */
  compact: boolean;
  /** プロバイダー既定のシステムプロンプトに追記する Kickoff の文脈 */
  systemPrompt: string;
  /** 続きの会話の場合、前回のセッション ID */
  resumeSessionId: string | null;
  model: string | null;
  /** 推論の深さ（null なら指定しない＝SDK とモデルの既定） */
  effort: EffortLevel | null;
  /** 権限モード（ファイルの編集を自動で承認するかも、これで決まる） */
  permissionMode: PermissionMode;
  /** ファストモード（対応していないモデル・プランでは通常の速度になる） */
  fastMode: boolean;
  /** 自動圧縮を始めるコンテキストの使用率（%。null なら指定しない＝ Claude Code の既定） */
  autoCompactPct: number | null;
  /**
   * 上限に近づいて自動で圧縮する前に足す圧縮前指示（null なら足さない）。message: AI に送る文（前置き付き）・
   * contextWindow: コンテキストウィンドウ（前の作業で分かったもの）・contextTokens: いまのコンテキストの大きさ（前の作業の終わりの値。分からなければ null）・
   * nudge: 合図のあと裏の作業を待って止まったときに足す発言・doneMark: 済んだ合図の一文
   */
  preCompact?: PreCompactRequest | null;
  /**
   * 指示に添える文脈（このチャットの名前と親チャットなど。null・省略なら添えない）。Claude Code は続きのセッションでは
   * システムプロンプトを取り直さず（記録の prompt_snapshot を使い回す。分岐した子チャットは親のもの）、送るたびに変わる文脈が届かないため、
   * 実行の初めの指示にだけ添える
   */
  turnContext?: string | null;
  /** 作業フォルダ以外に読み取りを許すフォルダ（添付ファイルの保存先・参照資料など） */
  additionalDirectories: string[];
  /** 子プロセスに足す環境変数（プロジェクトで選んだ GitHub のアカウントのトークン GH_TOKEN。省略なら足さない） */
  env?: Record<string, string>;
  /**
   * この実行の AI の操作ツールの口（コアの MCP サーバー。aiTools/host.ts）。turn.ts が機能の組からレジストリで作って登録し、
   * プロバイダーはそれぞれの CLI の書き方で MCP サーバーとして渡すだけ（中身を自分で作らない・知らない）。省略・空なら渡さない
   */
  tools?: ToolEndpoint[];
  /** ログインの仕方（api_key ならそのキー。省略ならサブスク = 各 CLI のログイン。キーを AI の Bash から読めない渡し方にするのはプロバイダー） */
  auth?: ProviderAuth;
  /** 自分で起動した CLI の PID。診断のチャットの境界に使う */
  onAgentSpawned?: (pid: number) => void;
  /**
   * AI の Bash の砂場（guard の bashSandbox.ts。Bash が書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにし、
   * 止めるのは OS）。プロバイダーが自分の砂場の設定に直す。null ならかけない
   */
  sandbox: SandboxPlan | null;
  /** 利用者がこのチャットで明示的に砂場なしを選んだ */
  sandboxOff: boolean;
  /**
   * 守りの門（chat が実行ごとに作る。断る・聞く・権限モードの答えはここから。承認を聞いてくる CLI（Codex・Copilot・ACP）は、
   * 聞かれたコマンド・書く先・読む先をこれに当てる）。承認なしで流してよいコマンドの一覧も持つ
   */
  gate: ToolGate;
}

/** 門の答え: 通す（forSession: このセッションの間は覚える / approved: 守りの書き込み先のカードで利用者が許した）/ 断る（AI に伝える理由） */
export type GateOutcome = { allow: true; forSession?: boolean; approved?: boolean } | { allow: false; reason: string };

/** 門が見る呼び出し（Claude Code のツールの名前と入力の形） */
export interface GateCall {
  name: string;
  input: Record<string, unknown>;
}

/** 承認カードに添えるもの（ツールの呼び出し ID・サブエージェント・カードの説明・待つのをやめる合図。合図を省けば実行の signal） */
export interface GateAsk {
  toolUseId?: string;
  agentId?: string;
  description?: string | null;
  signal?: AbortSignal;
}

/** 守りの門（guard の gate.ts が作る。テスト・守りのない実行は permissionMode.ts の permissionOnlyGate） */
export interface ToolGate {
  /** 守りを当てる: 断る守り → 断る / 聞く守り → 権限モードによらず承認カード / どれも言わなければ null（権限モードに任せる） */
  guard(call: GateCall, ask?: GateAsk): Promise<GateOutcome | null>;
  /** 断る守りだけを当てる（聞く守りは見ない。断らなければ null） */
  deny(call: GateCall): Promise<Extract<GateOutcome, { allow: false }> | null>;
  /** 書く先を 1 つずつ guard（Write）に当てる: 最初に断られた答え・聞いて許されたものがあれば通す・どれも言わなければ null */
  guardWrites(paths: string[], ask?: GateAsk): Promise<GateOutcome | null>;
  /** 読む先を guard（Read）に当てる */
  guardRead(path: string, ask?: GateAsk): Promise<GateOutcome | null>;
  /** 守りが何も言わなかったときの、権限モードによる答え（command = コマンド / edit = ファイルの変更） */
  byMode(kind: "command" | "edit", call: GateCall, ask?: GateAsk): Promise<GateOutcome>;
  /** 「このチャットでは許可」で覚えた書く先への書き込みか（Claude Code は聞き直さずに通す。守りが何も言わなかったときに見る） */
  remembered(call: GateCall): boolean;
  /** 承認なしで流してよいコマンドの頭（Claude Code の許可ルールに写す） */
  readonly allowedCommands: readonly string[];
  /** 砂場で止まった Bash の出力（失敗で終わったコマンド）に添える文（断られた場所・なぜ・代わりの道。砂場がない・読み取れなければ null） */
  sandboxDeniedNote(output: string): Promise<string | null>;
  /** 断ったことを AI に伝える文 */
  note(what: string, reason: string): string;
}

/** Bash の砂場（パスはどれも実体のパス。guard の bashSandboxFor が作り、プロバイダーが自分の砂場の設定に直す） */
export interface SandboxPlan {
  /** 書けるフォルダ（作業場所・ノートのフォルダ・決まりの例外） */
  writableDirs: string[];
  /** 読めるフォルダに足したが、書かせないもの（添付の保存先・作業場所の外の参照資料。プロバイダーが読めるフォルダを書けるようにしてしまうため） */
  readOnlyDirs: string[];
  /** 砂場の外で流すコマンド（Claude Code の許可ルールの書き方 `<コマンド>:*`。中で自分の砂場をかけるので砂場の中では動かないもの） */
  unsandboxedCommands: string[];
  /** Bash の通信を通す中継のポート（どこへでも通す。ネットワークは絞らない。なければ null = プロバイダーの中継のまま） */
  proxyPort: number | null;
}

/** CLI の決まりでいつも書ける場所（実体のパス。Claude Code の計画とメモリ）。書き込み先の守りが聞かずに通す */
export interface WriteExceptions {
  /** いつも書けるフォルダ（Claude Code の計画 ~/.claude/plans） */
  writableDirs: string[];
  /** この下の「<名前>/memory」の中を書けるフォルダ（Claude Code のメモリ ~/.claude/projects/<プロジェクト>/memory） */
  memoryParents: string[];
}

/** 書き込み先の守りに chat が渡すもの（guard の writeScope.ts が、その AI の決まりの例外を足して判定の様子にする） */
export interface WriteScopeParams {
  /** いつも書けるフォルダ（ノートのフォルダ・一時フォルダ。実体のパス） */
  writableDirs: string[];
  /** プロジェクトの本体とワークツリー */
  workplaces(): Promise<Workplace[]>;
  /** 承認カードの「このチャットでは許可」で許したファイル（実体のパス。チャットごとに作業をまたいで持つ。保存しない） */
  allowed: Set<string>;
}

/** 門を作る材料（chat が実行ごとに集める。プロバイダーには渡さず、門だけを渡す。上の機能の守り = 見せない DB・Docker はプロジェクトと作業フォルダから自分で引く） */
export interface GuardMaterials {
  cwd: string;
  permissionMode: PermissionMode;
  /** チャットのプロジェクト（見せない DB の接続・Docker の作業場所を引く） */
  project: Project;
  /** 読むだけで書き込ませないパス（リポジトリの外の参照資料） */
  readOnlyPaths?: string[];
  /** Git で管理していないファイルだけを書けるチャットか（ワークツリーの実行環境の［AI で整える］。guard の scope.ts の untrackedRule で断る） */
  untrackedOnly?: boolean;
  /**
   * AI の書き込み先の守り（guard の writeScope.ts。ファイルを書き換えるツールの先を、作業場所・ノートのフォルダ・決まりの例外だけにする。
   * 同じリポジトリのほかの作業場所は断り、それ以外の外は承認カードで聞く）。なければ付けない（Git で管理していないファイルだけを書けるチャットは、そちらの守りが絞る）
   */
  writeScope?: WriteScopeParams | null;
  /** ファイルを消す Bash（rm・find -delete・git clean など）を断り、kickoff-trash を使わせる守り（guard の deleteGuard.ts）を付けるか */
  deleteGuard?: boolean;
  /** Bash の砂場（砂場で止まったときの文に使う。なければ文を添えない） */
  sandbox?: SandboxPlan | null;
  /** その AI の CLI の決まりでいつも書ける場所（AgentProvider.writeExceptions。書き込み先の守りに足す） */
  writeExceptions?: WriteExceptions;
}

/** 実行ごとに門を作る口（guard が出し、chat が実行の材料と承認の口を渡して作る） */
export type ToolGateFactory = (materials: GuardMaterials, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal) => ToolGate;

export interface ApprovalRequest {
  kind: ApprovalKind;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  canRemember: boolean;
  /** 「覚える」の範囲（省いたら rule = 許可のルールに足す） */
  rememberScope?: RememberScope;
  /** 承認を求めているツールの呼び出し ID（Claude Code の toolUseID） */
  toolUseId?: string;
  /** サブエージェントの中で動いているときの、そのサブエージェントの ID（Claude Code の agentID。メインエージェントなら undefined） */
  agentId?: string;
}

/** 作業中のチャットへの操作（ストリーミング入力が開いている間だけ） */
export interface TurnControl {
  /** 作業を止めずに発言を足す（いまの手順の切れ目でメインエージェントが読む）。入力が閉じていれば false */
  tell(text: string, uuid?: string): boolean;
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド） */
  stopTask(taskId: string): Promise<void>;
}

export interface ProviderCallbacks {
  emit(event: AgentEvent): void;
  /** 返答の文字を生成されたそばから渡す（画面のストリーミング表示用。保存しない） */
  stream?(text: string): void;
  /** サブエージェントの途中経過（保存しない） */
  subagentProgress?(info: SubagentInfo): void;
  /** 実行中のコマンドの出力の終わりの部分（増えたときだけ。保存しない） */
  commandOutput?(output: CommandOutput): void;
  requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalReply>;
  /** AI の API への通信を再試行しているところ（通信が切れたときなど）。返答が届き始めたら null（保存しない） */
  retry?(info: ApiRetryInfo | null): void;
  /** 裏で動いている作業・メインの返答が終わったかが変わったとき（保存しない） */
  background?(state: BackgroundState): void;
  /** 上限を超えたあとの支払いの様子を AI が知らせた（Claude は超過分で動いているか、Codex はクレジット。引かれ始めたかは使用状況の見張りが決める） */
  spending?(note: SpendingNote): void;
  /** 会話を圧縮（要約）し始めた・終わった（手で圧縮したときも、上限に近づいて自動で圧縮されたときも。保存しない） */
  compacting?(active: boolean): void;
  /** 図のツール（show_visual・update_visual）の中身を書いている途中か（書き始めた・書き終えた。保存しない） */
  toolInputStreaming?(toolName: string, active: boolean): void;
  /**
   * 会話の圧縮に失敗した（理由。分からなければ null）。知らせるかはコアが決める（手で圧縮したときだけお知らせに残す。
   * 自動の圧縮の失敗は、要約するものがない（too_few_groups）なども含むので Claude Code も知らせない）
   */
  compactFailed?(reason: string | null): void;
  /**
   * 作業の途中でコンテキストの大きさが変わった（圧縮の直後。要約したあとの大きさが分からなければ、次のメインの応答のトークン数）。
   * 作業の終わりを待たずに画面のメーターへ反映するため（保存はコアが）
   */
  context?(tokens: number): void;
  /** 作業中のチャットへの操作を渡す（終わったら null） */
  control?(control: TurnControl | null): void;
  /** 自動の圧縮の前に、圧縮前指示（ProviderTurnParams.preCompact）を足した（uuid: 足した発言の ID。記録はコアが残す） */
  preCompactSent?(uuid: string): void;
  /** 圧縮前指示の合図のあと、裏の作業の終わりだけを待って止まったので、圧縮を走らせる発言（preCompact.nudge）を足した（記録はコアが残す） */
  preCompactNudged?(uuid: string): void;
}

export interface ProviderTurnResult {
  status: "completed" | "failed" | "cancelled";
  sessionId: string | null;
  result?: string;
  error?: string;
  /** API 換算の推定コスト（サブスクリプション利用時も参考値として記録） */
  costUsd?: number;
  turns?: number;
  /** 最後の応答の時点で、コンテキストウィンドウに入っているトークン数とその上限 */
  context?: { tokens: number; window: number | null };
  /** メインの会話の最後のメッセージの ID（ここから分岐するときの位置） */
  lastMessageId?: string;
  /** 失敗が通信の切断によるものか（つながったら自動で再開する） */
  network?: boolean;
  /** 再開の要求が「指定セッションは存在しない」と返し、指示を送る前に失敗したときだけ true。 */
  resumeSessionMissing?: true;
  /** 使用枠の上限で止まった（resetsAt: 枠が戻る時刻。Claude Code が知らせたときだけ） */
  usageLimit?: { resetsAt: string | null };
}

/** 子チャットが親の会話を写すときに残す区切りの数（最新の要約とそのあとのやり取りだけ） */
export const CHILD_FORK_KEEP = 1;

/** 会話記録のファイルの口（AgentProvider.sessions。どれも、記録を持たない・写せないプロバイダーは未実装） */
export interface SessionStore {
  /** チャットを消したとき、そのセッションの記録を trash で移す（cwds は動かした作業フォルダの候補。移した数を返す） */
  discard?(sessionIds: string[], cwds: string[], trash: (path: string) => Promise<void>): Promise<number>;
  /**
   * 長く続けたセッションを、終わりの直近の区切り（既定 3）だけにした新しいセッションにする（元のセッションは変えない）。
   * 発言の ID はそのまま。新しいセッションの ID と、元の記録のファイル（呼ぶ側がゴミ箱へ入れる）を返す。切るものがない・見つからなければ null
   */
  trim?(sessionId: string, cwd: string): Promise<{ sessionId: string; previousFile: string } | null>;
  /**
   * 作業場所を移すとき、会話を新しいセッションに写す（直近の区切り、足りなければ丸ごと。発言の ID は保つ。ファイルの控えは写さない。
   * 元のセッションは変えない）。新しいセッションの ID と、元の記録のファイルを返す。元の記録が見つからなければ null（写せなければそのセッションのまま移す）
   */
  copyForMove?(sessionId: string, cwd: string): Promise<{ sessionId: string; previousFile: string } | null>;
  /** セッションの記録のファイルの様子（cwds は動かした作業フォルダの候補。なければ null。Kickoff が作ったセッションの片付け） */
  info?(sessionId: string, cwds: string[]): Promise<SessionFileInfo | null>;
  /** すべての会話記録のファイル（どのチャットも使っていない記録の一覧。新しい順） */
  list?(): Promise<SessionFileInfo[]>;
  /** セッションの記録のファイルの大きさの合計（cwds は動かした作業フォルダの候補。アーカイブ済みのチャットの整理の見込み） */
  size?(sessionIds: string[], cwds: string[]): Promise<number>;
}

/** 会話記録のファイルの様子（Kickoff が作ったセッションの片付け・どのチャットも使っていない記録の一覧） */
export interface SessionFileInfo {
  sessionId: string;
  file: string;
  size: number;
  modifiedAt: string;
  /** 動かした作業フォルダ（記録の頭の cwd。なければ null） */
  cwd: string | null;
  /** 最初の自分の発言（頭の 200 文字。なければ null） */
  firstPrompt: string | null;
}
