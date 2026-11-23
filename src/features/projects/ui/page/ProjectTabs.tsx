import "./tabStrip.css";
import "./ProjectTabs.css";
import { GripHorizontal, GripVertical } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import type { SettingValue } from "@/foundation/ui/storage";
import { href, type ProjectViewId } from "@/foundation/ui/navigation/router";
import { storage } from "@/features/projects/ui/storage";
import { ChoiceMenu } from "@/foundation/ui/kit/ChoiceMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { availableProjectViews, projectViewGroups, type ProjectViewBadge, type ProjectViewBadgeProps, type ProjectViewDef } from "@/features/projects/ui/projectViews";
import { useChatPlacement } from "./chatPlacement";
import { useProjectTabOrder } from "./useProjectTabOrder";
import { useMemo } from "react";

/** タブの置き方（top = 見出しの下に横並び / side = 左に縦並び・アイコンだけ。縦の幅を本体に回せる） */
export type ProjectTabsLayout = SettingValue<typeof storage.settings.tabsLayout>;
/** 置き方の名前（設定の「表示」と、タブの右クリックのメニューで共通） */
export const PROJECT_TABS_LAYOUT_LABELS: Record<ProjectTabsLayout, string> = { top: "上に横並び", side: "左に縦並び（アイコン）" };

/** タブの置き方（設定の「表示」で選ぶ。どのプロジェクトでも同じ。初めは左に縦並び（選んだことがなければ、入れたばかりでも縦並び）） */
export function useProjectTabsLayout() {
  return useSetting(storage.settings.tabsLayout);
}

/** タブの数に要るもの（変更の数を出す作業場所・チャットの数を取り直している最中か = プロジェクトの画面のデータの読み込み） */
export interface TabBadgeSource {
  worktree: string | null;
  loading: boolean;
}

/** 数のない画面の口（数を読む hook を、口のオブジェクトから毎回同じに呼ぶため。hook を値で選んで呼ぶ・条件つきで呼ぶと React Compiler が外す） */
const NO_BADGE: { useBadge(props: ProjectViewBadgeProps): ProjectViewBadge | undefined } = { useBadge: () => undefined };

/** タブ 1 つ（数は画面の表の useBadge。badgeDef が変わるときは key を変えて作り直す） */
function ProjectTab({
  def,
  badgeDef,
  projectId,
  selected,
  vertical,
  badge,
  attrs,
  props,
}: {
  def: ProjectViewDef;
  badgeDef: ProjectViewDef | undefined;
  projectId: number;
  selected: boolean;
  vertical: boolean;
  badge: TabBadgeSource;
  attrs: object;
  props: object;
}) {
  const source = badgeDef?.useBadge ? (badgeDef as Required<Pick<ProjectViewDef, "useBadge">>) : NO_BADGE;
  const shown = source.useBadge({ projectId, worktree: badge.worktree, vertical, loading: badge.loading });
  const { label, tip, icon: Icon } = def;
  const count = shown?.label ?? null;
  return (
    <a
      role="tab"
      aria-selected={selected}
      aria-label={vertical ? `${tip ?? label}${count ? `（${count}）` : ""}` : undefined}
      title={!vertical && shown?.titled && count ? count : !vertical ? tip : undefined}
      {...(vertical && { "data-tip-title": tip ?? label, "data-tip": count ?? "", "data-tip-side": "right" })}
      className={cx("tab", selected && "active")}
      {...attrs}
      href={href({ name: "project", id: projectId, tab: def.id })}
      {...props}
    >
      {vertical ? <Icon size={18} aria-hidden /> : label}
      {/* 取り直している最中は数の代わりに更新中の印（終わったら数に戻す） */}
      {shown &&
        (shown.refreshing ? (
          <span className="tab-refreshing" role="status" aria-label="更新中" title="更新中…">
            <span className="spinner" aria-hidden />
          </span>
        ) : (
          shown.node
        ))}
    </a>
  );
}

