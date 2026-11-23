import "./TabBar.css";
import { Columns2, Rows2, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useCommandKeys } from "@/foundation/ui/commands";
import { dragAttrs } from "@/foundation/ui/kit/drag/dragAttrs";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { homePane, leavesOf, topRightPane, type PaneLeaf } from "@/features/panel/ui/layout/paneTree";
import type { TabDrag } from "@/features/panel/ui/layout/useTabDrag";
import { confirmTabsClose } from "@/features/panel/ui/state/closeTabs";
import { splitShownTab } from "@/features/panel/ui/state/actions";
import { surfaceOf } from "@/features/panel/ui/state/panelStore";
import { PaneTab } from "@/features/panel/ui/tabs/PaneTab";
import type { PanelViewMenu } from "@/features/panel/ui/tabs/PanelViewMenu";
import type { TabRename } from "@/features/panel/ui/tabs/useTabRename";
import { PanelCloseButton, PanelTools, type PanelFrame } from "./PanelTools";
import { PlainStrip } from "./PlainStrip";
import { storage } from "./storage";
import type { StripOrder, TabLook } from "./surface";
import type { PanelController } from "./usePanel";

/** 並べ方が項目を決めないとき（チャットのタブを並べない欄）: どの項目も出し、グループは付けない */
const PLAIN_LOOK: TabLook = { show: () => true, groupOf: () => undefined };

/**
 * パネルの 1 つのペインのタブの列の骨。左にタブの列の道具（左上のペインだけ）、タブ（並べ方は欄の Strip。なければペインの並びのまま）、
 * タブのすぐ右に欄の新しいタブのボタン（欄の Adds）、右端に右・下に分ける（欄の決まりで出さない欄もある）・ペインを閉じる（分けているときだけ）と、
 * その後ろに右上のペインだけ閉じるボタン（欄の決まりの closeButton が right の欄）。
 * タブが多いときはタブの並びの中だけを横にスクロールし、新しいタブのボタンはいつもタブのすぐ右に見せる。
 * 押すとこのペインにピントを移す（新しく開くタブはここに入る）。タブの列の何もないところの右クリックで「表示」のメニュー
 */
