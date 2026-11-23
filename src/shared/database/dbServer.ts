import { isLocalHost } from "@shared/foundation/net";
import { DB_DEFAULT_PORTS, type DbEngine } from "./types";

// この Mac の中の DB のサーバーの見分け（DB クライアントの取り込みと Docker タブの「DB で開く」で、同じ DB かを比べる）

type ServerOf = { engine: DbEngine; host: string | null; port: number | null };

/** この Mac の中の同じ DB のサーバーか（種類・この Mac の中のホスト・ポート（書いていなければ既定のポート）が同じ。SQLite は違うものとする） */
export function sameLocalServer(a: ServerOf, b: ServerOf): boolean {
  if (a.engine === "sqlite" || a.engine !== b.engine || !isLocalHost(a.host) || !isLocalHost(b.host)) return false;
  return (a.port ?? DB_DEFAULT_PORTS[a.engine]) === (b.port ?? DB_DEFAULT_PORTS[b.engine]);
}
