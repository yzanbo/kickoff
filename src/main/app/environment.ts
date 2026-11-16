import path from "node:path";
import { app } from "electron";
import { APP_ENVS } from "../../core/system/appEnv.js";
import { seedDevData } from "../../core/system/devData.js";

// 起動したアプリの環境: 本番（インストールしたアプリ）と開発（npm run dev）で、名前・保存先・ポートを分ける（同時に動かせるように。core/system/appEnv.ts）

/** ビルドした出力（out/main の隣に preload・renderer がある。メインプロセスは 1 つのファイルに束ねるので、どのファイルからでも同じ） */
const outDir = path.join(import.meta.dirname, "..");
/** 画面に読み込ませる preload */
export const PRELOAD_FILE = path.join(outDir, "preload", "index.cjs");
/**
 * macOS の音声認識の補助コマンド（native/kickoff-speech をビルドが out/native に作る）。
 * 実行ファイルは asar の中からは動かせないので、製品版では asar の外（app.asar.unpacked）に置いたものを指す
 */
export const SPEECH_HELPER = path.join(outDir, "native", "kickoff-speech").replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
/** DB クライアントの DB ワーカー（ビルドが out/main/dbWorker.js に作る。作るのはメイン（utilityProcess）、話すのはコアのプロセス） */
export const DB_WORKER_FILE = path.join(outDir, "main", "dbWorker.js");
/** コアのプロセス（ビルドが out/main/core.js に作る。メインが utilityProcess で起動する。src/core/host/main.ts） */
export const CORE_FILE = path.join(outDir, "main", "core.js");
/** 本番の画面のファイル（コアが配る） */
export const RENDERER_DIR = path.join(outDir, "renderer");

/**
 * 名前と保存先を決める（ヘッドレス起動の daemon とそろえる）。開発時は、動作確認用に KICKOFF_REMOTE_DEBUG=<port> のときだけ
 * 外から画面を操作できるようにする。返すのはコアのポートと、開発時の画面の URL（electron-vite の dev サーバー。本番はコアが配る）
 */
export function setupEnvironment(): { port: number; devUrl: string | undefined } {
  const env = APP_ENVS[app.isPackaged ? "production" : "development"];
  app.setName(env.name);
  app.setPath("userData", measureDataDir() ?? path.join(app.getPath("appData"), env.name));
  if (process.env.KICKOFF_REMOTE_DEBUG && !app.isPackaged) {
    app.commandLine.appendSwitch("remote-debugging-port", process.env.KICKOFF_REMOTE_DEBUG);
    // 確かめるときは開発版の窓を前に出さない（利用者の入力が入る）ので、隠れた窓でもタイマー・描画・アニメーションを止めない
    // （止まると、なめらかなスクロールや「スクロールし終えたら」の動きを外から確かめられない）
    for (const flag of ["disable-background-timer-throttling", "disable-backgrounding-occluded-windows", "disable-renderer-backgrounding"]) app.commandLine.appendSwitch(flag);
  }
  // 画面の V8 に、しばらく呼ばれていない関数のバイトコードを捨てさせない（長く放っておいたあとの最初の操作で、コンパイルし直さない）。
  // 30 分放っておいたあと、長いチャットを開き直す JS が 115 → 71ms（コンパイルし直し 43 → 0ms）、画面のメモリの増えは約 5MB だった
  // （メモの仕様書「0023_表示を軽くする」の案 18b）。起動のあとに足すので、画面（埋め込みブラウザの webview も）にだけ効き、メインには効かない
  app.commandLine.appendSwitch("js-flags", "--no-flush-bytecode");
  return { port: Number(process.env.KICKOFF_PORT ?? env.port), devUrl: process.env.ELECTRON_RENDERER_URL };
}

/**
 * 測るための一時の保存先（開発時の環境変数 KICKOFF_USER_DATA_DIR。製品版では見ない）。ビルドしたものを、開発版の保存先・製品版に触らずに
 * 起動して測るとき（npm run preview:measure → scripts/measure-code-cache.mjs）
 */
function measureDataDir(): string | null {
  const dir = process.env.KICKOFF_USER_DATA_DIR;
  return dir && !app.isPackaged ? path.resolve(dir) : null;
}

/** 開発のデータがまだなければ、本番のデータから一度だけ写す（起動中の印を保存先に作る前に呼ぶ。測るための一時の保存先には写さない = 製品版の DB を読まない） */
export function seedDevDataOnce() {
  if (!app.isPackaged && !measureDataDir()) seedDevData(path.join(app.getPath("appData"), APP_ENVS.production.name), app.getPath("userData"));
}
