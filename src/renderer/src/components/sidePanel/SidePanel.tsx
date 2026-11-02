import { Globe, Maximize2, MessageSquare, Minimize2, PanelRightClose, PanelRightOpen, Plus, SquarePen, SquareTerminal, type LucideIcon } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import type { Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import { cx } from "../../cx";
import { useMenuKeys } from "../../hooks/useMenuKeys";
import { RunPage } from "../../pages/RunPage";
import { normalizeUrl } from "../../url";
import { BrowserPane } from "../browser/BrowserPane";
import { IconButton } from "../IconButton";
import { NewChatPane } from "../NewChatPane";
import { clampToViewport, PopupMenu } from "../PopupMenu";
import { targetMenuAt, TerminalTargetMenu } from "../terminal/TerminalTargetMenu";
import { PanelTab } from "./PanelTab";
import type { PanelTab as PanelTabData, SidePanelController, TerminalTarget } from "./useSidePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("../terminal/TerminalPane"));

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host || url;
  } catch {
    return url;
  }
}

/**
 * タブに出す名前とアイコン。チャットかブラウザかがひと目でわかるよう、チャットは吹き出し（セクションの色）、
 * ブラウザは地球儀、新しいチャットはペン、ターミナルは端末の印にする
 */
function tabLabel(t: PanelTabData, runs: Run[]): { Icon: LucideIcon; iconClass?: string; label: string } {
  if (t.kind === "browser") return { Icon: Globe, label: t.title || (t.url ? hostOf(t.url) : "新しいタブ") };
  if (t.kind === "terminal") return { Icon: SquareTerminal, label: `ターミナル · ${t.label}` };
  if (t.kind === "new") return { Icon: SquarePen, label: t.groupName ? `新しいチャット · ${t.groupName}` : "新しいチャット" };
  // ボードの一覧にあればその最新の名前、なければタブが覚えている名前（アーカイブ済み・絞り込みで外れたチャットなど）
  const run = runs.find((r) => r.id === t.id);
  const title = run?.title ?? t.title;
  const phase = run?.phase ?? t.phase;
  return { Icon: MessageSquare, iconClass: phase ? `sec-icon sec-${phase}` : "muted", label: title === undefined ? "チャット" : chatTitle(title) };
}

/**
 * ボードの右側のパネル（ボードとパネルを並べる要素の中の最後に置く）。プロジェクトのチャット欄でも同じものを使う（sidebar）。
 * onNewChat: タブの列の＋で「新しいチャット」を選んだとき（どのプロジェクト・グループで始めるかはボードが決める）。
 * terminals: タブの列の＋から開けるターミナル（terminalTargets。Mac のアプリでだけ出す）。
 * sidebar: プロジェクトのチャット欄として使うとき（開閉は欄が持つ。幅の変更・横幅いっぱいは欄の側で行うので出さない）
 */
