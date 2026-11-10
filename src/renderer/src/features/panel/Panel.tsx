import { useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useSetting } from "@/hooks/useSetting";
import { CHAT_TAB_ROW_HIDDEN, PANEL_TAB_TWO_LINE } from "@/lib/storageKeys";
import { useContextMenu } from "@/ui/useContextMenu";
import { PaneSash, fracStyle } from "@/features/panel/layout/PaneSash";
import { PaneTabBar } from "@/features/panel/tabs/PaneTabBar";
import { PanelEmpty } from "./PanelEmpty";
import { PanelCloseButton, PanelTools, type PanelFrame } from "./PanelTools";
import { PanelTabPage } from "@/features/panel/tabs/PanelTabPage";
import { layoutRects } from "@/features/panel/layout/paneGeometry";
import { focusedPane, homePane, leavesOf, topRightPane, type PaneLeaf } from "@/features/panel/layout/paneTree";
import { TabMenu } from "@/features/panel/tabs/TabMenu";
import { useTabRename } from "@/features/panel/tabs/useTabRename";
import { useTabDrag } from "@/features/panel/layout/useTabDrag";
import type { PanelController } from "./usePanel";
import { useOpenWithMenu } from "@/features/openWith/useOpenWithMenu";
import { emptyHintOf, SURFACES } from "./surfaces";
import { focusedPanelKey, PanelHostContext } from "./panelHost";
import { specOf } from "@/features/panel/tabs/tabKinds";
import { usePanelViewMenu } from "@/features/panel/tabs/PanelViewMenu";
import { useNewChild } from "@/features/panel/agents/useNewChild";

/**
 * 欄のパネル（ボードの右のパネル・プロジェクトのチャット欄・フッターで共通。欄ごとの違いは SURFACES と、殻が渡す frame）。
 * タブは上下・左右のペインに分けて並べられる（VS Code のエディターと同じ）。分けていないときは、タブの列 → 中身の 1 段。
 * 分けているときは、中身の中にペインごとのタブの列と境目のつまみを、割合の位置で重ねる（タブの中身はいつも中身の直下に置き、作り直さない）。
 * 各ペインのタブの列の右端に、新しいチャット・ブラウザ・ターミナルと、右・下に分けるボタンを並べる。
 * 「新しいチャット」の作成先・開けるターミナル（Mac のアプリでだけ）は欄の hook が usePanel に渡す。チャットを開いているペインでは、ターミナルはそのチャットの作業場所で開く。
 * 表示するタブの種類（panel.kinds）で隠している種類のタブは、タブの列にも中身にも出さない（閉じずに残す）。
 * タブの列を隠せる欄（チャットのパネル）で隠しているときは、どのペインのタブの列（と左の道具）も出さない
 */
