import { Container, Database, FileDiff, FileText, GitPullRequest, SquareTerminal, Trash2, Workflow, type LucideIcon } from "lucide-react";
import { api } from "@/foundation/ui/api";
import { baseName } from "@/foundation/ui/lib/format";
import { ProjectViewTabLead } from "@/features/projects/ui/views/ProjectViewTabLead";
import { defineTabKind, type AnyTabKind } from "@/features/panel/ui/kind";
import { PROJECT_VIEW_LABELS, type PanelTab, type ProjectTool } from "./panelTypes";
import { terminalTitle } from "./tabData";
import { ChangesPage, CiPage, DatabasePage, DockerPage, GitHubPage, ProjectViewPage, TerminalPage, TrashPage } from "./PanelTabPage";

/**
 * パネルのタブの種類（panelTypes.ts の `PanelTab` の kind）ごとの決まり（defineTabKind の項目）。
 * アイコンと名前・どのプロジェクトのものか・中身を作る時・閉じたときの後始末・別ウィンドウの行き先・中身の部品を、種類で分岐させずにここから引く。
 * タブを作る関数（キーの決め方）は tabData.ts
 */

type TabOf<K extends PanelTab["kind"]> = Extract<PanelTab, { kind: K }>;
type ToolTab = TabOf<"github" | ProjectTool>;

/** 右の欄に欄に 1 つだけ開く、プロジェクトのタブと同じ画面（GitHub・CI・Docker・ゴミ箱）の種類の決まり。違うのはアイコンと名前だけ */
function projectToolKind(id: ToolTab["kind"], icon: LucideIcon, label: string, hint: string, Page: AnyTabKind["Page"]): AnyTabKind {
  return defineTabKind<ToolTab>({
    id,
    icon,
    label: () => label,
    hint: () => hint,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    Page,
  });
}

/**
 * まだ持ち主の機能へ移していない 8 種類（ui/contributes.ts が panelTabs に入れる。中身の部品は PanelTabPage.tsx）。
 * チャットの 5 種類は chatPanel、ファイル 2 種類は files、ノートは notes、ブラウザは browser の ui/contributes.ts が入れる
 */
export const PANEL_TAB_KINDS: readonly AnyTabKind[] = [
  defineTabKind<TabOf<"changes">>({
    id: "changes",
    icon: FileDiff,
    label: () => "変更",
    hint: (t) => `コミットしていない変更（${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    popout: (t) => ({
      route: { kind: "changes", chatId: t.chatId, projectId: t.projectId, ...(t.worktree ? { worktree: t.worktree } : {}) },
      title: `変更 — ${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}`,
    }),
    Page: ChangesPage,
  }),
  defineTabKind<TabOf<"projectView">>({
    id: "projectView",
    icon: FileText,
    // アイコンはプロジェクトの左の列のタブと同じ
    Lead: ProjectViewTabLead,
    label: (t) => PROJECT_VIEW_LABELS[t.view],
    hint: (t) => `プロジェクトの「${PROJECT_VIEW_LABELS[t.view]}」（${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}から）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    Page: ProjectViewPage,
  }),
  defineTabKind<TabOf<"database">>({
    id: "database",
    icon: Database,
    label: () => "DB",
    hint: (t) => `DB クライアント（SQLite は${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}のファイル）`,
    projectOf: (t) => t.projectId,
    // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
    ownerChatId: (t) => t.chatId,
    popout: (t) => ({
      route: { kind: "database", chatId: t.chatId, projectId: t.projectId, ...(t.worktree ? { worktree: t.worktree } : {}) },
      title: `DB — ${t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体"}`,
    }),
    Page: DatabasePage,
  }),
  projectToolKind("github", GitPullRequest, "GitHub", "GitHub（このプロジェクトの連携先の issue・PR）", GitHubPage),
  projectToolKind("ci", Workflow, "CI", "CI の結果（このプロジェクトの GitHub Actions の実行）", CiPage),
  projectToolKind("docker", Container, "Docker", "Docker（このプロジェクトの compose のサービス）", DockerPage),
  projectToolKind("trash", Trash2, "ゴミ箱", "ゴミ箱（3 日で消えます）", TrashPage),
  defineTabKind<TabOf<"terminal">>({
    id: "terminal",
    icon: SquareTerminal,
    label: terminalTitle,
    hint: (t) => (t.command ? `${t.command}\n${t.cwd}` : t.cwd),
    projectOf: (t) => t.projectId,
    // シェルを止める（コアの API。もう終わっていれば 404 なので、失敗は捨てる）
    dispose: (t) => void (globalThis.window?.kickoff?.terminal && api.closeTerminal(t.key).catch(() => {})),
    // 同じシェルに別ウィンドウからつなぎ直す（移すときはシェルを止めない。popOutTab の keep）
    popout: (t, panel) => {
      const { key, kind: _kind, ...target } = t;
      return { route: { kind: "terminal", panel, key, ...target }, title: `${terminalTitle(t)} — ターミナル` };
    },
    Page: TerminalPage,
  }),
];
