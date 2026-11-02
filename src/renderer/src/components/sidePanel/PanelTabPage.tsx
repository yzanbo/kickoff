import { lazy, Suspense } from "react";
import { BrowserPane } from "../browser/BrowserPane";
import { RunPane } from "../chat/RunPane";
import { NewChatPane } from "./NewChatPane";
import type { PanelTab, SidePanelController, TerminalTarget } from "./useSidePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("../terminal/TerminalPane"));

/**
 * パネルの 1 つのタブの中身（チャット・新しいチャット・ターミナル・ブラウザ）。
 * タブを切り替えても入力中の文章やスクロール位置が残るよう、表示していないタブも hidden で残す。
 * terminalTargets: タブの列の＋から開けるターミナル（空ならチャットからターミナルを開けない）
 */
export function PanelTabPage({
  tab: t,
  panel,
  panelOpen,
  onClose,
  terminalTargets,
}: {
  tab: PanelTab;
  panel: SidePanelController;
  panelOpen: boolean;
  onClose: () => void;
  terminalTargets: TerminalTarget[];
}) {
  const active = panel.activeTab === t.key;
  const visible = panelOpen && active;
  return (
    <div className="panel-tab-page" hidden={!active}>
      {t.kind === "chat" ? (
        <RunPane
          projectId={t.projectId}
          runId={t.id}
          focus={t.focus}
          visible={visible}
          onClose={onClose}
          onOpenTerminal={terminalTargets.length > 0 ? panel.openTerminal : undefined}
          onRunChange={(run) =>
            panel.updateTab(t.key, (x) => (x.kind === "chat" && (x.title !== run.title || x.phase !== run.phase) ? { ...x, title: run.title, phase: run.phase } : x))
          }
        />
      ) : t.kind === "new" ? (
        <NewChatPane
          projectId={t.projectId}
          section={t.section}
          group={t.group}
          projects={panel.projects}
          onProjectChange={(projectId) => panel.updateTab(t.key, () => ({ ...t, projectId, group: undefined, groupName: undefined }))}
          onGroupChange={(group, groupName) => panel.updateTab(t.key, (x) => (x.kind === "new" ? { ...x, group, groupName } : x))}
          onClose={onClose}
          onCreated={(run) => panel.replaceWithChat(t.key, run)}
          onDraftChange={(text) => panel.updateTab(t.key, (x) => (x.kind === "new" && (x.draftText ?? "") !== text ? { ...x, draftText: text } : x))}
        />
      ) : t.kind === "terminal" ? (
        <Suspense fallback={<div className="page muted">読み込み中…</div>}>
          <TerminalPane termKey={t.key} cwd={t.cwd} visible={visible} onOpenUrl={(url) => panel.openBrowser(url)} />
        </Suspense>
      ) : (
        <BrowserPane
          url={t.url}
          onChange={({ url, title }) =>
            // 空のページのあいだは「新しいタブ」と表示する
            panel.updateTab(t.key, (x) => (x.kind === "browser" ? { ...x, title: url === "about:blank" ? "" : title } : x))
          }
        />
      )}
    </div>
  );
}
