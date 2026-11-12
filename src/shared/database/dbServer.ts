import { DB_DEFAULT_PORTS, type DbEngine } from "../types/database";

// この Mac の中の DB のサーバーの見分け（DB クライアントの取り込みと Docker タブの「DB で開く」で、同じ DB かを比べる）

const LOCAL_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "host.docker.internal"]);

/** この Mac の中のホストか（書いていない・localhost・127.x） */
export function isLocalHost(host: string | null): boolean {
  if (!host) return true;
  const h = host.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.startsWith("127.");
}

type ServerOf = { engine: DbEngine; host: string | null; port: number | null };

/** この Mac の中の同じ DB のサーバーか（種類・この Mac の中のホスト・ポート（書いていなければ既定のポート）が同じ。SQLite は違うものとする） */
export function sameLocalServer(a: ServerOf, b: ServerOf): boolean {
  if (a.engine === "sqlite" || a.engine !== b.engine || !isLocalHost(a.host) || !isLocalHost(b.host)) return false;
  return (a.port ?? DB_DEFAULT_PORTS[a.engine]) === (b.port ?? DB_DEFAULT_PORTS[b.engine]);
}
