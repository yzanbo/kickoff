import { FoldHorizontal, PanelRightClose, UnfoldHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { baseName } from "@/lib/format";
import { cx } from "@/lib/cx";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useContextMenu } from "@/ui/useContextMenu";
import { TerminalTargetMenu } from "@/features/terminal/TerminalTargetMenu";
import { PaneSash, fracStyle } from "@/features/panel/layout/PaneSash";
import { PaneTabBar } from "@/features/panel/tabs/PaneTabBar";
import { PanelEmpty } from "./PanelEmpty";
import { PanelTabPage } from "@/features/panel/tabs/PanelTabPage";
import { layoutRects } from "@/features/panel/layout/paneGeometry";
import { focusedPane, homePane, leavesOf, type PaneLeaf } from "@/features/panel/layout/paneLayout";
import { TabMenu } from "@/features/panel/tabs/TabMenu";
import { useChatRename } from "@/features/chat/useChatRename";
import { useTabDrag } from "@/features/panel/layout/useTabDrag";
import type { PanelController, TerminalTarget } from "./usePanel";
import { useBoardHeaderLayoutMenu } from "@/features/board/useBoardHeaderLayoutMenu";
import { useOpenWithMenu } from "@/features/openWith/useOpenWithMenu";
import { TabArchiveToggle } from "@/features/panel/tabs/TabArchiveToggle";
import { TabGroupingButton } from "@/features/panel/tabs/TabGroupingButton";
import { TabKindsButton } from "@/features/panel/tabs/TabKindsButton";
import { shownActiveOf } from "@/features/panel/state/panelKinds";

/**
 * ボードの右側のパネル（ボードとパネルを並べる要素の中の最後に置く）。プロジェクトのチャット欄でも同じものを使う（sidebar）。
 * タブは上下・左右のペインに分けて並べられる（VS Code のエディターと同じ）。分けていないときは、タブの列 → 中身の 1 段。
 * 分けているときは、中身の中にペインごとのタブの列と境目のつまみを、割合の位置で重ねる（タブの中身はいつも中身の直下に置き、作り直さない）。
 * 各ペインのタブの列の右端に、新しいチャット・ブラウザ・ターミナルと、右・下に分けるボタンを並べる。
 * onNewChat: 「新しいチャット」を押したとき（どのプロジェクト・グループで始めるかはボードが決める）。
 * terminals: 開けるターミナル（terminalTargets。Mac のアプリでだけ出す）。チャットを開いているときは、そのチャットの作業場所で開く。
 * sidebar: 欄（画面の右端のチャット欄・フッター）として使うとき（開閉は欄が持つ。幅の変更・横幅いっぱいは欄の側で行うので出さない。
 * controls は欄の道具（フッターの最大化・閉じるなど）で、タブの列の左の道具の後ろに並べる）。
 * 表示するタブの種類（panel.kinds）で隠している種類のタブは、タブの列にも中身にも出さない（閉じずに残す）
 */