export function SidePanel({
  panel,
  onNewChat,
  terminals,
  sidebar,
}: {
  panel: SidePanelController;
  onNewChat: () => void;
  terminals: TerminalTarget[];
  sidebar?: { open: boolean; onClose: () => void };
}) {
  const { tabs, activeTab, maximized } = panel;
  const panelOpen = sidebar ? sidebar.open : panel.panelOpen;
  const close = sidebar ? sidebar.onClose : panel.close;
  const terminalTargets = window.kickoff?.terminal ? terminals : [];
  // タブの列の＋のメニュー（新しいチャット・ブラウザ・ターミナル）
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  // タブがないときの「ターミナルを開く」で、開く場所を選ぶメニュー（全プロジェクトのボード）
  const [terminalMenu, setTerminalMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <aside className={cx("board-panel", sidebar && "as-sidebar")} aria-hidden={!panelOpen}>
      {!sidebar && (
        <div
          inert={!panelOpen}
          className="panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="パネルの幅を変える"
          title="ドラッグで幅を変える"
          onPointerDown={panel.startResize}
        />
      )}
      <div className="panel-tabs" role="tablist" inert={!panelOpen}>
        <div className="panel-controls">
          {/* 横から出てきたパネルを、横へしまう（タブはそのまま残る） */}
          <button className="panel-control" title={sidebar ? "チャット欄を閉じる（⌥⌘B）" : "パネルを閉じる（Esc）"} aria-label="パネルを閉じる" onClick={close}>
            <PanelRightClose size={15} />
          </button>
          {!sidebar && (
            <button
              className="panel-control"
              title={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
              aria-label={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
              aria-pressed={maximized}
              onClick={panel.toggleMaximized}
            >
              {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
        </div>
        {tabs.map((t) => {
          const { Icon, iconClass, label } = tabLabel(t, panel.runs);
          return (
            <PanelTab
              key={t.key}
              active={activeTab === t.key}
              icon={Icon}
              iconClass={iconClass}
              label={label}
              title={t.kind === "browser" ? t.url : t.kind === "terminal" ? t.cwd : label}
              onSelect={() => panel.showTab(t.key)}
              onClose={() => panel.closeTab(t.key)}
            />
          );
        })}
        <IconButton
          icon={Plus}
          label="新しいタブ"
          title={terminalTargets.length > 0 ? "新しいタブ（チャット・ブラウザ・ターミナル）" : "新しいタブ（チャット・ブラウザ）"}
          className="panel-tab-add"
          aria-haspopup="menu"
          aria-expanded={addMenu !== null}
          onClick={(e) => {
            // 開いているときに押したら閉じる
            if (addMenu) return setAddMenu(null);
            const r = e.currentTarget.getBoundingClientRect();
            setAddMenu(clampToViewport(r.left, r.bottom + 4, 220, addMenuHeight(terminalTargets.length)));
          }}
        />
      </div>
      {addMenu && (
        <AddTabMenu
          {...addMenu}
          onNewChat={onNewChat}
          onBrowser={() => panel.openBrowser()}
          terminals={terminalTargets}
          onTerminal={panel.openTerminal}
          onClose={() => setAddMenu(null)}
        />
      )}
      <div className="panel-content" inert={!panelOpen}>
        {tabs.length === 0 && (
          <div className="panel-empty">
            {sidebar ? (
              <button className="btn" onClick={onNewChat}>
                <SquarePen size={14} /> 新しいチャット
              </button>
            ) : (
              <p className="muted small">カードを押すと、ここにチャットが開きます。</p>
            )}
            <button className="btn" onClick={() => panel.openBrowser()}>
              <Globe size={14} /> ブラウザを開く
            </button>
            {terminalTargets.length > 0 && (
              <button
                className="btn panel-empty-terminal"
                aria-haspopup={terminalTargets.length > 1 ? "menu" : undefined}
                onClick={(e) => {
                  if (terminalTargets.length === 1) return panel.openTerminal(terminalTargets[0]);
                  setTerminalMenu(terminalMenu ? null : targetMenuAt(e.currentTarget, terminalTargets.length));
                }}
              >
                <SquareTerminal size={14} /> ターミナルを開く
              </button>
            )}
          </div>
        )}
        {terminalMenu && (
          <TerminalTargetMenu
            {...terminalMenu}
            targets={terminalTargets}
            ignore=".panel-empty-terminal"
            onPick={panel.openTerminal}
            onClose={() => setTerminalMenu(null)}
          />
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
                onClose={close}
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
                onClose={close}
                onCreated={(run) => panel.replaceWithChat(t.key, run)}
                onDraftChange={(text) => panel.updateTab(t.key, (x) => (x.kind === "new" && (x.draftText ?? "") !== text ? { ...x, draftText: text } : x))}
              />
            ) : t.kind === "terminal" ? (
              <Suspense fallback={<div className="page muted">読み込み中…</div>}>
                <TerminalPane termKey={t.key} cwd={t.cwd} visible={panelOpen && activeTab === t.key} onOpenUrl={(url) => panel.openBrowser(url)} />
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
        ))}
      </div>
    </aside>
  );
}

/** タブの列の＋のメニューの高さ（画面からはみ出さない位置を決めるため） */
const addMenuHeight = (terminals: number) => 90 + (terminals === 1 ? 34 : terminals > 1 ? 40 + terminals * 34 : 0);

/**
 * タブの列の＋のメニュー: 新しいチャット・ブラウザ・ターミナルのタブを開く。
 * ターミナルは開く場所が 1 つ（プロジェクトのボード）なら 1 項目、いくつもある（全プロジェクトのボード）ならプロジェクトごとに並べる
 */
function AddTabMenu({
  x,
  y,
  onNewChat,
  onBrowser,
  terminals,
  onTerminal,
  onClose,
}: {
  x: number;
  y: number;
  onNewChat: () => void;
  onBrowser: () => void;
  terminals: TerminalTarget[];
  onTerminal: (target: TerminalTarget) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  const pick = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <PopupMenu x={x} y={y} label="新しいタブ" ignore=".panel-tab-add" menuRef={ref} onClose={onClose}>
      <button role="menuitem" onClick={() => pick(onNewChat)}>
        <SquarePen size={14} /> 新しいチャット
      </button>
      <button role="menuitem" onClick={() => pick(onBrowser)}>
        <Globe size={14} /> ブラウザ
      </button>
      {terminals.length === 1 && (
        <button role="menuitem" onClick={() => pick(() => onTerminal(terminals[0]))}>
          <SquareTerminal size={14} /> ターミナル
        </button>
      )}
      {terminals.length > 1 && (
        <>
          <div className="menu-separator" role="separator" />
          <div className="menu-label">ターミナル</div>
          {terminals.map((target) => (
            <button key={target.cwd} role="menuitem" title={target.cwd} onClick={() => pick(() => onTerminal(target))}>
              <SquareTerminal size={14} /> {target.label}
            </button>
          ))}
        </>
      )}
    </PopupMenu>
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
