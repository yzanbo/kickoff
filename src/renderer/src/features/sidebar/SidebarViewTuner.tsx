import { Archive, ArchiveX, Clock, GalleryHorizontal, GalleryVertical, GripVertical, Plus, Rows2, Rows3, Rows4, Save, Settings, ToggleLeft, ToggleRight, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { ProjectOrder } from "@/features/project/projectOrder";
import type { SettingValue } from "@/lib/storage";
import { SIDEBAR_BUCKET_COLORS, type SIDEBAR_LAYOUT } from "@/lib/storageKeys";
import { sameViewExistsText, viewNameTaken } from "@/lib/namedViews";
import { CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import { BucketColorItem } from "@/features/chatList/BucketColorItem";
import { useCompactProjects, useCompactRows, useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { openSettings } from "@/features/settings/openSettings";
import { InlineName } from "@/ui/InlineName";
import { CHAT_ORDERS, GROUPING_META, ORDER_META, useChatLayout } from "./chatGroupings";
import { HeadMenu, HeadToggle } from "./HeadMenu";
import { sameSidebarViewState } from "./sidebarViews";
import type { SidebarViews } from "./useSidebarViews";
import { canChooseOrder, WAITING_SCOPES, waitingAxes, waitingViewOf, type WaitingView } from "./waitingAxes";
import { WAITING_ORDER_META, WAITING_SCOPE_META } from "./waitingView";

/** slide: 1 プロジェクトずつ横にスライド（丸は下） / rail: 1 プロジェクトずつ縦にスライド（丸は左に縦に並べる） / stack: すべてのプロジェクトを縦に並べる */
export type NavLayout = SettingValue<typeof SIDEBAR_LAYOUT>;

export const LAYOUT_META: Record<NavLayout, { icon: LucideIcon; short: string; label: string }> = {
  stack: { icon: Rows3, short: "縦並び", label: "縦並び（すべてのプロジェクトを上から並べる）" },
  slide: { icon: GalleryHorizontal, short: "スライド", label: "横スライド（1 つずつ。丸は下・横スワイプ）" },
  rail: { icon: GalleryVertical, short: "縦スライド", label: "縦スライド（1 つずつ。丸は左・縦スワイプ）" },
};
export const LAYOUTS: NavLayout[] = ["stack", "slide", "rail"];

export interface TunerProps {
  layout: NavLayout;
  onLayout: (layout: NavLayout) => void;
  order: ProjectOrder;
  onOrder: (order: ProjectOrder) => void;
  /** しまった（アーカイブした）プロジェクトの数（アーカイブのボタンの説明に添える） */
  archivedCount: number;
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
  /** 要対応の行: オン / オフ・数・オンのときの表示（出し方 = 要対応だけ / 一覧の上に / プロジェクト内の上に、並べ方 = プロジェクト別 / 状態順） */
  waiting: WaitingRowProps;
}

/**
 * サイドバーの見え方の調整（見出しの ⚙ で開く窓の中身。利用者の依頼で、前は見出しにいつも出していた 3 行を、ビューのタブ 1 行にしてここへ移した）。
 * 何に効くかで行を分け、設定の種類（ジャンル）ごとのボタンを並べる（1 つのボタンには 1 種類だけ。2 択は押すたびに切り替え（HeadToggle）、
 * 3 つ以上あるもの（並べ方・まとめ方など）はメニューから選ぶ（HeadMenu））:
 * プロジェクト = 並べ方（縦並び / 横スライド / 縦スライド）・並び順（手動 / 最近動いた順）・表示（カードを 1 行 / 2 行）・アーカイブ（出すか）/
 * チャット = まとめ方（まとめない / グループ別 / 作業場所別）・並び順（最近動いた順 / 状態順 / 手動）・表示（行を 1 行 / 2 行）・アーカイブ（出すか）/
 * 要対応 = オン / オフ・出し方・並べ方。
 * 下に、変えた見え方を残す操作（選んでいるビューに上書き・今のビューを新規保存）と、設定の画面の「サイドバー」へ
 */
export function SidebarViewTuner({ layout, onLayout, order, onOrder, archivedCount, showArchived, onShowArchived, waiting, views }: TunerProps & { views: SidebarViews }) {
  const { grouping, setGrouping, order: chatOrder, setOrder: setChatOrder } = useChatLayout();
  const [showArchivedChats, setShowArchivedChats] = useShowArchivedChats();
  const [compact, setCompact] = useCompactRows();
  const [compactProjects, setCompactProjects] = useCompactProjects();
  /** アーカイブを出すかのボタン（プロジェクト・チャットで共通。押すたびに 表示 ⇄ 隠す） */
  const archiveToggle = (id: string, target: string, shown: boolean, set: (show: boolean) => void, note = "") => (
    <HeadToggle
      id={id}
      icon={shown ? Archive : ArchiveX}
      label="アーカイブ"
      value={shown ? "表示" : "隠す"}
      values={["表示", "隠す"]}
      title={`アーカイブした${target}${note}`}
      onToggle={() => set(!shown)}
    />
  );
  return (
    <div className="sidebar-view-tuner">
      <div className="project-list-head">
        <div className="project-list-row">
          <span className="project-list-row-label">プロジェクト</span>
          <HeadMenu
            id="layout"
            icon={LAYOUT_META[layout].icon}
            label="並べ方"
            value={LAYOUT_META[layout].short}
            values={LAYOUTS.map((l) => LAYOUT_META[l].short)}
            title={`プロジェクトの並べ方（いまは「${LAYOUT_META[layout].label}」）`}
            menu={{ title: "プロジェクトの並べ方", choices: LAYOUTS, meta: LAYOUT_META, current: layout, onPick: onLayout }}
          />
          <HeadToggle
            id="order"
            icon={order === "recent" ? Clock : GripVertical}
            label="並び順"
            value={order === "recent" ? "最近順" : "手動"}
            values={["手動", "最近順"]}
            title="プロジェクトの並び順（手動 = ドラッグで並べ替えた順 / 最近動いた順。最近動いた順でもドラッグすると手動になる。固定したものは上）"
            onToggle={() => onOrder(order === "recent" ? "manual" : "recent")}
          />
          <HeadToggle
            id="project-rows"
            icon={compactProjects ? Rows4 : Rows2}
            label="表示"
            value={compactProjects ? "1 行" : "2 行"}
            values={["1 行", "2 行"]}
            title="プロジェクトのカード（1 行 = 名前だけ / 2 行 = チャット数も）"
            onToggle={() => setCompactProjects(!compactProjects)}
          />
          {archiveToggle("archive-projects", "プロジェクト", showArchived, onShowArchived, `（${archivedCount} 件）`)}
        </div>
        <div className="project-list-row">
          <span className="project-list-row-label">チャット</span>
          <HeadMenu
            id="grouping"
            icon={GROUPING_META[grouping].icon}
            label="まとめ方"
            value={GROUPING_META[grouping].short}
            values={CHAT_GROUPINGS.map((g) => GROUPING_META[g].short)}
            title={`チャットのまとめ方（すべてのプロジェクト。いまは「${GROUPING_META[grouping].label}」）`}
            menu={{ title: "チャットのまとめ方", choices: CHAT_GROUPINGS, meta: GROUPING_META, current: grouping, onPick: setGrouping }}
            // グループ別・作業場所別の見出しの色（色付き / 色なし。見出しの右クリックにも同じ項目）。選んでもメニューは閉じない
            extra={<BucketColorItem setting={SIDEBAR_BUCKET_COLORS} keepOpen />}
          />
          {/* 3 つ（最近順・状態順・手動）なのでメニューから選ぶ。最近順・状態順でも、チャットの行をドラッグで並べ替えると手動になる */}
          <HeadMenu
            id="chat-order"
            icon={ORDER_META[chatOrder].icon}
            label="並び順"
            value={ORDER_META[chatOrder].short}
            values={CHAT_ORDERS.map((o) => ORDER_META[o].short)}
            title={`チャットの並び順（まとめ方の見出しの中で並べる。状態順 = 作業中・回答待ち・未読・既読の見出しに分ける / 手動 = ドラッグで並べた順。いまは「${ORDER_META[chatOrder].label}」）`}
            menu={{ title: "チャットの並び順", choices: CHAT_ORDERS, meta: ORDER_META, current: chatOrder, onPick: setChatOrder }}
          />
          <HeadToggle
            id="rows"
            icon={compact ? Rows4 : Rows2}
            label="表示"
            value={compact ? "1 行" : "2 行"}
            values={["1 行", "2 行"]}
            title="チャットの行（1 行 = 名前と時刻 / 2 行 = ブランチも）"
            onToggle={() => setCompact(!compact)}
          />
          {/* アーカイブはプロジェクトの行と同じく右端 */}
          {archiveToggle("archive-chats", "チャット", showArchivedChats, setShowArchivedChats)}
        </div>
        {/* 要対応の行（オン / オフと、オンのときの表示） */}
        <WaitingRow {...waiting} />
      </div>
      <TunerActions views={views} />
    </div>
  );
}

/**
 * 変えた見え方を残す操作: 選んでいるビューに上書き（同じなら押せない）・今のビューを新規保存（名前を聞く）・ビューの管理（設定の画面）。
 * いまの見え方と同じビューがもうあれば、今のビューを新規保存は押せなくし、どのビューと同じかを下に書く（同じ見え方のビューを 2 つ作らない。利用者の依頼）
 */
function TunerActions({ views }: { views: SidebarViews }) {
  const [naming, setNaming] = useState(false);
  const target = views.selected;
  const same = !target || sameSidebarViewState(target.state, views.current);
  // いまの見え方と同じビュー（あれば新しく作らない）
  const duplicate = views.active;
  return (
    <div className="sidebar-view-tuner-actions">
      {naming ? (
        <InlineName
          className="sidebar-view-name"
          placeholder="ビューの名前"
          validate={(name) =>
            viewNameTaken(views.views, name) ? `「${name}」というビューはもうあります` : duplicate ? sameViewExistsText(duplicate.name) : null
          }
          onSubmit={(name) => {
            views.save(name);
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      ) : (
        <>
          <button
            type="button"
            className="btn btn-sm"
            disabled={same}
            title={!target ? "選んでいるビューがありません" : same ? "いまの見え方と同じです" : `ビュー「${target.name}」をいまの見え方で上書きする`}
            onClick={() => target && views.overwrite(target.id)}
          >
            <Save size={13} aria-hidden /> {target ? `「${target.name}」に上書き` : "上書き"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={Boolean(duplicate)}
            title={duplicate ? sameViewExistsText(duplicate.name) : "いまの見え方に名前を付けて、ビューのタブに足す"}
            onClick={() => setNaming(true)}
          >
            <Plus size={13} aria-hidden /> 今のビューを新規保存
          </button>
          {duplicate && <p className="sidebar-view-same muted small">{sameViewExistsText(duplicate.name)}</p>}
        </>
      )}
      <button type="button" className="btn btn-sm sidebar-view-manage" title="設定の画面で、ビューの並べ替え・名前と中身の変更・削除をする" onClick={() => openSettings("sidebar")}>
        <Settings size={13} aria-hidden /> ビューを管理
      </button>
    </div>
  );
}

interface WaitingRowProps {
  on: boolean;
  onToggle: () => void;
  /** 待っているチャットの数（行の名前の横に出す） */
  count: number;
  view: WaitingView;
  onView: (view: WaitingView) => void;
}

/**
 * 「要対応」の行: オン / オフ（左。回答待ち・エラー・未読のチャットに目を向けるか）、出し方（要対応だけ / 一覧の上に / プロジェクト内の上に。3 つなのでメニュー）、
 * 並べ方（プロジェクト別 ⇔ 状態順）。オフのときは出し方・並べ方を押せなくする（隠さず薄くする）。
 * プロジェクト内の上には、プロジェクトの中に置くので並べ方はプロジェクト別だけ（並べ方のボタンは押せない）
 */
function WaitingRow({ on, onToggle, count, view, onView }: WaitingRowProps) {
  const { scope, order } = waitingAxes(view);
  const scopeMeta = WAITING_SCOPE_META[scope];
  const orderMeta = WAITING_ORDER_META[order];
  const orderFree = canChooseOrder(scope);
  const offNote = "要対応がオフのときは選べません（左の切り替えでオンにする）";
  return (
    <div className="project-list-row">
      <span className="project-list-row-label">
        要対応
        {count > 0 && <span className="count-badge project-list-count">{count}</span>}
      </span>
      <HeadToggle
        id="waiting-on"
        icon={on ? ToggleRight : ToggleLeft}
        label="切り替え"
        value={on ? "オン" : "オフ"}
        values={["オン", "オフ"]}
        title="要対応（回答待ち・エラー・未読のチャットに目を向ける）"
        pressed={on}
        onToggle={onToggle}
      />
      <HeadMenu
        id="waiting-scope"
        icon={scopeMeta.icon}
        label="出し方"
        value={scopeMeta.short}
        values={WAITING_SCOPES.map((s) => WAITING_SCOPE_META[s].short)}
        title={on ? `要対応の出し方（いまは「${scopeMeta.label}」）` : offNote}
        disabled={!on}
        menu={{ title: "要対応の出し方", choices: WAITING_SCOPES, meta: WAITING_SCOPE_META, current: scope, onPick: (s) => onView(waitingViewOf(s, order)) }}
      />
      <HeadToggle
        id="waiting-order"
        icon={orderMeta.icon}
        label="並べ方"
        value={orderMeta.short}
        values={[WAITING_ORDER_META.project.short, WAITING_ORDER_META.status.short]}
        title={
          !on
            ? offNote
            : orderFree
              ? `要対応の並べ方（${WAITING_ORDER_META.project.label} / ${WAITING_ORDER_META.status.label}）`
              : "要対応の並べ方: プロジェクト内の上にまとめるときは、プロジェクトの中に置くのでプロジェクト別だけです（中は状態順）"
        }
        disabled={!on || !orderFree}
        onToggle={() => onView(waitingViewOf(scope, order === "project" ? "status" : "project"))}
      />
    </div>
  );
}
