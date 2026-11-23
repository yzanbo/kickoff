import { cx } from "@/foundation/ui/lib/cx";
import { COLUMN_LOOKS } from "@shared/chat/stateLooks";
import type { StateCounts } from "@/features/chat/ui/state/chatState";

/** 角に出す順（左上 = 作業中・右上 = 未読・左下 = 回答待ち）と、data-state の値（styles/types/status.css） */
const CORNERS = [
  ["running", "running"],
  ["unread", "unread"],
  ["needs_input", "needs-input"],
] as const;

/** 状態ごとの件数を「作業中 2・未読 1」の文にする（title・aria-label に使う。0 のものは出さない） */
export function stateCountsSummary(counts: StateCounts): string {
  return CORNERS.filter(([c]) => counts[c] > 0)
    .map(([c]) => `${COLUMN_LOOKS[c].label} ${counts[c]}`)
    .join("・");
}

/**
 * 状態ごとのチャット数を、置いた要素の角に小さな丸で重ねる（左上 = 作業中（青）・右上 = 未読（緑）・左下 = 回答待ち（オレンジ）。
 * 色はカンバンの列と同じ。0 のものは出さない）。サイドバーのプロジェクトの丸・プロジェクトの画面の左のボードのタブ・右のパネルのタブのまとまりの札で共通。
 * 置く要素は position: relative にする。丸の縁の色は、後ろの地に合わせて --corner-ring で変える（初めは --bg）。
 * inline: 角に重ねず、文の後ろに色付きの数を並べる（横並びのタブ）
 */
export function StateCornerCounts({ counts, inline = false }: { counts: StateCounts; inline?: boolean }) {
  const shown = CORNERS.filter(([c]) => counts[c] > 0);
  if (shown.length === 0) return null;
  return (
    <span className={cx("corner-counts", inline && "inline")}>
      {shown.map(([c, cls]) => (
        <span key={c} className="corner-count" data-state={cls} aria-label={`${COLUMN_LOOKS[c].label} ${counts[c]} 件`}>
          {counts[c]}
        </span>
      ))}
    </span>
  );
}
