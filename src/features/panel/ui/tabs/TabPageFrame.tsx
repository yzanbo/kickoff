import { memo, useContext, useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { canPopOut, popOutTab } from "./popOutTab";
import { TabPageContext, TabVisibleContext } from "./tabPageContext";
import { kindOf } from "@/features/panel/ui/state/panelStore";
import type { PanelTab, PanelPageOps } from "@/features/panel/ui/usePanel";

type FrameProps = {
  tab: PanelTab;
  /** 欄の操作（usePanel の pageOps。欄の状態が変わっても同じ物） */
  panel: PanelPageOps;
  panelOpen: boolean;
  /** タブが入っているペイン */
  paneId: string;
  /** 自分のペインで表示中のタブか */
  active: boolean;
  /** 自分のペインにピントがあるか */
  focused: boolean;
  style?: CSSProperties;
  /** ペインを分けているか（分けているときだけ、ピントのあるペインをチャット欄の枠の色で示す） */
  split?: boolean;
};

/** 足すクラスのない種類の購読（何も知らせない） */
const noSubscribe = () => () => {};

/** 置き場所の style が同じか（分けているときの位置は描くたびに作られるので中身で比べる） */
function sameStyle(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof CSSProperties)[];
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/**
 * パネルの 1 つのタブの中身（中身は種類の項目の Page）。
 * タブを切り替えても入力中の文章やスクロール位置が残るよう、表示していないタブも hidden で残す。
 * ペインを分けても作り直さない（webview・ターミナル・入力中の文を保つ）よう、どのタブもパネルの中身の直下に置き、
 * 分けているときは style でそのペインの位置に重ねる。押す・ピントが入るとそのペインにピントを移す。
 * タブ・欄の操作・置き場所が変わらなければ描き直さない（ほかのタブのチャットが変わってパネルの店が変わっても、ほかのタブは描き直らない）
 */
export const TabPageFrame = memo(
  TabPageFrameBody,
  (a, b) =>
    a.tab === b.tab &&
    a.panel === b.panel &&
    a.panelOpen === b.panelOpen &&
    a.paneId === b.paneId &&
    a.active === b.active &&
    a.focused === b.focused &&
    a.split === b.split &&
    sameStyle(a.style, b.style),
);

function TabPageFrameBody({
  tab,
  panel,
  panelOpen,
  paneId,
  active,
  focused,
  style,
  split = false,
}: FrameProps) {
  const focus = () => panel.focusPane(paneId);
  const kind = kindOf(tab);
  const Page = kind.Page;
  // 中身の見出しの右端の「別ウィンドウで開く」（PopOutTabButton）に渡す
  const popOutable = canPopOut(tab, panel.key);
  // このタブを表に出す（入れ子の欄（チャットの画面の右の欄）なら、外のチャットのタブも表に出す）
  const outer = useContext(TabPageContext);
  const actions = useMemo(
    () => ({
      popOut: popOutable ? () => popOutTab(panel, tab.key) : null,
      show: () => {
        outer?.show();
        panel.showTab(tab.key);
      },
    }),
    [popOutable, panel, tab.key, outer],
  );
  // 種類が足すクラス（AI が操作しているブラウザのタブは、表に出ていなくても見えない形で並べる。撮る・押すため。panel の Panel.css）
  const pageClass = useSyncExternalStore(kind.pageClass?.subscribe ?? noSubscribe, () => kind.pageClass?.of(tab));
  // 表示中か（外のタブ（右の欄を持つチャットのタブ）が裏に回っていれば、自分のペインで選んでいても表示していない）
  const visible = useContext(TabVisibleContext) && panelOpen && active;
  return (
    <div
      className={cx("panel-tab-page", split && focused && "pane-focused", pageClass)}
      // タブのドラッグのサムネイルを撮る範囲を見つける印（layout/tabThumbnail.ts）
      data-tab-key={tab.key}
      hidden={!active}
      style={style}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
    >
      <TabPageContext.Provider value={actions}>
        <TabVisibleContext.Provider value={visible}>
          <Page tab={tab} panel={panel} visible={visible} focused={focused} />
        </TabVisibleContext.Provider>
      </TabPageContext.Provider>
    </div>
  );
}
