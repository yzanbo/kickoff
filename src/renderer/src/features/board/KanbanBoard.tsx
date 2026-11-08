import { SquarePen } from "lucide-react";
import { useMemo, useState } from "react";
import type { Chat } from "@shared/types";
import { useChatRename } from "@/features/chat/useChatRename";
import { useTicker } from "@/hooks/useTicker";
import { useProjects } from "@/stores/projects";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { openChat, type ReopenRoute } from "@/app/router";
import { useBoardPanel } from "@/features/panel/board/useBoardPanel";
import { panelChats, useChatsTabLinks, type BoardChats } from "@/features/panel/board/boardChats";
import { useChatPlacement } from "@/features/project/page/chatPlacement";
import { useAllDrafts, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import { AllProjectsColumnsToggle, BoardColumnsToggle, useAllProjectsColumns, useGroupsByState } from "./BoardColumnsToggle";
import { useProjectLaneReorder } from "./useProjectLaneReorder";
import { BoardHeader, useBoardView } from "./BoardHeader";
import { KanbanFilters } from "./KanbanFilters";
import { LaneSelect } from "./BoardLanes";
import { KanbanBody } from "./KanbanBody";
import { SortMenuButton, TableColumnsButton, useTableColumns } from "./BoardSortTools";
import { useChatSort } from "./useChatSort";
import { SavedViewTabs } from "./SavedViewTabs";
import { FeedList } from "./FeedList";
import { useFeed } from "./useFeed";
import { useSetting } from "@/hooks/useSetting";
import { ALL_PROJECTS_FEED } from "@/lib/storageKeys";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import type { BucketHead } from "@/features/chatList/buckets";
import { useKanbanChats } from "./useKanbanChats";
import { useKanbanFilters, useKanbanLanes, useWorktreeChoices } from "./useKanbanFilters";
import { BoardShell } from "./BoardShell";
import { useBoardCards, useCardMenu } from "./useBoardCards";
import { useChats } from "@/stores/chats";

/** 状態の列は、チャットがなくてもすべて出す（段・グループはチャットか下書きのあるものだけ） */
const keepColumns = (head: BucketHead) => head.kind === "status";

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
  // カードの右クリックメニュー（開いている間はパネルを Esc で閉じない）
  const menu = useCardMenu();
  // 右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ。チャットのタブはサイドバーの一覧にそろえる）と、
  // まだ送っていない新しいチャット（右のパネル・プロジェクトのチャット欄で書いている途中。いちばん左の「下書き」の列に出す）
  const chats = panelChats(useBoardPanel({ projectId, holdEsc: menu.isOpen, focus }));
  return <ProjectKanban projectId={projectId} menu={menu} chats={chats} />;
}

/** チャットタブへ移って開くカンバン */
function KanbanApart({ projectId }: { projectId: number }) {
  const menu = useCardMenu();
  const chats = useChatsTabLinks(projectId);
  return <ProjectKanban projectId={projectId} menu={menu} chats={chats} />;
}

function ProjectKanban({ projectId, menu, chats }: { projectId: number; menu: ReturnType<typeof useCardMenu>; chats: BoardChats }) {
  return (
    <KanbanView
      projectId={projectId}
      menu={menu}
      rightPanel={chats.rightPanel}
      onOpen={chats.open}
      newChat={{ onClick: chats.startNewChat, title: chats.newChatTitle }}
      drafts={chats.drafts}
    />
  );
}

/**
 * 全プロジェクトのカンバン（全プロジェクトの画面）。右のパネルを持たず、カードを押すとそのプロジェクトへ移って開く（サイドバー・⌘⇧A・検索と同じ。
 * 同じチャットが全プロジェクトとプロジェクトの 2 つのパネルで別々に開かないように）。ツールバーに「新規」は置かない（利用者の依頼。新しいチャットは ⌘N・サイドバー・プロジェクトのボードから始める）。
 * 下書きの列には、すべてのプロジェクトの下書きを並べる（押すとその欄の画面へ移って開く）
 */
