import { Archive, Folder } from "lucide-react";
import { Fragment, memo, useState } from "react";
import type { Chat } from "@shared/chat/types";
import { COLUMN_LOOKS } from "@shared/chat/stateLooks";
import type { ChatGroup } from "@shared/groups/types";
import type { Project } from "@shared/projects/types";
import { groupsApi } from "@/features/groups/ui";
import { cx } from "@/foundation/ui/lib/cx";
import { routeProjectId, useRoute } from "@/foundation/ui/navigation/router";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { Collapse } from "@/foundation/ui/kit/Collapse";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { RowBudgetScope, useProgressivePage } from "@/foundation/ui/hooks/useProgressiveRows";
import { useChatDragging } from "@/features/chatList/ui";
import { NO_CHATS, stateCounts, useChatStates, useChatsWithChildrenByProject, useChildChats } from "@/features/chat/ui";
import { BucketTree, chatListSettings, pinnedKey, useChatLayout, type ChatBucket } from "@/features/chatList/ui";
import type { PlacedDraft } from "@/features/chatPanel/ui";
import { ChildChatRows } from "./ChildChatRows";
import { useGroupSections } from "./useGroupSections";
import { DraftRow, DraftRows } from "./DraftRows";
import { useWorkspaceRows } from "./useWorkspaceRows";
import { useChatRowReorder } from "./useChatRowReorder";
import { WorkspaceHead } from "./WorkspaceHead";
import { useSidebarBucketColors } from "./bucketColor";
import { useWorkspaceDrops } from "./useWorkspaceDrops";
import { useChatRowRenderer } from "./useChatRowRenderer";
import { workspaceHeads } from "./sidebarHeads";

