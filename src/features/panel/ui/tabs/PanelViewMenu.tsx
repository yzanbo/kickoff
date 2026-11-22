import { ChevronRight, SlidersHorizontal } from "lucide-react";
import type { MouseEvent } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { PANEL_VIEW_BUTTON_HIDDEN } from "@/foundation/ui/storage/storageKeys";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuFlyout, useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { surfaceOf } from "@/features/panel/ui/state/panelStore";
import type { PanelController } from "@/features/panel/ui/usePanel";

/**
 * タブの列の「表示」のメニュー（タブの列の左の道具のボタン・タブの列の何もないところの右クリックで、同じものを開く）。
 * 中身は欄の ViewMenu（チャットのパネルはまとめ方・並び順・タブに出す項目など。タブの右クリックの「タブの表示 ›」と共通）。
 * 中身のない欄（サブエージェントの欄など）は、ボタンも右クリックも出さない。
 * 既定と違う選び方をしていても、ボタンに印は付けない（自分で選んだ好みなので、ずっと印を出すと何か問題があるように見えるため）
 */
export function usePanelViewMenu(panel: PanelController) {
  const menu = useContextMenu();
  const Items = surfaceOf(panel.surface)?.ViewMenu;
  const has = Items !== undefined;
  // 欄ごとにボタンを分ける（ほかの欄のボタンを押したときは、こちらのメニューを外側のクリックとして閉じる）
  const buttonClass = `panel-view-${panel.surface}`;
  return {
    has,
    isOpen: menu.isOpen,
    buttonClass,
    /** 道具のボタンを押したとき（開いていれば閉じる） */
    toggle: menu.toggle,
    /** タブの列の何もないところの右クリック（入力欄・タブの上では、そのものの右クリックを残す） */
    open: (e: MouseEvent) => {
      if (!has || (e.target as HTMLElement).closest("input, textarea, .panel-tab")) return;
      menu.open(e);
    },
    menu: menu.menu && Items && (
      <PopupMenu at={menu.menu.at} label="表示" ignore={`.${buttonClass}`} onClose={menu.close}>
        <Items panel={panel} />
      </PopupMenu>
    ),
  };
}

/**
 * タブの右クリックの「タブの表示 ›」（乗せる・押す・→ で横に開く子のメニューに、欄の ViewMenu のタブの表示の項目を出す。タブの列の「表示」のメニューと同じ値）。
 * 中身のない欄では何も出さない。区切り線は置かない（タブのメニューで「タブを閉じる」と 1 つの組にする）
 */
export function ViewSubmenu({ panel }: { panel: PanelController }) {
  const sub = useSubmenu();
  const Items = surfaceOf(panel.surface)?.ViewMenu;
  if (!Items) return null;
  return (
    <>
      <button {...sub.trigger} title="タブの列の「表示」のメニューと同じ、タブの表示の選び方です">
        <SlidersHorizontal size={14} /> タブの表示
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {sub.anchor && (
        <MenuFlyout anchor={sub.anchor} label="タブの表示" onBack={sub.back}>
          <Items panel={panel} tabMenu />
        </MenuFlyout>
      )}
    </>
  );
}

export type PanelViewMenu = ReturnType<typeof usePanelViewMenu>;

/** タブの列の左の道具の「表示」ボタン（隠す設定 PANEL_VIEW_BUTTON_HIDDEN なら出さない。初めは出す） */
export function PanelViewButton({ view }: { view: PanelViewMenu }) {
  const [hidden] = useSetting(PANEL_VIEW_BUTTON_HIDDEN);
  if (!view.has || hidden) return null;
  const label = "表示";
  return (
    <IconButton
      type="button"
      icon={SlidersHorizontal}
      iconSize={15}
      className={cx("panel-control", view.buttonClass)}
      label={label}
      title={`${label}: チャットのまとめ方と並び順・タブに出す項目・アーカイブ済みなど（タブの列の何もないところの右クリックでも開きます）`}
      aria-haspopup="menu"
      aria-expanded={view.isOpen}
      onClick={view.toggle}
    />
  );
}
