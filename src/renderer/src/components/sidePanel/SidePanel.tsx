import { Globe, Maximize2, MessageSquare, Minimize2, PanelRightClose, PanelRightOpen, Plus, SquarePen, X, type LucideIcon } from "lucide-react";
import type { Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import { cx } from "../../cx";
import { RunPage } from "../../pages/RunPage";
import { normalizeUrl } from "../../url";
import { BrowserPane } from "../BrowserPane";
import { NewChatPane } from "../NewChatPane";
import type { PanelTab, SidePanelController } from "./useSidePanel";

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host || url;
  } catch {
    return url;
  }
}

/**
 * タブに出す名前とアイコン。チャットかブラウザかがひと目でわかるよう、チャットは吹き出し（セクションの色）、
 * ブラウザは地球儀、新しいチャットはペンにする
 */
function tabLabel(t: PanelTab, runs: Run[]): { Icon: LucideIcon; iconClass?: string; label: string } {
  if (t.kind === "browser") return { Icon: Globe, label: t.title || (t.url ? hostOf(t.url) : "新しいタブ") };
  if (t.kind === "new") return { Icon: SquarePen, label: t.groupName ? `新しいチャット · ${t.groupName}` : "新しいチャット" };
  // ボードの一覧にあればその最新の名前、なければタブが覚えている名前（アーカイブ済み・絞り込みで外れたチャットなど）
  const run = runs.find((r) => r.id === t.id);
  const title = run?.title ?? t.title;
  const phase = run?.phase ?? t.phase;
  return { Icon: MessageSquare, iconClass: phase ? `sec-icon sec-${phase}` : "muted", label: title === undefined ? "チャット" : chatTitle(title) };
}

/** ボードの右側のパネル（ボードとパネルを並べる要素の中の最後に置く） */
export function SidePanel({ panel }: { panel: SidePanelController }) {
  const { tabs, activeTab, panelOpen, maximized } = panel;
  return (
    <aside className="board-panel" aria-hidden={!panelOpen}>
      <div
        inert={!panelOpen}
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="パネルの幅を変える"
        title="ドラッグで幅を変える"
        onPointerDown={panel.startResize}
      />
      <div className="panel-tabs" role="tablist" inert={!panelOpen}>
        <div className="panel-controls">
          {/* 横から出てきたパネルを、横へしまう（タブはそのまま残る） */}
          <button className="panel-control" title="パネルを閉じる（Esc）" aria-label="パネルを閉じる" onClick={panel.close}>
            <PanelRightClose size={15} />
          </button>
          <button
            className="panel-control"
            title={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
            aria-label={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
            aria-pressed={maximized}
            onClick={panel.toggleMaximized}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
        {tabs.map((t) => {
          const { Icon, iconClass, label } = tabLabel(t, panel.runs);
          return (
            <div key={t.key} className={cx("panel-tab", activeTab === t.key && "active")} role="tab" aria-selected={activeTab === t.key}>
              <button className="panel-tab-label" onClick={() => panel.showTab(t.key)} title={t.kind === "browser" ? t.url : label}>
                <Icon size={12} className={iconClass} aria-hidden />
                <span>{label}</span>
              </button>
              <button className="panel-tab-close" aria-label={`${label} のタブを閉じる`} onClick={() => panel.closeTab(t.key)}>
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button className="panel-tab-add" title="ブラウザのタブを開く" aria-label="ブラウザのタブを開く" onClick={panel.openBrowser}>
          <Plus size={12} />
          <Globe size={12} />
        </button>
      </div>
      <div className="panel-content" inert={!panelOpen}>
        {tabs.length === 0 && (
          <div className="panel-empty">
            <p className="muted small">カードを押すと、ここにチャットが開きます。</p>
            <button className="btn" onClick={panel.openBrowser}>
              <Globe size={14} /> ブラウザを開く
            </button>
          </div>
        )}
        {/* タブを切り替えても入力中の文章やスクロール位置が残るよう、開いているタブはすべて保持する */}
        {tabs.map((t) => (
          <div key={t.key} className="panel-tab-page" hidden={activeTab !== t.key}>
            {t.kind === "chat" ? (
              <RunPage
                projectId={t.projectId}
                runId={t.id}
                focus={t.focus}
                visible={panelOpen && activeTab === t.key}
                onClose={panel.close}
                onRunChange={(run) =>
                  panel.updateTab(t.key, (x) => (x.kind === "chat" && (x.title !== run.title || x.phase !== run.phase) ? { ...x, title: run.title, phase: run.phase } : x))
                }
              />
            ) : t.kind === "new" ? (
              <NewChatPane
                projectId={t.projectId}
                section={t.section}
                stage={t.stage}
                group={t.group}
                projects={panel.projects}
                onProjectChange={(projectId) => panel.updateTab(t.key, () => ({ ...t, projectId, group: undefined, groupName: undefined }))}
                onGroupChange={(group, groupName) => panel.updateTab(t.key, (x) => (x.kind === "new" ? { ...x, group, groupName } : x))}
                onClose={panel.close}
                onCreated={(run) => panel.replaceWithChat(t.key, run)}
              />
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
        ))}
      </div>
    </aside>
  );
}

/** ボードの見出し（「ボード／リスト」の右）に置く、パネルの開閉ボタン。閉じていて開いたタブがあれば数を出す */
export function PanelToggle({ panel }: { panel: SidePanelController }) {
  const { panelOpen, tabs } = panel;
  return (
    <button
      className={cx("icon-button panel-toggle", panelOpen && "active")}
      title={panelOpen ? "右側のパネルを閉じる（Esc）" : "右側のパネルを開く"}
      aria-label={panelOpen ? "右側のパネルを閉じる" : "右側のパネルを開く"}
      aria-pressed={panelOpen}
      onClick={panel.toggle}
    >
      {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
      {!panelOpen && tabs.length > 0 && <span className="panel-toggle-count">{tabs.length}</span>}
    </button>
  );
}
