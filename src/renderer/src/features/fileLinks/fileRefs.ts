/**
 * チャットの返答の中のファイルのパスを、押して開けるチップにするための判定（純粋関数）。
 * Markdown の木（mdast）に印を付ける remark のプラグインもここに置く（React に依らない）。
 * 印付け（パスらしい文字か）は作業場所のフォルダだけで決め、開けるか（一覧にあるか・どのファイルか）は描くときにリンクの部品が引き当てる
 * （一覧が変わっても返答の Markdown を解析し直さないため。メモの仕様書「0023_表示を軽くする」の案 28）
 */

/** 開くファイル（作業場所からの相対パスと、あれば行） */
export interface FileRef {
  path: string;
  line?: number;
}

/** 作業場所のファイルの一覧（チップにしてよいかの判定に使う） */
export interface FileIndex {
  /** 作業場所の絶対パス（本体かワークツリー）。これで始まる絶対パスは相対パスにして探す */
  root: string;
  files: Set<string>;
  /** ファイル名（最後の部分）→ そのファイル名のパス */
  byName: Map<string, string[]>;
  /** 一覧が多すぎて途中で切れている（一覧にないものも、フォルダ付きの形なら開けるとみなす） */
  truncated: boolean;
}

export function buildFileIndex(files: string[], root: string, truncated = false): FileIndex {
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    const list = byName.get(name);
    if (list) list.push(file);
    else byName.set(name, [file]);
  }
  return { root: root.replace(/\/+$/, ""), files: new Set(files), byName, truncated };
}

