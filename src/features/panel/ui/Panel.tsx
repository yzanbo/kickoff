import "./Panel.css";
import { memo, useEffect, useRef, useState } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "./storage";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { PaneSash, fracStyle } from "@/features/panel/ui/layout/PaneSash";
import { TabBar } from "./TabBar";
import { PanelEmpty } from "./PanelEmpty";
import type { PanelFrame } from "./PanelTools";
import { TabPageFrame } from "@/features/panel/ui/tabs/TabPageFrame";
import { layoutRects } from "@/features/panel/ui/layout/paneGeometry";
import { leavesOf, type PaneLeaf } from "@/features/panel/ui/layout/paneTree";
import { TabMenu } from "@/features/panel/ui/tabs/TabMenu";
import { useTabRename } from "@/features/panel/ui/tabs/useTabRename";
import { useTabDrag } from "@/features/panel/ui/layout/useTabDrag";
import type { PanelController } from "./usePanel";
import { useOpenWithMenu } from "@/features/panel/ui/openWith/useOpenWithMenu";
import { OpenWithContext } from "@/features/panel/ui/openWith/OpenWithAdds";
import { usePanelShortcuts } from "./usePanelShortcuts";
import { kindOf, surfaceOf } from "@/features/panel/ui/state/panelStore";
import { neighborTabs, useTabPrefetch } from "@/features/panel/ui/tabs/tabPrefetch";
import { usePanelViewMenu } from "@/features/panel/ui/tabs/PanelViewMenu";

/**
 * 欄のパネル（ボードの右のパネル・プロジェクトのチャット欄・フッターで共通。欄ごとの違いは欄の項目（surfaceOf）と、殻が渡す frame）。
 * タブは上下・左右のペインに分けて並べられる（VS Code のエディターと同じ）。分けていないときは、タブの列 → 中身の 1 段。
 * 分けているときは、中身の中にペインごとのタブの列と境目のつまみを、割合の位置で重ねる（タブの中身はいつも中身の直下に置き、作り直さない）。
 * 各ペインのタブの列（TabBar）の右端に、欄の新しいタブのボタン（欄の Adds）と、右・下に分けるボタンを並べる。タブの並べ方は欄の Strip。
 * 開けるターミナル（Mac のアプリでだけ）は欄の殻が frame で渡す。チャットを開いているペインでは、ターミナルはそのチャットの作業場所で開く。
 * キー（Esc で閉じる・⌘\ で右に分ける）は usePanelShortcuts。いつも開いておく欄（欄の決まりの alwaysOpen・画面そのもの frame.fixed）は閉じても開き直す。
 * タブの列を隠せる欄（チャットのパネル）で隠しているときは、どのペインのタブの列（と左の道具）も出さない。
 * panel（usePanel）と frame が同じなら描き直さない（チャットの画面の右の欄が、返答のたびに描き直らないように）。
 * タブの中身の枠（TabPageFrame）も memo で、変わったタブだけが描き直る
 */
export const Panel = memo(PanelBody);

