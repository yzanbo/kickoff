import { MessageCircle, Plus } from "lucide-react";
import { isCommonProject } from "@shared/projects/kinds";
import { Fragment, useEffect, useRef, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import type { Project } from "@shared/projects/types";
import { cx } from "@/foundation/ui/lib/cx";
import type { ProjectReorder } from "./useProjectNav";
import { useProjectChatDrops } from "./projectChatDrop";
import { useCommandKeyList } from "@/foundation/ui/commands";
import { COMMON_TONE, initialOf } from "@/features/projects/ui";
import type { StateCounts } from "@/features/chat/ui";
import { StateCornerCounts, stateCountsSummary } from "@/features/chatList/ui";

/**
 * 横スライドの下の行の、プロジェクトの丸の列（押すとそのプロジェクトへ・ドラッグで並べ替え・ほかのプロジェクトのチャットを落とすと確かめて移す・右クリックでメニュー）。
 * 丸の角に状態ごとの件数を出す（左上 = 作業中（青）・右上 = 未読（緑）・左下 = 回答待ち（オレンジ））。選んでいるプロジェクトの丸は、スクロールして見えるところに出す。
 * 先頭の共通の丸は灰色に吹き出しの印で、並べ替え・チャットの落とし先にならない（後ろとの間に区切り）
 */
export function WorkspaceDots({
  projects,
  index,
  countsOf,
  isArchived,
  reorder,
  axis,
  onGo,
  onMenu,
  onNewProject,
}: {
  projects: Project[];
  /** 選んでいるプロジェクトの位置 */
  index: number;
  /** プロジェクトごとの、作業中・回答待ち・未読のチャット数 */
  countsOf: (id: number) => StateCounts;
  /** しまった（アーカイブした）プロジェクトか（薄く出す） */
  isArchived: (id: number) => boolean;
  /** ドラッグでの並べ替え（最近動いた順・しまったものは並べ替えない） */
  reorder: ProjectReorder;
  /** 丸の並ぶ向き（横スライドは x・縦スライドは y。入る位置の線の向き） */
  axis: "x" | "y";
  onGo: (index: number) => void;
  /** 右クリック（プロジェクトのメニューを開く） */
  onMenu: (e: MouseEvent, project: Project) => void;
  onNewProject: () => void;
}) {
  const dotsRef = useRef<HTMLDivElement>(null);
  // n 番目のプロジェクトへ移るキー（⌃1〜⌃9）
  const dotKeys = useCommandKeyList("sidebar.projectN");
  // ほかのプロジェクトのチャットを丸へ落とすと、確かめてからそのプロジェクトへ移す（並べ替えのドラッグとは種類で分かれる）
  const chatDrop = useProjectChatDrops((id) => projects.find((p) => p.id === id));
  const dropProps = (id: number) => {
    const chat = chatDrop.propsFor(id);
    const order = reorder.dropProps(id);
    return {
      onDragOver: (e: DragEvent) => (chat.onDragOver(e), order.onDragOver?.(e)),
      onDragLeave: (e: DragEvent) => (chat.onDragLeave(e), order.onDragLeave?.(e)),
      onDrop: (e: DragEvent) => (chat.onDrop(e), order.onDrop?.(e)),
    };
  };
  useEffect(() => {
    dotsRef.current?.querySelector(".workspace-dot.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);
  // 右の並べ方の切り替えを除いた幅で、真ん中に並べる。入りきらなければ横にスクロール（マウスのホイールでも横に動く）
  return (
    <div
      ref={dotsRef}
      className="workspace-dots"
      role="tablist"
      aria-label="プロジェクトの切り替え"
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {projects.map((p, i) => {
        const counts = countsOf(p.id);
        const common = isCommonProject(p);
        const draggable = !isArchived(p.id) && !common;
        const summary = stateCountsSummary(counts);
        // 共通の丸と後ろの丸の間、固定したプロジェクトの丸と残りの丸の間に区切りを入れる
        const divider = i > 0 && (isCommonProject(projects[i - 1]) || (projects[i - 1].pinned && !p.pinned));
        const hints = common ? "右クリックでメニュー" : `${draggable ? "ドラッグで並べ替え・" : ""}チャットを落とすとこのプロジェクトへ移す・右クリックで固定・アーカイブ`;
        return (
          <Fragment key={p.id}>
          {divider && <span className="workspace-dots-divider" role="separator" aria-hidden />}
          <button
            role="tab"
            aria-selected={i === index}
            className={cx("workspace-dot", i === index && "active", p.pinned && "pinned", common && `common ${COMMON_TONE}`, isArchived(p.id) && "archived", chatDrop.over === p.id && (chatDrop.blockedAt(p.id) ? "chat-drop-blocked" : "chat-drop-over"))}
            style={{ "--hue": `${p.hue}` } as CSSProperties}
            {...reorder.attrsFor(p.id, axis)}
            title={`${p.name}${summary ? `（${summary}）` : ""}${p.pinned ? "（固定）" : ""}${isArchived(p.id) ? "（アーカイブ済み）" : ""}${dotKeys[i] ? `（${dotKeys[i]}）` : ""}（${hints}）`}
            onClick={() => onGo(i)}
            onContextMenu={(e) => onMenu(e, p)}
            draggable={draggable}
            {...reorder.handle(p.id)}
            {...dropProps(p.id)}
          >
            {common ? <MessageCircle size={14} aria-hidden /> : initialOf(p.name)}
            {/* 状態ごとの件数（色はカンバンの列と同じ）: 左上 = 作業中、右上 = 未読、左下 = 回答待ち */}
            <StateCornerCounts counts={counts} />
          </button>
          </Fragment>
        );
      })}
      <button className="workspace-dot add" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={onNewProject}>
        <Plus size={14} />
      </button>
    </div>
  );
}
