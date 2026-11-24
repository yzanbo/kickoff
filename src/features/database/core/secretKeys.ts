// 接続のパスワードを置く秘密の値（secrets）の名前 db_connection:<接続の ID>:<種類>。値の名前も、接続を消すトリガーの SQL も、ここの 1 つの形から組む

export const DB_SECRET_KINDS = ["password", "ai_password", "ssh_password"] as const;
export type DbSecretKind = (typeof DB_SECRET_KINDS)[number];

/** DB の接続のパスワードの秘密の値の名前（接続を消したら、表のトリガーで消える） */
export type DbSecretKey = `db_connection:${number}:${DbSecretKind}`;

/** 名前の形（id と後ろを埋める） */
const keyOf = (id: string, tail: string) => `db_connection:${id}:${tail}`;

/** 接続の秘密の値の名前 */
export const dbSecretKey = (id: number, kind: DbSecretKind) => keyOf(String(id), kind) as DbSecretKey;

/** SQL の中で名前を組む式（idSql は接続の ID の列、tail は種類か LIKE の %）。例: 'db_connection:' || OLD.id || ':%' */
export const dbSecretKeySql = (idSql: string, tail: DbSecretKind | "%") => `'${keyOf(`' || ${idSql} || '`, tail)}'`;