function PanelBody({ panel, frame }: { panel: PanelController; frame?: PanelFrame }) {
  const { tabs, layout, panelOpen } = panel;
  // 開けるターミナルの場所（フッターの殻が渡す。ほかの欄はターミナルを開かない）
  const terminals = frame?.terminals ?? [];
  const rules = surfaceOf(panel.surface)!;
  const [tabRowHidden] = useSetting(storage.settings.chatTabRowHidden);
  const tabsHidden = !!rules.hideableTabs && tabRowHidden;
  // タブの 2 行（名前の下にグループ・作業場所の札）。タブだけの設定で、サイドバーのチャットの行の 1 行 / 2 行とは別
  const [tabTwoLine] = useSetting(storage.settings.tabTwoLine);
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
  // 開閉で幅が動く欄（styles/types/slide-pane.css。画面そのものとして置くときは動かさない）
  const slide = rules.slide === true && !frame?.fixed;
  const { panes, sashes } = layoutRects(layout.root);
  // ブラウザ・ターミナルを開く（ターミナルの開く場所の決め方と、開く場所を選ぶメニュー・▾ のメニュー）
  const openWith = useOpenWithMenu(panel, terminals);
  usePanelShortcuts(panel, frame);
  // いつも開いておく欄（タブがなければ案内）
  const alwaysOpen = rules.alwaysOpen === true || frame?.fixed === true;
  const { setOpen } = panel;
  useEffect(() => {
    if (alwaysOpen && !panelOpen) setOpen(true);
  }, [alwaysOpen, panelOpen, setOpen]);

  // 「表示」のメニュー（まとめ方・アーカイブ済み・チャットの画面）。道具のボタンと、タブの列の何もないところの右クリックで同じものを開く
  const view = usePanelViewMenu(panel);
  // 一度表示したタブ。中身を作る時が shown の種類（チャット）は初めて表示したとき、欄を開くまで作らないタブ（復元したブラウザ）は初めて欄を開いたときから中身を作る
  // （描く中で ref に書かず state に持つ。表示中なのにまだ入っていないタブがあれば、描いている間に足す）
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<string>>(() => new Set());
  const shownNow = tabs.filter((t) => !mountedTabs.has(t.key) && (
    kindOf(t).deferUntilPanelOpen?.(t)
      ? panelOpen
      : (leaves.find((p) => p.tabs.includes(t.key)) ?? leaves[0]).active === t.key
  ));
  // 閉じたタブのキーは忘れる（同じキーのタブを開き直したとき、表示する前に中身を作らない）
  const liveKeys = new Set(tabs.map((t) => t.key));
  const closed = [...mountedTabs].some((key) => !liveKeys.has(key));
  if (shownNow.length > 0 || closed) setMountedTabs(new Set([...[...mountedTabs].filter((key) => liveKeys.has(key)), ...shownNow.map((t) => t.key)]));
  // まだ描いていないタブ（先読みできる種類）を、表のタブに近い順に手すきのときに先読みする（切り替えたときに読み込みを待たない）
  const tabByKey = new Map(tabs.map((t) => [t.key, t]));
  const prefetch = neighborTabs(
    leaves.map((p) => ({ tabs: p.tabs, shown: p.active })),
    (key) => {
      const t = tabByKey.get(key);
      return t !== undefined && kindOf(t).prefetch !== undefined && kindOf(t).createWhen === "shown" && !mountedTabs.has(key);
    },
  ).map((key) => tabByKey.get(key)!);
  useTabPrefetch(prefetch, panelOpen);
  /** ペインのタブの列（タブの列の左の道具は左上のペインに、右端の閉じるボタンは右上のペインにだけ置く。TabBar が決める） */
  const bar = (pane: PaneLeaf) => (
    <TabBar panel={panel} pane={pane} frame={frame} view={view} drag={drag} rename={rename} onTabMenu={(key, e) => tabMenu.open(e, key)} />
  );
  const EmptyHint = rules.EmptyHint;
  const empty = (pane: PaneLeaf) => (
    <PanelEmpty
      hint={EmptyHint ? <EmptyHint panel={panel} pane={pane} hint={rules.emptyHint} /> : rules.emptyHint}
      kinds={panel.kinds}
      hasTerminals={terminals.length > 0}
      manyTerminals={terminals.length > 1}
      onBrowser={() => panel.openBrowser()}
      onTerminal={(e) => openWith.openTerminal(e, pane)}
    />
  );
  const rectOf = new Map(panes.map((p) => [p.id, p.rect]));

  return (
    <OpenWithContext.Provider value={openWith}>
    <aside
      ref={asideRef}
      className={cx(rules.rootClass ?? "board-panel", rules.className, slide && "slide-pane", slide && panelOpen && "open", tabsHidden && "tabs-hidden")}
      data-axis={slide ? "x" : undefined}
      data-size={slide ? "outer" : undefined}
      aria-hidden={!panelOpen}
      data-panel-key={panel.key}
    >
      {frame?.resizeHandle && <div inert={!panelOpen} className="panel-resizer" aria-label="パネルの幅を変える" {...frame.resizeHandle} />}
      {!split && !tabsHidden && bar(leaves[0])}
      <div ref={contentRef} className={cx("panel-content", slide && "slide-pane-inner", split && "split-view", resizing && "resizing", twoLine && "tabs-two-line")} inert={!panelOpen}>
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
          if (!active && kindOf(t).createWhen === "shown" && !mountedTabs.has(t.key)) return null;
          if (kindOf(t).deferUntilPanelOpen?.(t) && !panelOpen && !mountedTabs.has(t.key)) return null;
          return (
            <TabPageFrame
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
    </OpenWithContext.Provider>
  );
}
