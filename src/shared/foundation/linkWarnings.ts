// 外部リンクを開く前の確認で添える警告。AI を使わず、URL とリンクの文字だけで機械的に決める

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
/** ドメインに見える語（ASCII でない文字の語も。аpple.com のようにキリル文字を混ぜた語も、URL として読んで punycode で比べる） */
const DOMAIN_LIKE = /^(?:https?:\/\/)?(?:[\p{L}\p{N}\p{M}-]+\.)+(?:[\p{L}\p{M}]{2,}|xn--[a-z0-9-]+)(?::\d+)?(?:[/?#]\S*)?$/iu;

/** この Mac の中（localhost・ループバック）か */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" || /^127\./.test(hostname);
}

/**
 * 見えない文字（制御文字・書式の文字（ゼロ幅・文字の並びを変える印・ソフトハイフン・タグ・行間注釈の印）・既定で描かない文字
 * （異体字セレクタ・ハングルの埋め字など））。リンクの文字に混ぜて、URL に見える語を URL と読ませない書き方を外すため
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
/** 文の中の http・https の URL のホスト（文字・数字・. と - が続く所まで。… などの記号で切る） */
const URL_IN_TEXT = /https?:\/\/([\p{L}\p{N}.-]+)/giu;
/** 語の前後のかっこ・句読点 */
const WORD_EDGES = /^[(\[「『"'<（【]+|[)\]」』"'>）】.,、。:;!?…]+$/gu;

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
 * 語がドメインとして比べるものか（http://・https://・www. で始まるものはいつも。ほかは最後のラベルがファイルの拡張子でないもの。
 * 拡張子にもドメインにもなるものは、行き先のファイル名と同じでないもの）
 */
function isDomainWord(word: string, url: URL): boolean {
  if (/^(?:https?:\/\/|www\.)/i.test(word)) return true;
  const host = word.split(/[/?#:]/, 1)[0];
  const extension = host.slice(host.lastIndexOf(".") + 1).toLowerCase();
  if (FILE_EXTENSIONS.has(extension)) return false;
  return !(FILE_OR_DOMAIN_EXTENSIONS.has(extension) && host.toLowerCase() === fileNameOf(url));
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
 * リンクの文字に見える URL・ドメインのホスト名（見えない文字を外して全角を半角にそろえてから、文の中の http・https の URL と、ドメインに見える語のすべて。
 * ファイル名に見える語は除く。行き先の URL の中に同じ語があっても緩めない（https://evil.example/github.com ですり抜けるため。
 * 拡張子にもドメインにもなる名前だけは、行き先のファイル名と同じなら除く）。ASCII でない語は URL として読んだ punycode のホスト名
 * （行き先の URL のホスト名も punycode なので、そのまま比べる。行き先の側の国際化ドメイン名は idn の警告が別に出す）。
 * 「https://good.example x」「https://good.example<small>…</small>」のように、ほかの文字が混ざっていても拾う
 */
function textHostsOf(text: string, url: URL): string[] {
  const visible = text.replace(INVISIBLE, "").normalize("NFKC");
  const hosts = new Set<string>();
  const add = (candidate: string) => {
    const host = hostOf(candidate);
    if (host) hosts.add(host);
  };
  for (const m of visible.matchAll(URL_IN_TEXT)) add(m[1].replace(/[.-]+$/, ""));
  for (const word of visible.split(/\s+/)) {
    const w = word.replace(WORD_EDGES, "");
    if (DOMAIN_LIKE.test(w) && isDomainWord(w, url)) add(w);
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
