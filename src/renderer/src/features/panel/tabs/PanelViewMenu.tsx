import { Check, SlidersHorizontal } from "lucide-react";
import { Fragment, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { BOARD_HEADER_LAYOUT_LABELS, BOARD_HEADER_LAYOUTS, useBoardHeaderLayout } from "@/features/board/boardHeaderLayout";
import { CHAT_GROUPING_LABELS, CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { useTabGrouping } from "@/features/panel/clusters/useTabClusters";
import { PANEL_KINDS, PANEL_KIND_LABELS } from "@/features/panel/state/panelKinds";
import { SURFACES } from "@/features/panel/surfaces";
import type { PanelController } from "@/features/panel/usePanel";

/**
 * タブの列の「表示」のメニュー（タブの列の左の道具のボタン・タブの列の何もないところの右クリックで、同じものを開く）。
 * 表示するタブの種類（チャット・ブラウザ・ターミナル）・チャットのまとめ方・アーカイブ済みのチャットを出すか・ボードツールバーの置き方
 * （ボードの右のパネルだけ）を 1 つにまとめる（以前はそれぞれのアイコンが並び、タブの列の道具が多かった）。
 * 欄に関係のない項目は出さない（サブエージェントの欄は項目がないので、ボタンも右クリックも出さない）。
 * 既定と違う選び方をしていれば changed（ボタンに点を付けて、隠れた状態に気づけるように）
 */
export function usePanelViewMenu(panel: PanelController) {
  const rules = SURFACES[panel.surface];
  const { kinds } = panel;
  const [grouping, setGrouping] = useTabGrouping(panel.surface);
  const [archived, setArchived] = useShowArchivedChats();
  const [layout, setLayout] = useBoardHeaderLayout();
  const menu = useContextMenu();
  const showKinds = !rules.fixedKinds;
  const showChat = kinds.has("chat");
  const showLayout = rules.layoutMenu === true;
  const has = showKinds || showChat || showLayout;
  const defaultKinds = rules.defaultKinds.join(",") === kinds.kinds.join(",");
  const changed = (showKinds && !defaultKinds) || (showChat && (grouping !== "none" || archived)) || (showLayout && layout !== "top");
  // 欄ごとにボタンを分ける（ほかの欄のボタンを押したときは、こちらのメニューを外側のクリックとして閉じる）
  const buttonClass = `panel-view-${panel.surface}`;

  const section = (title: string, items: ReactNode) => (
    <>
      <div className="menu-label">{title}</div>
      {items}
    </>
  );
  const separator = <div className="menu-separator" role="separator" />;
  const sections: ReactNode[] = [];
  if (showKinds)
    sections.push(
      section(
        "表示するタブ",
        PANEL_KINDS.map((k) => {
          const on = kinds.has(k);
          const last = on && kinds.kinds.length === 1;
          return (
            <MenuItem
              key={k}
              role="menuitemcheckbox"
              checked={on}
              title={last ? "1 つは表示しておきます" : on ? `${PANEL_KIND_LABELS[k]}のタブを隠す（閉じずに残します）` : `${PANEL_KIND_LABELS[k]}のタブを表示する`}
              onSelect={() => kinds.toggle(k)}
            >
              <span className="project-switch-item">{PANEL_KIND_LABELS[k]}</span>
              {on && <Check size={14} aria-hidden />}
            </MenuItem>
          );
        }),
      ),
    );
  if (showChat) {
    sections.push(
      section(
        "チャットのまとめ方",
        CHAT_GROUPINGS.map((g) => (
          <MenuItem key={g} role="menuitemradio" checked={g === grouping} onSelect={() => setGrouping(g)}>
            <span className="project-switch-item">{CHAT_GROUPING_LABELS[g]}</span>
            {g === grouping && <Check size={14} aria-hidden />}
          </MenuItem>
        )),
      ),
    );
    sections.push(
      <MenuItem
        role="menuitemcheckbox"
        checked={archived}
        title="サイドバーの「アーカイブ」と共通の設定です"
        onSelect={() => setArchived(!archived)}
      >
        <span className="project-switch-item">アーカイブ済みのチャットを表示</span>
        {archived && <Check size={14} aria-hidden />}
      </MenuItem>,
    );
  }
  if (showLayout)
    sections.push(
      section(
        "ボードツールバーの置き方",
        BOARD_HEADER_LAYOUTS.map((l) => (
          <MenuItem key={l} role="menuitemradio" checked={l === layout} onSelect={() => setLayout(l)}>
            <span className="project-switch-item">{BOARD_HEADER_LAYOUT_LABELS[l]}</span>
            {l === layout && <Check size={14} aria-hidden />}
          </MenuItem>
        )),
      ),
    );

  return {
    has,
    changed,
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

/** タブの列の左の道具の「表示」ボタン（既定と違う選び方をしていれば点を付ける） */
export function PanelViewButton({ view }: { view: PanelViewMenu }) {
  if (!view.has) return null;
  const label = view.changed ? "表示（既定から変えています）" : "表示";
  return (
    <IconButton
      type="button"
      icon={SlidersHorizontal}
      size={15}
      className={cx("panel-control panel-view-button", view.buttonClass, view.changed && "changed")}
      label={label}
      title={`${label}: 表示するタブ・チャットのまとめ方・アーカイブ済みなど（タブの列の何もないところの右クリックでも開きます）`}
      aria-haspopup="menu"
      aria-expanded={view.isOpen}
      onClick={view.toggle}
    />
  );
}
