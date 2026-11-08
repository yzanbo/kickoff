import { Folder, LayoutGrid, SquareKanban, SquarePen } from "lucide-react";
import { useMemo, useState } from "react";
import type { Chat } from "@shared/types";
import { useChatRename } from "@/features/chat/useChatRename";
import { useTicker } from "@/hooks/useTicker";
import { useProjects } from "@/stores/projects";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { openNoProjectsGuide } from "@/features/project/new/openNewProject";
import { useFallbackProject } from "@/features/sidebar/currentProject";
import { openChat, openNewChat, type ReopenRoute } from "@/app/router";
import { useBoardPanel } from "@/features/panel/board/useBoardPanel";
import { panelChats, useChatsTabLinks, type BoardChats } from "@/features/panel/board/boardChats";
import { useChatPlacement } from "@/features/project/page/chatPlacement";
import { useAllDrafts, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import { AllProjectsColumnsToggle, BoardColumnsToggle, useAllProjectsColumns } from "./BoardColumnsToggle";
import { FlatTasks } from "./FlatTasks";
import { ProjectGroupColumns } from "./ProjectGroupColumns";
import { BoardHeader, useBoardView } from "./BoardHeader";
import { KanbanFilters } from "./KanbanFilters";
import { BoardLanes, LaneSelect } from "./BoardLanes";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import type { BucketHead } from "@/features/chatList/buckets";
import { useKanbanChats } from "./useKanbanChats";
import { useKanbanFilters, useKanbanLanes, useWorktreeChoices } from "./useKanbanFilters";
import { BoardShell } from "./BoardShell";
import { ListSections, StateColumns } from "./StateColumn";
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
 * 同じチャットが全プロジェクトとプロジェクトの 2 つのパネルで別々に開かないように）。「新規」は ⌘N と同じく、サイドバーで選んでいるプロジェクトへ移って始める。
 * 下書きの列には、すべてのプロジェクトの下書きを並べる（押すとその欄の画面へ移って開く）
 */
export function AllProjectsKanban({ title }: { title: string }) {
  const menu = useCardMenu();
  const { projectName } = useProjects();
  const target = useFallbackProject();
  const drafts = useAllDrafts();
  return (
    <KanbanView
      title={title}
      menu={menu}
      onOpen={(chat) => openChat(chat.project_id, chat.id)}
      newChat={{
        // プロジェクトがなければ、チャットはプロジェクトの中で始めることを案内する（押せなくはしない）
        onClick: () => (target === undefined ? openNoProjectsGuide() : openNewChat(target)),
        title: target === undefined ? undefined : `「${projectName(target)}」で新しいチャットを始めます（サイドバーで選んでいるプロジェクト。⌘N と同じ）`,
      }}
      drafts={drafts}
    />
  );
}

interface ViewProps {
  /** プロジェクトのボード（なければ全プロジェクトのボード。カード・下書きにプロジェクトのバッジを付ける） */
  projectId?: number;
  /** 見出しの名前（全プロジェクトの画面だけ。プロジェクトのボードはタブの名前があるので出さない） */
  title?: string;
  menu: ReturnType<typeof useCardMenu>;
  /** 右のパネル（プロジェクトのボードだけ） */
  rightPanel?: ReturnType<typeof useBoardPanel>;
  /** カード・行・右クリックの「開く」 */
  onOpen: (chat: Chat) => void;
  /** ツールバーの「新規」（押したとき・乗せたときの説明） */
  newChat: { onClick: () => void; title?: string };
  /** いちばん左の「下書き」の列に出す下書き（全プロジェクトのボードでは、出しているプロジェクトのものだけに絞る） */
  drafts: readonly PanelDraft[];
}

/**
 * チャットのカンバン（プロジェクト・全プロジェクトで共通の中身）。列（作業中・回答待ち・未読・既読）は AI の状態から自動で決まり、人は動かさない（boardColumnOf）。
 * カードの点はより細かい状態（順番待ち・エラーなど）
 */
function KanbanView({ projectId, title, menu, rightPanel, onOpen, newChat, drafts: allDrafts }: ViewProps) {
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
  // 全プロジェクトのボードだけ、グループの列（プロジェクトの段ごと）・状態で分けない並びにできる（プロジェクトのボードはいつも状態の列。グループの列は別の画面）
  const [allColumns] = useAllProjectsColumns();
  const flat = allProjects && allColumns === "none";
  const byGroup = allProjects && allColumns === "groups";
  // 「アーカイブ済み」も、アーカイブを含めて読み込んでから、下で絞り込む
  const { chats, loaded, error: loadError } = useChats({ projectId, archived: filters.archive !== "active" });
  useTicker(30_000); // 経過時間の表示を進める
  const worktreeChoices = useWorktreeChoices(chats);

  // 絞り込んだチャットと下書き。全プロジェクトのボードでは、しまった（アーカイブした）・タグの絞り込みに合わないプロジェクトのものを出さない
  const projectIds = useMemo(() => (allProjects ? new Set(projects.map((p) => p.id)) : undefined), [allProjects, projects]);
  const shown = useKanbanChats({ chats, filters: { ...filters, matches: filters.search.matches }, projectIds });
  const drafts = useMemo(() => (projectIds ? allDrafts.filter((d) => projectIds.has(d.projectId)) : allDrafts), [allDrafts, projectIds]);
  const total = shown.length;
  // スイムレーンの段の分け方
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);

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
    // グループの列は、いつもプロジェクトの段に分け、段の中でそのプロジェクトのグループに分ける（ProjectGroupColumns。グループはプロジェクトごとのもの）
    by: byGroup ? "project" : flat ? (split ? [lanes] : []) : split ? [lanes, "status"] : "status",
    project: projectId,
    projects: allProjects ? projects : undefined,
    drafts,
    // グループの列では、チャットのないプロジェクトの段も出す（ほかのプロジェクトのチャットを落としてそのグループへ移せるように）
    keepEmpty: byGroup ? true : keepColumns,
  });
  /**
   * 段・アーカイブ済みのまとまりの開閉を覚える場所（ボードごと。列・段はまとまりのキーで分ける。チャットの置き方を変えても、
   * 全プロジェクトのボードも、パネルがあったときと同じ名前のまま）
   */
  const foldPlace = `board:${panelKey("board", projectId ?? "all")}`;

  const header = (
    <BoardHeader
      // 状態で分けないときは、カンバン（状態の列）ではなくタスクの並びと呼ぶ
      heading={
        title
          ? byGroup
            ? { icon: <Folder size={16} className="muted" />, title: "グループ", count: total }
            : flat
            ? { icon: <LayoutGrid size={16} className="muted" />, title: "タスク", count: total }
            : { icon: <SquareKanban size={16} className="muted" />, title, count: total }
          : undefined
      }
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
        <button className="btn btn-sm" onClick={newChat.onClick} title={newChat.title}>
          <SquarePen size={13} /> <span className="btn-label">新規</span>
        </button>
      }
      view={view}
      onView={setView}
      columns={projectId !== undefined ? <BoardColumnsToggle projectId={projectId} value="state" /> : <AllProjectsColumnsToggle />}
      // グループの列はいつもプロジェクトの段に分けるので、段の分け方は出さない
      viewOptions={
        !byGroup && (
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
      panel={rightPanel?.panel}
    />
  );

  return (
    <BoardShell header={header} error={error ?? loadError} rightPanel={rightPanel} menu={menu} onOpenChat={onOpen} rename={rename} onError={setError}>
      {!loaded ? (
        <p className="muted small board-loading">読み込み中…</p>
      ) : byGroup ? (
        // グループの列: プロジェクトの段ごとに、そのプロジェクトのグループの列（カードをドラッグしてグループを移す）
        <BoardLanes lanes={buckets} list={view === "list"} foldPlace={foldPlace}>
          {(lane) =>
            lane.projectId === undefined ? null : (
              <ProjectGroupColumns
                projectId={lane.projectId}
                chats={lane.chats}
                drafts={lane.drafts}
                list={view === "list"}
                foldPlace={foldPlace}
                render={view === "list" ? cards.row : cards.card}
              />
            )
          }
        </BoardLanes>
      ) : split ? (
        // 段に分ける: 段ごとに、ボードと同じく下書き（その段に入る作成先のもの）→ 状態の列を並べる（リストなら 下書き → 状態のまとまり → アーカイブ済み を縦に）
        // 作業場所の段にプロジェクト名を添えるのは、いくつかのプロジェクトが並ぶ全プロジェクトのボードだけ
        <BoardLanes lanes={buckets} list={view === "list"} foldPlace={foldPlace} showProject={allProjects && projects.length > 1}>
          {(lane) =>
            flat ? (
              <FlatTasks
                chats={lane.chats}
                drafts={lane.drafts}
                list={view === "list"}
                showDraftProject={allProjects}
                foldPlace={foldPlace}
                archivedKey={`${lane.key}/archived`}
                render={view === "list" ? cards.row : cards.card}
              />
            ) : view === "board" ? (
              <StateColumns columns={lane.children ?? []} drafts={lane.drafts} showDraftProject={allProjects} foldPlace={foldPlace} render={cards.card} />
            ) : (
              <ListSections
                columns={lane.children ?? []}
                drafts={lane.drafts}
                showDraftProject={allProjects}
                foldPlace={foldPlace}
                archivedKey={`${lane.key}/archived`}
                render={cards.row}
              />
            )
          }
        </BoardLanes>
      ) : flat ? (
        // 状態で分けない: 下書き → チャット（最近動いた順）を 1 つの並びに（ボードはカードを幅に合わせて折り返し、リストは 1 列）
        <div className={view === "list" ? "board-list" : "board-flat"}>
          <FlatTasks
            chats={buckets[0]?.chats ?? []}
            drafts={drafts}
            list={view === "list"}
            showDraftProject={allProjects}
            foldPlace={foldPlace}
            archivedKey="flat/archived"
            render={view === "list" ? cards.row : cards.card}
          />
        </div>
      ) : view === "board" ? (
        <div className="board-columns">
          <StateColumns columns={buckets} drafts={drafts} showDraftProject={allProjects} foldPlace={foldPlace} render={cards.card} />
        </div>
      ) : (
        <div className="board-list">
          <ListSections columns={buckets} drafts={drafts} showDraftProject={allProjects} foldPlace={foldPlace} archivedKey="archived" render={cards.row} />
        </div>
      )}
    </BoardShell>
  );
}
