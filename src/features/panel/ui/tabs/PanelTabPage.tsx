import { lazy, Suspense } from "react";
import { LazyDatabaseClient } from "@/features/database/ui/LazyDatabaseClient";
import { GitHubTab } from "@/features/github/ui/GitHubTab";
import { CiTab } from "@/features/github/ui/ci/CiTab";
import { DockerTab } from "@/features/docker/ui/DockerTab";
import { TrashTab } from "@/features/trash/ui/TrashTab";
import { SideProjectView } from "@/features/projects/ui/views/SideProjectView";
import { terminalTitle } from "./tabData";
import type { TabPageProps } from "@/features/panel/ui/kind";
import { projectOfPanel } from "@/features/panel/ui/surfaces";
import { openSideBrowser } from "@/features/browser/ui/panel/openBrowserTab";
import type { PanelTab } from "@/features/panel/ui/usePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("@/features/terminal/ui/TerminalPane"));

/** 種類 K のタブの中身に渡すもの */
type PageOf<K extends PanelTab["kind"]> = TabPageProps<Extract<PanelTab, { kind: K }>>;

// まだ持ち主の機能へ移していないタブの種類の中身（種類の項目の Page は tabKinds.ts。チャット・ファイル・ノート・ブラウザの中身は持ち主の機能の種類の項目）。
// 中身を包む枠は TabPageFrame.tsx（Panel が読むのは枠だけ）

// チャットの画面の右の欄だけに開く。プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面
export const ProjectViewPage = ({ tab: t }: PageOf<"projectView">) => <SideProjectView chatId={t.chatId} projectId={t.projectId} worktree={t.worktree} view={t.view} />;

// チャットの画面の右の欄だけに開く。DB クライアント（開いているタブ・木の開き具合はチャットごとに覚える。別ウィンドウと同じ place）
export const DatabasePage = ({ tab: t }: PageOf<"database">) => <LazyDatabaseClient projectId={t.projectId} place={`chat-${t.chatId}`} worktree={t.worktree ?? null} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「GitHub」タブと同じ画面（狭いので一覧と中身を切り替えて出す。絞り込みと開いているものはプロジェクトのタブと共通）
export const GitHubPage = ({ tab: t }: PageOf<"github">) => <GitHubTab projectId={t.projectId} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「CI」「Docker」「ゴミ箱」タブと同じ画面（開いているもの・絞り込みはプロジェクトのタブと共通）
export const CiPage = ({ tab: t }: PageOf<"ci">) => <CiTab projectId={t.projectId} />;
export const DockerPage = ({ tab: t }: PageOf<"docker">) => <DockerTab projectId={t.projectId} />;
export const TrashPage = ({ tab: t }: PageOf<"trash">) => <TrashTab projectId={t.projectId} />;

export function TerminalPage({ tab: t, panel, visible, focused }: PageOf<"terminal">) {
  return (
    <Suspense fallback={<div className="page muted">読み込み中…</div>}>
      <TerminalPane
        termKey={t.key}
        cwd={t.cwd}
        command={t.command}
        env={t.env}
        meta={{ projectId: t.projectId, title: terminalTitle(t) }}
        visible={visible}
        focused={visible && focused}
        // ブラウザは右サイドバー（チャット欄）だけに置くので、そのターミナルのプロジェクトの右サイドバーで開く
        onOpenUrl={(url) => openSideBrowser(t.projectId, url)}
        projectId={projectOfPanel(panel.key)}
      />
    </Suspense>
  );
}
