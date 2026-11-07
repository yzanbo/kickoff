import { Check, SlidersHorizontal } from "lucide-react";
import { Fragment, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { ChatDisplayItems } from "@/features/chat/pane/ChatDisplayMenu";
import { CHAT_GROUPING_LABELS, CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { useTabGrouping } from "@/features/panel/clusters/useTabClusters";
import { HiddenGroupItems } from "@/features/panel/clusters/HiddenGroupItems";
import { PANEL_KIND_LABELS } from "@/features/panel/state/panelKinds";
import { SURFACES } from "@/features/panel/surfaces";
import type { PanelController } from "@/features/panel/usePanel";
import { usePanelViewReset } from "./usePanelViewReset";
import { BucketColorItem } from "@/features/chatList/BucketColorItem";
import { PANEL_TAB_GROUP_COLORS } from "@/lib/storageKeys";

/**
 * タブの列の「表示」のメニュー（タブの列の左の道具のボタン・タブの列の何もないところの右クリックで、同じものを開く）。
 * 表示するタブの種類（チャット・ブラウザ・ターミナル）・チャットのまとめ方・グループ別のときに出すグループ（HiddenGroupItems）・アーカイブ済みのチャットを出すか・チャット画面表示
 * （タブの列・見出し・指示の帯・会話の横幅と文字の大きさ・チャット欄。ChatDisplayItems。どのチャットでも共通）
 * を 1 つにまとめる（以前はそれぞれのアイコンが並び、タブの列の道具が多かった）。
 * チャットの画面の切り替えは、見出しを隠しても戻せるよう、見出しの外のここに置く。
 * 欄に関係のない項目は出さない（サブエージェントの欄は項目がないので、ボタンも右クリックも出さない）。
 * 既定と違う選び方をしていても、ボタンに印は付けない（自分で選んだ好みなので、ずっと印を出すと何か問題があるように見えるため。以前は点を付けていた）
 */
export function usePanelViewMenu(panel: PanelController) {
  const rules = SURFACES[panel.surface];
  const { kinds } = panel;
  const [grouping, setGrouping] = useTabGrouping(panel.surface);
  const [archived, setArchived] = useShowArchivedChats();
  const menu = useContextMenu();
  // いちばん下の「既定に戻す」（メニューに出ている選び方を初めの値に戻す。初めのままなら押せない）
  const defaults = usePanelViewReset(panel.surface, kinds.has("chat"));
  const showKinds = !rules.fixedKinds;
  const showChat = kinds.has("chat");
  const has = showKinds || showChat;
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
        kinds.choices.map((k) => {
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
        <>
          {CHAT_GROUPINGS.map((g) => (
            <MenuItem key={g} role="menuitemradio" checked={g === grouping} onSelect={() => setGrouping(g)}>
              <span className="project-switch-item">{CHAT_GROUPING_LABELS[g]}</span>
              {g === grouping && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
          {/* まとめたまとまりの色（色付き / 色なし。まとまりの札の右クリックにも同じ項目）。まとめないときは効かないので出さない */}
          {grouping !== "none" && <BucketColorItem setting={PANEL_TAB_GROUP_COLORS} keepOpen />}
        </>,
      ),
    );
    // グループ別のときだけ: タブの列に出すグループ（自分で作ったグループを隠す・チャットのないグループを隠す）
    if (grouping === "group") sections.push(<HiddenGroupItems panel={panel} />);
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
    sections.push(<ChatDisplayItems />);
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
      title={`${label}: 表示するタブ・チャットのまとめ方・アーカイブ済み・チャットの見出しや指示の帯など（タブの列の何もないところの右クリックでも開きます）`}
      aria-haspopup="menu"
      aria-expanded={view.isOpen}
      onClick={view.toggle}
    />
  );
}
