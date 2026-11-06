import path from "node:path";
import { app } from "electron";
import { APP_ENVS } from "../../core/system/appEnv.js";
import { seedDevData } from "../../core/system/devData.js";

// 起動したアプリの環境: 本番（インストールしたアプリ）と開発（npm run dev）で、名前・保存先・ポートを分ける（同時に動かせるように。core/system/appEnv.ts）

/** ビルドした出力（out/main の隣に preload・renderer がある。メインプロセスは 1 つのファイルに束ねるので、どのファイルからでも同じ） */
const outDir = path.join(import.meta.dirname, "..");
/** 画面に読み込ませる preload */
export const PRELOAD_FILE = path.join(outDir, "preload", "index.cjs");
/** 本番の画面のファイル（コアが配る） */
export const RENDERER_DIR = path.join(outDir, "renderer");

/**
 * 名前と保存先を決める（ヘッドレス起動の daemon とそろえる）。開発時は、動作確認用に KICKOFF_REMOTE_DEBUG=<port> のときだけ
 * 外から画面を操作できるようにする。返すのはコアのポートと、開発時の画面の URL（electron-vite の dev サーバー。本番はコアが配る）
 */
export function setupEnvironment(): { port: number; devUrl: string | undefined } {
  const env = APP_ENVS[app.isPackaged ? "production" : "development"];
  app.setName(env.name);
  app.setPath("userData", path.join(app.getPath("appData"), env.name));
  if (process.env.KICKOFF_REMOTE_DEBUG && !app.isPackaged) {
    app.commandLine.appendSwitch("remote-debugging-port", process.env.KICKOFF_REMOTE_DEBUG);
    // 確かめるときは開発版の窓を前に出さない（利用者の入力が入る）ので、隠れた窓でもタイマー・描画・アニメーションを止めない
    // （止まると、なめらかなスクロールや「スクロールし終えたら」の動きを外から確かめられない）
    for (const flag of ["disable-background-timer-throttling", "disable-backgrounding-occluded-windows", "disable-renderer-backgrounding"]) app.commandLine.appendSwitch(flag);
  }
  return { port: Number(process.env.KICKOFF_PORT ?? env.port), devUrl: process.env.ELECTRON_RENDERER_URL };
}

/** 開発のデータがまだなければ、本番のデータから一度だけ写す（起動中の印を保存先に作る前に呼ぶ） */
export function seedDevDataOnce() {
  if (!app.isPackaged) seedDevData(path.join(app.getPath("appData"), APP_ENVS.production.name), app.getPath("userData"));
}
