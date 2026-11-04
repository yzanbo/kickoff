import type { Project, Chat } from "@shared/types";
import { sidebarOrder } from "@/features/project/projectOrder";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";

/** 新しいチャットを始めるときの指定（どのプロジェクト・グループで始めるか） */
export interface NewChatTarget {
  projectId: number;
  group?: number;
}

/** 右側のパネルのタブ（チャット・新しいチャット・サブエージェント・ブラウザ・ターミナル） */
export type PanelTab =
  /** title: タブに出すチャットの名前（開いたとき・チャットの画面が読み込んだときに入れる） */
  /** status / attention: タブの中のチャットから届いた最新の状態（ボードの一覧にないチャットでも、タブに状態の印を出すため） */
  /** run: タブの中のチャットから届いた最新のチャット（右クリックのメニューの固定・アーカイブ・セッション ID などに使う） */
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number; title?: string; status?: Chat["status"]; unread?: boolean; chat?: Chat }
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる）。draftText: 書いている途中の文（下書きのカードに出す）。seed: 初めに入力欄に入れるもの（送信待ちの指示から始めたとき） */
  | ({ key: string; kind: "new"; groupName?: string; draftText?: string; seed?: NewChatSeed } & NewChatTarget)
  /** チャットの中のサブエージェントの中身（toolUseId: Task / Agent の呼び出し ID。title: タブに出す名前） */
  | { key: string; kind: "subagent"; chatId: number; projectId: number; toolUseId: string; title: string }
  /** url は開いたときのページ（webview の初めの src）、current はいま表示しているページ（外のブラウザで開くときに渡す） */
  | { key: string; kind: "browser"; url: string; title: string; current?: string }
  /** cwd: シェルを始めるフォルダ（プロジェクトの本体かワークツリー）。label: タブに出す名前。key は裏のシェルのキーにも使う */
  | { key: string; kind: "terminal"; cwd: string; label: string };

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
