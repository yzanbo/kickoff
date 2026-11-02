import { FolderPlus, Plus } from "lucide-react";
import { useEffect } from "react";
import type { Run, RunGroup } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { cx } from "../../cx";
import { GROUP_FLASH_EVENT } from "../../groups";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import type { ReopenRoute } from "../../router";
import { DraftCards } from "../sidePanel/DraftCards";
import { useSidePanel } from "../sidePanel/useSidePanel";
import { ArchivedFold, splitArchived } from "./ArchivedFold";
import { BoardHeader } from "./BoardHeader";
import { BoardLanes, groupOfLane } from "./BoardLanes";
import { BoardShell } from "./BoardShell";
import type { BoardEntry } from "./boardColumns";
import { GroupColumnHead } from "./GroupColumnHead";
import { GroupCreateForm } from "./GroupCreateForm";
import { GroupLaneColumns } from "./GroupLaneColumns";
import { useBoardCards } from "./useBoardCards";
import { useBoardFocus } from "./useBoardFocus";
import { useGroupBoard } from "./useGroupBoard";

interface Props {
  projectId: number;
  runs: Run[];
  groups: RunGroup[];
  /** サイドバーのグループの＋から来たとき: そのグループで新しいチャットを始める */
  focus?: ReopenRoute;
  /** サイドバーのグループ名から来たとき: そのグループを表示して、背景と枠を少しのあいだハイライトする（1 秒ほどで消える。押し直すたびにやり直す。広がる光の動きは付けない） */
  highlight?: number;
}

/**
 * 自分で作ったグループを管理するボード。列 = グループ、カード = チャット。
 * カードをドラッグしてグループを移し、列の見出しをドラッグしてグループを並べ替える。
 */
export function GroupBoard({ projectId, runs, groups, focus, highlight }: Props) {
  const board = useGroupBoard({ projectId, runs, groups });
  const { view, menu, rename, over, reorder, dropProps } = board;
  // カンバンと同じく、カードを押すと右側から出てくるパネルで開く
  const panel = useSidePanel({ memoryKey: `groups:${projectId}`, runs, loaded: true, holdEsc: menu.isOpen });

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

  /** カード・リストの行で共通: クリックで右側に開く、ドラッグでグループを移す、右クリックでメニュー */
  const cards = useBoardCards({ panel, rename, menu, onOpen: panel.open, drag: { hint: "ドラッグでグループを移す" } });
  // チャットの状態（回答待ちの依頼は App が持つ）
  const { stateOf } = useRunStates();

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
  /** グループの見出し（ボードの列・リストで共通）。＋でそのグループに新しいチャット */
  const head = (g: RunGroup | null, count: number) => (
    <GroupColumnHead group={g} count={count} board={board} onNewChat={() => panel.openNew(g ? { projectId, group: g.id } : { projectId })} />
  );

  // スイムレーン: グループごとの段に、下書き・作業中・回答待ち・確認待ち・完了の列を並べる
  const entries: BoardEntry[] = runs
    .filter(board.search.matches)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((run) => ({ run, state: stateOf(run) }));

  const header = (
    <BoardHeader
      query={board.query}
      onQuery={board.setQuery}
      organize={
        <button className="btn btn-sm" onClick={() => board.setCreating(true)}>
          <FolderPlus size={13} /> <span className="btn-label">グループを作成</span>
        </button>
      }
      primary={
        <button className="btn btn-sm" onClick={() => panel.openNew({ projectId })} title="右側で新しいチャットを始める">
          <Plus size={13} /> <span className="btn-label">新規</span>
        </button>
      }
      view={view}
      onView={board.setView}
      lanesView
      panel={panel}
    />
  );

  return (
    <BoardShell
      className="group-board"
      header={header}
      error={board.error}
      panel={panel}
      onNewChat={() => panel.openNew({ projectId })}
      projectId={projectId}
      menu={menu}
      onOpenRun={panel.open}
      rename={rename}
      onError={board.setError}
      after={board.groupMenu.menu}
    >
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
            <GroupLaneColumns entries={list} foldKey={`groups:${projectId}:${key}`} groupId={groupOfLane(key)} projectId={projectId} panel={panel} renderCard={cards.card} />
          )}
        />
      ) : view === "board" ? (
        <div className="board-columns">
          {sections.map((g) => {
            // アーカイブ済みは、グループのいちばん下の閉じたまとまりに分ける（件数はアーカイブしていないものだけ）
            const [members, archived] = splitArchived(board.membersOf(g?.id ?? null), (r) => r);
            const { key, ...props } = sectionProps(g, "board-column");
            const card = (run: Run) => cards.card({ run, state: stateOf(run) });
            return (
              <section key={key} {...props}>
                {head(g, members.length)}
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
          <section className="board-column group-add-column">
            <GroupCreateForm board={board} />
          </section>
        </div>
      ) : (
        <div className="board-list">
          {sections.map((g) => {
            const [members, archived] = splitArchived(board.membersOf(g?.id ?? null), (r) => r);
            const { key, ...props } = sectionProps(g, "list-group");
            const row = (run: Run) => cards.row({ run, state: stateOf(run) });
            return (
              <section key={key} {...props}>
                {head(g, members.length)}
                {drafts(g)}
                {members.length === 0 && <p className="column-empty">{emptyText(g)}</p>}
                {members.map(row)}
                <ArchivedFold foldKey={`groups:${projectId}:list:${key}`} count={archived.length}>
                  {archived.map(row)}
                </ArchivedFold>
              </section>
            );
          })}
          <section className="list-group group-add-row">
            <GroupCreateForm board={board} />
          </section>
        </div>
      )}
    </BoardShell>
  );
}
