import { Archive, ArrowDownUp, ChevronsDownUp, ChevronsUpDown, Clock, Eye, GalleryHorizontal, GripVertical, ListTree, Rows2, Rows3 } from "lucide-react";
import { useSharedChoice, useSharedFlag } from "../../hooks/useStoredState";
import type { ProjectOrder } from "../../projectOrder";
import { IconButton } from "../IconButton";
import { CHAT_GROUPINGS, GROUPING_META, type ChatGrouping } from "./chatGroupings";
import { HeadMenu } from "./HeadMenu";
import { COMPACT_KEY, GROUPING_KEY, SHOW_ARCHIVED_KEY } from "./sidebarFlags";

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
 * プロジェクト一覧の上の見出しの行。設定の種類（ジャンル）ごとにボタンを分け、1 つのボタンには 1 種類だけを入れる:
 * 並べ方（縦 / 横スライド）・並び順（手動 / 最近動いた順）・まとめ方（チャット）・表示（アーカイブ済み・1 行など）。
 * 右端は、縦並びのときの「すべて閉じる / 開く」（VS Code のエクスプローラーの見出しと同じ位置）
 */
export function ProjectListHead({ layout, onLayout, order, onOrder, fold, archivedCount, showArchived, onShowArchived }: Props) {
  const [grouping, setGrouping] = useSharedChoice<ChatGrouping>(GROUPING_KEY, CHAT_GROUPINGS, "recent");
  const [showArchivedChats, setShowArchivedChats] = useSharedFlag(SHOW_ARCHIVED_KEY);
  const [compact, setCompact] = useSharedFlag(COMPACT_KEY);
  const radio = { role: "menuitemradio" as const };
  const check = { role: "menuitemcheckbox" as const };
  return (
    <div className="project-list-head">
      <HeadMenu
        id="layout"
        icon={layout === "stack" ? Rows3 : GalleryHorizontal}
        label="並べ方"
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
        icon={ArrowDownUp}
        label="並び順"
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
      <HeadMenu
        id="grouping"
        icon={ListTree}
        label="まとめ方"
        title={`チャットのまとめ方（すべてのプロジェクト。いまは「${GROUPING_META[grouping].label}」）`}
        sections={[
          {
            label: "チャットのまとめ方",
            items: CHAT_GROUPINGS.map((g) => ({ ...radio, key: g, icon: GROUPING_META[g].icon, label: GROUPING_META[g].label, checked: g === grouping, onSelect: () => setGrouping(g) })),
          },
        ]}
      />
      <HeadMenu
        id="display"
        icon={Eye}
        label="表示"
        title="表示するもの（アーカイブ済みのチャット・1 行で表示・アーカイブしたプロジェクト）"
        sections={[
          {
            label: "チャット",
            items: [
              { ...check, key: "archived-chats", icon: Archive, label: "アーカイブ済みを表示", checked: showArchivedChats, onSelect: () => setShowArchivedChats(!showArchivedChats) },
              { ...check, key: "compact", icon: Rows2, label: "1 行で表示", checked: compact, onSelect: () => setCompact(!compact) },
            ],
          },
          ...(archivedCount > 0
            ? [
                {
                  label: "プロジェクト",
                  items: [
                    { ...check, key: "archived-projects", icon: Archive, label: `アーカイブしたプロジェクトを表示（${archivedCount}）`, checked: showArchived, onSelect: () => onShowArchived(!showArchived) },
                  ],
                },
              ]
            : []),
        ]}
      />
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
  );
}
