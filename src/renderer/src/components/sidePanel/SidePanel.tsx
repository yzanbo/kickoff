import { Globe, Maximize2, Minimize2, PanelRightClose, Plus, SquarePen, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { clampToViewport } from "../PopupMenu";
import { targetMenuAt, TerminalTargetMenu } from "../terminal/TerminalTargetMenu";
import { AddTabMenu, addMenuHeight } from "./AddTabMenu";
import { PanelTab } from "./PanelTab";
import { PanelTabPage } from "./PanelTabPage";
import { tabLabel } from "./panelTabs";
import type { SidePanelController, TerminalTarget } from "./useSidePanel";

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
          <PanelTabPage key={t.key} tab={t} panel={panel} panelOpen={panelOpen} onClose={close} terminalTargets={terminalTargets} />
        ))}
      </div>
    </aside>
  );
}
