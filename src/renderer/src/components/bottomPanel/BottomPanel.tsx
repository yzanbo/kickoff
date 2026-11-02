import { Columns2, Maximize2, Minimize2, Plus, SquareTerminal } from "lucide-react";
import { cx } from "../../cx";
import { CloseButton, IconButton } from "../IconButton";
import { PanelTab } from "../sidePanel/PanelTab";
import { useAnchoredMenu } from "../menus/useAnchoredMenu";
import { TARGET_MENU_WIDTH, targetMenuHeight, TerminalTargetMenu } from "../terminal/TerminalTargetMenu";
import { TerminalSplit } from "./TerminalSplit";
import type { BottomPanelController } from "./useBottomPanel";

/**
 * 画面の下のパネル（VS Code の「ターミナル」と同じ）。どの画面でも開け、ターミナルはプロジェクトごと（useBottomPanel）。
 * タブは分割でき（⌘\）、ペインを左右に並べる（TerminalSplit）。閉じても要素は残し（hidden）、もう一度開いたら同じ画面に戻る
 */
export function BottomPanel({ panel }: { panel: BottomPanelController }) {
  const { open, tabs, active, maximized, targets } = panel;
  const addMenu = useAnchoredMenu(".bottom-panel-add", TARGET_MENU_WIDTH, "right");
  if (!panel.available) return null;

  /** ＋: 開く場所が 1 つならそこで、いくつもあれば選ぶメニューを出す */
  const add = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (targets.length === 1) return panel.openTerminal(targets[0]);
    addMenu.toggle(e, targetMenuHeight(targets.length));
  };

  return (
    <section {...panel.panelProps} className={cx("bottom-panel", open && "open", maximized && "maximized", panel.resizing && "resizing")}
      inert={!open}
      aria-hidden={!open}
      aria-label="ターミナル"
    >
      <div className="bottom-panel-inner">
      <div
        className="bottom-panel-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="パネルの高さを変える"
        title="ドラッグで高さを変える（ダブルクリックで元の高さ）"
        onPointerDown={panel.startResize}
        onDoubleClick={panel.resetHeight}
      />
      <div className="bottom-panel-bar">
        <span className="bottom-panel-title">ターミナル</span>
        <div className="panel-tabs bottom-panel-tabs" role="tablist">
          {tabs.map((t) => (
            <PanelTab
              key={t.key}
              active={active === t.key}
              icon={SquareTerminal}
              // 分割しているタブは、ペインの数も出す
              label={t.panes.length > 1 ? `${t.label} (${t.panes.length})` : t.label}
              title={t.panes.map((p) => p.cwd).join("\n")}
              onSelect={() => panel.showTab(t.key)}
              onClose={() => panel.closeTab(t.key)}
            />
          ))}
        </div>
        <span className="spacer" />
        {targets.length > 0 && (
          <IconButton
            icon={Plus}
            label="新しいターミナル"
            className="bottom-panel-add"
            aria-haspopup={targets.length > 1 ? "menu" : undefined}
            aria-expanded={targets.length > 1 ? addMenu.isOpen : undefined}
            onClick={add}
          />
        )}
        {active && <IconButton icon={Columns2} size={14} label="ターミナルを分割" title="ターミナルを分割（⌘\）" onClick={panel.split} />}
        <IconButton
          icon={maximized ? Minimize2 : Maximize2}
          size={13}
          label={maximized ? "元の高さに戻す" : "パネルを最大化"}
          aria-pressed={maximized}
          onClick={panel.toggleMaximized}
        />
        <CloseButton label="パネルを閉じる" title="閉じる（⌃` / ⌘J）" size={15} onClick={panel.close} />
      </div>
      {addMenu.at && <TerminalTargetMenu {...addMenu.at} targets={targets} ignore={addMenu.ignore} onPick={panel.openTerminal} onClose={addMenu.close} />}
      <div className="bottom-panel-body">
        {tabs.length === 0 && (
          <div className="bottom-panel-empty">
            {targets.length === 0 ? (
              <p className="muted small">プロジェクトを作ると、ここでターミナルを開けます。</p>
            ) : (
              <>
                <p className="muted small">ターミナルを開く場所</p>
                <div className="bottom-panel-targets">
                  {targets.map((t) => (
                    <button key={t.cwd} className="btn btn-sm" title={t.cwd} onClick={() => panel.openTerminal(t)}>
                      <SquareTerminal size={13} /> {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {/* タブ・プロジェクトを切り替えても画面が残るよう、すべてのプロジェクトのタブを保持する（見せるのはこの画面の表示中のタブだけ） */}
        {panel.groups.map((g) => (
          <div key={g.key} className="bottom-panel-page" hidden={active !== g.key}>
            <TerminalSplit
              group={g}
              visible={open && active === g.key}
              onFocusPane={(paneKey) => panel.focusPane(g.key, paneKey)}
              onClosePane={(paneKey) => panel.closePane(g.key, paneKey)}
              onResize={(sizes) => panel.resizePanes(g.key, sizes)}
            />
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
