// 接続の形の表（ファイルの DB / サーバーの DB）。SQL の方言（dialect.ts）とは別の、つなぎ方の違い。
// ファイルの DB はファイルのパスで開き、ホスト・SSH・つなぐときのコマンドを使わない。種類の if を書かずに、ここを引く（種類を足すときは表に 1 行）
import type { DbEngine } from "./types";

export const DB_CONNECTION_SHAPES = ["file", "server"] as const;
export type DbConnectionShape = (typeof DB_CONNECTION_SHAPES)[number];

const SHAPE_OF: Record<DbEngine, DbConnectionShape> = { sqlite: "file", postgres: "server", mysql: "server" };

/** ファイルを開く DB か（SQLite。ほかはホストにつなぐ） */
export const isFileDb = (engine: DbEngine): boolean => SHAPE_OF[engine] === "file";
