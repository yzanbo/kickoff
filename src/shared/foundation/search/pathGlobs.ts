// 検索の「含めるファイル」「除外するファイル」（VS Code と同じ glob のカンマ区切り）を、git の pathspec にする

/** カンマで分ける（{a,b} の中のカンマでは分けない）。前後の空白・空の項目は除く */
export function splitGlobList(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of list) {
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      items.push(current);
      current = "";
    } else current += c;
  }
  items.push(current);
  return items.map((s) => s.trim()).filter(Boolean);
}

/** {a,b} を広げる（git の glob は {} を使えないため。入れ子も広げる） */
export function expandBraces(glob: string): string[] {
  const open = glob.indexOf("{");
  if (open < 0) return [glob];
  let depth = 0;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === "{") depth++;
    else if (glob[i] === "}" && --depth === 0) {
      const head = glob.slice(0, open);
      const tail = glob.slice(i + 1);
      return splitGlobList(glob.slice(open + 1, i)).flatMap((alt) => expandBraces(head + alt + tail));
    }
  }
  return [glob];
}

/**
 * 1 つの glob を、作業場所から見た git の glob にする（VS Code と同じ読み方）:
 * ./ で始まれば作業場所から、そうでなければどの深さでも（**\/ を前に付ける）。/ で終われば、そのフォルダの中すべて。
 * glob の記号（* ? [）がなければ、その名前のファイルとフォルダの中の両方
 */
function toGitGlobs(glob: string): string[] {
  let g = glob.replace(/\\/g, "/");
  const rooted = g.startsWith("./") || g.startsWith("/");
  g = g.replace(/^\.?\/+/, "");
  if (!g) return [];
  if (!rooted && !g.startsWith("**/")) g = `**/${g}`;
  if (g.endsWith("/")) return [`${g}**`];
  return /[*?[]/.test(g.replace(/^\*\*\//, "")) ? [g] : [g, `${g}/**`];
}

/** 含める・除外するファイルの指定を、git grep の pathspec（-- のあとに並べる）にする。どちらも空なら空 */
export function toPathspecs(include: string, exclude: string): string[] {
  const globs = (list: string) => splitGlobList(list).flatMap(expandBraces).flatMap(toGitGlobs);
  return [...globs(include).map((g) => `:(glob)${g}`), ...globs(exclude).map((g) => `:(glob,exclude)${g}`)];
}
