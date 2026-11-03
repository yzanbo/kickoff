import { FoldHorizontal, PanelRightClose, UnfoldHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { baseName } from "../../format";
import { cx } from "../../cx";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { useAnchoredMenu } from "../menus/useAnchoredMenu";
import { clampToViewport } from "../PopupMenu";
import { TARGET_MENU_WIDTH, targetMenuHeight, TerminalTargetMenu } from "../terminal/TerminalTargetMenu";
import { PaneSash, fracStyle } from "./PaneSash";
import { PaneTabBar } from "./PaneTabBar";
import { PanelEmpty } from "./PanelEmpty";
import { PanelTabPage } from "./PanelTabPage";
import { layoutRects } from "./paneGeometry";
import { focusedPane, leavesOf, type PaneLeaf } from "./paneLayout";
import { TAB_MENU_WIDTH, TabMenu, tabMenuHeight } from "./TabMenu";
import { useRunRename } from "../../hooks/useRunRename";
import { useTabDrag } from "./useTabDrag";
import type { SidePanelController, TerminalTarget } from "./useSidePanel";
import { useBoardHeaderLayoutMenu } from "../board/useBoardHeaderLayoutMenu";

/**
 * ボードの右側のパネル（ボードとパネルを並べる要素の中の最後に置く）。プロジェクトのチャット欄でも同じものを使う（sidebar）。
 * タブは上下・左右のペインに分けて並べられる（VS Code のエディターと同じ）。分けていないときは、タブの列 → 中身の 1 段。
 * 分けているときは、中身の中にペインごとのタブの列と境目のつまみを、割合の位置で重ねる（タブの中身はいつも中身の直下に置き、作り直さない）。
 * 各ペインのタブの列の右端に、新しいチャット・ブラウザ・ターミナルと、右・下に分けるボタンを並べる。
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
  const { tabs, maximized, layout } = panel;
  const panelOpen = sidebar ? sidebar.open : panel.panelOpen;
  const close = sidebar ? sidebar.onClose : panel.close;
  const terminalTargets = window.kickoff?.terminal ? terminals : [];
  const asideRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useTabDrag(panel);
  // タブの右クリックのメニュー
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  // チャットのタブの名前をその場で変える（タブのダブルクリック・右クリックの「名前を変更」で共通）
  const rename = useRunRename();
  // 境目をドラッグしている間（中身の上でポインターを奪われないようにする）
  const [resizing, setResizing] = useState(false);
  const leaves = leavesOf(layout.root);
  const split = leaves.length > 1;
  const { panes, sashes } = layoutRects(layout.root);
  // ターミナルの開く場所を選ぶメニュー（開く場所がいくつもあるとき。タブの列のボタン・タブがないときのボタンで共通）
  const terminalMenu = useAnchoredMenu(".panel-tab-terminal, .panel-empty-terminal", TARGET_MENU_WIDTH, "right");
  /** ペインで表示しているチャットの作業場所（ワークツリーならそのフォルダ、本体ならプロジェクトのフォルダ）。チャットでなければ undefined */
  const chatTarget = (pane: PaneLeaf): TerminalTarget | undefined => {
    const tab = tabs.find((t) => t.key === pane.active);
    if (tab?.kind !== "chat") return undefined;
    const run = panel.runs.find((r) => r.id === tab.id);
    if (run?.worktree_path) return { cwd: run.worktree_path, label: baseName(run.worktree_path), projectId: run.project_id };
    return terminalTargets.find((t) => t.projectId === tab.projectId);
  };
  /** ターミナルを開く（押したペインに入れる）: チャットを表示していればその作業場所、開く場所が 1 つならそこ、いくつもあれば選ぶメニュー */
  const openTerminal = (e: React.MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => {
    panel.focusPane(pane.id);
    const target = chatTarget(pane) ?? (terminalTargets.length === 1 ? terminalTargets[0] : undefined);
    if (target) return panel.openTerminal(target);
    terminalMenu.toggle(e, targetMenuHeight(terminalTargets.length));
  };

  // ⌘\ で、ピントのあるペインを右に分ける（パネルの中にピントがあるとき。下のパネルの ⌘\ はそちらにピントがあるときだけ）
  useWindowEvent(
    "keydown",
    (e) => {
      if (!e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.code !== "Backslash") return;
      if (!asideRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      const pane = focusedPane(layout);
      panel.splitPane(pane.id, "row", "after", pane.tabs.length > 1 ? (pane.active ?? undefined) : undefined);
    },
    panelOpen,
  );

  // パネルの閉じる・横幅いっぱい（ボードの右のパネルだけ。チャット欄は右上のレイアウトの開閉（LayoutToggles）で閉じるので、重ねて置かない）
  // タブの列の何もないところの右クリックで、ボードの見出しの置き方を選ぶ（パネルを上まで伸ばすか。チャット欄では関係しないので出さない）
  const layoutMenu = useBoardHeaderLayoutMenu();
  const controls = sidebar ? undefined : (
    <div className="panel-controls">
      {/* 横から出てきたパネルを、横へしまう（タブはそのまま残る） */}
      <button className="panel-control" title="パネルを閉じる（Esc）" aria-label="パネルを閉じる" onClick={close}>
        <PanelRightClose size={15} />
      </button>
      {/* 横幅いっぱい ⇔ 元の幅（横にだけ広がるので、横向きの矢印）。狭くてボードを覆っているときは、切り替えても見た目が変わらないので出さない */}
      {!panel.covering && (
        <button
          className="panel-control"
          title={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
          aria-label={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
          aria-pressed={maximized}
          onClick={panel.toggleMaximized}
        >
          {maximized ? <FoldHorizontal size={15} /> : <UnfoldHorizontal size={15} />}
        </button>
      )}
    </div>
  );
  /** ペインのタブの列（パネルの閉じる・横幅いっぱいは、左上のペインにだけ置く） */
  const bar = (pane: PaneLeaf) => (
    <PaneTabBar
      panel={panel}
      pane={pane}
      split={split}
      inert={!panelOpen}
      controls={pane.id === leaves[0].id ? controls : undefined}
      drag={drag}
      terminals={terminalTargets.length}
      terminalMenuOpen={terminalMenu.isOpen}
      onNewChat={() => {
        panel.focusPane(pane.id);
        onNewChat();
      }}
      onTerminal={openTerminal}
      rename={rename}
      onBarMenu={sidebar ? undefined : layoutMenu.open}
      onMenu={(key, e) => {
        e.preventDefault();
        setMenu({ key, ...clampToViewport(e.clientX, e.clientY, TAB_MENU_WIDTH, tabMenuHeight(leaves.length, tabs.some((t) => t.key === key && t.kind === "chat"))) });
      }}
    />
  );
  const empty = (pane: PaneLeaf) => (
    <PanelEmpty
      // ボードの分けていないパネルは、今までどおり案内の文（新しいチャットは見出しの「新規」から）。分けたペインには新しいチャットも出す
      showNewChat={!!sidebar || split}
      hasTerminals={terminalTargets.length > 0}
      manyTerminals={terminalTargets.length > 1}
      onNewChat={onNewChat}
      onBrowser={() => panel.openBrowser()}
      onTerminal={(e) => openTerminal(e, pane)}
    />
  );
  const rectOf = new Map(panes.map((p) => [p.id, p.rect]));

  return (
    <aside ref={asideRef} className={cx("board-panel", sidebar && "as-sidebar")} aria-hidden={!panelOpen}>
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
      {!split && bar(leaves[0])}
      <div ref={contentRef} className={cx("panel-content", split && "split-view", resizing && "resizing")} inert={!panelOpen}>
        {!split && tabs.length === 0 && empty(leaves[0])}
        {split &&
          panes.map(({ id, rect }) => {
            const pane = leaves.find((p) => p.id === id)!;
            return (
              <div
                key={id}
                className={cx("split-pane", rect.y === 0 && "top-row", rect.y === 0 && rect.x + rect.w > 0.999 && "top-right")}
                style={fracStyle(rect)}
                onPointerDown={() => panel.focusPane(id)}
              >
                {bar(pane)}
                {pane.tabs.length === 0 && empty(pane)}
              </div>
            );
          })}
        {layoutMenu.menu}
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
        {tabs.map((t) => {
          const pane = leaves.find((p) => p.tabs.includes(t.key)) ?? leaves[0];
          const rect = rectOf.get(pane.id);
          return (
            <PanelTabPage
              key={t.key}
              tab={t}
              panel={panel}
              panelOpen={panelOpen}
              paneId={pane.id}
              active={pane.active === t.key}
              focused={pane.id === layout.focused}
              style={split && rect ? fracStyle(rect, true) : undefined}
              split={split}
            />
          );
        })}
        {split &&
          sashes.map((s) => (
            <PaneSash
              key={`${s.path.join(".")}:${s.index}`}
              sash={s}
              root={layout.root}
              container={contentRef}
              onResize={panel.resizeSplit}
              onEqualize={panel.equalizeSplit}
              onResizing={setResizing}
            />
          ))}
        {/* タブをドラッグしている間だけ、中身の上に透明の覆いを置き、落とす場所（端なら分けて置く範囲）を出す */}
        {drag.dragging &&
          panes.map(({ id, rect }) => {
            const zone = drag.zoneOf(id);
            return (
              <div key={`cover:${id}`} className="split-drop-cover" style={split ? fracStyle(rect, true) : undefined} {...drag.coverProps(id)}>
                {zone && <div className={`split-drop-hint split-hint-${zone}`} />}
              </div>
            );
          })}
      </div>
      {menu && <TabMenu panel={panel} tabKey={menu.key} x={menu.x} y={menu.y} onRename={(run) => rename.start(run)} onClose={() => setMenu(null)} />}
    </aside>
  );
}
