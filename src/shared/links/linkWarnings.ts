// 外部リンクを開く前の確認で添える警告（メモの仕様書「0027_チャット欄の外の画像とリンク」）。AI を使わず、URL とリンクの文字だけで機械的に決める

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

/** リンクの文字が URL・ドメインに見えれば、そのホスト名（小文字・頭の www. を外す） */
function textHostOf(text: string): string | null {
  const t = text.trim();
  if (!DOMAIN_LIKE.test(t)) return null;
  try {
    return stripWww(new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).hostname.toLowerCase());
  } catch {
    return null;
  }
}

const stripWww = (host: string) => host.replace(/^www\./, "");

/** 外部リンクの警告（当たるものを並びの順に）。text はリンクに書かれた文字（省けば文字との食い違いは見ない） */
export function linkWarnings(href: string, text?: string): LinkWarning[] {
  const url = webUrlOf(href);
  if (!url) return [];
  const hostname = url.hostname.toLowerCase();
  const found: LinkWarning[] = [];
  const shown = text === undefined ? null : textHostOf(text);
  const actual = stripWww(hostname);
  if (shown !== null && shown !== actual && !actual.endsWith(`.${shown}`)) found.push("text_mismatch");
  if (url.username || url.password) found.push("userinfo");
  if (hostname.split(".").some((label) => label.startsWith("xn--"))) found.push("idn");
  if ((IPV4.test(hostname) || hostname.startsWith("[")) && !isLoopback(hostname)) found.push("ip");
  return found;
}
