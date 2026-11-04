import { useRef, useState, type CSSProperties } from "react";
import type { Run } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { cx } from "../../cx";
import { useDismiss } from "../../hooks/useDismiss";
import { stateCounts } from "../../runState";
import { StateCornerCounts, stateCountsSummary } from "../StateCornerCounts";
import { StateRunsPopover, runsByState } from "../StateRunsPopover";
import type { TabCluster } from "./tabClusters";

/** 一覧の幅（state-runs.css の width と同じ）と、画面の端から空ける幅 */
const POPOVER_WIDTH = 380;
const EDGE = 8;

/**
 * タブのまとまりの頭（まとまりの色の名前の札と、中のタブの数）。札の角に、そのまとまり（グループ・作業場所）のチャットの状態ごとの数を重ね、
 * 札を押すと、まとまりのチャットを状態ごと（作業中 → 回答待ち → 未読）にまとめた一覧を開く（画面の見出しの状態ごとの数と同じ一覧。行でそのチャットのタブを開く）。
 * runs が undefined の「その他」（ブラウザなど）は押せない札。まとまりはプロジェクトごとなので、一覧の行にプロジェクト名は出さない。
 * まとめないときも、タブの列の左端に「チャット」の札（all）として置き、パネルのチャット全体の状態ごとの数と一覧を出す（タブの数は出さない）
 */
export function TabClusterHead({
  cluster,
  runs,
  onOpen,
  all = false,
  popoverTitle = `${cluster.label}のチャット`,
}: {
  cluster: TabCluster;
  runs: Run[] | undefined;
  onOpen: (run: Run) => void;
  all?: boolean;
  popoverTitle?: string;
}) {
  const { stateOf, pending } = useRunStates();
  const [at, setAt] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, () => setAt(null), { enabled: at !== null });
  const counts = runs ? stateCounts(runs, pending) : undefined;
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
    <span ref={ref} className={cx("panel-tab-cluster", all && "all")}>
      {runs ? (
        <button type="button" className="panel-tab-cluster-name" title={`${title ?? cluster.label}。押すと状態ごとのチャットを一覧する`} aria-expanded={at !== null} onClick={toggle}>
          {name}
        </button>
      ) : (
        <span className="panel-tab-cluster-name" title={title}>
          {name}
        </span>
      )}
      {!all && (
        <span className="panel-tab-cluster-count" title={`タブ ${cluster.tabs.length} 個`}>
          {cluster.tabs.length}
        </span>
      )}
      {at && runs && (
        <StateRunsPopover
          title={popoverTitle}
          sections={runsByState(runs, stateOf)}
          onOpen={onOpen}
          onClose={() => setAt(null)}
          className="cluster-runs-popover"
          style={at}
        />
      )}
    </span>
  );
}