export function Panel({ panel, frame }: { panel: PanelController; frame?: PanelFrame }) {
  const { tabs, layout, panelOpen, terminals } = panel;
  const rules = SURFACES[panel.surface];
  const [tabRowHidden] = useSetting(CHAT_TAB_ROW_HIDDEN);
  const tabsHidden = !!rules.hideableTabs && tabRowHidden;
  // タブの 2 行（名前の下にグループ・作業場所の札）。タブだけの設定で、サイドバーのチャットの行の 1 行 / 2 行とは別（利用者の依頼。前はサイドバーに合わせていた）
  const [tabTwoLine] = useSetting(PANEL_TAB_TWO_LINE);
  const twoLine = tabTwoLine && panel.kinds.has("chat");
  // パネルそのもの（ピントがパネルの中にあるか・殻が大きさを測る）
  const ownRef = useRef<HTMLElement>(null);
  const asideRef = frame?.paneRef ?? ownRef;
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useTabDrag(panel);
  // タブの右クリックのメニュー
  const tabMenu = useContextMenu<string>();
  // チャット・新しいチャットのタブの名前をその場で変える（タブのダブルクリック・右クリックの「名前を変更」で共通）
  const rename = useTabRename();
  // 境目をドラッグしている間（中身の上でポインターを奪われないようにする）
  const [resizing, setResizing] = useState(false);
  const leaves = leavesOf(layout.root);
  const split = leaves.length > 1;
  const homeId = homePane(layout).id;
  // 閉じるボタンをタブの列の右端に置く欄（サブエージェントの欄）は、右上のペインにだけ置く
  const closeAtRight = SURFACES[panel.surface].closeButton?.at === "right";
  const topRightId = topRightPane(layout.root).id;
  const { panes, sashes } = layoutRects(layout.root);
  const anyShown = (keys: readonly string[]) => keys.some(panel.isKindShown);
  // ブラウザ・ターミナルを開く（ターミナルの開く場所の決め方と、開く場所を選ぶメニュー・▾ のメニュー）
  const openWith = useOpenWithMenu(panel);

  // ⌘\ で、ピントのあるペインを右に分ける（パネルの中にピントがあるとき。下のパネルの ⌘\ はそちらにピントがあるときだけ。
  // チャットの中の右の欄（入れ子のパネル）にピントがあるときは、いちばん内側の欄だけが分ける）
  useWindowEvent(
    "keydown",
    (e) => {
      if (!e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.code !== "Backslash") return;
      if (focusedPanelKey() !== panel.key) return;
      e.preventDefault();
      const pane = focusedPane(layout);
      panel.splitPane(pane.id, "row", "after", pane.tabs.length > 1 ? (pane.active ?? undefined) : undefined);
    },
    panelOpen,
  );

  // 「表示」のメニュー（表示するタブ・まとめ方・アーカイブ済み・チャットの画面）。道具のボタンと、タブの列の何もないところの右クリックで同じものを開く
  const view = usePanelViewMenu(panel);
  // 新しい子チャットを開く（サブエージェントの欄で、欄のチャットが子チャットを作れるときだけ。タブの列の「＋」と空の欄のボタン）
  const newChild = useNewChild(panel);
  // 一度表示したタブ（中身を作ったもの。チャットのタブは、ここにあるか表示中のときだけ中身を作る）
  const mountedTabs = useRef(new Set<string>());
  /** ペインのタブの列（タブの列の左の道具は左上のペインに、右端の閉じるボタンは右上のペインにだけ置く） */
  const bar = (pane: PaneLeaf) => (
    <PaneTabBar
      panel={panel}
      pane={pane}
      split={split}
      twoLine={twoLine}
      // 一覧のペイン（サイドバーと連動したチャットのタブが自動で入るペイン）。分けていなければ、そのペインが一覧
      home={!split || pane.id === homeId}
      inert={!panelOpen}
      controls={pane.id === leaves[0].id ? <PanelTools panel={panel} frame={frame} view={view} /> : undefined}
      endControls={closeAtRight && pane.id === topRightId ? <PanelCloseButton panel={panel} frame={frame} /> : undefined}
      drag={drag}
      terminals={terminals.length}
      terminalMenuOpen={openWith.picking}
      onNewChat={() => {
        panel.focusPane(pane.id);
        panel.startNewChat();
      }}
      onTerminal={openWith.openTerminal}
      onNewChild={
        newChild &&
        (() => {
          panel.focusPane(pane.id);
          newChild();
        })
      }
      rename={rename}
      onBarMenu={view.has ? view.open : undefined}
      onOpenWith={openWith.open}
      openWithShown={openWith.shown}
      onMenu={(key, e) => tabMenu.open(e, key)}
    />
  );
  const empty = (pane: PaneLeaf) => (
    <PanelEmpty
      // 分けたペインには、案内の代わりに新しいチャットも出す（チャットを出さない欄（サブエージェントの欄）は、分けたペインにも案内を出す）
      hint={split && panel.kinds.has("chat") ? undefined : emptyHintOf(rules, Boolean(newChild))}
      kinds={panel.kinds}
      hasTerminals={terminals.length > 0}
      manyTerminals={terminals.length > 1}
      onNewChat={panel.startNewChat}
      onNewChild={
        newChild &&
        (() => {
          panel.focusPane(pane.id);
          newChild();
        })
      }
      onBrowser={() => panel.openBrowser()}
      onTerminal={(e) => openWith.openTerminal(e, pane)}
    />
  );
  const rectOf = new Map(panes.map((p) => [p.id, p.rect]));

  return (
    <PanelHostContext.Provider value={Panel}>
    <aside ref={asideRef} className={cx(rules.rootClass ?? "board-panel", rules.className, tabsHidden && "tabs-hidden")} aria-hidden={!panelOpen} data-panel-key={panel.key}>
      {frame?.resizeHandle && <div inert={!panelOpen} className="panel-resizer" aria-label="パネルの幅を変える" {...frame.resizeHandle} />}
      {!split && !tabsHidden && bar(leaves[0])}
      <div ref={contentRef} className={cx("panel-content", split && "split-view", resizing && "resizing", twoLine && "tabs-two-line")} inert={!panelOpen}>
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
                {!tabsHidden && bar(pane)}
                {!anyShown(pane.tabs) && empty(pane)}
              </div>
            );
          })}
        {view.menu}
        {openWith.menu}
        {/*
          タブを切り替えても入力中の文章やスクロール位置が残るよう、一度表示したタブは保持する。
          チャットのタブはサイドバーと連動して自動で増えるので、中身は初めて表示したときに作る（見ていないチャットまで読み込まない）
        */}
        {tabs.map((t) => {
          const pane = leaves.find((p) => p.tabs.includes(t.key)) ?? leaves[0];
          const rect = rectOf.get(pane.id);
          const active = panel.shownTabOf(pane) === t.key;
          if (active) mountedTabs.current.add(t.key);
          else if (specOf(t).lazy && !mountedTabs.current.has(t.key)) return null;
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
      {tabMenu.menu && <TabMenu panel={panel} tabKey={tabMenu.menu.value} at={tabMenu.menu.at} onRename={() => rename.start(tabMenu.menu!.value)} onClose={tabMenu.close} />}
    </aside>
    </PanelHostContext.Provider>
  );
}
