// .env の読み方（純粋。Docker の compose の COMPOSE_FILE と、ワークツリーの実行環境の .env の書き換えが同じ読み方を使う）

/** 1 行の「（export ）名前 = 値」（値は書いたまま。囲み・行末のコメントも残す） */
const LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(.*)$/;

/** .env の 1 行（head は前の空白と export、eq は = とまわりの空白。書き戻すときは head + key + eq + value） */
export interface EnvLine {
  head: string;
  key: string;
  eq: string;
  value: string;
}

/** .env の 1 行を読む（変数の行でなければ null） */
export function parseEnvLine(line: string): EnvLine | null {
  const m = LINE.exec(line);
  return m ? { head: m[1], key: m[2], eq: m[3], value: m[4] } : null;
}

/** 値の囲み（"…"・'…'）を外す */
export const unquoteEnv = (value: string) => value.replace(/^(['"])(.*)\1$/, "$2");

/** .env の中身の変数（値は後ろの空白と囲みを外したもの。同じ名前は後ろが勝つ） */
export function readEnvVars(text: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const raw of text.split("\n")) {
    const line = parseEnvLine(raw);
    if (line) vars.set(line.key, unquoteEnv(line.value.trimEnd()));
  }
  return vars;
}

/** COMPOSE_FILE の並び（COMPOSE_PATH_SEPARATOR で区切る。既定は「:」。書いていなければ null） */
export function composeFileList(vars: ReadonlyMap<string, string>): string[] | null {
  const list = vars.get("COMPOSE_FILE");
  return list ? list.split(vars.get("COMPOSE_PATH_SEPARATOR") || ":").filter(Boolean) : null;
}
