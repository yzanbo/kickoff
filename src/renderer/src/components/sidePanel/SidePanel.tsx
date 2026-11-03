import { Globe, Maximize2, Minimize2, PanelRightClose, SquarePen, SquareTerminal } from "lucide-react";
import { baseName } from "../../format";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { useAnchoredMenu } from "../menus/useAnchoredMenu";
import { TARGET_MENU_WIDTH, targetMenuHeight, TerminalTargetMenu } from "../terminal/TerminalTargetMenu";
import { PanelTab } from "./PanelTab";
import { PanelTabPage } from "./PanelTabPage";
import { tabLabel } from "./panelTabs";
import type { SidePanelController, TerminalTarget } from "./useSidePanel";

/**
 * ボードの右側のパネル（ボードとパネルを並べる要素の中の最後に置く）。プロジェクトのチャット欄でも同じものを使う（sidebar）。
 * タブの列の右端に、新しいチャット・ブラウザ・ターミナルのボタンを並べる（1 回で開く）。
 * onNewChat: 「新しいチャット」を押したとき（どのプロジェクト・グループで始めるかはボードが決める）。
 * terminals: 開けるターミナル（terminalTargets。Mac のアプリでだけ出す）。チャットを開いているときは、そのチャットの作業場所で開く。
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
  // ターミナルの開く場所を選ぶメニュー（開く場所がいくつもあるとき。タブの列のボタン・タブがないときのボタンで共通）
  const terminalMenu = useAnchoredMenu(".panel-tab-terminal, .panel-empty-terminal", TARGET_MENU_WIDTH, "right");
  /** 表示しているチャットの作業場所（ワークツリーならそのフォルダ、本体ならプロジェクトのフォルダ）。チャットでなければ undefined */
  const chatTarget = (): TerminalTarget | undefined => {
    const tab = tabs.find((t) => t.key === activeTab);
    if (tab?.kind !== "chat") return undefined;
    const run = panel.runs.find((r) => r.id === tab.id);
    if (run?.worktree_path) return { cwd: run.worktree_path, label: baseName(run.worktree_path), projectId: run.project_id };
    return terminalTargets.find((t) => t.projectId === tab.projectId);
  };
  /** ターミナルを開く: チャットを表示していればその作業場所、開く場所が 1 つならそこ、いくつもあれば選ぶメニュー */
  const openTerminal = (e: React.MouseEvent<HTMLButtonElement>) => {
    const target = chatTarget() ?? (terminalTargets.length === 1 ? terminalTargets[0] : undefined);
    if (target) return panel.openTerminal(target);
    terminalMenu.toggle(e, targetMenuHeight(terminalTargets.length));
  };
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
        {/* 新しいタブ: チャット・ブラウザ・ターミナルを 1 回で開く */}
        <span className="panel-tab-adds">
          <IconButton icon={SquarePen} label="新しいチャット" size={14} onClick={onNewChat} />
          <IconButton icon={Globe} label="ブラウザを開く" size={14} onClick={() => panel.openBrowser()} />
          {terminalTargets.length > 0 && (
            <IconButton
              icon={SquareTerminal}
              label="ターミナルを開く"
              title="ターミナルを開く（チャットを表示しているときは、その作業場所で開く）"
              size={14}
              className="panel-tab-terminal"
              aria-haspopup={terminalTargets.length > 1 ? "menu" : undefined}
              aria-expanded={terminalTargets.length > 1 ? terminalMenu.isOpen : undefined}
              onClick={openTerminal}
            />
          )}
        </span>
      </div>
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
                onClick={openTerminal}
              >
                <SquareTerminal size={14} /> ターミナルを開く
              </button>
            )}
          </div>
        )}
        {terminalMenu.at && (
          <TerminalTargetMenu
            {...terminalMenu.at}
            targets={terminalTargets}
            ignore={terminalMenu.ignore}
            onPick={panel.openTerminal}
            onClose={terminalMenu.close}
          />
        )}
        {/* タブを切り替えても入力中の文章やスクロール位置が残るよう、開いているタブはすべて保持する */}
        {tabs.map((t) => (
          <PanelTabPage key={t.key} tab={t} panel={panel} panelOpen={panelOpen} onClose={close} />
        ))}
      </div>
    </aside>
  );
}
