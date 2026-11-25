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
const DOMAIN_LIKE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

/** この Mac の中（localhost・ループバック）か */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" || /^127\./.test(hostname);
}

/**
 * 見えない文字（制御文字・ゼロ幅・文字の並びを変える印・ソフトハイフン・見えない字形）。
 * リンクの文字に混ぜて、URL に見える語を URL と読ませない書き方を外すため
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\u3164\ufeff\uffa0]/g;
/** 文の中の http・https の URL のホスト（文字・数字・. と - が続く所まで。… などの記号で切る） */
const URL_IN_TEXT = /https?:\/\/([\p{L}\p{N}.-]+)/giu;
/** 語の前後のかっこ・句読点 */
const WORD_EDGES = /^[(\[「『"'<（【]+|[)\]」』"'>）】.,、。:;!?…]+$/gu;

/** ホスト名の小文字（頭の www. を外す）。読めなければ null */
function hostOf(text: string): string | null {
  try {
    return stripWww(new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase());
  } catch {
    return null;
  }
}

/**
 * リンクの文字に見える URL・ドメインのホスト名（見えない文字を外してから、文の中の http・https の URL と、ドメインに見える語のすべて）。
 * 「https://good.example x」「https://good.example<small>…</small>」のように、ほかの文字が混ざっていても拾う
 */
function textHostsOf(text: string): string[] {
  const visible = text.replace(INVISIBLE, "");
  const hosts = new Set<string>();
  const add = (candidate: string) => {
    const host = hostOf(candidate);
    if (host) hosts.add(host);
  };
  for (const m of visible.matchAll(URL_IN_TEXT)) add(m[1].replace(/[.-]+$/, ""));
  for (const word of visible.split(/\s+/)) {
    const w = word.replace(WORD_EDGES, "");
    if (DOMAIN_LIKE.test(w)) add(w);
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
  const shown = text === undefined ? [] : textHostsOf(text);
  if (shown.some((host) => host !== actual && !actual.endsWith(`.${host}`))) found.push("text_mismatch");
  if (url.username || url.password) found.push("userinfo");
  if (hostname.split(".").some((label) => label.startsWith("xn--"))) found.push("idn");
  if ((IPV4.test(hostname) || hostname.startsWith("[")) && !isLoopback(hostname)) found.push("ip");
  return found;
}
