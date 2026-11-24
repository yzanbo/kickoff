// ホストの見分け（純粋。DB クライアントの取り込みとワークツリーの実行環境の .env の書き換えが同じ決まりを使う）

const LOCAL_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "host.docker.internal"]);

/** この Mac の中のホストか（書いていない・localhost・127.x・Docker から見た Mac） */
export function isLocalHost(host: string | null): boolean {
  if (!host) return true;
  const h = host.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.startsWith("127.");
}
