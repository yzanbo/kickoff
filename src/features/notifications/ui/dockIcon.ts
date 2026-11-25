// Dock のアイコンに状態の数を描いて当てる（canvas。メインプロセスには canvas がないので画面で描き、PNG で渡す）
import type { CountedColumn, StateCounts } from "@/features/chat/ui";
import { badgeFontSize, digitColorFor, dockBadgeLayout } from "./dockIconModel";
import { createDockIconUpdater } from "./dockIconUpdater";
import { getDockIconBase, setDockIcon } from "./native";

/** 丸の色の変数（画面の状態の点と同じ。tokens.css の --dot-*） */
const COLOR_VARS = { running: "--dot-running", unread: "--dot-unread", needs_input: "--dot-needs-input" } as const satisfies Record<CountedColumn, string>;

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

async function loadBase(): Promise<HTMLImageElement | null> {
  const url = await getDockIconBase();
  if (!url) return null;
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
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
  const css = getComputedStyle(document.documentElement);
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
    // canvas では CSS 変数が使えないので、テーマの値を読み、fillStyle が正規化した色で対比も計算する
    ctx.fillStyle = "#888888";
    ctx.fillStyle = css.getPropertyValue(COLOR_VARS[badge.column]).trim();
    const background = ctx.fillStyle;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = digitColorFor(background);
    // 数字は目で見て真ん中に来るよう、わずかに下げる（middle の基準は字の箱の中央で、数字は上に寄って見える）
    ctx.fillText(badge.label, x + width / 2, y + height / 2 + height * 0.03);
  }
  return canvas.toDataURL("image/png");
}

/** 状態の数を Dock に表示する。null・全件 0・下地が取れないときは元のアイコンに戻す */
export const showDockCounts = createDockIconUpdater({ loadBase, draw, setIcon: setDockIcon });
