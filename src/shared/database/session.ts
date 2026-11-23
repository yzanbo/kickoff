// DB ワーカーの中の接続（セッション）の名前「<種類>:<接続の ID>:<キー>」（コアが組み、コアとワーカーが読む）。
// shared = 木・テーブルのタブで共有（キーは作業場所と DB）/ sql = SQL のタブ（キーはタブのキー）/ edit = 行の保存 / ai = AI の SQL（どちらも 1 回ずつ開いて閉じる）

export const DB_SESSION_KINDS = ["shared", "sql", "edit", "ai"] as const;
export type DbSessionKind = (typeof DB_SESSION_KINDS)[number];

export interface DbSessionName {
  kind: DbSessionKind;
  connectionId: number;
  /** 種類の中の名前（「:」を含んでよい） */
  key: string;
}

export const sessionName = (s: DbSessionName): string => `${s.kind}:${s.connectionId}:${s.key}`;

/** 名前を読む（知らない種類・接続の ID が正の整数でなければ null） */
export function parseSession(name: string): DbSessionName | null {
  const m = /^([a-z]+):(\d+):([\s\S]*)$/.exec(name);
  const kind = DB_SESSION_KINDS.find((k) => k === m?.[1]);
  const connectionId = Number(m?.[2]);
  return m && kind && Number.isSafeInteger(connectionId) && connectionId > 0 ? { kind, connectionId, key: m[3] } : null;
}

/** 接続の状態（つないでいるか）に数えるセッションか（木・テーブルと SQL のタブだけ。AI・行の保存は数えない） */
export const countsAsConnected = (s: DbSessionName): boolean => s.kind === "shared" || s.kind === "sql";
