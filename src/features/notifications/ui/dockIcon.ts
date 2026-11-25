// Dock のアイコンに状態の数を描いて当てる（canvas。メインプロセスには canvas がないので画面で描き、PNG で渡す）
import { COUNTED_COLUMNS, type CountedColumn, type StateCounts } from "@/features/chat/ui";
import { badgeFontSize, digitColorFor, dockBadgeLayout } from "./dockIconModel";
import { getDockIconBase, setDockIcon } from "./native";

/** 丸の色の変数（画面の状態の点と同じ。tokens.css の --dot-*） */
const COLOR_VARS = { running: "--dot-running", unread: "--dot-unread", needs_input: "--dot-needs-input" } as const satisfies Record<CountedColumn, string>;

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

/** 元のアイコン（1 回だけ取って覚える。取れなければ null のまま、Dock は元のアイコン） */
let baseImage: Promise<HTMLImageElement | null> | null = null;

function loadBase(): Promise<HTMLImageElement | null> {
  baseImage ??= getDockIconBase().then(async (url) => {
    if (!url) return null;
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  });
  return baseImage.catch(() => null);
}

/** 描く色をいまのテーマから読む（canvas には CSS の変数が効かないので値にする。fillStyle に通して #rrggbb にそろえる） */
function readColors(ctx: CanvasRenderingContext2D): Record<CountedColumn, string> {
  const css = getComputedStyle(document.documentElement);
  const colors = {} as Record<CountedColumn, string>;
  for (const column of COUNTED_COLUMNS) {
    ctx.fillStyle = css.getPropertyValue(COLOR_VARS[column]).trim() || "#888888";
    colors[column] = String(ctx.fillStyle);
  }
  return colors;
}

/** 元のアイコンに丸を描いた PNG の data URL */
function draw(base: HTMLImageElement, counts: StateCounts): string | null {
  const size = base.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(base, 0, 0, size, size);
  const colors = readColors(ctx);
  ctx.font = `700 ${badgeFontSize(size)}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const badge of dockBadgeLayout(counts, size, (label) => ctx.measureText(label).width)) {
    const { x, y, width, height } = badge;
    // うすい影で、Dock の背景の色に関係なく丸の形が見えるようにする（影は丸にだけ付け、数字には付けない）
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = size * 0.02;
    ctx.shadowOffsetY = size * 0.006;
    ctx.fillStyle = colors[badge.column];
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = digitColorFor(colors[badge.column]);
    // 数字は目で見て真ん中に来るよう、わずかに下げる（middle の基準は字の箱の中央で、数字は上に寄って見える）
    ctx.fillText(badge.label, x + width / 2, y + height / 2 + height * 0.03);
  }
  return canvas.toDataURL("image/png");
}

/** 後から頼んだものだけを当てる（描くのを待つ間に数が変わったら、古い絵で上書きしない） */
let latest = 0;

/** 状態の数を Dock のアイコンに出す（3 つとも 0 なら元のアイコンに戻す。描けなければ元のまま） */
export async function showDockCounts(counts: StateCounts): Promise<void> {
  const id = ++latest;
  if (COUNTED_COLUMNS.every((column) => counts[column] === 0)) return setDockIcon(null);
  const base = await loadBase();
  if (id !== latest) return;
  setDockIcon(base ? draw(base, counts) : null);
}

/** 元のアイコンに戻す（画面を閉じるとき） */
export function resetDockIcon(): void {
  latest++;
  setDockIcon(null);
}
