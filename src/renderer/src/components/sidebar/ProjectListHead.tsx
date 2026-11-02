import { Archive, ArchiveX, ChevronsDownUp, ChevronsUpDown, Clock, GalleryHorizontal, GripVertical, Rows2, Rows3, Rows4 } from "lucide-react";
import { useSharedChoice } from "../../hooks/useStoredState";
import type { ProjectOrder } from "../../projectOrder";
import { IconButton } from "../IconButton";
import { CHAT_GROUPINGS, GROUPING_META, type ChatGrouping } from "./chatGroupings";
import { HeadMenu } from "./HeadMenu";
import { GROUPING_KEY, useCompactRows, useShowArchivedChats } from "./sidebarFlags";

/** slide: 1 プロジェクトずつ横にスライド / stack: すべてのプロジェクトを縦に並べる */
export type NavLayout = "slide" | "stack";

interface Props {
  layout: NavLayout;
  onLayout: (layout: NavLayout) => void;
  order: ProjectOrder;
  onOrder: (order: ProjectOrder) => void;
  /** 縦並びのとき: すべてのプロジェクトのチャット一覧をまとめて閉じる・開く */
  fold?: { allCollapsed: boolean; set: (collapsed: boolean) => void };
  /** しまった（アーカイブした）プロジェクトの数（0 なら出す・隠すの項目を置かない） */
  archivedCount: number;
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
}

/**
 * プロジェクト一覧の上の見出し。何に効くかで 2 行に分け、どちらも設定の種類（ジャンル）ごとのボタンを並べる（1 つのボタンには 1 種類だけ）:
 * プロジェクト = 並べ方（縦 / 横スライド）・並び順（手動 / 最近動いた順）・アーカイブ（出すか）と、右端に縦並びのときの「すべて閉じる / 開く」/
 * チャット = まとめ方・アーカイブ（出すか）・表示（1 行 / 2 行）。チャットの設定はすべてのプロジェクトに効く
 */
export function ProjectListHead({ layout, onLayout, order, onOrder, fold, archivedCount, showArchived, onShowArchived }: Props) {
  const [grouping, setGrouping] = useSharedChoice<ChatGrouping>(GROUPING_KEY, CHAT_GROUPINGS, "recent");
  const [showArchivedChats, setShowArchivedChats] = useShowArchivedChats();
  const [compact, setCompact] = useCompactRows();
  const radio = { role: "menuitemradio" as const };
  /** アーカイブを出すかのボタン（プロジェクト・チャットで共通） */
  const archiveMenu = (id: string, target: string, shown: boolean, set: (show: boolean) => void, note = "") => (
    <HeadMenu
      id={id}
      icon={shown ? Archive : ArchiveX}
      label="アーカイブ"
      value={shown ? "表示" : "隠す"}
      values={["表示", "隠す"]}
      title={`アーカイブした${target}を表示するか（いまは「${shown ? "表示" : "隠す"}」${note}）`}
      sections={[
        {
          label: `アーカイブした${target}${note}`,
          items: [
            { ...radio, key: "show", icon: Archive, label: "表示する", checked: shown, onSelect: () => set(true) },
            { ...radio, key: "hide", icon: ArchiveX, label: "隠す", checked: !shown, onSelect: () => set(false) },
          ],
        },
      ]}
    />
  );
  return (
    <div className="project-list-head">
      <div className="project-list-row">
        <span className="project-list-row-label">プロジェクト</span>
        <HeadMenu
          id="layout"
          icon={layout === "stack" ? Rows3 : GalleryHorizontal}
          label="並べ方"
          value={layout === "stack" ? "縦並び" : "スライド"}
          values={["縦並び", "スライド"]}
          title={`プロジェクトの並べ方（いまは「${layout === "stack" ? "縦に並べる" : "1 つずつ横にスライド"}」）`}
          sections={[
            {
              label: "プロジェクトの並べ方",
              items: [
                { ...radio, key: "stack", icon: Rows3, label: "縦に並べる（すべてのプロジェクト）", checked: layout === "stack", onSelect: () => onLayout("stack") },
                { ...radio, key: "slide", icon: GalleryHorizontal, label: "1 つずつ横にスライド", checked: layout === "slide", onSelect: () => onLayout("slide") },
              ],
            },
          ]}
        />
        <HeadMenu
          id="order"
          icon={order === "recent" ? Clock : GripVertical}
          label="並び順"
          value={order === "recent" ? "最近順" : "手動"}
          values={["手動", "最近順"]}
          title={`プロジェクトの並び順（いまは「${order === "recent" ? "最近動いた順" : "手動"}」。固定したものは上）`}
          sections={[
            {
              label: "プロジェクトの並び順（固定したものは上）",
              items: [
                { ...radio, key: "manual", icon: GripVertical, label: "手動（ドラッグで並べ替え）", checked: order === "manual", onSelect: () => onOrder("manual") },
                { ...radio, key: "recent", icon: Clock, label: "最近動いた順", checked: order === "recent", onSelect: () => onOrder("recent") },
              ],
            },
          ]}
        />
        {archiveMenu("archive-projects", "プロジェクト", showArchived, onShowArchived, `（${archivedCount} 件）`)}
        {/* 開いているものがあれば閉じる、すべて閉じていれば開く */}
        {fold && (
          <IconButton
            icon={fold.allCollapsed ? ChevronsUpDown : ChevronsDownUp}
            className="project-list-fold"
            label={fold.allCollapsed ? "すべてのプロジェクトを開く" : "すべてのプロジェクトを閉じる"}
            title={fold.allCollapsed ? "すべて開く" : "すべて閉じる"}
            onClick={() => fold.set(!fold.allCollapsed)}
          />
        )}
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
          sections={[
            {
              label: "チャットのまとめ方",
              items: CHAT_GROUPINGS.map((g) => ({ ...radio, key: g, icon: GROUPING_META[g].icon, label: GROUPING_META[g].label, checked: g === grouping, onSelect: () => setGrouping(g) })),
            },
          ]}
        />
        {archiveMenu("archive-chats", "チャット", showArchivedChats, setShowArchivedChats)}
        <HeadMenu
          id="rows"
          icon={compact ? Rows4 : Rows2}
          label="表示"
          value={compact ? "1 行" : "2 行"}
          values={["1 行", "2 行"]}
          title={`チャットの行（いまは「${compact ? "1 行（名前と時刻）" : "2 行（セクション・ブランチも）"}」）`}
          sections={[
            {
              label: "チャットの行",
              items: [
                { ...radio, key: "compact", icon: Rows4, label: "1 行（名前と時刻）", checked: compact, onSelect: () => setCompact(true) },
                { ...radio, key: "full", icon: Rows2, label: "2 行（セクション・ブランチも）", checked: !compact, onSelect: () => setCompact(false) },
              ],
            },
          ]}
        />
      </div>
    </div>
  );
}
