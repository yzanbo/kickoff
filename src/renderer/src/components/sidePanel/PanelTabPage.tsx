import { lazy, Suspense, type CSSProperties } from "react";
import { BrowserPane } from "../browser/BrowserPane";
import { RunPane } from "../chat/RunPane";
import { SubagentPane } from "../chat/SubagentPane";
import { NewChatPane } from "./NewChatPane";
import type { PanelTab, SidePanelController } from "./useSidePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("../terminal/TerminalPane"));

/**
 * パネルの 1 つのタブの中身（チャット・新しいチャット・サブエージェント・ターミナル・ブラウザ）。
 * タブを切り替えても入力中の文章やスクロール位置が残るよう、表示していないタブも hidden で残す。
 * ペインを分けても作り直さない（webview・ターミナル・入力中の文を保つ）よう、どのタブもパネルの中身の直下に置き、
 * 分けているときは style でそのペインの位置に重ねる。押す・ピントが入るとそのペインにピントを移す
 */
export function PanelTabPage({
  tab: t,
  panel,
  panelOpen,
  paneId,
  active,
  focused,
  style,
}: {
  tab: PanelTab;
  panel: SidePanelController;
  panelOpen: boolean;
  /** タブが入っているペイン */
  paneId: string;
  /** 自分のペインで表示中のタブか */
  active: boolean;
  /** 自分のペインにピントがあるか */
  focused: boolean;
  style?: CSSProperties;
}) {
  const visible = panelOpen && active;
  const focus = () => panel.focusPane(paneId);
  return (
    <div className="panel-tab-page" hidden={!active} style={style} onPointerDownCapture={focus} onFocusCapture={focus}>
      {t.kind === "chat" ? (
        <RunPane
          projectId={t.projectId}
          runId={t.id}
          focus={t.focus}
          visible={visible}
          onOpenSubagent={(toolUseId, title) => panel.openSubagent({ runId: t.id, projectId: t.projectId, toolUseId, title })}
          onRunChange={(run) =>
            panel.updateTab(t.key, (x) =>
              x.kind === "chat" && (x.title !== run.title || x.status !== run.status || x.attention !== run.attention)
                ? { ...x, title: run.title, status: run.status, attention: run.attention }
                : x,
            )
          }
        />
      ) : t.kind === "new" ? (
        <NewChatPane
          projectId={t.projectId}
          group={t.group}
          projects={panel.projects}
          onProjectChange={(projectId) => panel.updateTab(t.key, () => ({ ...t, projectId, group: undefined, groupName: undefined }))}
          onGroupChange={(group, groupName) => panel.updateTab(t.key, (x) => (x.kind === "new" ? { ...x, group, groupName } : x))}
          onCreated={(run) => panel.replaceWithChat(t.key, run)}
          onDraftChange={(text) => panel.updateTab(t.key, (x) => (x.kind === "new" && (x.draftText ?? "") !== text ? { ...x, draftText: text } : x))}
        />
      ) : t.kind === "subagent" ? (
        <SubagentPane projectId={t.projectId} runId={t.runId} toolUseId={t.toolUseId} />
      ) : t.kind === "terminal" ? (
        <Suspense fallback={<div className="page muted">読み込み中…</div>}>
          <TerminalPane termKey={t.key} cwd={t.cwd} visible={visible} focused={visible && focused} onOpenUrl={(url) => panel.openBrowser(url)} />
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
