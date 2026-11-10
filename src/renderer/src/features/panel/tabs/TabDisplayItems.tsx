import { Check, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem } from "@/ui/PopupMenu";
import { CHAT_GROUPING_LABELS, CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { BucketColorItem } from "@/features/chatList/BucketColorItem";
import { ClusterShortItem } from "@/features/panel/clusters/ClusterShortItem";
import { useTabGrouping } from "@/features/panel/clusters/useTabClusters";
import { HiddenGroupItems } from "@/features/panel/clusters/HiddenGroupItems";
import { PANEL_KIND_LABELS } from "@/features/panel/state/panelKinds";
import { SURFACES } from "@/features/panel/surfaces";
import type { PanelController } from "@/features/panel/usePanel";
import { PANEL_TAB_GROUP_COLORS, PANEL_TAB_HIDDEN, PANEL_TAB_TWO_LINE } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { CHAT_ORDERS, ORDER_META, useChatLayout } from "@/features/sidebar/chatGroupings";
import { groupedTabField, hiddenTabFields, TAB_FIELD_LABELS, TAB_FIELDS, toggleTabField } from "./tabFields";

/** その欄に、タブの表示の項目があるか（表示するタブの種類を選べる欄か、チャットを出す欄。サブエージェントの欄はない） */
export const hasTabDisplayItems = (panel: PanelController) => !SURFACES[panel.surface].fixedKinds || panel.kinds.has("chat");

const separator = <div className="menu-separator" role="separator" />;

/**
 * タブの表示の項目（タブの列の「表示」のメニューの上の部分と、タブの右クリックの「タブの表示 ›」で共通。利用者の依頼）:
 * 表示するタブの種類（チャット・ブラウザ・ターミナル）・チャットのまとめ方（とまとまりの色）・チャットの並び順（サイドバーと共通）・タブに出す項目（tabFields）・
 * グループ別のときに出すグループ（HiddenGroupItems）・アーカイブ済みのチャットを出すか。まとまりごとに区切り線で分ける
 */
export function TabDisplayItems({ panel }: { panel: PanelController }) {
  const { kinds } = panel;
  const [grouping, setGrouping] = useTabGrouping(panel.surface);
  const [archived, setArchived] = useShowArchivedChats();
  // チャットの並び順はサイドバーと共通の 1 つの設定（利用者の依頼。一覧のペインのチャットのタブはサイドバーと同じ並びなので、どちらで選んでもそろう）
  const { order, setOrder } = useChatLayout();
  // タブに出す項目（隠した項目だけを覚える）
  const [tabHidden, setTabHidden] = useSetting(PANEL_TAB_HIDDEN);
  const hiddenFields = hiddenTabFields(tabHidden);
  // タブを 2 行にするか（サイドバーのチャットの行とは別の、タブだけの設定。利用者の依頼）
  const [twoLine, setTwoLine] = useSetting(PANEL_TAB_TWO_LINE);
  const showKinds = !SURFACES[panel.surface].fixedKinds;
  const showChat = kinds.has("chat");

  const section = (title: string, items: ReactNode) => (
    <>
      <div className="menu-label">{title}</div>
      {items}
    </>
  );
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
          {/* まとめたまとまりの色（色付き / 色なし。まとまりの札の右クリックにも同じ項目）と名前の省略。まとめないときは効かないので出さない。
              まとめ方の選択肢と見分けられるよう、上に区切り線を引く（利用者の依頼） */}
          {grouping !== "none" && (
            <>
              {separator}
              <BucketColorItem setting={PANEL_TAB_GROUP_COLORS} keepOpen />
              <ClusterShortItem keepOpen />
            </>
          )}
        </>,
      ),
    );
    sections.push(
      section(
        "チャットの並び順",
        CHAT_ORDERS.map((o) => (
          <MenuItem key={o} role="menuitemradio" checked={o === order} title="サイドバーの「並び順」と共通の設定です" onSelect={() => setOrder(o)}>
            <span className="project-switch-item">{ORDER_META[o].label}</span>
            {o === order && <Check size={14} aria-hidden />}
          </MenuItem>
        )),
      ),
    );
    // タブに出す項目（状態・ピン留め・グループ・作業場所。すべてのパネルで共通）。いまのまとめ方の項目（グループ別ならグループ・作業場所別なら作業場所）は、
    // まとまりの札に出るので選んでいてもタブには出さない: チェックはそのまま薄くして押せなくし、別のまとめ方にすれば選んだとおりに出る
    sections.push(
      section(
        "タブに出す項目",
        TAB_FIELDS.map((f) => {
          const on = !hiddenFields.has(f);
          const grouped = groupedTabField(grouping) === f;
          return (
            <MenuItem
              key={f}
              role="menuitemcheckbox"
              checked={on}
              disabled={grouped}
              keepOpen
              title={
                grouped
                  ? `${CHAT_GROUPING_LABELS[grouping]}にまとめているので、${TAB_FIELD_LABELS[f]}はまとまりの札に出し、タブには出しません（別のまとめ方にすると、選んだとおりに出ます）`
                  : on
                    ? `タブの${TAB_FIELD_LABELS[f]}を隠す`
                    : `タブに${TAB_FIELD_LABELS[f]}を出す`
              }
              onSelect={() => setTabHidden(toggleTabField(tabHidden, f))}
            >
              <span className="project-switch-item">{TAB_FIELD_LABELS[f]}</span>
              {on && <Check size={14} aria-hidden />}
            </MenuItem>
          );
        }).concat(
          // 項目の付け外しと見分けられるよう、上に区切り線を引く（利用者の依頼）
          <Fragment key="two-line-sep">{separator}</Fragment>,
          // 2 行で表示: グループ・作業場所の札を名前の下の行に置く（すべてのパネルで共通。サイドバーのチャットの行の 1 行 / 2 行とは別）
          <MenuItem
            key="two-line"
            role="menuitemcheckbox"
            checked={twoLine}
            keepOpen
            title={twoLine ? "タブを 1 行に戻す（札を名前の右に並べる）" : "タブを 2 行にして、グループ・作業場所の札を名前の下の行に並べる（サイドバーのチャットの行とは別の設定です）"}
            onSelect={() => setTwoLine(!twoLine)}
          >
            <span className="project-switch-item">2 行で表示</span>
            {twoLine && <Check size={14} aria-hidden />}
          </MenuItem>,
        ),
      ),
    );
    // グループ別のときだけ: タブの列に出すグループ（自分で作ったグループを隠す・チャットのないグループを隠す）
    if (grouping === "group") sections.push(<HiddenGroupItems panel={panel} />);
    sections.push(
      <MenuItem role="menuitemcheckbox" checked={archived} title="サイドバーの「アーカイブ」と共通の設定です" onSelect={() => setArchived(!archived)}>
        <span className="project-switch-item">アーカイブ済みのチャットを表示</span>
        {archived && <Check size={14} aria-hidden />}
      </MenuItem>,
    );
  }
  return sections.map((s, i) => (
    <Fragment key={i}>
      {i > 0 && separator}
      {s}
    </Fragment>
  ));
}

/**
 * タブの右クリックの「タブの表示 ›」（乗せる・押す・→ で横に開く子のメニューに TabDisplayItems を出す。タブの列の「表示」のメニューと同じ値。利用者の依頼）。
 * 項目のない欄（サブエージェントの欄）では何も出さない。前に区切り線を置く
 */
export function TabDisplaySubmenu({ panel }: { panel: PanelController }) {
  const sub = useSubmenu();
  if (!hasTabDisplayItems(panel)) return null;
  return (
    <>
      {separator}
      <button {...sub.trigger} title="タブの列の「表示」のメニューと同じ、タブの表示の選び方です">
        <SlidersHorizontal size={14} /> タブの表示
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {sub.anchor && (
        <MenuFlyout anchor={sub.anchor} label="タブの表示" onBack={sub.back}>
          <TabDisplayItems panel={panel} />
        </MenuFlyout>
      )}
    </>
  );
}
