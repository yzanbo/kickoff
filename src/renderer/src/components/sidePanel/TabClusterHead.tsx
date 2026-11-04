import { useRef, useState, type CSSProperties } from "react";
import type { Run } from "../../../../core/types";
import { api } from "../../api";
import { useRunStates } from "../../approvalsContext";
import { promptDialog } from "../../dialogs";
import { confirmDeleteGroup } from "../../groups";
import { reportFailure } from "../../runActions";
import { MenuItem, PopupMenu, clampToViewport } from "../PopupMenu";
import { cx } from "../../cx";
import { Chevron } from "../Chevron";
import { useDismiss } from "../../hooks/useDismiss";
import { stateCounts } from "../../runState";
import { StateCornerCounts, stateCountsSummary } from "../StateCornerCounts";
import { StateRunsPopover, runsByState } from "../StateRunsPopover";
import type { TabCluster } from "./tabClusters";
import type { NewChatTarget } from "./useSidePanel";

/** 一覧の幅（state-runs.css の width と同じ）と、画面の端から空ける幅 */
const POPOVER_WIDTH = 380;
const EDGE = 8;

/**
 * タブのまとまりの頭（まとまりの色の名前の札と、中のタブの数）。札の角に、そのまとまり（グループ・作業場所）のチャットの状態ごとの数を重ね、
 * 札を押すと、まとまりのチャットを状態ごと（作業中 → 回答待ち → 未読）にまとめた一覧を開く（画面の見出しの状態ごとの数と同じ一覧。行でそのチャットのタブを開く）。
 * runs が undefined の「その他」（ブラウザなど）は押せない札。まとまりはプロジェクトごとなので、一覧の行にプロジェクト名は出さない。
 * まとめないときも、タブの列の左端に「チャット」の札（all）として置き、パネルのチャット全体の状態ごとの数と一覧を出す（タブの数は出さない）。
 * 札の右クリック（プロジェクトの分かるまとまりだけ）: このグループで新しいチャット（グループ別のとき）・新しいグループを作成・
 * このグループを削除（自分で作ったグループのとき。サイドバーと同じく確かめてから。中のチャットはグループなしに戻る）。
 * 自分で作ったグループの札はつかんで並べ替えられる（dragProps。サイドバーのグループの並びも同じに変わる）。
 * 札の右の数は、まとまりのタブを畳む・開くボタン（onToggleCollapsed。ブラウザのタブのグループを畳むのと同じ。右クリックにも同じ項目）。
 * 数はサイドバーの見出しと同じ数え方のチャットの数（count。表示だけ消したタブ・下書きは数えない）で、渡さなければタブの数
 */
