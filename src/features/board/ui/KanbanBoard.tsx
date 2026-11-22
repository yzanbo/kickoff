import { useMemo, useState } from "react";
import type { Chat } from "@shared/chat/types";
import { useChatRename } from "@/features/chat/ui/useChatRename";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { useVisibleProjects } from "@/features/projects/ui/useVisibleProjects";
import { open } from "@/foundation/ui/navigation/open";
import type { ReopenRoute } from "@/foundation/ui/navigation/router";
import { useBoardPanel } from "@/features/chatPanel/ui/board/useBoardPanel";
import { panelChats, useChatsTabLinks } from "@/features/chatPanel/ui/board/boardChats";
import { useChatPlacement } from "@/features/projects/ui/page/chatPlacement";
import { useAllDrafts, type PlacedDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { panelKey } from "@/features/panel/ui";
import { BoardColumnsToggle } from "./BoardColumnsToggle";
import { BoardContext, useBoard, useBoardContextValue } from "./BoardContext";
import { useGroupLaneDrop } from "./useGroupLaneDrop";
import { useProjectLaneReorder } from "./useProjectLaneReorder";
import { BoardHeader } from "./BoardHeader";
import { KanbanFilters } from "./KanbanFilters";
import { LaneSelect } from "./BoardLanes";
import { KanbanBody } from "./KanbanBody";
import { GroupCreateToolButton } from "./GroupCreateForm";
import { SortMenuButton } from "./BoardSortTools";
import { CardFieldsButton } from "./CardFieldsMenu";
import { useChatSort } from "./useChatSort";
import { SavedViewTabs } from "./SavedViewTabs";
import { FeedList } from "./FeedList";
import { useFeed } from "./useFeed";
import { useChatBuckets } from "@/features/chatList/ui/useChatBuckets";
import { useKanbanChats } from "./useKanbanChats";
import { useKanbanFilters, useWorktreeChoices } from "./useKanbanFilters";
import { BoardShell } from "./BoardShell";
import { boardCardIds, useBoardCards, useCardMenu } from "./useBoardCards";
import { SelectionBar, useChatSelectionState } from "@/features/chatList/ui";
import { useGroupsOf } from "@/features/groups/ui/stores/groups";
import { useChats } from "@/features/chat/ui/store/knownChats";
import { RowBudgetScope, useProgressivePage } from "@/foundation/ui/hooks/useProgressiveRows";

/**
 * プロジェクトのカンバン。チャットを開く先は設定の「チャットの置き方」で決まる: ボードと分ける（初め）なら、カードを押すと「チャット」タブへ移って開く。
 * ボードの右で開くなら、右側から出てくるパネルで開き、URL もそのチャットにする（サイドバー・検索などから開いたチャット・新しいチャット（focus）もパネルで開く）
 */
export function KanbanBoard({ projectId, focus }: { projectId: number; focus?: ReopenRoute }) {
  const [placement] = useChatPlacement();
  return placement === "together" ? <KanbanWithPanel projectId={projectId} focus={focus} /> : <KanbanApart projectId={projectId} />;
}

/** ボードの右のパネルで開くカンバン */
function KanbanWithPanel({ projectId, focus }: { projectId: number; focus?: ReopenRoute }) {
  // カードの右クリックメニュー（開いている間はパネルを Esc で閉じない: メニューの開いている間の Esc は usePanelShortcuts が見送る）
  const menu = useCardMenu();
  // 右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ。チャットのタブはサイドバーの一覧にそろえる）と、
  // まだ送っていない新しいチャット（右のパネル・プロジェクトのチャット欄で書いている途中。いちばん左の「下書き」の列に出す）
  const chats = panelChats(useBoardPanel({ projectId, focus }));
  return <KanbanView projectId={projectId} menu={menu} rightPanel={chats.rightPanel} onOpen={chats.open} drafts={chats.drafts} />;
}

/** チャットタブへ移って開くカンバン */
function KanbanApart({ projectId }: { projectId: number }) {
  const menu = useCardMenu();
  const chats = useChatsTabLinks(projectId);
  return <KanbanView projectId={projectId} menu={menu} rightPanel={chats.rightPanel} onOpen={chats.open} drafts={chats.drafts} />;
}

/**
 * 全プロジェクトのカンバン（全プロジェクトの画面）。右のパネルを持たず、カードを押すとそのプロジェクトへ移って開く（サイドバー・⌘⇧A・検索と同じ。
 * 同じチャットが全プロジェクトとプロジェクトの 2 つのパネルで別々に開かないように）。ツールバーに「新規」は置かない（プロジェクトのボードにもない。新しいチャットは ⌘N・サイドバー・タブの列の＋から始める）。
 * 下書きの列には、すべてのプロジェクトの下書きを並べる（押すとその欄の画面へ移って開く）
 */
export function AllProjectsKanban() {
  const menu = useCardMenu();
  const drafts = useAllDrafts();
  return (
    <KanbanView
      menu={menu}
      onOpen={(chat) => open({ kind: "chat", projectId: chat.project_id, chatId: chat.id })}
      drafts={drafts}
    />
  );
}

interface ViewProps {
  /** プロジェクトのボード（なければ全プロジェクトのボード。カード・下書きにプロジェクトのバッジを付ける） */
  projectId?: number;
  menu: ReturnType<typeof useCardMenu>;
  /** 右のパネル（プロジェクトのボードだけ） */
  rightPanel?: ReturnType<typeof useBoardPanel>;
  /** カード・行・右クリックの「開く」 */
  onOpen: (chat: Chat) => void;
  /** いちばん左の「下書き」の列に出す下書き（全プロジェクトのボードでは、出しているプロジェクトのものだけに絞る） */
  drafts: readonly PlacedDraft[];
}

/** チャットのカンバン（プロジェクト・全プロジェクトで共通）。根にボードの種類と見え方（BoardContext）を置く */
function KanbanView(props: ViewProps) {
  const board = useBoardContextValue(props.projectId);
  return (
    <BoardContext.Provider value={board}>
      <KanbanContent {...props} />
    </BoardContext.Provider>
  );
}

/** カンバンの中身。列（作業中・回答待ち・未読・既読）は AI の状態から自動で決まり、人は動かさない（boardColumnOf）。カードの点はより細かい状態（順番待ち・エラーなど） */
function KanbanContent({ projectId, menu, rightPanel, onOpen, drafts: allDrafts }: ViewProps) {
  const { kind, view: state, patch, layout } = useBoard();
  const allProjects = kind === "all";
  // 全プロジェクトのボードに出すプロジェクト: しまった（アーカイブした）ものを除いたサイドバーの並び。サイドバーの「タグ」で絞り込んでいれば、合うものだけ
  // （使うのは全プロジェクトのボードだけ。名前の引き当てはどのボードでも全プロジェクトから）
  const { projectName } = useProjects();
  const { visible: projects } = useVisibleProjects();
  const [error, setError] = useState<string>();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useChatRename(setError);
  // 絞り込み（アーカイブ・作業場所・名前）とボード／リスト／スイムレーン（覚えておく）
  const filters = useKanbanFilters();
  // 表示・段・列の分け方（見え方から layout.ts の boardLayout が決める）。全プロジェクトのボードだけ、フィード（チャットごとの最新の返答を新しい順に）で見られる
  const { feed, view, lanes, laneSplit, byGroup } = layout;
  const feedData = useFeed(feed);
  const groupLaneDrop = useGroupLaneDrop(projectId, layout.groupLanes);
  // 「アーカイブ済み」も、アーカイブを含めて読み込んでから、下で絞り込む
  const { chats, loaded, error: loadError } = useChats({ projectId, archived: filters.archive !== "active" });
  useTicker(30_000); // 経過時間の表示を進める
  const worktreeChoices = useWorktreeChoices(chats);

  // 絞り込んだチャットと下書き。全プロジェクトのボードでは、しまった（アーカイブした）・タグの絞り込みに合わないプロジェクトのものを出さない
  const projectIds = useMemo(() => (allProjects ? new Set(projects.map((p) => p.id)) : undefined), [allProjects, projects]);
  const shown = useKanbanChats({ chats, filters: { ...filters, matches: filters.search.matches }, projectIds });
  const drafts = useMemo(() => (projectIds ? allDrafts.filter((d) => projectIds.has(d.projectId)) : allDrafts), [allDrafts, projectIds]);
  // 全プロジェクトのボードのプロジェクトの段は、見出しのドラッグで並べ替える（サイドバーと同じ並び）
  const laneReorder = useProjectLaneReorder(allProjects);
  // 並び順（ツールバーの「並び順」。列・まとまりの中もこの順）
  const { sort, setSort, compare } = useChatSort(projectIds ? [...projectIds] : projectId !== undefined ? [projectId] : []);
  // ⌘ / Shift ＋クリックで選んだカード（サイドバーと同じ決まりで、まとめて操作する欄とメニューもサイドバーと同じ SelectionBar。範囲はボードの画面の並び）
  const selection = useChatSelectionState(
    shown.map((c) => c.id),
    boardCardIds,
  );
  const shownProjects = [...new Set(shown.map((c) => c.project_id))];
  const groupsOf = useGroupsOf(shownProjects);
  const selectionBar = selection.ids.size > 0 && (
    <div className="board-selection">
      <SelectionBar
        selection={selection}
        chats={Object.fromEntries(shownProjects.map((id) => [id, shown.filter((c) => c.project_id === id)]))}
        groups={Object.fromEntries(shownProjects.map((id) => [id, groupsOf(id)]))}
      />
    </div>
  );

  /**
   * カード・リストの行（クリックで開く・右クリックでメニュー・名前をその場で変える）。全プロジェクトのボードではプロジェクトのバッジ（印と名前）を付け、
   * 乗せるとどのプロジェクトへ移って開くかを出す
   */
  const cards = useBoardCards({
    panel: rightPanel?.panel,
    rename,
    menu,
    onOpen,
    selection,
    openTitle: allProjects ? (chat) => `プロジェクト「${projectName(chat.project_id)}」で開く（そのプロジェクトの画面へ移ります）` : undefined,
    projectName: (chat) => (allProjects ? projectName(chat.project_id) : undefined),
    // グループの列・グループの段では、カードをドラッグしてグループを移す（全プロジェクトのボードで、ほかのプロジェクトのグループへ落とすと、確かめてからプロジェクトも移す）
    drag: byGroup
      ? { hint: allProjects ? "ドラッグでグループを移す（ほかのプロジェクトのグループへ落とすと、確かめてからそのプロジェクトへ移します）" : "ドラッグでグループを移す" }
      : groupLaneDrop.laneProps
        ? { hint: "ドラッグでほかのグループの段へ移す" }
        : undefined,
  });
  // 状態の列（段に分けるときは、段（グループ・作業場所・プロジェクト）ごとに状態の列。段には、その段に入る作成先の下書きも入る）。
  // 状態で分けないときは、段だけで分ける（段に分けなければ見出しのないまとまり 1 つ。中のチャットは最後に動いた順）
  const buckets = useChatBuckets(shown, {
    by: layout.bucketBy,
    project: projectId,
    projects: allProjects ? projects : undefined,
    drafts,
    keepEmpty: layout.keepEmpty,
    sort: compare,
  });
  /**
   * 段・アーカイブ済みのまとまりの開閉を覚える場所（ボードごと。列・段はまとまりのキーで分ける。チャットの置き方を変えても、
   * 全プロジェクトのボードも、パネルがあったときと同じ名前のまま）
   */
  const foldPlace = `board:${panelKey("kanban", projectId ?? "all")}`;
  // ボードを開いた直後（見え方を変えた・チャットが届いたときも）は画面に入る数のカードだけを描き、最初の描画のあとに残りを描く
  const rowBudget = useProgressivePage(
    `${projectId ?? "all"}/${feed ? `feed/${feedData.loaded ? 1 : 0}` : view}/${laneSplit ? lanes : "none"}/${state.columns}/${filters.archive}/${loaded ? 1 : 0}`,
  );

  const header = (
    <BoardHeader
      query={filters.query}
      onQuery={filters.setQuery}
      filters={
        <KanbanFilters
          archive={filters.archive}
          onArchive={filters.setArchive}
          worktrees={worktreeChoices}
          worktree={filters.worktree}
          onWorktree={filters.setWorktree}
        />
      }
      organize={projectId !== undefined && <GroupCreateToolButton projectId={projectId} />}
      view={feed ? "feed" : view}
      onView={(next) => patch({ view: next })}
      feed={allProjects}
      // 列の分け方（「状態」「グループ」のオン・オフ。どちらのボードも同じ形）。フィードは返答の新しい順の 1 列なので、段・列の分け方・並び順を出さない
      columns={feed ? undefined : <BoardColumnsToggle />}
      viewOptions={
        !feed && (
        <LaneSelect value={layout.laneValue} options={layout.laneChoices} onChange={(next) => patch({ lanes: next })} />
        )
      }
      // 並び順の左に「表示項目」（カード・行に出す項目）。フィードのカードにも効くので、フィードでも出す
      sortTools={
        <>
          <CardFieldsButton />
          {!feed && <SortMenuButton sort={sort} onSort={setSort} />}
        </>
      }
      panel={rightPanel?.panel}
    />
  );

  return (
    <BoardShell views={<SavedViewTabs />} header={header} error={error ?? loadError ?? (feed ? feedData.error : undefined)} rightPanel={rightPanel} menu={menu} onOpenChat={onOpen} rename={rename} onError={setError} after={selectionBar}>
      <RowBudgetScope value={rowBudget}>
      {!loaded ? (
        <p className="muted small board-loading">読み込み中…</p>
      ) : feed ? (
        <FeedList items={feedData.items} chats={shown} loaded={feedData.loaded} foldPlace={foldPlace} render={cards.feedCard} />
      ) : (
        <KanbanBody
          buckets={buckets}
          drafts={drafts}
          showLaneProject={allProjects && projects.length > 1}
          foldPlace={foldPlace}
          cards={cards}
          laneReorder={laneReorder}
          laneDrop={groupLaneDrop.laneProps}
        />
      )}
      </RowBudgetScope>
    </BoardShell>
  );
}
