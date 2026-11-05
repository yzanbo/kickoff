import { Archive, ArchiveX, ChevronsDownUp, ChevronsUpDown, Clock, GalleryHorizontal, GalleryVertical, GripVertical, Rows2, Rows3, Rows4, type LucideIcon } from "lucide-react";
import type { ProjectOrder } from "@/features/project/projectOrder";
import type { SettingValue } from "@/lib/storage";
import type { SIDEBAR_LAYOUT } from "@/lib/storageKeys";
import { CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import { GROUPING_META, ORDER_META, useChatLayout } from "./chatGroupings";
import { HeadMenu, HeadToggle } from "./HeadMenu";
import { IconButton } from "@/ui/IconButton";
import { useCompactProjects, useCompactRows, useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { TagFilterRow } from "./TagFilterRow";
import { WAITING_VIEW_META, WAITING_VIEWS, type WaitingView } from "./waitingView";

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
  /** 自分待ちがオンのときだけ: その表示（プロジェクトで絞る / 上にまとめる / 1 列にまとめる）を選ぶ行を出す */
  waiting?: { view: WaitingView; onView: (view: WaitingView) => void };
}

/**
 * プロジェクト一覧の上の見出し。何に効くかで 2 行に分け、どちらも設定の種類（ジャンル）ごとのボタンを並べる（1 つのボタンには 1 種類だけ。
 * 2 択のものは押すたびに切り替え（HeadToggle）、3 つ以上あるもの（並べ方・まとめ方）はメニューから選ぶ（HeadMenu））:
 * プロジェクト = 並べ方（縦並び / 横スライド / 縦スライド）・並び順（手動 / 最近動いた順）・表示（カードを 1 行 / 2 行）・アーカイブ（出すか）/
 * チャット = まとめ方（まとめない / グループ別 / 作業場所別。右のパネルのタブのまとめ方と同じ文言）・並び順（新しい順 / 状態別）・表示（行を 1 行 / 2 行）・アーカイブ（出すか。プロジェクトの行と同じく右端）。
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
          title="プロジェクトの並び順（手動 = ドラッグで並べ替え / 最近動いた順。固定したものは上）"
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
        />
        <HeadToggle
          id="chat-order"
          icon={ORDER_META[chatOrder].icon}
          label="並び順"
          value={ORDER_META[chatOrder].short}
          values={[ORDER_META.recent.short, ORDER_META.status.short]}
          title="チャットの並び順（新しい順 / 状態別 = 作業中・回答待ち・未読・既読の見出しに分ける。まとめ方の見出しの中で並べる）"
          onToggle={() => setChatOrder(chatOrder === "recent" ? "status" : "recent")}
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
      {/* 自分待ちがオンのときだけ、その表示を選ぶ行（上の行の「自分待ち」の右クリックでも選べる） */}
      {waiting && (
        <div className="project-list-row">
          <span className="project-list-row-label">自分待ち</span>
          <HeadMenu
            id="waiting-view"
            icon={WAITING_VIEW_META[waiting.view].icon}
            label="表示"
            value={WAITING_VIEW_META[waiting.view].short}
            values={WAITING_VIEWS.map((v) => WAITING_VIEW_META[v].short)}
            title={`自分待ちがオンのときの表示（いまは「${WAITING_VIEW_META[waiting.view].label}」）`}
            menu={{ title: "自分待ちの表示", choices: WAITING_VIEWS, meta: WAITING_VIEW_META, current: waiting.view, onPick: waiting.onView }}
          />
        </div>
      )}
      {/* タグがあるときだけ、タグでの絞り込みの行（押すたびに付け外し） */}
      <TagFilterRow />
    </div>
  );
}
