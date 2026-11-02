import { Columns2, Maximize2, Minimize2, Plus, SquareTerminal } from "lucide-react";
import { useRef, useState } from "react";
import { cx } from "../../cx";
import { useMenuKeys } from "../../hooks/useMenuKeys";
import { CloseButton, IconButton } from "../IconButton";
import { clampToViewport, PopupMenu } from "../PopupMenu";
import { PanelTab } from "../sidePanel/PanelTab";
import type { TerminalTarget } from "../sidePanel/useSidePanel";
import { TerminalSplit } from "./TerminalSplit";
import type { BottomPanelController } from "./useBottomPanel";

/**
 * 画面の下のパネル（VS Code の「ターミナル」と同じ）。どの画面でも開け、ターミナルはプロジェクトごと（useBottomPanel）。
 * タブは分割でき（⌘\）、ペインを左右に並べる（TerminalSplit）。閉じても要素は残し（hidden）、もう一度開いたら同じ画面に戻る
 */
export function BottomPanel({ panel }: { panel: BottomPanelController }) {
  const { open, tabs, active, maximized, targets } = panel;
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  if (!panel.available) return null;

  /** ＋: 開く場所が 1 つならそこで、いくつもあれば選ぶメニューを出す */
  const add = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (targets.length === 1) return panel.openTerminal(targets[0]);
    if (addMenu) return setAddMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    setAddMenu(clampToViewport(r.right - 220, r.bottom + 4, 220, 16 + targets.length * 34));
  };

  return (
    <section {...panel.panelProps} className={cx("bottom-panel", maximized && "maximized", panel.resizing && "resizing")} hidden={!open} aria-label="ターミナル">
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
            aria-expanded={targets.length > 1 ? addMenu !== null : undefined}
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
      {addMenu && <TargetMenu {...addMenu} targets={targets} onPick={panel.openTerminal} onClose={() => setAddMenu(null)} />}
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
    </section>
  );
}

/** ＋のメニュー: どのプロジェクトでターミナルを開くか（全プロジェクトの画面） */
function TargetMenu({ x, y, targets, onPick, onClose }: { x: number; y: number; targets: TerminalTarget[]; onPick: (t: TerminalTarget) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  return (
    <PopupMenu x={x} y={y} label="ターミナルを開く場所" ignore=".bottom-panel-add" menuRef={ref} onClose={onClose}>
      <div className="menu-label">ターミナルを開く場所</div>
      {targets.map((t) => (
        <button
          key={t.cwd}
          role="menuitem"
          title={t.cwd}
          onClick={() => {
            onClose();
            onPick(t);
          }}
        >
          <SquareTerminal size={14} /> {t.label}
        </button>
      ))}
    </PopupMenu>
  );
}