export function AllProjectsKanban() {
  const menu = useCardMenu();
  const drafts = useAllDrafts();
  return (
    <KanbanView
      menu={menu}
      onOpen={(chat) => openChat(chat.project_id, chat.id)}
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
  /** ツールバーの「新規」（押したとき・乗せたときの説明。プロジェクトのボードだけ。全プロジェクトのボードには置かない） */
  newChat?: { onClick: () => void; title?: string };
  /** いちばん左の「下書き」の列に出す下書き（全プロジェクトのボードでは、出しているプロジェクトのものだけに絞る） */
  drafts: readonly PanelDraft[];
}

/**
 * チャットのカンバン（プロジェクト・全プロジェクトで共通の中身）。列（作業中・回答待ち・未読・既読）は AI の状態から自動で決まり、人は動かさない（boardColumnOf）。
 * カードの点はより細かい状態（順番待ち・エラーなど）
 */
function KanbanView({ projectId, menu, rightPanel, onOpen, newChat, drafts: allDrafts }: ViewProps) {
  const allProjects = projectId === undefined;
  // 全プロジェクトのボードに出すプロジェクト: しまった（アーカイブした）ものを除いたサイドバーの並び。サイドバーの「タグ」で絞り込んでいれば、合うものだけ
  // （使うのは全プロジェクトのボードだけ。名前の引き当てはどのボードでも全プロジェクトから）
  const { projectName } = useProjects();
  const { visible: projects } = useVisibleProjects();
  const [error, setError] = useState<string>();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useChatRename(setError);
  // 絞り込み（アーカイブ・作業場所・名前）とボード／リスト／スイムレーン（覚えておく）
  const filters = useKanbanFilters();
  // 表示（ボード / リスト）と、段に分けるか（段の分け方はボードとリストで共通）
  const { view, split, setView, setSplit } = useBoardView();
  // 全プロジェクトのボードだけ、フィード（チャットごとの最新の返答を新しい順に）で見られる（ボード・リスト・表とは別に覚える）
  const [feedOn, setFeed] = useSetting(ALL_PROJECTS_FEED);
  const feed = allProjects && feedOn;
  const feedData = useFeed(feed);
  // 全プロジェクトのボードだけ、グループの列（プロジェクトの段ごと）・状態で分けない並びにできる（プロジェクトのボードはいつも状態の列。グループの列は別の画面）
  const [allColumns] = useAllProjectsColumns();
  // スイムレーンの段の分け方
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);
  // グループの列は、段がプロジェクトのときだけ選べる（グループはプロジェクトごとのもの）。ほかの段では、覚えた「グループ」は状態の列で出す（段をプロジェクトに戻すとグループに戻る）
  const projectLanes = allProjects && split && lanes === "project";
  const flat = allProjects && allColumns === "none";
  const byGroup = projectLanes && allColumns === "groups";
  // 列の分け方の「グループ×状態」: グループの列の中を状態で小分けにする（表では、プロジェクトの段 → グループ → 状態の見出しの行）
  const [groupsByState] = useGroupsByState();
  const byState = byGroup && groupsByState;
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
  // 並び順（表の見出し・ツールバーの「並び順」。列・まとまりの中もこの順）と、表に出す列
  const { sort, setSort, compare } = useChatSort(projectIds ? [...projectIds] : projectId !== undefined ? [projectId] : []);
  const { columns: tableColumns } = useTableColumns(allProjects);

  /**
   * カード・リストの行（クリックで開く・右クリックでメニュー・名前をその場で変える）。全プロジェクトのボードではプロジェクトのバッジ（印と名前）を付け、
   * 乗せるとどのプロジェクトへ移って開くかを出す
   */
  const cards = useBoardCards({
    panel: rightPanel?.panel,
    rename,
    menu,
    onOpen,
    openTitle: allProjects ? (chat) => `プロジェクト「${projectName(chat.project_id)}」で開く（そのプロジェクトの画面へ移ります）` : undefined,
    projectName: (chat) => (allProjects ? projectName(chat.project_id) : undefined),
    // グループの列では、カードをドラッグしてグループを移す（ほかのプロジェクトのグループへ落とすと、確かめてからプロジェクトも移す）
    drag: byGroup ? { hint: "ドラッグでグループを移す（ほかのプロジェクトのグループへ落とすと、確かめてからそのプロジェクトへ移します）" } : undefined,
  });
  // 状態の列（段に分けるときは、段（グループ・作業場所・プロジェクト）ごとに状態の列。段には、その段に入る作成先の下書きも入る）。
  // 状態で分けないときは、段だけで分ける（段に分けなければ見出しのないまとまり 1 つ。中のチャットは最後に動いた順）
  const buckets = useChatBuckets(shown, {
    // グループの列は、プロジェクトの段の中でそのプロジェクトのグループに分ける（ProjectGroupColumns。グループはプロジェクトごとのもの）
    // 表では、プロジェクトの段の中をグループのまとまりに分けておく（表の中の見出しの行）
    by: byGroup ? (view === "table" ? (byState ? ["project", "group", "status"] : ["project", "group"]) : "project") : flat ? (split ? [lanes] : []) : split ? [lanes, "status"] : "status",
    project: projectId,
    projects: allProjects ? projects : undefined,
    drafts,
    // グループの列では、チャットのないプロジェクトの段も出す（ほかのプロジェクトのチャットを落としてそのグループへ移せるように）
    keepEmpty: byGroup ? true : keepColumns,
    sort: compare,
  });
  /**
   * 段・アーカイブ済みのまとまりの開閉を覚える場所（ボードごと。列・段はまとまりのキーで分ける。チャットの置き方を変えても、
   * 全プロジェクトのボードも、パネルがあったときと同じ名前のまま）
   */
  const foldPlace = `board:${panelKey("board", projectId ?? "all")}`;

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
      primary={
        newChat && (
          <button className="btn btn-sm" onClick={newChat.onClick} title={newChat.title}>
            <SquarePen size={13} /> <span className="btn-label">新規</span>
          </button>
        )
      }
      view={feed ? "feed" : view}
      onView={(next) => {
        setFeed(next === "feed");
        if (next !== "feed") setView(next);
      }}
      feed={allProjects}
      // フィードは返答の新しい順の 1 列なので、段・列の分け方・並び順を出さない
      columns={feed ? undefined : projectId !== undefined ? <BoardColumnsToggle projectId={projectId} value="state" /> : <AllProjectsColumnsToggle groups={projectLanes} />}
      viewOptions={
        !feed && (
        <LaneSelect
          value={split ? lanes : "none"}
          options={laneOptions}
          onChange={(next) => {
            if (next !== "none") setLanes(next);
            setSplit(next !== "none");
          }}
        />
        )
      }
      sortTools={
        !feed && (
        <>
          <SortMenuButton sort={sort} onSort={setSort} allProjects={allProjects} />
          {view === "table" && <TableColumnsButton allProjects={allProjects} />}
        </>
        )
      }
      panel={rightPanel?.panel}
    />
  );

  return (
    <BoardShell views={<SavedViewTabs allProjects={allProjects} />} header={header} error={error ?? loadError ?? (feed ? feedData.error : undefined)} rightPanel={rightPanel} menu={menu} onOpenChat={onOpen} rename={rename} onError={setError}>
      {!loaded ? (
        <p className="muted small board-loading">読み込み中…</p>
      ) : feed ? (
        <FeedList items={feedData.items} chats={shown} loaded={feedData.loaded} render={cards.feedCard} />
      ) : (
        <KanbanBody
          view={view}
          split={split}
          flat={flat}
          byGroup={byGroup}
          byState={byState}
          buckets={buckets}
          drafts={drafts}
          allProjects={allProjects}
          showLaneProject={allProjects && projects.length > 1}
          foldPlace={foldPlace}
          cards={cards}
          laneReorder={laneReorder}
          table={{ columns: tableColumns, sort, onSort: setSort }}
        />
      )}
    </BoardShell>
  );
}
