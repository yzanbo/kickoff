// 窓の地の色（画面を読み込む前・大きさを変えている間に見える色）を、画面で選んでいるテーマに合わせる。
// メインは localStorage を読めないので、画面が IPC の appearance.setTheme で知らせたテーマを <userData>/appearance.json に覚え、
// 次の起動では最初の窓を作る前に 1 回読む（覚えたものがない最初の起動はダーク = テーマの既定と同じ）
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { app, nativeTheme, type BrowserWindow } from "electron";
import { backgroundFor, parseThemeChoice, type ThemeChoice } from "@shared/foundation/theme/backgrounds";
import type { IpcHandlers } from "@/foundation/desktop/ipc/register";

const FILE = "appearance.json";

/** 覚えているテーマ（最初に使うときに appearance.json から読む） */
let theme: ThemeChoice | null = null;
/** 地の色を合わせる窓（メインのウィンドウ・別ウィンドウ。開発者ツールの窓は入れない） */
const windows = new Set<BrowserWindow>();

function currentTheme(): ThemeChoice {
  if (theme) return theme;
  try {
    theme = parseThemeChoice(JSON.parse(readFileSync(path.join(app.getPath("userData"), FILE), "utf8"))?.theme) ?? "dark";
  } catch {
    theme = "dark";
  }
  return theme;
}

/** いまの窓の地の色 */
export const windowBackground = (): string => backgroundFor(currentTheme(), nativeTheme.shouldUseDarkColors);

let watchingOs = false;

/** 窓を作ったら渡す（テーマが変わったら地の色も変える。閉じたら外す） */
export function followAppearance(win: BrowserWindow) {
  if (!watchingOs) {
    watchingOs = true;
    // システムに合わせるときは、OS のダーク・ライトが切り替わったら合わせる
    nativeTheme.on("updated", () => {
      if (currentTheme() === "system") applyToWindows();
    });
  }
  windows.add(win);
  win.on("closed", () => windows.delete(win));
}

function applyToWindows() {
  const color = windowBackground();
  for (const win of windows) if (!win.isDestroyed()) win.setBackgroundColor(color);
}

export const appearanceHandlers: IpcHandlers["appearance"] = {
  setTheme: (_e, next) => {
    if (next === currentTheme()) return;
    theme = next;
    applyToWindows();
    // 書くのは変わったときだけ（失敗しても次の起動の地の色がずれるだけ）
    void writeFile(path.join(app.getPath("userData"), FILE), JSON.stringify({ theme: next })).catch(() => {});
  },
};
