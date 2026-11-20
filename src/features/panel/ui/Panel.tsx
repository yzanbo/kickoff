import { memo, useRef, useState } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "./storage";
import { CHAT_TAB_ROW_HIDDEN } from "@/foundation/ui/storage/storageKeys";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { PaneSash, fracStyle } from "@/features/panel/ui/layout/PaneSash";
import { PaneTabBar } from "@/features/panel/ui/tabs/PaneTabBar";
import { PanelEmpty } from "./PanelEmpty";
import { PanelCloseButton, PanelTools, type PanelFrame } from "./PanelTools";
import { PanelTabPage } from "@/features/panel/ui/tabs/PanelTabPage";
import { layoutRects } from "@/features/panel/ui/layout/paneGeometry";
import { focusedPane, homePane, leavesOf, topRightPane, type PaneLeaf } from "@/features/panel/ui/layout/paneTree";
import { TabMenu } from "@/features/panel/ui/tabs/TabMenu";
import { useTabRename } from "@/features/panel/ui/tabs/useTabRename";
import { useTabDrag } from "@/features/panel/ui/layout/useTabDrag";
import type { PanelController } from "./usePanel";
import { useOpenWithMenu } from "@/features/panel/ui/openWith/useOpenWithMenu";
import { emptyHintOf, SURFACES } from "./surfaces";
import { focusedPanelKey, PanelHostContext } from "./panelHost";
import { specOf } from "@/features/panel/ui/tabs/tabKinds";
import { neighborChats } from "@/features/chatPanel/ui/tabs/tabPrefetch";
import { useTabPrefetch } from "@/features/chatPanel/ui/tabs/useTabPrefetch";
import { usePanelViewMenu } from "@/features/panel/ui/tabs/PanelViewMenu";
import { useNewChild } from "@/features/chatPanel/ui/agents/useNewChild";

/**
 * 欄のパネル（ボードの右のパネル・プロジェクトのチャット欄・フッターで共通。欄ごとの違いは SURFACES と、殻が渡す frame）。
 * タブは上下・左右のペインに分けて並べられる（VS Code のエディターと同じ）。分けていないときは、タブの列 → 中身の 1 段。
 * 分けているときは、中身の中にペインごとのタブの列と境目のつまみを、割合の位置で重ねる（タブの中身はいつも中身の直下に置き、作り直さない）。
 * 各ペインのタブの列の右端に、新しいチャット・ブラウザ・ターミナルと、右・下に分けるボタンを並べる。
 * 「新しいチャット」の作成先・開けるターミナル（Mac のアプリでだけ）は欄の hook が usePanel に渡す。チャットを開いているペインでは、ターミナルはそのチャットの作業場所で開く。
 * タブの列を隠せる欄（チャットのパネル）で隠しているときは、どのペインのタブの列（と左の道具）も出さない。
 * panel（usePanel）と frame が同じなら描き直さない（チャットの画面の右の欄が、返答のたびに描き直らないように）。
 * タブの中身（PanelTabPage）も memo で、変わったタブだけが描き直る
 */
export const Panel = memo(PanelBody);

function PanelBody({ panel, frame }: { panel: PanelController; frame?: PanelFrame }) {
  const { tabs, layout, panelOpen, terminals } = panel;
  const rules = SURFACES[panel.surface];
  const [tabRowHidden] = useSetting(CHAT_TAB_ROW_HIDDEN);
  const tabsHidden = !!rules.hideableTabs && tabRowHidden;
  // タブの 2 行（名前の下にグループ・作業場所の札）。タブだけの設定で、サイドバーのチャットの行の 1 行 / 2 行とは別
  const [tabTwoLine] = useSetting(storage.settings.tabTwoLine);
  const twoLine = tabTwoLine && panel.kinds.has("chat");
  // タブが入らないとき、細くして収めるか横にスクロールするか（チャットを出す欄だけ。「表示」のメニューの「タブが増えたとき」）
  const [tabOverflow] = useSetting(storage.settings.tabOverflow);
  const scrollTabs = tabOverflow === "scroll" && panel.kinds.has("chat");
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

  // 「表示」のメニュー（まとめ方・アーカイブ済み・チャットの画面）。道具のボタンと、タブの列の何もないところの右クリックで同じものを開く
  const view = usePanelViewMenu(panel);
  // 新しい子チャットを開く（サブエージェントの欄で、欄のチャットが子チャットを作れるときだけ。タブの列の「＋」と空の欄のボタン）
  const newChild = useNewChild(panel);
  // 一度表示したタブ。チャットは初めて表示したとき、復元したブラウザは初めて欄を開いたときから中身を作る
  // （描く中で ref に書かず state に持つ。表示中なのにまだ入っていないタブがあれば、描いている間に足す）
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<string>>(() => new Set());
  const shownNow = tabs.filter((t) => !mountedTabs.has(t.key) && (
    t.kind === "browser" && t.restored
      ? panelOpen
      : (leaves.find((p) => p.tabs.includes(t.key)) ?? leaves[0]).active === t.key
  ));
  if (shownNow.length > 0) setMountedTabs(new Set([...mountedTabs, ...shownNow.map((t) => t.key)]));
  // まだ描いていないチャットのタブを、表のタブに近い順に手すきのときに先読みする（切り替えたときに読み込みを待たない）
  const tabByKey = new Map(tabs.map((t) => [t.key, t]));
  const prefetch = neighborChats(
    leaves.map((p) => ({ tabs: p.tabs, shown: p.active })),
    (key) => {
      const t = tabByKey.get(key);
      return t?.kind === "chat" && specOf(t).lazy && !mountedTabs.has(key) ? t.id : null;
    },
  );
  useTabPrefetch(prefetch, panelOpen);
  /** ペインのタブの列（タブの列の左の道具は左上のペインに、右端の閉じるボタンは右上のペインにだけ置く） */
  const bar = (pane: PaneLeaf) => (
    <PaneTabBar
      panel={panel}
      pane={pane}
      split={split}
      twoLine={twoLine}
      scrollTabs={scrollTabs}
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
        {!split && leaves[0].tabs.length === 0 && empty(leaves[0])}
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
                {pane.tabs.length === 0 && empty(pane)}
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
          const active = pane.active === t.key;
          if (!active && specOf(t).lazy && !mountedTabs.has(t.key)) return null;
          if (t.kind === "browser" && t.restored && !panelOpen && !mountedTabs.has(t.key)) return null;
          return (
            <PanelTabPage
              key={t.key}
              tab={t}
              panel={panel.pageOps}
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