export function TabClusterHead({
  cluster,
  runs,
  onOpen,
  onNewChat,
  all = false,
  popoverTitle = `${cluster.label}のチャット`,
  collapsed = false,
  onToggleCollapsed,
  dragProps,
  count = cluster.tabs.length,
}: {
  cluster: TabCluster;
  runs: Run[] | undefined;
  onOpen: (run: Run) => void;
  /** 札の右クリックの「このグループで新しいチャット」 */
  onNewChat?: (target: NewChatTarget) => void;
  all?: boolean;
  popoverTitle?: string;
  /** まとまりのタブを畳んでいるか（表示中のタブだけを残す） */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** 札をつかんでグループの並びを入れ替える（自分で作ったグループだけ。useClusterReorder の handle） */
  dragProps?: { draggable: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
  /** 札の右に出す数（サイドバーの見出しと同じ、まとまりのチャットの数） */
  count?: number;
}) {
  const { stateOf, pending } = useRunStates();
  const [at, setAt] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, () => setAt(null), { enabled: at !== null });
  // 札の右クリックのメニュー（プロジェクトの分かるまとまりだけ。「その他」「チャット」の札では出さない）
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const projectId = cluster.projectId;
  const openMenu = (e: React.MouseEvent) => {
    if (projectId === undefined) return;
    // タブの列の何もないところの右クリック（ツールバーの置き方のメニュー）に渡さない
    e.preventDefault();
    e.stopPropagation();
    setMenu(clampToViewport(e.clientX, e.clientY, 240, 170));
  };
  const createGroup = async () => {
    if (projectId === undefined) return;
    const name = await promptDialog({ title: "新しいグループ", label: "グループ名", placeholder: "例: コードレビュー", confirmLabel: "作成" });
    if (name?.trim()) await api.createGroup(projectId, name.trim()).catch(reportFailure("グループを作成できませんでした"));
  };
  const groupId = cluster.groupId;
  const deleteGroup = async () => {
    if (typeof groupId !== "number") return;
    if (await confirmDeleteGroup({ name: cluster.groupName ?? cluster.label })) await api.deleteGroup(groupId).catch(reportFailure("グループを削除できませんでした"));
  };
  const counts = runs ? stateCounts(runs, pending) : undefined;
  const countTitle = runs ? `チャット ${count} 件（サイドバーの見出しと同じ数）` : `タブ ${count} 個`;
  const summary = counts ? stateCountsSummary(counts) : "";
  const title = summary ? `${cluster.title ?? cluster.label}（${summary}）` : cluster.title;
  const name = (
    <>
      <span className="panel-tab-cluster-text">{cluster.label}</span>
      {counts && <StateCornerCounts counts={counts} />}
    </>
  );
  // タブの列は横にスクロールして中身を切り取るので、一覧は画面に固定して札のすぐ下に出す（右の端からはみ出さないよう寄せる）
  const toggle = () => {
    if (at) return setAt(null);
    const r = ref.current!.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth * 0.8);
    setAt({ top: r.bottom + 6, left: Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE)) });
  };
  return (
    <span ref={ref} className={cx("panel-tab-cluster", all && "all", dragProps && "draggable")} onContextMenu={openMenu} {...dragProps}>
      {runs ? (
        <button type="button" className="panel-tab-cluster-name" title={`${title ?? cluster.label}。押すと状態ごとのチャットを一覧する`} aria-expanded={at !== null} onClick={toggle}>
          {name}
        </button>
      ) : (
        <span className="panel-tab-cluster-name" title={title}>
          {name}
        </span>
      )}
      {!all &&
        (onToggleCollapsed ? (
          <button
            type="button"
            className="panel-tab-cluster-count panel-tab-cluster-fold"
            aria-expanded={!collapsed}
            title={`${countTitle}。押すとタブを${collapsed ? "表示する" : "畳む（表示中のタブは残す）"}`}
            onClick={onToggleCollapsed}
          >
            <Chevron open={!collapsed} size={11} />
            {count}
          </button>
        ) : (
          <span className="panel-tab-cluster-count" title={countTitle}>
            {count}
          </span>
        ))}
      {menu && projectId !== undefined && (
        <PopupMenu x={menu.x} y={menu.y} label={`「${cluster.label}」の操作`} onClose={() => setMenu(undefined)}>
          {onToggleCollapsed && cluster.tabs.length > 0 && (
            <>
              <MenuItem onSelect={onToggleCollapsed}>{collapsed ? "タブを表示する" : "タブを畳む"}</MenuItem>
              <div className="menu-separator" role="separator" />
            </>
          )}
          {cluster.groupId !== undefined && onNewChat && (
            <MenuItem onSelect={() => onNewChat({ projectId, group: cluster.groupId ?? undefined })}>
              {cluster.groupId === null ? "グループなしで新しいチャット" : `「${cluster.label}」で新しいチャット`}
            </MenuItem>
          )}
          <MenuItem onSelect={() => void createGroup()} title="このプロジェクトに、自分で使うグループを作ります">
            新しいグループを作成…
          </MenuItem>
          {typeof groupId === "number" && (
            <>
              <div className="menu-separator" role="separator" />
              <MenuItem danger onSelect={() => void deleteGroup()} title="グループを消します（中のチャットは消えず、グループなしに戻ります）">
                「{cluster.groupName ?? cluster.label}」を削除…
              </MenuItem>
            </>
          )}
        </PopupMenu>
      )}
      {at && runs && (
        <StateRunsPopover
          title={popoverTitle}
          // まとまりのチャットをすべて（既読・アーカイブ済みも）状態ごとに並べる
          sections={runsByState(runs, stateOf, { all: true })}
          emptyText="チャットはありません"
          onOpen={onOpen}
          onClose={() => setAt(null)}
          className="cluster-runs-popover"
          style={at}
        />
      )}
    </span>
  );
}
