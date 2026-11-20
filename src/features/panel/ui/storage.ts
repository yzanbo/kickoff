// panel の画面の保存（キーは kickoff:panel:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, flag, json, list, number, record, single } from "@/foundation/ui/storage";
import { NO_POPOUT_WINDOW_TABS, isPopoutWindowTab } from "./popoutWindowTab";

export const storage = defineSettings("panel", {
  /**
   * 別ウィンドウへ・別ウィンドウから移す送る前の新しいチャットのタブの中身（タブのキーごと。書きかけの文・添付は URL に入らないので、ここで渡し、受け取った側が消す。
   * features/panel/tabs/popOutTab.ts・features/popout/tabWindow.ts・dockPopout.ts）
   */
  popoutTabHandoff: single(record(), { ids: true }),
  popoutWindowTabs: single(json((value) => (Array.isArray(value) ? value.filter(isPopoutWindowTab) : undefined), NO_POPOUT_WINDOW_TABS, (tabs) => tabs.length === 0), { ids: true, session: true }),
  width: number(1127),
  /** 右のパネルを横幅いっぱいにしているか */
  maximized: flag(),
  /** タブに出さない項目（状態・ピン留め・グループ・作業場所。features/panel/tabs/tabFields.ts。すべてのパネルで共通。初めはすべて出す） */
  tabHidden: list(),
  /** チャットを出す欄のタブを 2 行にする（名前の下の行にグループ・作業場所の札。すべてのパネルで共通。初めは 1 行。サイドバーのチャットの行の 1 行 / 2 行とは別） */
  tabTwoLine: flag(false),
  /**
   * チャットを出す欄で、タブが増えて入らないとき: shrink = タブを細くして収める（Chrome と同じ。初め） / scroll = ふだんの幅のまま並べ、タブの列を横にスクロールする
   * （VS Code と同じ。すべてのパネルで共通）
   */
  tabOverflow: choice(["shrink", "scroll"], "shrink"),
  bottomHeight: number(198),
});