// プロジェクトを切り替えても、中身の変わらないページは描き直さない
export const WorkspacePage = memo(function WorkspacePage({
  project,
  chats,
  groups,
  hidden,
  collapsed,
  onCollapsedChange,
  headDrag,
  searchAll = "",
}: {
  project: Project;
  chats: Chat[];
  groups: ChatGroup[];
  hidden: boolean;
  /** チャット一覧を閉じているか（縦並びの「すべて閉じる・開く」で変えるので、外で持つ） */
  collapsed: boolean;
  onCollapsedChange: (projectId: number, collapsed: boolean) => void;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
  /** すべてのプロジェクトをまたぐ検索欄（縦並びの上）の検索語。プロジェクトの検索欄が空のときに使う */
  searchAll?: string;
}) {
  const route = useRoute();
  const { grouping, setGrouping, order } = useChatLayout();
  // 見出しのクリックでチャット一覧を開閉する
  const toggleCollapsed = () => onCollapsedChange(project.id, !collapsed);
  // 選んでいる = いまの画面がこのプロジェクト（カンバン・チャットなど）
  const isActive = routeProjectId(route) === project.id;
  // 要対応・状態ごとの数で数えるチャット（アーカイブしていないもの。子チャットも入れる）
  const counted = useChatsWithChildrenByProject()[project.id] ?? NO_CHATS;
  const { pending } = useChatStates();
  // まとまりの見出しの色（「まとまりを色付きで表示」のとき。タブの列のまとまりと同じ色）と、見出しの右クリックでの切り替え
  const colors = useSidebarBucketColors(grouping, project.id);
  const sections = useGroupSections({ project, groups, menuExtra: colors.menuItem });
  const list = useWorkspaceRows({ projectId: project.id, chats, counted, groupIds: groups.map((g) => g.id), ungroupedAt: sections.ungroupedAt, searchAll, collapsed });
  const { query, setQuery, keyword, stateFilter, setStateFilter, filtering } = list.filter;
  // 子チャット（親ごと。サイドバーの一覧には並べず、親の行の中に開閉で出す。アーカイブ済みはサイドバーの表示の切り替えに従う）
  const [showArchivedChats] = useSetting(chatListSettings.showArchived);
  const childChats = useChildChats({ archived: showArchivedChats });
  // 一覧を開いた直後（まとめ方・並び順・開閉・アーカイブ済みを出すか・チャットが届いたかが変わったとき）は画面に入る数の行だけを描き、
  // 最初の描画のあとに残りを描く（見えていない裏のページは初めは描かない）
  const rowBudget = useProgressivePage(`${grouping}/${order}/${collapsed ? 1 : 0}/${showArchivedChats ? 1 : 0}/${chats.length > 0 ? 1 : 0}`, hidden);
  // 「アーカイブ済み」へ落とすとアーカイブ・見出しの下の一覧へ落とすと戻す・ほかのプロジェクトのチャットを落とすと移す（どれも確かめてから）
  const drops = useWorkspaceDrops(project, chats);
  const chatDragging = useChatDragging();
  const rows = useChatRowRenderer();
  // 同じまとまりの中のチャットの行をドラッグで並べ替える（手動の並び。最近順・状態順なら手動に切り替わる）
  const rowReorder = useChatRowReorder(project.id, chats, !collapsed);

  // 自分で作ったグループを作り始める入力欄
  const [creating, setCreating] = useState(false);
  const startCreate = () => {
    if (collapsed) toggleCollapsed();
    // 作ったグループが見えるよう、グループでまとめる表示にする
    if (grouping !== "group") setGrouping("group");
    setCreating(true);
  };

  // まとまり（グループ別のグループ・No Group、作業場所別の作業場所）の中の行で隠す札（見出しと同じことを言うため）
  const bucketChip = list.layout.showGroups ? "group" : list.layout.grouping === "worktree" ? "worktree" : undefined;
  // 要対応・固定（まとまりの外）の行は、どのグループ・作業場所かがわかるよう札を残す。要対応の行の後ろには下書きを並べない
  const renderRow = (chat: Chat, bucket?: ChatBucket<PlacedDraft>) => {
    const outside = bucket?.kind === "waiting" || bucket?.key === pinnedKey(project.id);
    return (
      <Fragment key={chat.id}>
        {rows.renderRow(chat, {
          // 子チャットは親の行の中にだけ置く（開閉と数。孫・ひ孫も同じ形で）
          after: <ChildChatRows parentId={chat.id} parentArchived={chat.archived_at !== null} childrenOf={childChats} renderRow={renderRow} />,
          reorder: rowReorder(chat),
          hideChip: outside ? undefined : bucketChip,
          // 状態・要対応で絞ると子チャットも親の外に 1 行で並ぶので、子チャットだと分かる札を付ける
          childMark: stateFilter !== null || list.filter.waitingOnly,
        })}
        {/* 手動の並びで、タブの列でこのチャットのすぐ後ろにある下書き（タブの位置に合わせる。useDraftPlacement） */}
        {bucket?.kind !== "waiting" && list.draftsAfter.get(chat.id)?.map((d) => <DraftRow key={`${d.panel}:${d.key}`} draft={d} />)}
      </Fragment>
    );
  };
  const heads = workspaceHeads({ projectId: project.id, chats, ...list.layout, draftCounts: list.counts.drafts, colors, sections, drops });

  return (
    <section
      className={cx("workspace-page", drops.projectDrop.over === project.id && (drops.projectDrop.blockedAt(project.id) ? "chat-drop-blocked" : "chat-drop-over"))}
      data-project-id={project.id}
      {...drops.projectDrop.propsFor(project.id)}
      aria-hidden={hidden}
      inert={hidden}
      style={{ "--hue": `${project.hue}` } as React.CSSProperties}
    >
      <WorkspaceHead
        project={project}
        groups={groups}
        active={isActive}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        chatCount={list.counts.chats}
        counts={stateCounts(counted, pending)}
        stateFilter={stateFilter}
        onStateFilter={(next) => {
          setStateFilter(next);
          // 閉じているときに絞ったら、開いて見せる
          if (next && collapsed) toggleCollapsed();
        }}
        onCreateGroup={startCreate}
        headDrag={headDrag}
      />
      {/* チャット一覧（開閉で高さがなめらかに変わる） */}
      <Collapse open={!collapsed}>
        {list.counts.chats > 0 && <SearchField value={query} onChange={setQuery} placeholder="チャット名で検索" label={`${project.name} のチャットを検索`} />}
        {keyword && list.counts.visible === 0 && <p className="empty-note chat-search-empty">「{keyword}」に一致するチャットはありません</p>}
        {!keyword && stateFilter && list.counts.visible === 0 && <p className="empty-note chat-search-empty">{COLUMN_LOOKS[stateFilter].label}のチャットはありません</p>}
        {creating && (
          <div className="custom-group-head editing">
            <Folder size={13} aria-hidden />
            <InlineName
              placeholder="グループ名（例: コードレビュー）"
              onSubmit={(name) => {
                setCreating(false);
                void groupsApi.createGroup(project.id, name);
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}
        {/* 要対応 → いちばん上の下書き → 固定 → グループと「No Group」→ アーカイブ済み（最初に描く行の上限は、この順に配る） */}
        <RowBudgetScope value={rowBudget}>
          <BucketTree buckets={list.buckets} heads={heads} renderRow={renderRow} renderDrafts={(drafts) => <DraftRows drafts={drafts} />} place="sidebar" forceOpen={filtering} />
        </RowBudgetScope>
        {/* アーカイブ済みのまとまりがない（まだない・隠している）ときも、チャットをドラッグしている間だけ同じ場所に落とし先を出す */}
        {!list.buckets.some((b) => b.kind === "archived") && chatDragging && (
          <div className={cx("chat-row ghost archive-drop", drops.archiveDrop.over && (drops.archiveDrop.blocked ? "drop-blocked" : "drop-target"))} {...drops.archiveDrop.props}>
            <Archive size={13} aria-hidden /> アーカイブ済みへ（落とすとアーカイブ）
          </div>
        )}
      </Collapse>
      {sections.menuElement}
      {colors.menuElement}
      {rows.menuElement}
    </section>
  );
});
