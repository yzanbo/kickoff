import type { Attachment, Project, Chat } from "@shared/types";
import { sidebarOrder } from "@/features/project/projectOrder";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";

/** 右の欄に開ける、プロジェクトのタブと同じ画面（ファイル・検索・履歴。変更は右の欄向けの「変更」のタブ） */
export const PROJECT_VIEWS = ["files", "search", "history"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];
export const PROJECT_VIEW_LABELS: Record<ProjectView, string> = { files: "ファイル", search: "検索", history: "履歴" };

/** 新しいチャットを始めるときの指定（どのプロジェクト・グループで始めるか） */
export interface NewChatTarget {
  projectId: number;
  group?: number;
  /** 始める作業場所のワークツリーのフォルダ（作業場所別のまとまりの「新しいチャット」から。なければ本体） */
  worktree?: string;
}

/** パネルのタブ（チャット・新しいチャット・サブエージェント・変更・ファイル・メモ・子チャット・新しい子チャット・ブラウザ・ターミナル。種類ごとの違いは tabKinds.ts の表） */
export type PanelTab =
  /**
   * title: タブに出すチャットの名前（開いたとき・チャットの画面が読み込んだときに入れる）。
   * chat: タブの中のチャットから届いた最新のチャット（サイドバーの一覧にないチャットでも、状態の印・右クリックのメニューの固定・アーカイブなどに使う）
   */
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number; title?: string; chat?: Chat }
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる）。draftText: 書いている途中の文（下書きのカードに出す）。draftAttachments: 送る前の添付（アップロード済み。外すまで残す。一度も残していなければ undefined）。seed: 初めに入力欄に入れるもの（送信待ちの指示から始めたとき）。pinned: サイドバーの「固定」に出すか（送ったら、できたチャットも固定する） */
  | ({ key: string; kind: "new"; groupName?: string; draftText?: string; draftAttachments?: Attachment[]; seed?: NewChatSeed; pinned?: boolean; title?: string } & NewChatTarget)
  /**
   * チャットの画面の右の欄（サブエージェントの欄）に開いた、サブエージェントの画面。chatId: どのチャットのものか。
   * agentKey: サブエージェントの一覧の行のキー（起動した Task / Agent の呼び出し ID）。title: タブに出す名前（開いたときの名前）。
   * path: サブエージェントの中で起動したもの（入れ子）の、外側からの道筋（「調査 › 洗い出し」。名前の前に「↳」を付け、乗せると出す。入れ子でなければない）
   */
  | { key: string; kind: "subagent"; chatId: number; agentKey: string; title: string; path?: string }
  /**
   * チャットの画面の右の欄に開いた、作業場所のコミットしていない変更（変更のあるファイルの差分を縦に並べる。作業場所ごとに 1 つ）。chatId: どのチャットから開いたか。
   * worktree: チャットの作業場所のワークツリーのフォルダ（本体ならない）。focus: 移るファイル（作業場所からの相対パス）。focusAt: 移るように頼んだ時刻（同じファイルを押し直しても移る）
   */
  | { key: string; kind: "changes"; chatId: number; projectId: number; worktree?: string; focus?: string; focusAt?: number }
  /**
   * チャットの画面の右の欄に開いた、作業場所のファイルの中身（変更のないファイル・返答のチップに行の番号があったとき）。
   * path: 作業場所からの相対パス。line: 目立たせる行
   */
  | { key: string; kind: "file"; chatId: number; projectId: number; worktree?: string; path: string; line?: number }
  /**
   * チャットの画面の右の欄に開いた、プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面（view。作業場所はチャットの作業場所から始め、中で切り替えられる）。
   * chatId: どのチャットの右の欄か。worktree: 初めに見る作業場所のワークツリーのフォルダ（本体ならない）
   */
  | { key: string; kind: "projectView"; chatId: number; projectId: number; worktree?: string; view: ProjectView }
  /**
   * プロジェクトの「ファイル」「検索」「変更」タブの右（パネルの files）に開いたファイル（features/editor/fileTabs.ts）。path: 作業場所からの相対パス。
   * staged: 変更の一覧から開いた差分（ステージ済みか。なければ中身）。line: 検索の行から開いたときの行。edit: 差分を見ながら編集する。focus: 開いたら編集の部品にピントを置く
   */
  | { key: string; kind: "projectFile"; projectId: number; path: string; staged?: boolean; line?: number; edit?: boolean; focus?: boolean }
  /** チャットの画面の右の欄に開いた、プロジェクトのメモ（自動で保存）。chatId: どのチャットの右の欄か。path: メモのフォルダからの相対パス */
  | { key: string; kind: "memo"; chatId: number | null; projectId: number; path: string }
  /** チャットの画面の右の欄に開いた DB クライアント（欄に 1 つ）。chatId: どのチャットの右の欄か。worktree: SQLite のファイルを開く作業場所のワークツリーのフォルダ（本体ならない） */
  | { key: string; kind: "database"; chatId: number; projectId: number; worktree?: string }
  /** チャットの画面の右の欄に開いた、プロジェクトの「GitHub」タブと同じ画面（issue・PR の一覧と中身。欄に 1 つ）。chatId: どのチャットの右の欄か */
  | { key: string; kind: "github"; chatId: number; projectId: number }
  /**
   * チャットの画面の右の欄に開いた子チャット（孫・ひ孫も、いちばん上の親の右の欄に開く）。chatId: どのチャットの右の欄か（いちばん上の親）。
   * childId: 子チャット。title: タブに出す名前（開いたときの名前。中身が読み込んだら最新にする）
   */
  | { key: string; kind: "child"; chatId: number; childId: number; projectId: number; title: string }
  /**
   * これから作る子チャット（入力欄だけ。右の欄の「＋」・「子チャットを作成」・「新しい子チャットで聞く」で開く。最初の文を送ると、できた子チャットのタブに置き換わる）。
   * chatId: どのチャットの右の欄か（いちばん上の親）。parentId: 作る子チャットの親（右の欄のチャットと違うとき = 子チャットから孫を作るときだけ）。
   * quote: 入力欄に引用として初めに入れる文（選んだ文・発言）。eventId: 親の会話の聞いた位置（発言の右クリックから）。
   * follow: 作ったあと設定の「子チャットを作ったとき」に従う（右の欄なら置き換え、別ウィンドウ・開かないならタブを閉じる。右の欄の「＋」は従わず、いつも置き換える）。
   * text・attachments: 入力欄に初めに入れる文と添付（「AI に渡す」の「子チャットで聞く」）
   */
  | { key: string; kind: "newChild"; chatId: number; projectId: number; parentId?: number; quote?: string; eventId?: number; follow?: boolean; text?: string; attachments?: Attachment[] }
  /** url は開いたときのページ（webview の初めの src）、current はいま表示しているページ（外のブラウザで開くときに渡す） */
  | { key: string; kind: "browser"; url: string; title: string; current?: string }
  /**
   * cwd: シェルを始めるフォルダ（プロジェクトの本体かワークツリー）。label: タブに出す名前。projectId: どのプロジェクトの作業場所か。key は裏のシェルのキーにも使う。
   * command・title・env: 決まったコマンドで開くタブ（Docker のシェルなど。TerminalTarget）
   */
  | ({ key: string; kind: "terminal" } & TerminalTarget);

/** 内蔵ターミナルを開く場所（タブの列の＋のメニューに出す）。command があれば、そのコマンドを流すタブとして開く */
export interface TerminalTarget {
  cwd: string;
  label: string;
  /** どのプロジェクトのターミナルか */
  projectId: number;
  /** 流すコマンド（ログインシェルの -l -c。終わってもシェルは開き直さず「終了しました」と［もう一度流す］を出す） */
  command?: string;
  /** タブに出す名前（command のタブ。なければ「ターミナル · label」） */
  title?: string;
  /** シェルに足す環境変数 */
  env?: Record<string, string>;
}

/** ボードのタブの列の＋から開けるターミナル（プロジェクトのボードはそのプロジェクトの本体、全プロジェクトのボードは各プロジェクト） */
export function terminalTargets(projects: Project[], projectId?: number): TerminalTarget[] {
  const list = projectId === undefined ? sidebarOrder(projects) : projects.filter((p) => p.id === projectId);
  return list.map((p) => ({ cwd: p.repo_path, label: p.name, projectId: p.id }));
}
