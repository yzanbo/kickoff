import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { Fragment, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { ChatDisplayItems } from "@/features/chat/pane/ChatDisplayMenu";
import type { PanelController } from "@/features/panel/usePanel";
import { usePanelViewReset } from "./usePanelViewReset";
import { hasTabDisplayItems, TabDisplayItems } from "./TabDisplayItems";

/**
 * タブの列の「表示」のメニュー（タブの列の左の道具のボタン・タブの列の何もないところの右クリックで、同じものを開く）。
 * タブの表示（表示するタブの種類・チャットのまとめ方・並び順・タブに出す項目・出すグループ・アーカイブ済み。TabDisplayItems。タブの右クリックの「タブの表示 ›」と共通）・チャット画面表示
 * （タブの列・見出し・指示の帯・会話の横幅と文字の大きさ・チャット欄。ChatDisplayItems。どのチャットでも共通。項目が多いので「チャット画面表示 ›」の横に開く子のメニューに入れる。利用者の依頼）
 * を 1 つにまとめる（以前はそれぞれのアイコンが並び、タブの列の道具が多かった）。
 * チャットの画面の切り替えは、見出しを隠しても戻せるよう、見出しの外のここに置く。
 * 欄に関係のない項目は出さない（サブエージェントの欄は項目がないので、ボタンも右クリックも出さない）。
 * 既定と違う選び方をしていても、ボタンに印は付けない（自分で選んだ好みなので、ずっと印を出すと何か問題があるように見えるため。以前は点を付けていた）
 */
export function usePanelViewMenu(panel: PanelController) {
  const menu = useContextMenu();
  const chatDisplay = useSubmenu();
  // いちばん下の「既定に戻す」（メニューに出ている選び方を初めの値に戻す。初めのままなら押せない）
  const defaults = usePanelViewReset(panel.surface, panel.kinds.has("chat"));
  const showChat = panel.kinds.has("chat");
  const has = hasTabDisplayItems(panel);
  // 欄ごとにボタンを分ける（ほかの欄のボタンを押したときは、こちらのメニューを外側のクリックとして閉じる）
  const buttonClass = `panel-view-${panel.surface}`;

  const separator = <div className="menu-separator" role="separator" />;
  const sections: ReactNode[] = [];
  // タブの表示（表示するタブ・まとめ方・並び順・タブに出す項目・出すグループ・アーカイブ済み。タブの右クリックの「タブの表示 ›」と共通）
  if (has) sections.push(<TabDisplayItems panel={panel} />);
  if (showChat) {
    // 乗せる・押す・→ で横に開く（メニューは閉じない）
    sections.push(
      <>
        <button {...chatDisplay.trigger} title="どのチャットでも共通の表示です（設定の「表示」と同じ値）">
          <span className="project-switch-item">チャット画面表示</span>
          <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
        </button>
        {chatDisplay.anchor && (
          <MenuFlyout anchor={chatDisplay.anchor} label="チャット画面表示" onBack={chatDisplay.back}>
            <ChatDisplayItems heading={false} />
          </MenuFlyout>
        )}
      </>,
    );
  }
  if (has)
    sections.push(
      <MenuItem
        disabled={!defaults.changed}
        title={defaults.changed ? "このメニューの選び方を初めの値に戻します" : "初めの選び方のままです"}
        keepOpen
        onSelect={defaults.reset}
      >
        <span className="project-switch-item">既定に戻す</span>
      </MenuItem>,
    );
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
    menu: menu.menu && (
      <PopupMenu at={menu.menu.at} label="表示" ignore={`.${buttonClass}`} onClose={menu.close}>
        {sections.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && separator}
            {s}
          </Fragment>
        ))}
      </PopupMenu>
    ),
  };
}

export type PanelViewMenu = ReturnType<typeof usePanelViewMenu>;

/** タブの列の左の道具の「表示」ボタン */
export function PanelViewButton({ view }: { view: PanelViewMenu }) {
  if (!view.has) return null;
  const label = "表示";
  return (
    <IconButton
      type="button"
      icon={SlidersHorizontal}
      size={15}
      className={cx("panel-control", view.buttonClass)}
      label={label}
      title={`${label}: 表示するタブ・チャットのまとめ方と並び順・アーカイブ済み・チャットの見出しや指示の帯など（タブの列の何もないところの右クリックでも開きます）`}
      aria-haspopup="menu"
      aria-expanded={view.isOpen}
      onClick={view.toggle}
    />
  );
}