export function TabBar({
  panel,
  pane,
  frame,
  view,
  drag,
  rename,
  onTabMenu,
}: {
  panel: PanelController;
  pane: PaneLeaf;
  frame: PanelFrame | undefined;
  /** 「表示」のメニュー（左の道具のボタンと、タブの列の何もないところの右クリック） */
  view: PanelViewMenu;
  drag: TabDrag;
  /** タブの名前をその場で変える（ダブルクリック・右クリックの「名前を変更」。パネル全体で 1 つ） */
  rename: TabRename;
  /** タブの右クリック */
  onTabMenu: (tabKey: string, e: React.MouseEvent) => void;
}) {
  const rules = surfaceOf(panel.surface)!;
  const splitKeys = useCommandKeys("panel.splitRight");
  const leaves = leavesOf(panel.layout.root);
  const split = leaves.length > 1;
  // 一覧のペイン（サイドバーと連動したチャットのタブが自動で入るペイン）。分けていなければ、そのペインが一覧
  const home = !split || pane.id === homePane(panel.layout).id;
  // タブを 2 行にする（「表示」のメニューの「2 行で表示」。名前の下にグループ・作業場所の札）。チャットを出す欄だけ
  const [tabTwoLine] = useSetting(storage.settings.tabTwoLine);
  const twoLine = tabTwoLine && panel.kinds.has("chat");
  // タブが入らないとき、細くせずにふだんの幅のまま並べ、タブの列を横にスクロールする（「表示」のメニューの「タブが増えたとき」。チャットを出す欄だけ）
  const [tabOverflow] = useSetting(storage.settings.tabOverflow);
  const scrollTabs = tabOverflow === "scroll" && panel.kinds.has("chat");
  // 分けていないときのタブの列は、開閉で幅が動く欄の中身（開き終えたときの幅のまま）
  const slideInner = rules.slide === true && !frame?.fixed && !split;
  const insertAt = drag.insertAt(pane.id);
  const active = pane.active;
  // 表示中のタブが並びの外（横にスクロールした先）にあれば、見えるところまで動かす（新しく開いたタブなど）
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector(".panel-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, pane.tabs.length]);
  /** ペインを閉じる（閉じるファイル・ノートのタブに保存していない書きかけがあれば、先に保存するかを聞く） */
  const closePane = () => {
    const tabs = panel.tabs.filter((t) => pane.tabs.includes(t.key));
    void confirmTabsClose(panel.key, tabs).then((ok) => ok && panel.closePane(pane.id));
  };
  /** タブ 1 つ（i は見た目の並びの位置。ドラッグで落とす位置の印もこの並びで付ける） */
  const renderTab = (key: string, i: number, count: number, look: TabLook = PLAIN_LOOK) => {
    const t = panel.tabs.find((x) => x.key === key);
    if (!t) return null;
    return (
      <PaneTab
        key={t.key}
        panel={panel}
        tab={t}
        active={active === t.key}
        home={home}
        show={look.show}
        twoLine={twoLine}
        groupOf={look.groupOf}
        className={cx(
          // 印: index 番目の前。まとまりの境目で前のまとまりの最後に入れるとき（after）・いちばん後ろは、前のタブの後ろに付ける
          insertAt && !insertAt.after && insertAt.index === i && "split-insert-before",
          insertAt && (insertAt.after || insertAt.index === count) && i === insertAt.index - 1 && "split-insert-after",
        )}
        extra={{ ...drag.tabProps(t.key), ...dragAttrs(null, { source: drag.dragging === t.key }), onContextMenu: (e) => onTabMenu(t.key, e) }}
        rename={rename}
      />
    );
  };
  const Adds = rules.Adds;
  const bar = (content: ReactNode, order: StripOrder = {}) => (
    <div
      className={cx("panel-tabs", slideInner && "slide-pane-inner", insertAt !== null && pane.tabs.length === 0 && "split-insert-bar")}
      role="tablist"
      inert={!panel.panelOpen}
      onPointerDown={() => panel.focusPane(pane.id)}
      onContextMenu={view.has ? view.open : undefined}
      {...drag.barProps(pane.id, order.toPaneIndex, order.reorder)}
    >
      {pane.id === leaves[0].id && <PanelTools panel={panel} frame={frame} view={view} />}
      {order.lead}
      <div
        ref={stripRef}
        className={cx("panel-tab-strip", order.grouped && "grouped", scrollTabs && "scroll-tabs")}
        // 横にスクロールするときは、マウスのホイール（縦）でも横に動かす（トラックパッドの横のスワイプはそのまま）
        onWheel={
          scrollTabs
            ? (e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
              }
            : undefined
        }
      >
        {content}
      </div>
      {Adds && <Adds panel={panel} pane={pane} />}
      {/* ペインを分ける・閉じる（右端。狭い欄は分けるボタンを置かない） */}
      <span className="panel-bar-buttons panel-pane-tools">
        {rules.splitButtons !== false && (
          <>
            <IconButton icon={Columns2} label="右に分ける" title={`右に分ける（${splitKeys}）`} iconSize={14} onClick={() => splitShownTab(panel.key, "row", pane.id)} />
            <IconButton icon={Rows2} label="下に分ける" iconSize={14} onClick={() => splitShownTab(panel.key, "column", pane.id)} />
          </>
        )}
        {split && <IconButton icon={X} label="ペインを閉じる" title="ペインを閉じる（チャットは一覧のペインに戻し、ほかのタブは閉じる）" iconSize={15} onClick={closePane} />}
        {rules.closeButton?.at === "right" && pane.id === topRightPane(panel.layout.root).id && <PanelCloseButton panel={panel} frame={frame} />}
      </span>
    </div>
  );
  const Strip = rules.Strip ?? PlainStrip;
  return <Strip panel={panel} pane={pane} home={home} dragging={drag.dragging} renderTab={renderTab} bar={bar} />;
}
