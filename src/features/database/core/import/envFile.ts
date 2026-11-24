// .env の読み方（dotenv と同じ形の主なもの）と、compose・.env の中の ${VAR} の埋め方

/**
 * .env の文を読む: `KEY=value`・頭の `export `・"…"（\n などを読む）と '…'（そのまま）・囲まない値の ` #` からあとはコメント。
 * 囲まない値と "…" の中の ${VAR} / $VAR は、それまでに出てきた値で埋める（dotenv-expand と同じ）
 */
export function parseEnvFile(text: string): Map<string, string> {
  const vars = new Map<string, string>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key] = m;
    let raw = m[2];
    const quote = raw[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      // 閉じるまで（次の行に続いてもよい）
      let body = raw.slice(1);
      while (!hasClosing(body, quote) && i + 1 < lines.length) body += "\n" + lines[++i];
      const end = closingIndex(body, quote);
      body = end >= 0 ? body.slice(0, end) : body;
      vars.set(key, quote === "'" ? body : interpolate(quote === '"' ? unescape(body) : body, (name) => vars.get(name)));
      continue;
    }
    raw = raw.replace(/\s+#.*$/, "").trim();
    vars.set(key, interpolate(raw, (name) => vars.get(name)));
  }
  return vars;
}

const closingIndex = (body: string, quote: string) => {
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && quote === '"') i++;
    else if (body[i] === quote) return i;
  }
  return -1;
};
const hasClosing = (body: string, quote: string) => closingIndex(body, quote) >= 0;
const unescape = (s: string) => s.replace(/\\([nrt"\\])/g, (_, c: string) => ({ n: "\n", r: "\r", t: "\t" })[c] ?? c);

/**
 * ${VAR}・${VAR:-既定}・${VAR-既定}・${VAR:?…}・$VAR を埋める（$$ は $）。見つからない名前は空にする（compose と同じ）
 */
export function interpolate(text: string, lookup: (name: string) => string | undefined): string {
  return text.replace(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, braced?: string, op?: string, fallback?: string, bare?: string) => {
    if (all === "$$") return "$";
    const name = braced ?? bare ?? "";
    const value = lookup(name);
    if (op === ":-") return value ? value : (fallback ?? "");
    if (op === "-") return value ?? fallback ?? "";
    return value ?? "";
  });
}
