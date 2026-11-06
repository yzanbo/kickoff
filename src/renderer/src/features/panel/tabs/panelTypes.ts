import type { Project, Chat } from "@shared/types";
import { sidebarOrder } from "@/features/project/projectOrder";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";

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
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる）。draftText: 書いている途中の文（下書きのカードに出す）。seed: 初めに入力欄に入れるもの（送信待ちの指示から始めたとき） */
  | ({ key: string; kind: "new"; groupName?: string; draftText?: string; seed?: NewChatSeed } & NewChatTarget)
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
  /** チャットの画面の右の欄に開いた、プロジェクトのメモ（自動で保存）。chatId: どのチャットの右の欄か。path: メモのフォルダからの相対パス */
  | { key: string; kind: "memo"; chatId: number; projectId: number; path: string }
  /**
   * チャットの画面の右の欄に開いた子チャット（孫・ひ孫も、いちばん上の親の右の欄に開く）。chatId: どのチャットの右の欄か（いちばん上の親）。
   * childId: 子チャット。title: タブに出す名前（開いたときの名前。中身が読み込んだら最新にする）
   */
  | { key: string; kind: "child"; chatId: number; childId: number; projectId: number; title: string }
  /**
   * チャットの画面の右の欄の「＋」で開いた、これから作る子チャット（入力欄だけ。最初の文を送ると、できた子チャットのタブに置き換わる）。
   * chatId: どのチャットの右の欄か（作る子チャットの親）
   */
  | { key: string; kind: "newChild"; chatId: number; projectId: number }
  /** url は開いたときのページ（webview の初めの src）、current はいま表示しているページ（外のブラウザで開くときに渡す） */
  | { key: string; kind: "browser"; url: string; title: string; current?: string }
  /** cwd: シェルを始めるフォルダ（プロジェクトの本体かワークツリー）。label: タブに出す名前。projectId: どのプロジェクトの作業場所か。key は裏のシェルのキーにも使う */
  | { key: string; kind: "terminal"; cwd: string; label: string; projectId: number };

/** 内蔵ターミナルを開く場所（タブの列の＋のメニューに出す） */
export interface TerminalTarget {
  cwd: string;
  label: string;
  /** どのプロジェクトのターミナルか */
  projectId: number;
}

/** ボードのタブの列の＋から開けるターミナル（プロジェクトのボードはそのプロジェクトの本体、全プロジェクトのボードは各プロジェクト） */
export function terminalTargets(projects: Project[], projectId?: number): TerminalTarget[] {
  const list = projectId === undefined ? sidebarOrder(projects) : projects.filter((p) => p.id === projectId);
  return list.map((p) => ({ cwd: p.repo_path, label: p.name, projectId: p.id }));
}