/**
 * プロジェクトの画面のタブ（画面の表 projectViews の真ん中に置けるもの。チャットはボードと分ける置き方のときだけ）。数は画面の表の useBadge
 * （チャットのタブ（分けない置き方ならボード）は状態ごとのチャット数、変更は変更のあるファイルの数。取り直している最中は数の代わりに回る印）。
 * 同じまとまりのタブは薄い地でつなぎ、まとまりの間を空ける。ドラッグで並べ替えられる（ほかのまとまりへはまとまりごと、同じまとまりの中では 1 つずつ。
 * useProjectTabOrder。2 つ以上のタブのまとまりは端のつまみでまとまりごと動かせる）。右サイドバーの右端の列も同じまとまりと並び（SideRail）。
 * vertical: 左に縦並び（アイコンだけ。名前と数は aria-label と、乗せたときに右に出す説明 data-tip）。右クリックで置き方（横並び / 縦並び）を切り替え、並べ替えていれば元の並びに戻せる
 */
export function ProjectTabs({
  projectId,
  tab,
  badge,
  vertical = false,
}: {
  projectId: number;
  tab: ProjectViewId;
  badge: TabBadgeSource;
  vertical?: boolean;
}) {
  const [layout, setLayout] = useProjectTabsLayout();
  const [placement] = useChatPlacement();
  const separate = placement === "separate";
  const menu = useContextMenu();
  // 真ん中に置ける画面のまとまり（画面の表は登録のあと変わらない）と、ドラッグでの並べ替え（並べた順のまとまりとタブ）
  const views = useMemo(() => availableProjectViews("center"), []);
  const order = useProjectTabOrder(useMemo(() => projectViewGroups(views), [views]), vertical);
  // 数を出す画面（チャットをボードと分けない置き方では、出さないチャットのタブの数をボードが受け持つ = チャットを開く所に付ける）
  const badgeOf = (def: ProjectViewDef) => (def.useBadge ? def : separate ? undefined : views.find((v) => v.onlyWhenSeparate?.into === def.id && v.useBadge));
  return (
    <nav
      className={cx("tabs", vertical && "project-side-tabs")}
      role="tablist"
      aria-orientation={vertical ? "vertical" : undefined}
      onContextMenu={menu.open}
    >
      {order.groups.map((group) => {
        const shown = group.tabs.filter((t) => !t.def.onlyWhenSeparate || separate);
        return (
          <div
            key={group.key}
            className={cx("project-tab-group", shown.length > 1 && "boxed")}
            {...order.groupAttrs(group)}
            aria-label={group.label}
            {...order.groupProps(group)}
          >
            {/* まとまりごと動かすつまみ（地でつないだまとまりだけ。タブが 1 つのまとまりは、タブをつかめばまとまりごと動く） */}
            {shown.length > 1 && (
              <span className="project-tab-group-handle" title={`ドラッグで「${group.label}」のまとまりごと動かす`} {...order.groupHandleProps(group)}>
                {vertical ? <GripHorizontal size={12} aria-hidden /> : <GripVertical size={12} aria-hidden />}
              </span>
            )}
            {shown.map(({ def }) => {
              const badgeDef = badgeOf(def);
              return (
                <ProjectTab
                  key={`${def.id}:${badgeDef?.id ?? ""}`}
                  def={def}
                  badgeDef={badgeDef}
                  projectId={projectId}
                  selected={tab === def.id}
                  vertical={vertical}
                  badge={badge}
                  attrs={order.tabAttrs(def.id)}
                  props={order.tabProps(group, def.id)}
                />
              );
            })}
          </div>
        );
      })}
      {menu.menu && (
        <ChoiceMenu
          at={menu.menu.at}
          title="タブの置き方"
          values={storage.settings.tabsLayout.choices}
          labels={PROJECT_TABS_LAYOUT_LABELS}
          value={layout}
          onPick={setLayout}
          onClose={menu.close}
        >
          {order.customized && <MenuItem onSelect={order.reset}>タブの並びを元に戻す</MenuItem>}
        </ChoiceMenu>
      )}
    </nav>
  );
}
