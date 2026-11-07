import { Archive, Folder, Inbox, Pin, SquarePen } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { BOARD_COLUMN_LABELS, type Project, type Chat, type ChatGroup } from "@shared/types";
import { api } from "@/api";
import { alertDialog, reportFailure } from "@/ui/dialogs";
import { cx } from "@/lib/cx";
import { toggleArchiveChat } from "@/features/chat/chatActions";
import { useChatDragging, useChatDropTarget } from "@/features/group/groups";
import { useChatRename } from "@/features/chat/useChatRename";
import { useFold, useFolds } from "@/hooks/useFold";
import { projectHue } from "@/features/project/projectColor";
import { archivedKey, groupKey, pinnedKey } from "@/features/chatList/bucketHeads";
import { openNewChat, openChat, routeProjectId, useRoute } from "@/app/router";
import { useChatStates } from "@/app/chatStatesContext";
import { ChatMenu } from "@/features/chat/ChatMenu";
import { InlineName } from "@/ui/InlineName";
import { SearchField } from "@/ui/SearchField";
import { ChatRow } from "./ChatRow";
import { ChildChatRows } from "./ChildChatRows";
import { openChildChat } from "@/features/chat/children/openChild";
import { useChildChats } from "@/stores/chats";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { useChatLayout } from "./chatGroupings";
import { GroupedChatRows } from "./GroupedChatRows";
import { CustomGroupSection } from "./CustomGroupSection";
import { useGroupSections } from "./useGroupSections";
import { DraftRows } from "./DraftRows";
import { FoldSection } from "@/ui/FoldHead";
import { stateCounts } from "@/features/chat/chatState";
import { UngroupedHead } from "./UngroupedHead";
import { splitAtUngrouped } from "@/features/group/groupOrder";
import { useWorkspaceRows } from "./useWorkspaceRows";
import { WorkspaceHead } from "./WorkspaceHead";
import { Collapse } from "@/ui/Collapse";
import { useContextMenu } from "@/ui/useContextMenu";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_WAITING_ONLY } from "@/lib/storageKeys";
import { inboxSections, waitingSince } from "./inboxOrder";
import { waitingAxes } from "./waitingAxes";
import { useWaitingView } from "./waitingView";
import { huedHeadProps, useSidebarBucketColors } from "./bucketColor";

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
  // まとめ方（まとめない / グループ / 作業場所）。グループの見出しは「グループ」のときだけ出す
  const { grouping, setGrouping } = useChatLayout();
  // 見出しのクリックでチャット一覧を開閉する
  const toggleCollapsed = () => onCollapsedChange(project.id, !collapsed);
  // 選んでいる = いまの画面がこのプロジェクト（カンバン・チャットなど）
  const isActive = routeProjectId(route) === project.id;
  // 行の絞り込み（検索・自分待ち・状態）と、固定・グループ・グループなし・アーカイブ済みへの分け方（bucketChats）
  const list = useWorkspaceRows({ projectId: project.id, chats, groupCount: groups.length, searchAll, collapsed });
  const { showGroups, query, setQuery, keyword, stateFilter, setStateFilter, filtering, pending, chatCount, visibleCount, pinned, ungrouped, mainRows, mainSections, archived } = list;
  const { stateOf, approvals } = useChatStates();
  // 子チャット（親ごと。サイドバーの一覧には並べず、親の行の中に開閉で出す。アーカイブ済みはサイドバーの表示の切り替えに従う）
  const [showArchivedChats] = useShowArchivedChats();
  const childChats = useChildChats({ archived: showArchivedChats });
  // 自分待ちの「プロジェクト内の上に」: このプロジェクトの待っているチャットを、いちばん上のまとまりに状態順で並べる（下のいつもの一覧にも残す）。
  // 検索・状態で絞っている間は出さない
  const [waitingOn] = useSetting(SIDEBAR_WAITING_ONLY);
  const [waitingView] = useWaitingView();
  const showWaitingTop = waitingOn && waitingAxes(waitingView).scope === "project" && !keyword && !stateFilter;
  const waitingTop = useMemo(
    () => (showWaitingTop ? inboxSections(chats, stateOf, (chat, state) => waitingSince(chat, state, approvals)).flatMap((s) => s.chats) : []),
    [showWaitingTop, chats, stateOf, approvals],
  );
  const waitingFold = useFold("sidebar", `waiting:in:${project.id}`);
  // 開閉の記憶（まとまりのキーで覚え、見出しの行の「すべて閉じる / 開く」にも従う）: 固定・グループなし・自分で作ったグループ（絞り込み中は開いて見せる）、
  // アーカイブ済み（初めは閉じる。検索中は開いて見せる）
  const pinnedFold = useFold("sidebar", pinnedKey(project.id), { forceOpen: filtering });
  const ungroupedFold = useFold("sidebar", groupKey(project.id, null), { forceOpen: filtering });
  const archivedFold = useFold("sidebar", archivedKey(project.id), { defaultOpen: false, forceOpen: Boolean(keyword) });
  const groupFolds = useFolds(
    "sidebar",
    groups.map((g) => groupKey(project.id, g.id)),
  );
  // チャットの右クリックメニュー（開く・名前を変更・アーカイブ・削除）
  const rowMenu = useContextMenu<Chat>();
  // 「アーカイブ済み」へチャットの行をドラッグしてアーカイブする（どこからでも同じく、確かめてから。作業中のチャットはサーバーが断るので、その理由を出す）
  const chatDragging = useChatDragging();
  const archiveDrop = useChatDropTarget((chatId) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat && !chat.archived_at) void toggleArchiveChat(chat).catch(reportFailure("アーカイブできませんでした"));
  });

  // 自分で作ったグループ（作り始める入力欄と、グループごとの「…」メニュー・名前の変更・ドロップ先）
  const [creating, setCreating] = useState(false);
  // まとまりの見出しの色（「まとまりを色付きで表示」のとき。タブの列のまとまりと同じ色）と、見出しの右クリックでの切り替え
  const colors = useSidebarBucketColors(grouping, project.id);
  const sections = useGroupSections({ projectId: project.id, groups, chats, menuExtra: colors.menuItem });
  // グループに入れた下書きがあれば、グループなしのチャットがなくても「No Group」の見出しを出す（下書きを戻すドロップ先）
  const groupedDrafts = list.groups.some((g) => g.drafts.length > 0);
  // グループの見出しを出しているときは、どのグループにも入っていない下書き（もうないグループのものも）を「No Group」の中（チャットの上）に並べる
  // （以前はプロジェクトのいちばん上に出していて、グループなしのものだと分かりにくかった）
  const ungroupedDrafts = showGroups ? (ungrouped?.drafts ?? []) : [];
  // 固定を除いた、絞り込みを通したチャットの数
  const restCount = visibleCount - (pinned?.chats.length ?? 0);
  // 「No Group」の見出しで閉じているか（グループの見出しを出しているときだけ。閉じていれば中身を隠す）
  const ungroupedHidden = showGroups && !ungroupedFold.open;
  const startCreate = () => {
    if (collapsed) toggleCollapsed();
    // 作ったグループが見えるよう、グループでまとめる表示にする
    if (grouping !== "group") setGrouping("group");
    setCreating(true);
  };

  // 右クリックメニューの「名前を変更」は、行の名前をその場で入力欄にする
  const rename = useChatRename((m) => void alertDialog("名前を変更できませんでした", m));
  const renderRow = (chat: Chat) => (
    <ChatRow
      key={chat.id}
      chat={chat}
      state={stateOf(chat)}
      active={route.name === "chat" && route.chatId === chat.id}
      menuOpen={rowMenu.menu?.value.id === chat.id}
      onMenu={(at) => rowMenu.openAt(at, chat)}
      onCloseMenu={rowMenu.close}
      onRename={() => rename.start(chat)}
      rename={rename.editorFor(chat)}
      // 子チャットは親の行の中にだけ置く（開閉と数。孫・ひ孫も同じ形で）。子チャットは別ウィンドウで開く
      after={<ChildChatRows parentId={chat.id} parentArchived={chat.archived_at !== null} childrenOf={childChats} renderRow={renderRow} />}
      onOpen={chat.parent_chat_id !== null ? () => openChildChat(chat) : undefined}
    />
  );

  const renderGroup = (bucket: (typeof list.groups)[number]) => {
    const group = bucket.group!;
    return (
      <CustomGroupSection
        key={group.id}
        projectId={project.id}
        group={group}
        bucket={bucket}
        closed={!filtering && !groupFolds.isOpen(bucket.key)}
        onSetClosed={(closed) => groupFolds.set(bucket.key, !closed)}
        filtering={filtering}
        renderRow={renderRow}
        section={sections.sectionProps(group)}
        hue={colors.hueOf(bucket)}
      />
    );
  };
  // 「No Group」より前と後ろのグループ（グループの並びの中の位置で分ける。グループの見出しを出していなければすべて前）
  const { before: groupsBeforeUngrouped, after: groupsAfterUngrouped } = showGroups
    ? splitAtUngrouped(list.groups, (b) => b.group!.id, groups.map((g) => g.id), sections.ungroupedAt)
    : { before: list.groups, after: [] };
  // 「No Group」の見出しと中身（グループなしの下書き・チャット。グループの見出しがなければ、ふつうの一覧）
  const ungroupedBlock = (
    <>
      {showGroups && ungrouped && (ungrouped.chats.length > 0 || ungroupedDrafts.length > 0 || groupedDrafts) && (
        <UngroupedHead
          projectId={project.id}
          count={ungrouped.chats.length}
          open={ungroupedFold.open}
          onToggle={ungroupedFold.toggle}
          dragProps={sections.ungrouped.dragProps}
          hue={colors.hueOf(ungrouped)}
          onContextMenu={colors.onContextMenu}
        />
      )}
      {(filtering && restCount === 0 && ungroupedDrafts.length === 0) ||
      (visibleCount === 0 && ungroupedDrafts.length === 0 && ungroupedHidden) ? null : visibleCount === 0 &&
        ungroupedDrafts.length === 0 ? (
        <button className="chat-row ghost" onClick={() => openNewChat(project.id)}>
          <SquarePen size={13} /> 最初のチャットを始める
        </button>
      ) : mainRows.length === 0 && ungroupedDrafts.length === 0 ? null : (
        // グループの見出しがあるときは「No Group」の見出しで開閉し、中身（グループなしの下書き・チャット）を段下げする
        <Collapse open={!ungroupedHidden} indent={showGroups}>
          {/* グループなしの下書き（グループから戻すドロップ先は、包む要素の「No Group」のまとまり） */}
          <DraftRows drafts={ungroupedDrafts} />
          {mainRows.length === 0 ? null : mainSections ? (
            <GroupedChatRows buckets={mainSections} renderRow={renderRow} forceOpen={filtering} hueOf={colors.hueOf} onContextMenu={colors.onContextMenu} />
          ) : (
            <ul className="chat-rows">{mainRows.map(renderRow)}</ul>
          )}
        </Collapse>
      )}
    </>
  );

  return (
    <section
      className="workspace-page"
      data-project-id={project.id}
      aria-hidden={hidden}
      inert={hidden}
      style={{ "--ws-hue": `${projectHue(project.id)}` } as React.CSSProperties}
    >
      <WorkspaceHead
        project={project}
        groups={groups}
        active={isActive}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        chatCount={chatCount}
        counts={stateCounts(chats, pending)}
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
        {chatCount > 0 && <SearchField value={query} onChange={setQuery} placeholder="チャット名で検索" label={`${project.name} のチャットを検索`} />}
        {keyword && visibleCount === 0 && <p className="chat-search-empty">「{keyword}」に一致するチャットはありません</p>}
        {!keyword && stateFilter && visibleCount === 0 && <p className="chat-search-empty">{BOARD_COLUMN_LABELS[stateFilter]}のチャットはありません</p>}
        {creating && (
          <div className="custom-group-head editing">
            <Folder size={13} aria-hidden />
            <InlineName
              placeholder="グループ名（例: コードレビュー）"
              onSubmit={(name) => {
                setCreating(false);
                void api.createGroup(project.id, name);
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}
        {/* 自分待ちの「プロジェクト内の上に」: プロジェクトの中のいちばん上（下書き・固定より上） */}
        {waitingTop.length > 0 && (
          <FoldSection look="row" icon={Inbox} label="自分待ち" count={waitingTop.length} open={waitingFold.open} onToggle={waitingFold.toggle}>
            <ul className="chat-rows">{waitingTop.map(renderRow)}</ul>
          </FoldSection>
        )}
        {/* グループの見出しを出していないときの下書き（グループでまとめていないときは、グループに入れたものも含めていちばん上に） */}
        <DraftRows drafts={list.topDrafts} />
        {pinned && (
          <FoldSection
            look="row"
            wrapClassName="pinned"
            icon={Pin}
            label="固定"
            count={pinned.chats.length}
            open={pinnedFold.open}
            onToggle={pinnedFold.toggle}
            {...huedHeadProps(colors.hueOf(pinned))}
            onContextMenu={colors.onContextMenu}
          >
            <ul className="chat-rows">{pinned.chats.map(renderRow)}</ul>
          </FoldSection>
        )}
        {/* 自分で作ったグループ（検索・自分待ちなどで絞り込んでいる間は、一致するチャットか下書きのあるものだけ）と、
            その間の覚えた位置（ungroupedAt）に「No Group」（見出しのドラッグで並べ替える） */}
        {groupsBeforeUngrouped.map(renderGroup)}
        {showGroups ? (
          <div className={sections.ungrouped.className} {...sections.ungrouped.dropProps}>
            {ungroupedBlock}
          </div>
        ) : (
          ungroupedBlock
        )}
        {groupsAfterUngrouped.map(renderGroup)}
        {archived && (
          // チャットの行をここへドラッグすると、確かめてからアーカイブする（右クリックの「アーカイブ」と同じ確認のダイアログ）
          <div className={cx("archive-drop", archiveDrop.over && "drop-target")} {...archiveDrop.props}>
          <FoldSection
            look="row"
            icon={Archive}
            label="アーカイブ済み"
            count={archived.chats.length}
            open={archivedFold.open}
            onToggle={archivedFold.toggle}
            {...huedHeadProps(colors.hueOf(archived))}
            onContextMenu={colors.onContextMenu}
          >
            {/* 中も、ほかのチャットと同じまとめ方で出す（グループには分けない。開閉はアーカイブ済みの中だけで覚える） */}
            {archived.children ? (
              <div className="custom-group-grouped">
                <GroupedChatRows buckets={archived.children} renderRow={renderRow} forceOpen={Boolean(keyword)} />
              </div>
            ) : (
              <ul className="chat-rows archived-rows">{archived.chats.map(renderRow)}</ul>
            )}
          </FoldSection>
          </div>
        )}
        {/* アーカイブ済みのまとまりがない（まだない・隠している）ときも、チャットをドラッグしている間だけ同じ場所に落とし先を出す */}
        {!archived && chatDragging && (
          <div className={cx("chat-row ghost archive-drop", archiveDrop.over && "drop-target")} {...archiveDrop.props}>
            <Archive size={13} aria-hidden /> アーカイブ済みへ（落とすとアーカイブ）
          </div>
        )}
      </Collapse>
      {sections.menuElement}
      {colors.menuElement}
      {rowMenu.menu && (
        <ChatMenu
          at={rowMenu.menu.at}
          chat={rowMenu.menu.value}
          onOpenPanel={(chat) => openChat(chat.project_id, chat.id)}
          onRename={rename.start}
          onClose={rowMenu.close}
          onError={(m) => void alertDialog("操作できませんでした", m)}
          ignore=".chat-row-more"
        />
      )}
    </section>
  );
});
