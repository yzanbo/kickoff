// 外部リンクを開く前の確認で添える警告。AI を使わず、URL とリンクの文字だけで機械的に決める
import { TOP_LEVEL_DOMAINS } from "./topLevelDomains";

/** 警告の種類: リンクの文字のホストと行き先が違う / URL にユーザー名・パスワード / 紛らわしい国際化ドメイン名 / ホストが IP アドレス */
const LINK_WARNINGS = ["text_mismatch", "userinfo", "idn", "ip"] as const;
export type LinkWarning = (typeof LINK_WARNINGS)[number];

export const LINK_WARNING_LABELS: Record<LinkWarning, string> = {
  text_mismatch: "リンクの文字に見えるサイトと、実際に開くサイトが違います",
  userinfo: "URL にユーザー名・パスワードが入っています（「@」の前のサイト名は見せかけで、実際に開くのは「@」の後ろのサイトです）",
  idn: "誤解を招く可能性のある国際化ドメイン名です。ドメインは右のように表示されます",
  ip: "サイト名ではなく IP アドレスを開きます",
};

/** 外部リンク（http・https）の URL。読めない・ほかのスキームは null */
export function webUrlOf(href: string): URL | null {
  try {
    const url = new URL(href.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** 「今後確認しない」で覚える単位（ホスト名の小文字。ポートは含めない） */
export function linkDomainOf(href: string): string | null {
  return webUrlOf(href)?.hostname.toLowerCase() ?? null;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
/** ドメインに見える部分（ASCII でない文字の部分も。аpple.com のようにキリル文字を混ぜたものも、URL として読んで punycode で比べる） */
const DOMAIN_LIKE = /^(?:[\p{L}\p{N}\p{M}-]+\.)+(?:[\p{L}\p{M}]{2,}|xn--[a-z0-9-]+)$/iu;

/** この Mac の中（localhost・ループバック）か */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" || /^127\./.test(hostname);
}

/**
 * 見えない文字（制御文字・書式の文字（ゼロ幅・文字の並びを変える印・ソフトハイフン・タグ・行間注釈の印）・既定で描かない文字
 * （異体字セレクタ・ハングルの埋め字など））。リンクの文字に混ぜて、URL に見える語を URL と読ませない書き方を外すため
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
/**
 * ドットに見える文字（NFKC のあとも残るもの。Unicode の confusables で「.」「·」に写る文字と、句点の 。）。
 * ．・․・﹒・｡・· のギリシャ文字の形は NFKC で . か 。 か · になる。DOT_MARK に置き換えてから、ドメインに見える部分を探す
 */
const DOT_LIKE =
  /[\u00B7\u02D1\u0660\u06F0\u0701\u0702\u0830\u0A76\u1427\u16EB\u2022\u2027\u2219\u22C5\u2E31\u3002\u30FB\uA4F8\uA60E\uA78F\uABEC\uFF65\u{10101}\u{1091F}\u{10A50}\u{11174}\u{111C7}\u{115C4}\u{116B9}\u{12562}\u{1D16D}\u{1ECAE}]/gu;
/** ドットに見える文字の置き換え先（1 つの UTF-16 の単位なので、. に戻しても位置がずれない。私用の文字なので、元の文にあればドットに見える文字と同じに扱う） */
const DOT_MARK = "\uE000";
/**
 * 文の中の http・https の URL（ホストは文字・数字・. と - が続く所まで。その後ろのポート・パス・クエリは URL に使える ASCII の文字まで。
 * @ と ASCII でない文字で切る）。ホストを行き先と比べ、後ろのパス・クエリの中はドメインを探さない（文字に見えるホストが行き先と同じなら、パスの中の語は見せかけでないため）
 */
const URL_IN_TEXT = /https?:\/\/([\p{L}\p{N}.-]+)(?::\d+)?(?:[/?#][\w\-.~:/?#[\]!$&'()*+,;=%]*)?/giu;
/** ドメインを探す部分（文字・数字・. と - と、ドットに見える文字が続く所。ほかの文字（空白・記号・絵文字・かっこ・: = @ # | など）で区切る） */
const DOMAIN_PART = /[\p{L}\p{N}\p{M}.\uE000-]+/gu;

/**
 * ファイルの拡張子で、トップレベルドメインではない名前。http://・https://・www. で始まらない語のうち、最後のラベルがこれのもの
 * （package.json・src/a.ts など）はドメインとみなさない（返答のファイル名のリンクで毎回警告にしないため）
 */
const FILE_EXTENSIONS: ReadonlySet<string> = new Set(
  (
    "mdx markdown txt rst json jsonc json5 yml yaml toml lock ts tsx mts cts js jsx mjs cjs vue svelte pyi rb go kt kts swift c h cpp hpp m cs fs php lua dart scala " +
    "zsh bash ps1 bat sql graphql proto html htm css scss sass less png jpg jpeg gif svg webp ico bmp avif pdf gz tgz tar log env ini cfg conf xml csv tsv diff patch " +
    "wasm snap lockb gradle plist"
  ).split(" "),
);

/**
 * ファイルの拡張子にもトップレベルドメインにもなる名前（IANA の一覧と照らした。README.md・main.py・a.zip・Kickoff.app など）。
 * 語が行き先の URL のパスの最後の部分（ファイル名）と同じときだけ比べない（違えば、allegro.pl のようなドメインとして比べる）
 */
const FILE_OR_DOMAIN_EXTENSIONS: ReadonlySet<string> = new Set(
  "md py rs java cc mm pl sh fish zip map mov ai so am in ps app tf ml mk mo pm cr sc gd nu sv pub".split(" "),
);

/** URL のパスの最後の部分（ファイル名）の小文字。なければ空 */
function fileNameOf(url: URL): string {
  const last = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last).toLowerCase();
  } catch {
    return last.toLowerCase();
  }
}

/**
 * 部分がドメインとして比べるものか（www. で始まるものはいつも。ほかは最後のラベルがファイルの拡張子でないもの。
 * 拡張子にもドメインにもなるものは、行き先のファイル名と同じでなく、/ の後ろ（docs/設計.md のようなパスの中）でもないもの）
 */
function isDomainWord(word: string, url: URL, inPath: boolean): boolean {
  if (/^www\./i.test(word)) return true;
  const extension = word.slice(word.lastIndexOf(".") + 1).toLowerCase();
  if (FILE_EXTENSIONS.has(extension)) return false;
  return !(FILE_OR_DOMAIN_EXTENSIONS.has(extension) && (inPath || word.toLowerCase() === fileNameOf(url)));
}

/** ホスト名の小文字（頭の www. を外す）。読めなければ null */
function hostOf(text: string): string | null {
  try {
    return stripWww(new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase());
  } catch {
    return null;
  }
}

/**
 * リンクの文字に見える URL・ドメインのホスト名（見えない文字を外して全角を半角にそろえ、ドットに見える文字を . にそろえてから、
 * 文の中の http・https の URL のホストと、文字・数字・. ・- 以外の所で区切った部分のうちドメインに見えるもののすべて。
 * 空白で区切った語全体で見ると「github.com🔒」「Docs:github.com」「github.com（公式）」「github.com's」をドメインと読めないため）。
 * ファイル名に見える部分は除く。行き先の URL の中に同じ語があっても緩めない（https://evil.example/github.com ですり抜けるため。
 * 拡張子にもドメインにもなる名前だけは、行き先のファイル名と同じか、パスの中なら除く）。ドットに見える文字で区切った部分は、
 * 実在するトップレベルドメインで終わるときだけ（「設計・実装」「React・Vue」をドメインと読まない）。ASCII でない部分は URL として読んだ punycode のホスト名
 * （行き先の URL のホスト名も punycode なので、そのまま比べる。行き先の側の国際化ドメイン名は idn の警告が別に出す）
 */
function textHostsOf(text: string, url: URL): string[] {
  const marked = text.replace(INVISIBLE, "").normalize("NFKC").replace(DOT_LIKE, DOT_MARK);
  // URL の中のドットに見える文字は . として読む（http(s):// が付いていれば、ドメインとして書いたものとみなす）。marked と同じ長さ
  let dotted = marked.replaceAll(DOT_MARK, ".");
  const hosts = new Set<string>();
  const add = (candidate: string) => {
    const host = hostOf(candidate);
    if (host) hosts.add(host);
  };
  for (const m of dotted.matchAll(URL_IN_TEXT)) add(m[1].replace(/[.-]+$/, ""));
  // URL の分は空白にして、下の部分の探しから外す（位置は変えない）
  dotted = dotted.replace(URL_IN_TEXT, (m) => " ".repeat(m.length));
  for (const m of dotted.matchAll(DOMAIN_PART)) {
    const part = marked.slice(m.index, m.index + m[0].length);
    const word = m[0].replace(/^[.-]+|[.-]+$/g, "");
    if (!DOMAIN_LIKE.test(word)) continue;
    const inPath = dotted[m.index - 1] === "/" && dotted[m.index - 2] !== "/";
    if (!isDomainWord(word, url, inPath)) continue;
    if (!part.includes(DOT_MARK)) add(word);
    else if (TOP_LEVEL_DOMAINS.has(hostOf(word)?.split(".").pop() ?? "")) add(word);
  }
  return [...hosts];
}

const stripWww = (host: string) => host.replace(/^www\./, "");

/** 外部リンクの警告（当たるものを並びの順に）。text はリンクに書かれた文字（省けば文字との食い違いは見ない） */
export function linkWarnings(href: string, text?: string): LinkWarning[] {
  const url = webUrlOf(href);
  if (!url) return [];
  const hostname = url.hostname.toLowerCase();
  const found: LinkWarning[] = [];
  const actual = stripWww(hostname);
  const shown = text === undefined ? [] : textHostsOf(text, url);
  if (shown.some((host) => host !== actual && !actual.endsWith(`.${host}`))) found.push("text_mismatch");
  if (url.username || url.password) found.push("userinfo");
  if (hostname.split(".").some((label) => label.startsWith("xn--"))) found.push("idn");
  if ((IPV4.test(hostname) || hostname.startsWith("[")) && !isLoopback(hostname)) found.push("ip");
  return found;
}
