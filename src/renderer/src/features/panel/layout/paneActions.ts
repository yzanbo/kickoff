import { closePane, focusPane, moveTab, splitPane, type PaneLayout, type SplitDir, type SplitSide } from "./paneLayout";
import { equalizeSplit, setSplitSizes } from "./paneSizes";
import { newTabKey } from "@/features/panel/tabs/tabKeys";

/**
 * 右のパネルのペインの操作（分ける・移す・閉じる・境目・ピント）。useSidePanel が返す。
 * closeMany はタブを閉じる方法（ペインを閉じるとき、中のタブも閉じる。base は閉じる前に変えておいた配置）。
 * keepOnClose はペインを閉じても閉じずに一覧のペインへ戻すタブ（サイドバーと連動したチャット）
 */
export function paneActions(
  layout: PaneLayout,
  setLayout: (fn: (l: PaneLayout) => PaneLayout) => void,
  closeMany: (keys: string[], base: PaneLayout) => void,
  keepOnClose: (key: string) => boolean,
) {
  return {
    /** ペインにピントを移す（ペインを押した・ペインの中で操作したとき。新しく開くタブはここに入る） */
    focusPane: (paneId: string) => setLayout((l) => focusPane(l, paneId)),
    /** ペインを分ける。tabKey があればそのタブを新しいペインへ移し、なければ空のペインを作る */
    splitPane: (paneId: string, dir: SplitDir, side: SplitSide, tabKey?: string) => {
      // ID は updater の外で作る（updater は StrictMode で 2 回走る）
      const id = newTabKey("pane");
      setLayout((l) => splitPane(l, paneId, dir, side, id, tabKey));
    },
    /** タブを別のペイン（同じペインなら並べ替え）の index の位置へ移す */
    moveTab: (key: string, paneId: string, index?: number) => setLayout((l) => moveTab(l, key, paneId, index)),
    /** ペインを閉じる（サイドバーと連動したチャットは一覧のペインへ戻し、ほかのタブは閉じる。最後の 1 つは閉じない） */
    closePane: (paneId: string) => {
      const next = closePane(layout, paneId, keepOnClose);
      if (next.layout !== layout) closeMany(next.closed, next.layout);
    },
    /** 境目をドラッグして割合を変える（path は分割の場所） */
    resizeSplit: (path: number[], sizes: number[]) => setLayout((l) => setSplitSizes(l, path, sizes)),
    /** 境目のダブルクリックで等分に戻す */
    equalizeSplit: (path: number[]) => setLayout((l) => equalizeSplit(l, path)),
  };
}
