// ワークツリーに写した .env の書き換え（純粋な関数）: 接続先のポートを帯の番号にし、後ろに Kickoff の区切りを足す
import { isLocalHost } from "@shared/database/dbServer";

export const KICKOFF_BLOCK_START = "# >>> Kickoff";
export const KICKOFF_BLOCK_END = "# <<< Kickoff";

const LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(.*)$/;
/** URL の中の「スキーム://（ユーザー@）ホスト:ポート」 */
const URL_PORT = /([a-z][a-z0-9+.-]*:\/\/)((?:[^\s@/"'#?]*@)?)(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9._-]+):(\d{1,5})(?=[/?#"'\s,;]|$)/gi;
/** 名前が _PORT で終わる変数の値（囲み・行末のコメントがあってもよい） */
const PORT_VALUE = /^(["']?)(\d{1,5})\1(\s+#.*)?\s*$/;

const hostOf = (raw: string) => raw.replace(/^\[|\]$/g, "");

/** Kickoff の区切り（前に書いたもの）を外す */
export function withoutKickoffBlock(text: string): string {
  const out: string[] = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (line.startsWith(KICKOFF_BLOCK_START)) inside = true;
    else if (inside && line.startsWith(KICKOFF_BLOCK_END)) inside = false;
    else if (!inside) out.push(line);
  }
  return out.join("\n");
}

/** 後ろに Kickoff の区切りを足す（前の区切りは外してから。終わりは改行 1 つ） */
export function withKickoffBlock(text: string, header: string, lines: readonly string[]): string {
  const body = withoutKickoffBlock(text).replace(/\n+$/, "");
  const block = [`${KICKOFF_BLOCK_START}（${header}）`, ...lines, KICKOFF_BLOCK_END].join("\n");
  return body ? `${body}\n\n${block}\n` : `${block}\n`;
}

export interface EnvPortRewrite {
  text: string;
  /** 書き換えた変数 */
  rewritten: string[];
  /** 書き換えたあとも本体の番号が残っている変数（変わった形。手順では直せない） */
  leftovers: string[];
  /** この Mac の中の URL で、Docker の番号でないポートのもの（アプリ自身の URL・ログインの戻り先かもしれない） */
  localUrls: string[];
}

/**
 * 接続先のポートを書き換える: URL の中のポート（この Mac の中のホストだけ）と、名前が _PORT で終わる変数のうち、
 * 本体の Docker の公開ポート（portMap のキー）と同じ番号のものを、帯の番号（portMap の値）にする。Kickoff の区切りの中は見ない
 */
export function rewriteEnvPorts(text: string, portMap: ReadonlyMap<number, number>): EnvPortRewrite {
  const rewritten: string[] = [];
  const leftovers: string[] = [];
  const localUrls: string[] = [];
  const bandPorts = new Set(portMap.values());
  let inside = false;
  const lines = text.split("\n").map((line) => {
    if (line.startsWith(KICKOFF_BLOCK_START)) inside = true;
    else if (inside && line.startsWith(KICKOFF_BLOCK_END)) inside = false;
    const m = inside ? null : LINE.exec(line);
    if (!m) return line;
    const [, head, key, eq, raw] = m;
    let value = raw;
    if (/_PORT$/i.test(key)) {
      const pm = PORT_VALUE.exec(value);
      const to = pm ? portMap.get(Number(pm[2])) : undefined;
      if (pm && to !== undefined) value = `${pm[1]}${to}${pm[1]}${pm[3] ?? ""}`;
    }
    let sawLocalUrl = false;
    value = value.replace(URL_PORT, (all, scheme: string, user: string, host: string, port: string) => {
      if (!isLocalHost(hostOf(host))) return all;
      const to = portMap.get(Number(port));
      if (to === undefined) {
        if (!bandPorts.has(Number(port))) sawLocalUrl = true;
        return all;
      }
      return `${scheme}${user}${host}:${to}`;
    });
    if (value !== raw) rewritten.push(key);
    if (sawLocalUrl) localUrls.push(key);
    for (const original of portMap.keys()) {
      const left = new RegExp(`(^|[^0-9]):${original}(?![0-9])`).test(value) || (/PORT/i.test(key) && new RegExp(`(^|[^0-9])${original}(?![0-9])`).test(value));
      if (left) {
        leftovers.push(key);
        break;
      }
    }
    return `${head}${key}${eq}${value}`;
  });
  return { text: lines.join("\n"), rewritten, leftovers, localUrls };
}

/** コメントにした行の終わりの印 */
const COMMENTED_MARK = "  # Kickoff が下の区切りで決め直しています";

/**
 * Kickoff の区切りで決め直す変数（COMPOSE_PROJECT_NAME など）を、区切りの外ではコメントにする（同じ名前が 2 回あると、どちらが効くか分かりにくいため）。
 * 前の値を返す（COMPOSE_FILE の並びを引き継ぐ）
 */
export function commentOutKeys(text: string, keys: readonly string[]): { text: string; values: Map<string, string> } {
  const values = new Map<string, string>();
  let inside = false;
  const lines = text.split("\n").map((line) => {
    if (line.startsWith(KICKOFF_BLOCK_START)) inside = true;
    else if (inside && line.startsWith(KICKOFF_BLOCK_END)) inside = false;
    if (inside) return line;
    // 前にコメントにした行（作り直すときも、元の値を引き継ぐ）
    const done = line.startsWith("# ") && line.endsWith(COMMENTED_MARK) ? LINE.exec(line.slice(2, -COMMENTED_MARK.length)) : null;
    const m = done ?? LINE.exec(line);
    if (!m || !keys.includes(m[2])) return line;
    values.set(m[2], m[4].replace(/\s+#.*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2"));
    return done ? line : `# ${line.trim()}${COMMENTED_MARK}`;
  });
  return { text: lines.join("\n"), values };
}
