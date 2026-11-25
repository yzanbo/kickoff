// Dock のアイコンに描く状態の数の丸の計算（位置・幅・文字・数字の色。描くのは dockIcon.ts。純粋に保つ）
import type { CountedColumn, StateCounts } from "@/features/chat/ui";
import { contrastRatio, parseColor, type Rgb } from "@shared/foundation/theme/color";
import { formatBadgeCount } from "@/foundation/ui/lib/format";

/** 状態ごとの隅（左上 = 作業中・右上 = 未読・左下 = 回答待ち。右下は Dock の起動中の点に近いので空ける） */
const CORNER_OF = { running: "top_left", unread: "top_right", needs_input: "bottom_left" } as const satisfies Record<CountedColumn, string>;

/** 描く順（重なったときに後のものが上。急ぐ回答待ちを最後にする） */
const DRAW_ORDER = ["running", "unread", "needs_input"] as const satisfies readonly CountedColumn[];

/**
 * アイコンの絵の外側の余白（画像の 1 辺に対する割合）。macOS のアイコンは 1024px のうち 824px に絵を置く決まりで、
 * Quick Look の縮小画像（dockIconBase）も同じ余白で返る
 */
const ART_MARGIN = 100 / 1024;
/** 丸の高さ（画像の 1 辺に対する割合） */
const BADGE_SIZE = 0.3;
/** 丸の中心を絵の角から内側へ寄せる量（丸の高さに対する割合。標準の赤い数字と同じく、絵の角に半分ほど掛かる） */
const BADGE_INSET = 0.28;
/** 数字の大きさ（丸の高さに対する割合） */
const FONT_RATIO = 0.62;
/** 2 桁以上で横に伸ばすときの、文字の左右の余白の合計（丸の高さに対する割合） */
const TEXT_PADDING = 0.55;

/** 数字の大きさ（px）。文字の幅を測るときと描くときに同じ値を使う */
export const badgeFontSize = (size: number): number => Math.round(size * BADGE_SIZE * FONT_RATIO);

export interface DockBadge {
  column: CountedColumn;
  label: string;
  /** 丸の左上と大きさ（px。画像の左上が 0） */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 1 辺 size px の画像に描く丸（0 の状態は描かない）。measure は数字の大きさ badgeFontSize(size) での文字の幅（px）。
 * 1 桁は円、2 桁以上は横に伸びる。右上は右端をそろえて左へ、左の 2 つは左端をそろえて右へ伸ばす
 */
export function dockBadgeLayout(counts: StateCounts, size: number, measure: (label: string) => number): DockBadge[] {
  const height = size * BADGE_SIZE;
  const near = size * ART_MARGIN + height * BADGE_INSET - height / 2;
  const far = size * (1 - ART_MARGIN) - height * BADGE_INSET + height / 2;
  return DRAW_ORDER.filter((column) => counts[column] > 0).map((column) => {
    const label = formatBadgeCount(counts[column]);
    const width = Math.max(height, measure(label) + height * TEXT_PADDING);
    const corner = CORNER_OF[column];
    const x = corner === "top_right" ? far - width : near;
    const y = corner === "bottom_left" ? far - height : near;
    return { column, label, x, y, width, height };
  });
}

/** 数字の色（白を基本に、白が読みにくい明るい丸では黒っぽい色） */
const LIGHT_DIGIT = "#ffffff";
const DARK_DIGIT = "#111111";
const WHITE: Rgb = [255, 255, 255];
/** 白い数字にしてよい対比の下限（WCAG の大きな文字の 3:1。丸の数字は太く大きい） */
const MIN_CONTRAST = 3;

/**
 * 丸に載せる数字の色: 白との対比が 3:1 あれば白、なければ黒っぽい色。
 * 半透明や読めない色は、下地との合成後の対比が分からないので白にする
 */
export function digitColorFor(background: string): string {
  const bg = parseColor(background);
  if (!bg || bg.alpha !== 1) return LIGHT_DIGIT;
  return contrastRatio(WHITE, bg.rgb) >= MIN_CONTRAST ? LIGHT_DIGIT : DARK_DIGIT;
}
