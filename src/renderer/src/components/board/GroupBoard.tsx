import { Folder, FolderPlus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { agentStateOf } from "../../../../core/board";
import type { Approval, ProjectSummary, Run, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { useChatSearch } from "../../chatSearch";
import { cx } from "../../cx";
import { confirmDeleteGroup, startRunDrag, useGroupDrop, GROUP_FLASH_EVENT } from "../../groups";
import { useActionError } from "../../hooks/useActionError";
import { useRunRename } from "../../hooks/useRunRename";
import { useStoredChoice } from "../../hooks/useStoredState";
import type { ReopenRoute } from "../../router";
import { GROUP_VIEW_KEY } from "../../storageKeys";
import { CardMenu } from "../menus/CardMenu";
import { ErrorText } from "../ErrorText";
import { useGroupMenu } from "../menus/GroupMenu";
import { IconButton } from "../IconButton";
import { InlineName } from "../InlineName";
import { DraftCards } from "../sidePanel/DraftCards";
import { SidePanel } from "../sidePanel/SidePanel";
import { terminalTargets, useSidePanel } from "../sidePanel/useSidePanel";
import { BoardHeader, type BoardView } from "./BoardHeader";
import { BoardLanes, groupOfLane } from "./BoardLanes";
import type { BoardEntry } from "./boardColumns";
import { GroupLaneColumns } from "./GroupLaneColumns";
import { RunCardContent, RunRowContent } from "./RunCard";
import { runCardProps } from "./runCardProps";
import { useBoardFocus } from "./useBoardFocus";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { ArchivedFold, splitArchived } from "./ArchivedFold";

interface Props {
  projectId: number;
  /** すべてのプロジェクト（タブの列の＋のターミナルの開く場所に使う） */
  projects: ProjectSummary[];
  runs: Run[];
  groups: RunGroup[];
  approvals: Approval[];
  /** サイドバーのグループの＋から来たとき: そのグループで新しいチャットを始める */
  focus?: ReopenRoute;
  /** サイドバーのグループ名から来たとき: そのグループを表示して、背景と枠を少しのあいだハイライトする（1 秒ほどで消える。押し直すたびにやり直す。広がる光の動きは付けない） */
  highlight?: number;
}

/**
 * 自分で作ったグループを管理するボード。列 = グループ、カード = チャット。
 * カードをドラッグしてグループを移し、列の見出しをドラッグしてグループを並べ替える。
 */
export function GroupBoard({ projectId, projects, runs, groups, approvals, focus, highlight }: Props) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  const [dragRun, setDragRun] = useState<number>();
  const { error, setError, guard } = useActionError();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useRunRename(setError);
  const [menu, setMenu] = useState<{ x: number; y: number; run: Run } | null>(null);
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  // ボード（列 = グループ）/ リスト / スイムレーン（段 = グループ、列 = 下書きと状態）の切り替え。カンバンとは別に覚える
  const [view, setView] = useStoredChoice<BoardView>(GROUP_VIEW_KEY, ["board", "list", "lanes"], "board");
  // カンバンと同じく、カードを押すと右側から出てくるパネルで開く
  const panel = useSidePanel({ memoryKey: `groups:${projectId}`, runs, loaded: true, holdEsc: menu !== null });

  // サイドバーのグループの＋から来たら、そのグループで新しいチャットを右側に開く（同じ＋を押し直したときも）
  useBoardFocus(focus, (target) => {
    if (target.name === "newChat") panel.openNew({ projectId, section: target.section, group: target.group });
  });

  // サイドバーで選んだグループが見えるところまでスクロールする
  useEffect(() => {
    if (highlight === undefined) return;
    const timer = setTimeout(() => {
      document.querySelector(`[data-group-id="${highlight}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 50);
    return () => clearTimeout(timer);
  }, [highlight, view]);
  // すでに表示しているグループをサイドバーでもう一度押したとき: ハイライトの動きを始めからやり直し、見えるところまでスクロールする
  useWindowEvent(GROUP_FLASH_EVENT, (e) => {
    const id = (e as CustomEvent<number>).detail;
    if (id !== highlight) return;
    const el = document.querySelector(`[data-group-id="${id}"]`);
    if (!el) return;
    el.classList.remove("highlighted");
    void el.getBoundingClientRect(); // 外したことを反映させてから付け直す（動きをやり直す）
    el.classList.add("highlighted");
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });

  const groupIds = new Set(groups.map((g) => g.id));
  const membersOf = (groupId: number | null) =>
    runs
      .filter((r) => (groupId === null ? r.group_id === null || !groupIds.has(r.group_id) : r.group_id === groupId))
      .filter(search.matches)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const removeGroup = async (group: RunGroup) => {
    if (await confirmDeleteGroup(group)) void guard(() => api.deleteGroup(group.id));
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });

  // 列をドロップ先にする。チャットはその列のグループへ、グループの列はその位置へ並べ替える
  const { reorder, over, dropProps } = useGroupDrop({
    groups,
    runs,
    onReorder: (ids) => void guard(() => api.reorderGroups(projectId, ids)),
    onMoveRun: (run, groupId) => void guard(() => api.setRunGroup(run.id, groupId)),
  });

  /** カード・リストの行で共通: クリックで右側に開く、ドラッグでグループを移す、右クリックでメニュー */
  const cardProps = (run: Run) =>
    runCardProps(run, {
      dragHint: "ドラッグでグループを移す",
      onOpen: () => panel.open(run),
      onMenu: (at) => setMenu({ ...at, run }),
      onDragStart: (e) => {
        startRunDrag(e, run.id);
        setDragRun(run.id);
      },
      onDragEnd: () => setDragRun(undefined),
      editing: Boolean(rename.editorFor(run)),
    });
  const cardClass = (run: Run) => cx(dragRun === run.id && "dragging", panel.isShowing(run.id) && "selected", panel.hasTab(run.id) && "in-tab");
  const stateOf = (run: Run) => agentStateOf(run, approvals.some((a) => a.run_id === run.id));

  /** グループの見出し（ボードの列・リストで共通）。group が null なら「グループなし」 */
  const renderHead = (group: RunGroup | null, count: number) => {
    if (!group) {
      return (
        <header className="column-head">
          <span className="column-title muted">グループなし</span>
          <span className="column-count">{count}</span>
          <span className="spacer" />
          <IconButton icon={Plus} label="グループなしで新しいチャット" title="新しいチャット" onClick={() => panel.openNew({ projectId })} />
        </header>
      );
    }
    return (
      <header
        className="column-head group-column-head"
        draggable={renaming !== group.id}
        title="ドラッグでグループを並べ替える（右クリックでメニュー）"
        onContextMenu={(e) => groupMenu.openFor(group, e)}
        {...reorder.handle(group.id)}
      >
        <Folder size={13} className="muted" aria-hidden />
        {renaming === group.id ? (
          <InlineName
            initial={group.name}
            onSubmit={(name) => {
              setRenaming(undefined);
              void guard(() => api.renameGroup(group.id, name));
            }}
            onCancel={() => setRenaming(undefined)}
          />
        ) : (
          <span className="column-title" onDoubleClick={() => setRenaming(group.id)}>
            {group.name}
          </span>
        )}
        {/* 名前の編集中は、ほかの操作を隠す */}
        {renaming !== group.id && (
          <>
            <span className="column-count">{count}</span>
            <IconButton
              icon={Plus}
              label={`${group.name} に新しいチャット`}
              title={`「${group.name}」に新しいチャット`}
              className="group-add-chat"
              onClick={() => panel.openNew({ projectId, group: group.id })}
            />
            {groupMenu.button(group)}
          </>
        )}
      </header>
    );
  };

  const createForm = creating ? (
    <header className="column-head">
      <Folder size={13} className="muted" aria-hidden />
      <InlineName
        placeholder="グループ名（例: コードレビュー）"
        onSubmit={(name) => {
          setCreating(false);
          void guard(() => api.createGroup(projectId, name));
        }}
        onCancel={() => setCreating(false)}
      />
    </header>
  ) : (
    <button className="group-add" onClick={() => setCreating(true)}>
      <FolderPlus size={14} /> グループを作成
    </button>
  );

  const sections: (RunGroup | null)[] = [null, ...groups];
  const sectionProps = (g: RunGroup | null, base: string) => ({
    key: g?.id ?? "none",
    className: cx(base, over === (g?.id ?? "none") && "drop-target", g ? reorder.classFor(g.id) : "ungrouped", g !== null && g.id === highlight && "highlighted"),
    "data-group-id": g?.id,
    ...dropProps(g?.id ?? null),
  });
  const emptyText = (g: RunGroup | null) => (g ? "チャットをここへドラッグ" : "なし");
  // その列（グループ）で入力中の新しいチャット
  const drafts = (g: RunGroup | null) => <DraftCards panel={panel} filter={(t) => t.projectId === projectId && (t.group ?? null) === (g?.id ?? null)} />;

  // スイムレーン: グループごとの段に、下書き・作業中・回答待ち・確認待ち・完了の列を並べる
  const entries: BoardEntry[] = runs
    .filter(search.matches)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((run) => ({ run, state: stateOf(run) }));

  return (
    <div className="board group-board">
      <BoardHeader
        query={query}
        onQuery={setQuery}
        organize={
          <button className="btn btn-sm" onClick={() => setCreating(true)}>
            <FolderPlus size={13} /> <span className="btn-label">グループを作成</span>
          </button>
        }
        primary={
          <button className="btn btn-sm" onClick={() => panel.openNew({ projectId })} title="右側で新しいチャットを始める">
            <Plus size={13} /> <span className="btn-label">新規</span>
          </button>
        }
        view={view}
        onView={setView}
        lanesView
        panel={panel}
      />
      <ErrorText message={error} className="board-error" />

      <div {...panel.body}>
        <div className="board-main">
          {view === "lanes" ? (
            // 段（グループ）へカードをドラッグすると、そのグループへ移す
            <BoardLanes
              kind="group"
              boardKey={`groups:${projectId}`}
              entries={entries}
              projects={[]}
              groups={groups}
              showEmpty
              laneProps={(key) => {
                const groupId = groupOfLane(key);
                return { ...dropProps(groupId), className: cx(over === (groupId ?? "none") && "drop-target") };
              }}
              renderColumns={(list, key) => (
                <GroupLaneColumns
                  entries={list}
                  foldKey={`groups:${projectId}:${key}`}
                  groupId={groupOfLane(key)}
                  projectId={projectId}
                  panel={panel}
                  renderCard={({ run, state }) => (
                    <article key={run.id} className={cx("board-card", cardClass(run))} {...cardProps(run)}>
                      <RunCardContent run={run} state={state} rename={rename.editorFor(run)} />
                    </article>
                  )}
                />
              )}
            />
          ) : view === "board" ? (
            <div className="board-columns">
              {sections.map((g) => {
                // アーカイブ済みは、グループのいちばん下の閉じたまとまりに分ける（件数はアーカイブしていないものだけ）
                const [members, archived] = splitArchived(membersOf(g?.id ?? null), (r) => r);
                const { key, ...props } = sectionProps(g, "board-column");
                const card = (run: Run) => (
                  <article key={run.id} className={cx("board-card", cardClass(run))} {...cardProps(run)}>
                    <RunCardContent run={run} state={stateOf(run)} rename={rename.editorFor(run)} />
                  </article>
                );
                return (
                  <section key={key} {...props}>
                    {renderHead(g, members.length)}
                    <div className="column-cards">
                      {drafts(g)}
                      {members.length === 0 && <p className="column-empty">{emptyText(g)}</p>}
                      {members.map(card)}
                      <ArchivedFold foldKey={`groups:${projectId}:board:${key}`} count={archived.length}>
                        {archived.map(card)}
                      </ArchivedFold>
                    </div>
                  </section>
                );
              })}
              <section className="board-column group-add-column">{createForm}</section>
            </div>
          ) : (
            <div className="board-list">
              {sections.map((g) => {
                const [members, archived] = splitArchived(membersOf(g?.id ?? null), (r) => r);
                const { key, ...props } = sectionProps(g, "list-group");
                const row = (run: Run) => (
                  <div key={run.id} className={cx("list-row", cardClass(run))} {...cardProps(run)}>
                    <RunRowContent run={run} state={stateOf(run)} rename={rename.editorFor(run)} />
                  </div>
                );
                return (
                  <section key={key} {...props}>
                    {renderHead(g, members.length)}
                    {drafts(g)}
                    {members.length === 0 && <p className="column-empty">{emptyText(g)}</p>}
                    {members.map(row)}
                    <ArchivedFold foldKey={`groups:${projectId}:list:${key}`} count={archived.length}>
                      {archived.map(row)}
                    </ArchivedFold>
                  </section>
                );
              })}
              <section className="list-group group-add-row">{createForm}</section>
            </div>
          )}
        </div>
        <SidePanel panel={panel} onNewChat={() => panel.openNew({ projectId })} terminals={terminalTargets(projects, projectId)} />
      </div>

      {groupMenu.menu}
      {menu && <CardMenu {...menu} onOpenPanel={panel.open} onRename={rename.start} onClose={() => setMenu(null)} onError={setError} />}
    </div>
  );
}
