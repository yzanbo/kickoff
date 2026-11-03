import { lazy, Suspense } from "react";
import { BrowserPane } from "../browser/BrowserPane";
import { RunPane } from "../chat/RunPane";
import { NewChatPane } from "./NewChatPane";
import { isTabVisible } from "./paneLayout";
import type { PanelTab, SidePanelController } from "./useSidePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("../terminal/TerminalPane"));

/**
 * パネルの 1 つのタブの中身（チャット・新しいチャット・ターミナル・ブラウザ）。
 * タブを切り替えても入力中の文章やスクロール位置が残るよう、表示していないタブも hidden で残す。
 */
export function PanelTabPage({
  tab: t,
  panel,
  panelOpen,
  onClose,
}: {
  tab: PanelTab;
  panel: SidePanelController;
  panelOpen: boolean;
  onClose: () => void;
}) {
  // 分割していれば、自分のペインで表示中のタブか
  const active = isTabVisible(panel.layout, t.key);
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
          onRunChange={(run) =>
            panel.updateTab(t.key, (x) => (x.kind === "chat" && x.title !== run.title ? { ...x, title: run.title } : x))
          }
        />
      ) : t.kind === "new" ? (
        <NewChatPane
          projectId={t.projectId}
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
