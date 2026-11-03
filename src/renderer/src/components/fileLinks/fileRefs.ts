/**
 * チャットの返答の中のファイルのパスを、押して開けるチップにするための判定（純粋関数）。
 * Markdown の木（mdast）を書き換える remark のプラグインもここに置く（React に依らない）
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
  const raw = text.trim();
  if (!raw) return undefined;
  const match = raw.match(LINE_SUFFIX);
  let path = match ? match[1] : raw;
  const lineText = match ? (match[2] ?? match[3]) : undefined;
  const line = lineText ? Number(lineText) : undefined;

  if (index.root && path.startsWith(`${index.root}/`)) path = path.slice(index.root.length + 1);
  path = path.replace(/^(\.\/)+/, "");
  if (!path || path.startsWith("/") || path.startsWith("~") || path.endsWith("/") || NOT_PATH.test(path)) return undefined;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return undefined;
  if (!EXTENSION.test(segments[segments.length - 1])) return undefined;

  const found = resolvePath(path, index);
  if (!found) return undefined;
  return line && line > 0 ? { path: found, line } : { path: found };
}

/** 一覧の中のパスに引き当てる（そのまま → フォルダを省いた形で 1 つに決まるもの → 一覧が切れていればフォルダ付きの形をそのまま） */
function resolvePath(path: string, index: FileIndex): string | undefined {
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
 * 地の文の中の、作業場所の絶対パスを探して分ける（開けるものだけ { ref }、ほかは文字のまま）。
 * パスは ASCII の文字だけで読み（すぐ後ろに日本語が続いても含めない）、文の終わりの句読点は外す
 */
export function splitAbsolutePaths(text: string, index: FileIndex): (string | { ref: FileRef })[] {
  if (!index.root || !text.includes(index.root)) return [text];
  const pattern = new RegExp(`(?<![\\w./-])${escapeRegExp(index.root)}/[A-Za-z0-9_./@+~#:()\\[\\]-]+`, "g");
  const out: (string | { ref: FileRef })[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const candidate = match[0].replace(/[.,:;!?)\]]+$/, "");
    const ref = parseFileRef(candidate, index);
    if (!ref) continue;
    const start = match.index;
    if (start > last) out.push(text.slice(last, start));
    out.push({ ref });
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

/** 押して開けるファイルのリンクの印（Markdown の a の部品が data-file-path / data-file-line で見分ける） */
function markFileLink(node: MdNode, ref: FileRef): MdNode {
  node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataFilePath: ref.path, ...(ref.line ? { dataFileLine: ref.line } : {}) } };
  return node;
}

const fileLink = (ref: FileRef, children: MdNode[]): MdNode => markFileLink({ type: "link", url: "", children }, ref);

// 中を見ない節（コードブロック・HTML・リンクの中。リンクの中にリンクを入れない）
const SKIP = new Set(["code", "html", "linkReference", "definition"]);

/**
 * Markdown の木の中のファイルのパスを、開けるファイルのリンクにする（index にあるものだけ）。
 * - インラインコード（`src/a.ts` `a.ts:12`）→ コードの見た目のまま、リンクで包む
 * - リンク（[a.ts:12](src/a.ts#L12) や絶対パス）→ 開けるファイルのリンクの印を付ける
 * - 地の文の作業場所の絶対パス → 相対パスのインラインコードにしてリンクで包む
 */
export function linkFilePaths(node: MdNode, index: FileIndex): void {
  if (!node.children) return;
  node.children = node.children.flatMap((child): MdNode[] => {
    if (child.type === "link") {
      const ref = child.url ? parseFileRef(child.url, index) : undefined;
      return [ref ? markFileLink(child, ref) : child];
    }
    if (child.type === "inlineCode") {
      const ref = parseFileRef(child.value ?? "", index);
      return [ref ? fileLink(ref, [child]) : child];
    }
    if (child.type === "text") {
      const parts = splitAbsolutePaths(child.value ?? "", index);
      if (parts.length === 1 && typeof parts[0] === "string") return [child];
      return parts.map((part) =>
        typeof part === "string" ? { type: "text", value: part } : fileLink(part.ref, [{ type: "inlineCode", value: formatFileRef(part.ref) }]),
      );
    }
    if (!SKIP.has(child.type)) linkFilePaths(child, index);
    return [child];
  });
}

/** remark のプラグイン（remarkPlugins に [remarkFileLinks, index] で渡す） */
export function remarkFileLinks(index: FileIndex) {
  return (tree: unknown) => linkFilePaths(tree as MdNode, index);
}
