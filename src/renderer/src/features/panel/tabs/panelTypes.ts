import type { Project, Chat } from "@shared/types";
import { sidebarOrder } from "@/features/project/projectOrder";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";

/** 新しいチャットを始めるときの指定（どのプロジェクト・グループで始めるか） */
export interface NewChatTarget {
  projectId: number;
  group?: number;
}

/** パネルのタブ（チャット・新しいチャット・サブエージェント・ブラウザ・ターミナル。種類ごとの違いは tabKinds.ts の表） */
export type PanelTab =
  /**
   * title: タブに出すチャットの名前（開いたとき・チャットの画面が読み込んだときに入れる）。
   * chat: タブの中のチャットから届いた最新のチャット（サイドバーの一覧にないチャットでも、状態の印・右クリックのメニューの固定・アーカイブなどに使う）
   */
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number; title?: string; chat?: Chat }
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる）。draftText: 書いている途中の文（下書きのカードに出す）。seed: 初めに入力欄に入れるもの（送信待ちの指示から始めたとき） */
  | ({ key: string; kind: "new"; groupName?: string; draftText?: string; seed?: NewChatSeed } & NewChatTarget)
  /** チャットの中のサブエージェントの中身（toolUseId: Task / Agent の呼び出し ID。title: タブに出す名前） */
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
