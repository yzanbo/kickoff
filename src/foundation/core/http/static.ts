// 画面の配信（製品版。開発は Vite が配る）: ビルド済みの画面のファイルと、SPA の未知のパスの index.html
import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { etag } from "hono/etag";
import { serveStatic } from "@hono/node-server/serve-static";
import { errorMessage } from "@shared/foundation/errors";
import { isHashedAsset, rendererCacheControl } from "./rendererCache";

/** 画面のファイルを配る（ほかのルートのあとに登録する。画面のファイルを読めなければ起動を失敗にする = 黙って画面を配らないと、窓が真っ暗のまま理由が分からない） */
export function serveRenderer(app: Hono, staticDir: string): void {
  const indexHtml = readIndexHtml(staticDir);
  const root = path.relative(process.cwd(), staticDir);
  // /assets/ の下（名前に中身のハッシュが付く）は 1 年・変わらないとしてキャッシュさせ（起動・別ウィンドウのたびに JS を取り直してコンパイルし直さない）、
  // ほかは毎回問い合わせさせる（no-cache）。no-cache を外すと、serveStatic は Last-Modified だけを付けるので Chromium が経験則でキャッシュを
  // 新しいとみなし、アプリを入れ替えたあとの起動で古い index.html を問い合わせずに使う（新しいコアとかみ合わず、画面が真っ暗になることがあった）。
  // index.html には中身から作る ETag を付け、変わっていなければ 304（変われば新しい index.html が新しいハッシュの JS を読む。rendererCache.ts）
  app.use("/*", async (c, next) => {
    await next();
    if (c.res.ok || c.res.status === 304) c.res.headers.set("Cache-Control", rendererCacheControl(c.req.path));
  });
  // ETag は /assets/ の外だけ（大きな JS を読み直してハッシュを計算しない。asar の中のファイルの更新時刻はファイルごとでないので If-Modified-Since は使わない）
  const withEtag = etag();
  app.use("/*", (c, next) => (isHashedAsset(c.req.path) ? next() : withEtag(c, next)));
  app.use("/*", serveStatic({ root }));
  // SPA のため、未知のパスは index.html を返す。ただし拡張子のあるパス（/assets/… の JS・CSS など）は 404 にする
  // （HTML を JS として読み込ませて、原因の分からない失敗にしない）
  app.get("*", (c) => (path.extname(c.req.path) ? c.notFound() : c.html(indexHtml)));
}

/** 画面の index.html を読む（読めなければ、場所と理由の分かる文で投げる。コアの起動の失敗として画面の外に出る） */
export function readIndexHtml(staticDir: string): string {
  const file = path.join(staticDir, "index.html");
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(`画面のファイル（${file}）を読めません: ${errorMessage(e)}`);
  }
}
