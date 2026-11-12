// Docker タブの「DB で開く」（段階 2）: compose の DB のサービスから、DB クライアントの登録済みの接続か、取り込みの案を決める（純粋な関数）。
// 案の作り方は DB クライアントの「プロジェクトからの取り込み」と同じ（candidatesFromCompose）で、compose に聞いた設定（変数を埋めたもの）から読む
import path from "node:path";
import { DB_DEFAULT_PORTS, type DbConnection, type DockerCompose } from "@shared/types";
import { candidatesFromCompose } from "../databases/import/fromCompose.js";
import { candidateName, isLocalHost, type FoundDb } from "../databases/import/found.js";

/** ports: がなく Mac にポートを出していない DB のサービス（「DB で開く」を押せない理由） */
export const DOCKER_DB_NO_PORT = "Mac にポートを出していないので、DB クライアントからはつなげません";

/** Docker タブから作った取り込みの案の印（サービス名に「:」は使えないので、最初の「:」までがサービス） */
export const dockerDbKey = (composeKey: string, service: string) => `docker:${service}:${composeKey}`;

export function parseDockerDbKey(key: string): { composeKey: string; service: string } | null {
  if (!key.startsWith("docker:")) return null;
  const rest = key.slice("docker:".length);
  const at = rest.indexOf(":");
  if (at <= 0 || at === rest.length - 1) return null;
  return { service: rest.slice(0, at), composeKey: rest.slice(at + 1) };
}

export type DockerDbCandidate = { found: FoundDb } | { blocked: string };

/**
 * compose の設定（config --format json を読んだもの）から、そのサービスの取り込みの案を作る（DB のイメージでなければ null）。
 * つなぐ先は localhost と Mac に出したポート。ワークツリーの db が本体の同じサービスと別のポート（mainPort）なら、別の DB として名前にブランチを添える
 */
export function dockerDbCandidate(input: {
  compose: Pick<DockerCompose, "key" | "file" | "worktree_path" | "branch">;
  service: string;
  doc: unknown;
  /** 本体の同じ compose・同じサービスが Mac に出すポート（本体の compose なら・なければ null） */
  mainPort: number | null;
}): DockerDbCandidate | null {
  const { compose, service } = input;
  const file = compose.file ?? "compose";
  const found = candidatesFromCompose(file, input.doc, new Map(), new Map()).find((f) => f.key === `compose:${file}:${service}`);
  if (!found) return null;
  // candidatesFromCompose は ports: がないとき注意（note）を付け、中のポートを入れる
  if (found.note) return { blocked: DOCKER_DB_NO_PORT };
  const branch = compose.worktree_path === null ? null : (compose.branch ?? path.basename(compose.worktree_path));
  const separate = branch !== null && found.port !== input.mainPort;
  return {
    found: {
      ...found,
      key: dockerDbKey(compose.key, service),
      origin: `${file} のサービス ${service}（Docker タブ${branch ? `・WT | ${branch}` : ""}）`,
      name: separate ? candidateName(found.database ?? service, branch) : found.name,
    },
  };
}

/** 同じ DB の登録済みの接続（種類・この Mac の中のホスト・ポートが同じもの。DB の名前まで同じものを先に） */
export function sameServerConnection(connections: readonly DbConnection[], found: Pick<FoundDb, "engine" | "port" | "database">): DbConnection | undefined {
  if (found.engine === "sqlite") return undefined;
  const portOf = (c: Pick<DbConnection, "engine" | "port">) => c.port ?? (c.engine === "sqlite" ? null : DB_DEFAULT_PORTS[c.engine]);
  const same = connections.filter((c) => c.engine === found.engine && isLocalHost(c.host) && portOf(c) === found.port);
  return same.find((c) => (c.database ?? null) === (found.database ?? null)) ?? same[0];
}
