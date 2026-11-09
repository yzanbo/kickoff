import { Archive, ArchiveX, ChevronsDownUp, ChevronsUpDown, Clock, GalleryHorizontal, GalleryVertical, GripVertical, Rows2, Rows3, Rows4, ToggleLeft, ToggleRight, type LucideIcon } from "lucide-react";
import type { ProjectOrder } from "@/features/project/projectOrder";
import type { SettingValue } from "@/lib/storage";
import { SIDEBAR_BUCKET_COLORS, type SIDEBAR_LAYOUT } from "@/lib/storageKeys";
import { CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import { CHAT_ORDERS, GROUPING_META, ORDER_META, useChatLayout } from "./chatGroupings";
import { cx } from "@/lib/cx";
import { useOverflowCompact } from "@/hooks/useOverflowCompact";
import { HeadMenu, HeadToggle } from "./HeadMenu";
import { BucketColorItem } from "@/features/chatList/BucketColorItem";
import { IconButton } from "@/ui/IconButton";
import { useCompactProjects, useCompactRows, useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { TagFilterRow } from "./TagFilterRow";
import { canChooseOrder, WAITING_SCOPES, waitingAxes, waitingViewOf, type WaitingView } from "./waitingAxes";
import { WAITING_ORDER_META, WAITING_SCOPE_META } from "./waitingView";

/** slide: 1 プロジェクトずつ横にスライド（丸は下） / rail: 1 プロジェクトずつ縦にスライド（丸は左に縦に並べる） / stack: すべてのプロジェクトを縦に並べる */
export type NavLayout = SettingValue<typeof SIDEBAR_LAYOUT>;

/** 並べ方の表示（ボタンの値・メニューの項目） */
const LAYOUT_META: Record<NavLayout, { icon: LucideIcon; short: string; label: string }> = {
  stack: { icon: Rows3, short: "縦並び", label: "縦並び（すべてのプロジェクトを上から並べる）" },
  slide: { icon: GalleryHorizontal, short: "スライド", label: "横スライド（1 つずつ。丸は下・横スワイプ）" },
  rail: { icon: GalleryVertical, short: "縦スライド", label: "縦スライド（1 つずつ。丸は左・縦スワイプ）" },
};
const LAYOUTS: NavLayout[] = ["stack", "slide", "rail"];

interface Props {
  layout: NavLayout;
  onLayout: (layout: NavLayout) => void;
  order: ProjectOrder;
  onOrder: (order: ProjectOrder) => void;
  /** しまった（アーカイブした）プロジェクトの数（0 なら出す・隠すの項目を置かない） */
  /** すべてのプロジェクトのチャット一覧（と中のまとまり）をまとめて閉じる・開く（縦並び・横スライドのどちらでも） */
  fold: { allCollapsed: boolean; set: (collapsed: boolean) => void };
  archivedCount: number;
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
  /** 自分待ちの行: オン / オフ・数・オンのときの表示（出し方 = 自分待ちだけ / 一覧の上に / プロジェクト内の上に、並べ方 = プロジェクト別 / 状態順） */
  waiting: WaitingRowProps;
}

/**
 * プロジェクト一覧の上の見出し。何に効くかで 2 行に分け、どちらも設定の種類（ジャンル）ごとのボタンを並べる（1 つのボタンには 1 種類だけ。
 * 2 択のものは押すたびに切り替え（HeadToggle）、3 つ以上あるもの（並べ方・まとめ方）はメニューから選ぶ（HeadMenu））:
 * プロジェクト = 並べ方（縦並び / 横スライド / 縦スライド）・並び順（手動 / 最近動いた順）・表示（カードを 1 行 / 2 行）・アーカイブ（出すか）/
 * チャット = まとめ方（まとめない / グループ別 / 作業場所別。右のパネルのタブのまとめ方と同じ文言）・並び順（最近動いた順 / 状態順 / 手動）・表示（行を 1 行 / 2 行）・アーカイブ（出すか。プロジェクトの行と同じく右端）。
 * チャットの設定はすべてのプロジェクトに効く。まとめ方（外側の見出し）と並び順（その中の並び）は別の種類の設定なので、別のボタンにする。
 * 「表示」はプロジェクトのカードとチャットの行で別々に切り替える。
 * 「すべて閉じる / 開く」は、並べ方にかかわらず「チャット」の行の名前のすぐ右に、小さなアイコンのボタンで置く
 * （ボタンを 5 つ並べる幅はないため。以前はアーカイブの右に同じ形のボタンで置いていたが、並び順を足して収まらなくなった）
 */
export function ProjectListHead({ layout, onLayout, order, onOrder, fold, archivedCount, showArchived, onShowArchived, waiting }: Props) {
  const { grouping, setGrouping, order: chatOrder, setOrder: setChatOrder } = useChatLayout();
  const [showArchivedChats, setShowArchivedChats] = useShowArchivedChats();
  const [compact, setCompact] = useCompactRows();
  const [compactProjects, setCompactProjects] = useCompactProjects();
  // ボタンの文字が横幅に入らないときだけ、文字を隠していまの値のアイコンだけにする（入るかは実際の幅で決める。タグの行が出入りしたら測り直す）
  const fit = useOverflowCompact<HTMLDivElement>(null);
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
    <div ref={fit.ref} className={cx("project-list-head", fit.compact && "icon-only")}>
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
        <span className="project-list-row-label">
          チャット
          {/* 開いているものがあれば閉じる、すべて閉じていれば開く（すべてのプロジェクトと中のまとまり） */}
          <IconButton
            icon={fold.allCollapsed ? ChevronsUpDown : ChevronsDownUp}
            label={fold.allCollapsed ? "すべてのプロジェクトを開く" : "すべてのプロジェクトを閉じる"}
            title={fold.allCollapsed ? "すべてのプロジェクトと中のまとまりを開く" : "すべてのプロジェクトと中のまとまりを閉じる"}
            size={13}
            className="project-list-fold"
            onClick={() => fold.set(!fold.allCollapsed)}
          />
        </span>
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
      {/* 自分待ちの行（オン / オフと、オンのときの表示。利用者の依頼で、オン / オフを上の段から移し、オフでも出す） */}
      <WaitingRow {...waiting} />
      {/* タグがあるときだけ、タグでの絞り込みの行（押すたびに付け外し） */}
      <TagFilterRow />
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
 * 「自分待ち」の行: オン / オフ（左。回答待ち・エラー・未読のチャットに目を向けるか）、出し方（自分待ちだけ / 一覧の上に / プロジェクト内の上に。3 つなのでメニュー）、
 * 並べ方（プロジェクト別 ⇔ 状態順）。オフのときは出し方・並べ方を押せなくする（隠さず薄くする）。
 * プロジェクト内の上には、プロジェクトの中に置くので並べ方はプロジェクト別だけ（並べ方のボタンは押せない）
 */
function WaitingRow({ on, onToggle, count, view, onView }: WaitingRowProps) {
  const { scope, order } = waitingAxes(view);
  const scopeMeta = WAITING_SCOPE_META[scope];
  const orderMeta = WAITING_ORDER_META[order];
  const orderFree = canChooseOrder(scope);
  const offNote = "自分待ちがオフのときは選べません（左の切り替えでオンにする）";
  return (
    <div className="project-list-row">
      <span className="project-list-row-label">
        自分待ち
        {count > 0 && <span className="count-badge project-list-count">{count}</span>}
      </span>
      <HeadToggle
        id="waiting-on"
        icon={on ? ToggleRight : ToggleLeft}
        label="切り替え"
        value={on ? "オン" : "オフ"}
        values={["オン", "オフ"]}
        title="自分待ち（回答待ち・エラー・未読のチャットに目を向ける）"
        pressed={on}
        onToggle={onToggle}
      />
      <HeadMenu
        id="waiting-scope"
        icon={scopeMeta.icon}
        label="出し方"
        value={scopeMeta.short}
        values={WAITING_SCOPES.map((s) => WAITING_SCOPE_META[s].short)}
        title={on ? `自分待ちの出し方（いまは「${scopeMeta.label}」）` : offNote}
        disabled={!on}
        menu={{ title: "自分待ちの出し方", choices: WAITING_SCOPES, meta: WAITING_SCOPE_META, current: scope, onPick: (s) => onView(waitingViewOf(s, order)) }}
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
              ? `自分待ちの並べ方（${WAITING_ORDER_META.project.label} / ${WAITING_ORDER_META.status.label}）`
              : "自分待ちの並べ方: プロジェクト内の上にまとめるときは、プロジェクトの中に置くのでプロジェクト別だけです（中は状態順）"
        }
        disabled={!on || !orderFree}
        onToggle={() => onView(waitingViewOf(scope, order === "project" ? "status" : "project"))}
      />
    </div>
  );
}