// 末尾の行番号（a.ts:12 / a.ts:12:5 / a.ts:12-20 / a.ts#L12 / a.ts#L12-L20）
const LINE_SUFFIX = /^(.+?)(?::(\d+)(?::\d+)?(?:-\d+)?|#L(\d+)(?:C\d+)?(?:-L?\d+(?:C\d+)?)?)$/;
// パスに使わない文字（空白・グロブ・引用符・シェルの記号など。: は行番号を外したあとに残っていれば URL などなので断る）
const NOT_PATH = /[\s*?<>|"'`{}$;,=\\:]/;
// ファイル名の拡張子（拡張子のないもの（Makefile・コマンド名など）はチップにしない）
const EXTENSION = /\.[A-Za-z0-9_-]+$/;

/**
 * 文字（インラインコード・リンク先・絶対パス）をファイルとして読む。
 * 作業場所のファイルの一覧にあるもの（フォルダを省いた形は、一覧の中で 1 つに決まるもの）だけを返す
 */
export function parseFileRef(text: string, index: FileIndex): FileRef | undefined {
  const candidate = parsePathCandidate(text, index.root);
  return candidate && resolveFileRef(candidate, index);
}

/**
 * 文字がファイルのパスらしいか（一覧は見ない）。らしければ作業場所からのパス（作業場所の絶対パス・./ を外した形。フォルダを省いた形もそのまま）と行を返す。
 * 開けるかは resolveFileRef で一覧に引き当てて決める
 */
export function parsePathCandidate(text: string, root: string): FileRef | undefined {
  const raw = text.trim();
  if (!raw) return undefined;
  const match = raw.match(LINE_SUFFIX);
  let path = match ? match[1] : raw;
  const lineText = match ? (match[2] ?? match[3]) : undefined;
  const line = lineText ? Number(lineText) : undefined;

  if (root && path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
  path = path.replace(/^(\.\/)+/, "");
  if (!path || path.startsWith("/") || path.startsWith("~") || path.endsWith("/") || NOT_PATH.test(path)) return undefined;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return undefined;
  if (!EXTENSION.test(segments[segments.length - 1])) return undefined;
  return line && line > 0 ? { path, line } : { path };
}

/** パスらしい文字を一覧に引き当てる（開けなければ undefined） */
export function resolveFileRef(ref: FileRef, index: FileIndex): FileRef | undefined {
  const found = resolveFilePath(ref.path, index);
  if (!found) return undefined;
  return ref.line ? { path: found, line: ref.line } : { path: found };
}

/** 一覧の中のパスに引き当てる（そのまま → フォルダを省いた形で 1 つに決まるもの → 一覧が切れていればフォルダ付きの形をそのまま） */
export function resolveFilePath(path: string, index: FileIndex): string | undefined {
  if (index.files.has(path)) return path;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const candidates = (index.byName.get(name) ?? []).filter((file) => file.endsWith(`/${path}`));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0 && index.truncated && path.includes("/")) return path;
  return undefined;
}

/** チップに出す文字（相対パスと行） */
export function formatFileRef(ref: FileRef): string {
  return ref.line ? `${ref.path}:${ref.line}` : ref.path;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 地の文の中の、作業場所の絶対パスを探して分ける（パスらしいものは { ref（作業場所からのパス）, text（元の文字） }、ほかは文字のまま。開けるかは見ない）。
 * パスは ASCII の文字だけで読み（すぐ後ろに日本語が続いても含めない）、文の終わりの句読点は外す
 */
export function splitAbsolutePaths(text: string, root: string): (string | { ref: FileRef; text: string })[] {
  if (!root || !text.includes(root)) return [text];
  const pattern = new RegExp(`(?<![\\w./-])${escapeRegExp(root)}/[A-Za-z0-9_./@+~#:()\\[\\]-]+`, "g");
  const out: (string | { ref: FileRef; text: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const candidate = match[0].replace(/[.,:;!?)\]]+$/, "");
    const ref = parsePathCandidate(candidate, root);
    if (!ref) continue;
    const start = match.index;
    if (start > last) out.push(text.slice(last, start));
    out.push({ ref, text: candidate });
    last = start + candidate.length;
  }
  if (last === 0) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Markdown の木（mdast）の節（ここで使う分だけ） */
export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, string | number> };
}

/**
 * ファイルのパスらしいものの印（Markdown の a の部品が data-file-path / data-file-line で見分け、一覧に引き当てて開ければチップにする。
 * 開けなければ元のまま: リンクはふつうのリンク、インラインコードはコードだけ、地の文の絶対パスは data-file-text の元の文字）
 */
function markFileLink(node: MdNode, ref: FileRef, text?: string): MdNode {
  node.data = {
    ...node.data,
    hProperties: { ...node.data?.hProperties, dataFilePath: ref.path, ...(ref.line ? { dataFileLine: ref.line } : {}), ...(text !== undefined ? { dataFileText: text } : {}) },
  };
  return node;
}

const fileLink = (ref: FileRef, children: MdNode[], text?: string): MdNode => markFileLink({ type: "link", url: "", children }, ref, text);

// 中を見ない節（コードブロック・HTML・リンクの中。リンクの中にリンクを入れない）
const SKIP = new Set(["code", "html", "linkReference", "definition"]);

/**
 * Markdown の木の中のファイルのパスらしいものに印を付ける（一覧は見ない。root は作業場所の絶対パス）。
 * - インラインコード（`src/a.ts` `a.ts:12`）→ コードの見た目のまま、リンクで包む
 * - リンク（[a.ts:12](src/a.ts#L12) や絶対パス）→ ファイルのリンクの印を付ける
 * - 地の文の作業場所の絶対パス → 相対パスのインラインコードにしてリンクで包み、元の文字も持たせる
 */
export function markFilePaths(node: MdNode, root: string): void {
  if (!node.children) return;
  node.children = node.children.flatMap((child): MdNode[] => {
    if (child.type === "link") {
      const ref = child.url ? parsePathCandidate(child.url, root) : undefined;
      return [ref ? markFileLink(child, ref) : child];
    }
    if (child.type === "inlineCode") {
      const ref = parsePathCandidate(child.value ?? "", root);
      return [ref ? fileLink(ref, [child]) : child];
    }
    if (child.type === "text") {
      const parts = splitAbsolutePaths(child.value ?? "", root);
      if (parts.length === 1 && typeof parts[0] === "string") return [child];
      return parts.map((part) =>
        typeof part === "string" ? { type: "text", value: part } : fileLink(part.ref, [{ type: "inlineCode", value: formatFileRef(part.ref) }], part.text),
      );
    }
    if (!SKIP.has(child.type)) markFilePaths(child, root);
    return [child];
  });
}

/** remark のプラグイン（remarkPlugins に [remarkFileLinks, 作業場所の絶対パス] で渡す。一覧が変わっても同じ設定のまま） */
export function remarkFileLinks(root: string) {
  return (tree: unknown) => markFilePaths(tree as MdNode, root);
}
