import type { DbPrep } from "../types/database";

// つなぐ前の準備のコマンド（要件 5.12 の段階 2）: 中の {名前} の埋め方・確かめた中身の写し・次に確かめる日

/** コマンドの中で使える名前 */
export const DB_PREP_PLACEHOLDERS = ["local_port", "my_ip", "host", "port", "database", "user"] as const;
export type DbPrepPlaceholder = (typeof DB_PREP_PLACEHOLDERS)[number];
export const DB_PREP_PLACEHOLDER_LABELS: Record<DbPrepPlaceholder, string> = {
  local_port: "Kickoff が選んだ空きポート（ポートの転送）",
  my_ip: "いまの IP（使うときだけ問い合わせる）",
  host: "接続のホスト",
  port: "接続のポート",
  database: "接続の DB 名",
  user: "接続のユーザー",
};

export type DbPrepVars = Partial<Record<DbPrepPlaceholder, string | null>>;

const PLACEHOLDER = new RegExp(`\\{(${DB_PREP_PLACEHOLDERS.join("|")})\\}`, "g");

/** シェルの 1 つの語にする（' で囲み、中の ' は '\'' にする） */
export const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** コマンドが使う名前 */
export function prepPlaceholders(command: string): DbPrepPlaceholder[] {
  return [...new Set([...command.matchAll(PLACEHOLDER)].map((m) => m[1] as DbPrepPlaceholder))];
}

/** {名前} を値で埋める（値はシェルの 1 つの語にして入れる。ない値を使っていれば、その名前を投げる） */
export function expandPrepCommand(command: string, vars: DbPrepVars): string {
  return command.replace(PLACEHOLDER, (_, name: DbPrepPlaceholder) => {
    const value = vars[name];
    if (value === undefined || value === null || value === "") throw new Error(`コマンドの {${name}} に入れる値がありません（${DB_PREP_PLACEHOLDER_LABELS[name]}）`);
    return shellQuote(value);
  });
}

/** 登録したすべてのコマンド（準備・後片付け・ポートの転送・パスワード） */
export function allPrepCommands(prep: DbPrep): string[] {
  return [...prep.prepare, ...prep.cleanup, ...(prep.tunnel ? [prep.tunnel] : []), ...(prep.password ? [prep.password] : [])];
}

/** {my_ip} を使うコマンドがあるか（あるときだけ外に問い合わせる） */
export const usesMyIp = (commands: string[]) => commands.some((c) => prepPlaceholders(c).includes("my_ip"));

/** 何も書いていない準備は null にする（空の行は落とす） */
export function normalizePrep(prep: DbPrep | null): DbPrep | null {
  if (!prep) return null;
  const lines = (list: string[]) => list.map((c) => c.trim()).filter(Boolean);
  const text = (v: string | null) => v?.trim() || null;
  const next: DbPrep = { prepare: lines(prep.prepare), cleanup: lines(prep.cleanup), tunnel: text(prep.tunnel), password: text(prep.password), my_ip_url: text(prep.my_ip_url) };
  return allPrepCommands(next).length === 0 ? null : next;
}

/** 確かめた中身の写し（これと同じ間は確かめ済み。問い合わせ先を変えても確かめ直す） */
export const prepConfirmKey = (prep: DbPrep) =>
  JSON.stringify([prep.prepare, prep.cleanup, prep.tunnel, prep.password, prep.my_ip_url]);

/** つなぐときに流すコマンド（ポートの転送・パスワード）があるか（あれば、確かめるまでつながない・AI からはつながない） */
export const hasConnectCommands = (prep: DbPrep | null) => Boolean(prep?.tunnel || prep?.password);

/** 次に確かめる日を過ぎたか（今日を含む。today は YYYY-MM-DD） */
export const isCheckDue = (checkOn: string | null, today: string) => checkOn !== null && checkOn <= today;

/** この Mac の時間帯の今日（YYYY-MM-DD） */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
