import { Fragment, type ReactNode } from "react";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { ClusterShortItem } from "@/features/chatPanel/ui/clusters/ClusterShortItem";
import { useTabGrouping } from "@/features/chatPanel/ui/clusters/useTabClusters";
import { HiddenGroupItems } from "@/features/chatPanel/ui/clusters/HiddenGroupItems";
import { panelSettings, type PanelController } from "@/features/panel/ui";
import { PANEL_TAB_GROUP_COLORS } from "@/foundation/ui/storage/storageKeys";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { groupedTabField, hiddenTabFields, TAB_FIELD_LABELS, TAB_FIELDS, toggleTabField } from "./tabFields";
import { ArchivedChatsItem } from "./ArchivedChatsItem";
import { CHAT_GROUPING_LABELS, CHAT_GROUPINGS, BucketColorItem, CHAT_ORDERS, ORDER_META, useChatLayout } from "@/features/chatList/ui";

const separator = <div className="menu-separator" role="separator" />;

const TAB_OVERFLOWS = panelSettings.tabOverflow.choices;
const TAB_OVERFLOW_LABELS: Record<(typeof TAB_OVERFLOWS)[number], string> = { shrink: "タブを細くして収める", scroll: "横にスクロールする" };
const TAB_OVERFLOW_TIPS: Record<(typeof TAB_OVERFLOWS)[number], string> = {
  shrink: "タブが増えたら、タブを細くしてタブの列に収めます（名前を省き、狭くなったらアイコンだけに）",
  scroll: "タブが増えても幅を変えずに並べ、タブの列を横にスクロールします（トラックパッドの横のスワイプ・マウスのホイール）",
};

/**
 * タブの表示の項目（タブの列の「表示」のメニューの上の部分と、タブの右クリックの「タブの表示 ›」で共通）:
 * チャットのまとめ方（とまとまりの色）・チャットの並び順（サイドバーと共通）・タブに出す項目（tabFields）・
 * グループ別のときに出すグループ（HiddenGroupItems）・アーカイブ済みのチャットを出すか。まとまりごとに区切り線で分ける
 */
export function TabDisplayItems({ panel }: { panel: PanelController }) {
  const [grouping, setGrouping] = useTabGrouping(panel.surface);
  // チャットの並び順はサイドバーと共通の 1 つの設定（一覧のペインのチャットのタブはサイドバーと同じ並びなので、どちらで選んでもそろう）
  const { order, setOrder } = useChatLayout();
  // タブに出す項目（隠した項目だけを覚える）
  const [tabHidden, setTabHidden] = useSetting(panelSettings.tabHidden);
  const hiddenFields = hiddenTabFields(tabHidden);
  // タブを 2 行にするか（サイドバーのチャットの行とは別の、タブだけの設定）
  const [twoLine, setTwoLine] = useSetting(panelSettings.tabTwoLine);
  // タブが増えて入らないとき、細くして収めるか横にスクロールするか（すべてのパネルで共通）
  const [overflow, setOverflow] = useSetting(panelSettings.tabOverflow);
  const showChat = panel.kinds.has("chat");

  const section = (title: string, items: ReactNode) => (
    <>
      <div className="menu-label">{title}</div>
      {items}
    </>
  );
  const sections: ReactNode[] = [];
  if (showChat) {
    sections.push(
      section(
        "チャットのまとめ方",
        <>
          {CHAT_GROUPINGS.map((g) => (
            <MenuItem key={g} radio checked={g === grouping} onSelect={() => setGrouping(g)}>
              <span className="project-switch-item">{CHAT_GROUPING_LABELS[g]}</span>
            </MenuItem>
          ))}
          {/* まとめたまとまりの色（色付き / 色なし。まとまりの札の右クリックにも同じ項目）と名前の省略。まとめないときは効かないので出さない。
              まとめ方の選択肢と見分けられるよう、上に区切り線を引く */}
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
          <MenuItem key={o} radio checked={o === order} title="サイドバーの「並び順」と共通の設定です" onSelect={() => setOrder(o)}>
            <span className="project-switch-item">{ORDER_META[o].label}</span>
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
            </MenuItem>
          );
        }).concat(
          // 項目の付け外しと見分けられるよう、上に区切り線を引く
          <Fragment key="two-line-sep">{separator}</Fragment>,
          // 2 行で表示: グループ・作業場所の札を名前の下の行に置く（すべてのパネルで共通。サイドバーのチャットの行の 1 行 / 2 行とは別）
          <MenuItem
            key="two-line"
            checked={twoLine}
            keepOpen
            title={twoLine ? "タブを 1 行に戻す（札を名前の右に並べる）" : "タブを 2 行にして、グループ・作業場所の札を名前の下の行に並べる（サイドバーのチャットの行とは別の設定です）"}
            onSelect={() => setTwoLine(!twoLine)}
          >
            <span className="project-switch-item">2 行で表示</span>
          </MenuItem>,
        ),
      ),
    );
    // タブが増えたとき: 細くして収める（Chrome と同じ）か、ふだんの幅のまま横にスクロールする（VS Code と同じ）か
    sections.push(
      section(
        "タブが増えたとき",
        TAB_OVERFLOWS.map((o) => (
          <MenuItem
            key={o}
            radio
            checked={overflow === o}
            keepOpen
            title={TAB_OVERFLOW_TIPS[o]}
            onSelect={() => setOverflow(o)}
          >
            <span className="project-switch-item">{TAB_OVERFLOW_LABELS[o]}</span>
          </MenuItem>
        )),
      ),
    );
    // グループ別のときだけ: タブの列に出すグループ（自分で作ったグループを隠す・チャットのないグループを隠す）
    if (grouping === "group") sections.push(<HiddenGroupItems panel={panel} />);
    sections.push(<ArchivedChatsItem />);
  }
  return sections.map((s, i) => (
    <Fragment key={i}>
      {i > 0 && separator}
      {s}
    </Fragment>
  ));
}