export function Panel({
  panel,
  onNewChat,
  terminals,
  sidebar,
}: {
  panel: PanelController;
  onNewChat: () => void;
  terminals: TerminalTarget[];
  sidebar?: { open: boolean; onClose: () => void; controls?: React.ReactNode; className?: string };
}) {
  const { tabs, panelFull, layout } = panel;
  const panelOpen = sidebar ? sidebar.open : panel.panelOpen;
  const close = sidebar ? sidebar.onClose : panel.close;
  const terminalTargets = window.kickoff?.terminal ? terminals : [];
  const asideRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useTabDrag(panel);
  // タブの右クリックのメニュー
  const tabMenu = useContextMenu<string>();
  // チャットのタブの名前をその場で変える（タブのダブルクリック・右クリックの「名前を変更」で共通）
  const rename = useChatRename();
  // 境目をドラッグしている間（中身の上でポインターを奪われないようにする）
  const [resizing, setResizing] = useState(false);
  const leaves = leavesOf(layout.root);
  const split = leaves.length > 1;
  const homeId = homePane(layout).id;
  const { panes, sashes } = layoutRects(layout.root);
  /** ペインで見せる表示中のタブ（隠した種類のタブを表示中にしていたら、見せている種類の最初のタブ） */
  const shown = (pane: PaneLeaf) => shownActiveOf(pane, panel.isKindShown);
  const anyShown = (keys: readonly string[]) => keys.some(panel.isKindShown);
  // ターミナルの開く場所を選ぶメニュー（開く場所がいくつもあるとき。タブの列のボタン・タブがないときのボタンで共通）
  const terminalMenu = useContextMenu({ align: "end" });
  /** ペインで表示しているチャットの作業場所（ワークツリーならそのフォルダ、本体ならプロジェクトのフォルダ）。チャットでなければ undefined */
  const chatTarget = (pane: PaneLeaf): TerminalTarget | undefined => {
    const tab = tabs.find((t) => t.key === shown(pane));
    if (tab?.kind !== "chat") return undefined;
    const chat = panel.chats.find((r) => r.id === tab.id);
    if (chat?.worktree_path) return { cwd: chat.worktree_path, label: baseName(chat.worktree_path), projectId: chat.project_id };
    return terminalTargets.find((t) => t.projectId === tab.projectId);
  };
  /** ターミナルを開く（押したペインに入れる）: チャットを表示していればその作業場所、開く場所が 1 つならそこ、いくつもあれば選ぶメニュー */
  const openTerminal = (e: React.MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => {
    panel.focusPane(pane.id);
    const target = chatTarget(pane) ?? (terminalTargets.length === 1 ? terminalTargets[0] : undefined);
    if (target) return panel.openTerminal(target);
    terminalMenu.toggle(e);
  };

  // ブラウザ・ターミナルの ▾（新しいタブ・外のアプリで開く・外のアプリを選ぶ）
  const openWith = useOpenWithMenu({ panel, targets: terminalTargets, chatTarget });

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

  // パネルの閉じる・タブのまとめ方・横幅いっぱい（閉じる・横幅いっぱいはボードの右のパネルだけ。チャット欄は右上のレイアウトの開閉（LayoutToggles）で閉じるので、重ねて置かない）
  // タブの列の何もないところの右クリックで、ボードツールバーの置き方を選ぶ（常時表示か、パネル優先にしてパネルを上まで伸ばすか。チャット欄では関係しないので出さない）
  const layoutMenu = useBoardHeaderLayoutMenu();
  // 一度表示したタブ（中身を作ったもの。チャットのタブは、ここにあるか表示中のときだけ中身を作る）
  const mountedTabs = useRef(new Set<string>());
  // パネルを閉じるボタンのすぐ右に、表示するタブの種類（いちばん左。ほかの道具の前提になるため）、チャットのタブのまとめ方（まとめない・グループ別・作業場所別）、
  // アーカイブ済みを出すか（サイドバーと共通）。チャット欄は閉じるボタンがないので、表示するタブの種類が左端
  // （まとめ方・アーカイブ済みはチャットのタブにだけ効くので、チャットを隠している欄では出さない）
  const controls = sidebar ? (
    <div className="panel-controls">
      <TabKindsButton panel={panel} />
      {/* まとめ方・アーカイブ済みを出すかはチャットのタブにだけ効くので、チャットを隠している欄では出さない */}
      {panel.kinds.has("chat") && <TabGroupingButton surface={panel.surface} />}
      {panel.kinds.has("chat") && <TabArchiveToggle />}
      {sidebar.controls}
    </div>
  ) : (
    <div className="panel-controls">
      {/* 横から出てきたパネルを、横へしまう（タブはそのまま残る） */}
      <button className="panel-control" title="パネルを閉じる（Esc）" aria-label="パネルを閉じる" onClick={close}>
        <PanelRightClose size={15} />
      </button>
      <TabKindsButton panel={panel} />
      {/* まとめ方・アーカイブ済みを出すかはチャットのタブにだけ効くので、チャットを隠している欄では出さない */}
      {panel.kinds.has("chat") && <TabGroupingButton surface={panel.surface} />}
      {panel.kinds.has("chat") && <TabArchiveToggle />}
      {/* 横幅いっぱい ⇔ 元の幅（横にだけ広がるので、横向きの矢印）。いつも出し、見た目どおりに切り替える（狭くてボードを覆っているときは「元の幅に戻す」で、
          ボードが残る幅まで縮める。サイドバー・チャット欄を開いて狭くなっても隠さない） */}
      <button
        className="panel-control"
        title={panelFull ? (panel.canRestoreWidth ? "元の幅に戻す" : "画面が狭いため、元の幅に戻せません") : "横幅いっぱいに広げる"}
        aria-label={panelFull ? "元の幅に戻す" : "横幅いっぱいに広げる"}
        aria-pressed={panelFull}
        disabled={panelFull && !panel.canRestoreWidth}
        onClick={panel.toggleMaximized}
      >
        {panelFull ? <FoldHorizontal size={15} /> : <UnfoldHorizontal size={15} />}
      </button>
    </div>
  );
  /** ペインのタブの列（パネルの閉じる・横幅いっぱいは、左上のペインにだけ置く） */
  const bar = (pane: PaneLeaf) => (
    <PaneTabBar
      panel={panel}
      pane={pane}
      split={split}
      // 一覧のペイン（サイドバーと連動したチャットのタブが自動で入るペイン）。分けていない・連動しない欄では、どのペインも一覧として扱う
      home={!split || !panel.linked || pane.id === homeId}
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
      onOpenWith={openWith.open}
      openWithShown={openWith.shown}
      onMenu={(key, e) => tabMenu.open(e, key)}
    />
  );
  const empty = (pane: PaneLeaf) => (
    <PanelEmpty
      // ボードの分けていないパネルは、今までどおり案内の文（新しいチャットは見出しの「新規」から）。分けたペインには新しいチャットも出す
      showNewChat={!!sidebar || split}
      kinds={panel.kinds}
      hasTerminals={terminalTargets.length > 0}
      manyTerminals={terminalTargets.length > 1}
      onNewChat={onNewChat}
      onBrowser={() => panel.openBrowser()}
      onTerminal={(e) => openTerminal(e, pane)}
    />
  );
  const rectOf = new Map(panes.map((p) => [p.id, p.rect]));

  return (
    <aside ref={asideRef} className={cx("board-panel", sidebar && "as-sidebar", sidebar?.className)} aria-hidden={!panelOpen}>
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
        {!split && !anyShown(leaves[0].tabs) && empty(leaves[0])}
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
                {!anyShown(pane.tabs) && empty(pane)}
              </div>
            );
          })}
        {layoutMenu.menu}
        {openWith.menu}
        {terminalMenu.menu && (
          <TerminalTargetMenu
            at={terminalMenu.menu.at}
            targets={terminalTargets}
            ignore=".panel-tab-terminal, .panel-empty-terminal"
            onPick={panel.openTerminal}
            onClose={terminalMenu.close}
          />
        )}
        {/*
          タブを切り替えても入力中の文章やスクロール位置が残るよう、一度表示したタブは保持する。
          チャットのタブはサイドバーと連動して自動で増えるので、中身は初めて表示したときに作る（見ていないチャットまで読み込まない）
        */}
        {tabs.map((t) => {
          const pane = leaves.find((p) => p.tabs.includes(t.key)) ?? leaves[0];
          const rect = rectOf.get(pane.id);
          const active = shown(pane) === t.key;
          if (active) mountedTabs.current.add(t.key);
          else if (t.kind === "chat" && !mountedTabs.current.has(t.key)) return null;
          return (
            <PanelTabPage
              key={t.key}
              tab={t}
              panel={panel}
              panelOpen={panelOpen}
              paneId={pane.id}
              active={active}
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
      {tabMenu.menu && <TabMenu panel={panel} tabKey={tabMenu.menu.value} at={tabMenu.menu.at} onRename={(chat) => rename.start(chat)} onClose={tabMenu.close} />}
    </aside>
  );
}
