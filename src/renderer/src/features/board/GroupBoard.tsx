import { FolderPlus, Plus } from "lucide-react";
import { useEffect } from "react";
import type { ChatGroup } from "@shared/types";
import { cx } from "@/lib/cx";
import { GROUP_FLASH_EVENT } from "@/features/group/groups";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import type { ReopenRoute } from "@/app/router";
import { useBoardPanel } from "@/features/panel/board/useBoardPanel";
import { ArchiveFilterSelect } from "./ArchiveFilterSelect";
import { BoardColumnsToggle } from "./BoardColumnsToggle";
import { BoardHeader } from "./BoardHeader";
import { BoardLanes, LaneSelect, type BoardLane } from "./BoardLanes";
import { BoardShell } from "./BoardShell";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import { GroupCreateForm } from "./GroupCreateForm";
import { GroupSections } from "./GroupSections";
import { StateColumns } from "./StateColumn";
import { useBoardCards } from "./useBoardCards";
import { useGroupBoard } from "./useGroupBoard";

/** グループのボードの段の分け方（グループだけ） */
const GROUP_LANES: readonly BoardLane[] = ["group"];

interface Props {
  projectId: number;
  groups: ChatGroup[];
  /** サイドバーのグループの＋から来たとき: そのグループで新しいチャットを始める */
  focus?: ReopenRoute;
  /** サイドバーのグループ名から来たとき: そのグループを表示して、背景と枠を少しのあいだハイライトする（1 秒ほどで消える。押し直すたびにやり直す。広がる光の動きは付けない） */
  highlight?: number;
}

/**
 * 自分で作ったグループを管理するボード。列 = グループ、カード = チャット。
 * カードをドラッグしてグループを移し、列の見出しをドラッグしてグループを並べ替える。
 */
export function GroupBoard({ projectId, groups, focus, highlight }: Props) {
  const board = useGroupBoard({ projectId, groups });
  const { view, split, menu, rename, over, dropProps } = board;
  // カンバンと同じく、カードを押すと右側から出てくるパネルで開き、URL もそのチャットにする（下書きもカンバンと同じく、このボードのパネルとチャット欄のもの）。
  // サイドバー・検索から開いたチャット、サイドバーのグループの＋から来た新しいチャットも右側に開く（同じ＋を押し直したときも）
  const { panel, drafts, frame, body, open } = useBoardPanel({ projectId, holdEsc: menu.isOpen, focus, tab: "groups" });

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
  const cards = useBoardCards({ panel, rename, menu, onOpen: open, drag: { hint: "ドラッグでグループを移す" } });
  // グループごとのまとまり（自分で作ったグループ → グループなし。チャットのないグループも出す）。段に分けるときは、その中を状態の列に分ける
  // （列・段には、そのグループで始める下書きも入る）
  const buckets = useChatBuckets(board.shown, { by: ["group", "status"], project: projectId, drafts, keepEmpty: true });
  /** アーカイブ済み・段の開閉を覚える場所（ボードごと） */
  const foldPlace = `board:groups:${projectId}`;

  const header = (
    <BoardHeader
      query={board.query}
      onQuery={board.setQuery}
      filters={<ArchiveFilterSelect value={board.archive} onChange={board.setArchive} />}
      organize={
        <button className="btn btn-sm" onClick={() => board.setCreating(true)}>
          <FolderPlus size={13} /> <span className="btn-label">グループを作成</span>
        </button>
      }
      primary={
        <button className="btn btn-sm" onClick={panel.startNewChat} title="右側で新しいチャットを始める">
          <Plus size={13} /> <span className="btn-label">新規</span>
        </button>
      }
      view={view}
      onView={board.setView}
      // 段の分け方はグループだけ（段に分けると、列は下書き＋状態）。リストはもともとグループごとのまとまりなので出さない
      viewOptions={view === "board" && <LaneSelect value={split ? "group" : "none"} options={GROUP_LANES} onChange={(next) => board.setSplit(next !== "none")} />}
      columns={<BoardColumnsToggle projectId={projectId} value="groups" />}
      panel={panel}
    />
  );

  return (
    <BoardShell
      className="group-board"
      header={header}
      error={board.error}
      panel={panel}
      frame={frame}
      body={body}
      menu={menu}
      onOpenChat={open}
      rename={rename}
      onError={board.setError}
      after={board.groupMenu.menu}
    >
      {view === "board" && split ? (
        // 段（グループ）へカードをドラッグすると、そのグループへ移す
        <BoardLanes
          lanes={buckets}
          foldPlace={foldPlace}
          laneProps={(lane) => {
            const groupId = lane.group?.id ?? null;
            return { ...dropProps(groupId), className: cx(over === (groupId ?? "none") && "drop-target") };
          }}
        >
          {(lane) => <StateColumns columns={lane.children ?? []} drafts={lane.drafts} foldPlace={foldPlace} render={cards.card} />}
        </BoardLanes>
      ) : view === "board" ? (
        <div className="board-columns">
          <GroupSections projectId={projectId} buckets={buckets} board={board} panel={panel} render={cards.card} foldPlace={foldPlace} highlight={highlight} />
          <section className="board-column group-add-column">
            <GroupCreateForm board={board} />
          </section>
        </div>
      ) : (
        <div className="board-list">
          <GroupSections
            projectId={projectId}
            buckets={buckets}
            board={board}
            panel={panel}
            render={cards.row}
            foldPlace={foldPlace}
            highlight={highlight}
            list
            beforeUngrouped={
              <section className="list-group group-add-row">
                <GroupCreateForm board={board} />
              </section>
            }
          />
        </div>
      )}
    </BoardShell>
  );
}
