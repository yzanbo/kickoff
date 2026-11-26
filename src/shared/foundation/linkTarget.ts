// リンクの行き先の判定（Markdown のリンク・HTML の本文のリンク・外で開く IPC で同じものを使う）。
// 書かれた文字列はそのまま使わず、URL として読み直した形だけを返す（確認の画面に出す URL と、開く URL を同じにするため）
import { hasInvisibleChar } from "./invisibleChars";

/** リンクにしてよい行き先: 外のページ（http・https。読み直した URL）か、同じ文書の中の場所（# の後ろ。ID の文字列） */
export type LinkTarget = { kind: "web"; url: string } | { kind: "fragment"; id: string };

/**
 * 改行・制御文字・空白（全角のものも）・見えない文字（ゼロ幅・文字の並びを変える印）を含むか。ブラウザは URL を読むときに改行・タブを黙って捨てるので、
 * 見た目と違う行き先にならないよう、含むものは読み直さずに断る
 */
const hasUnsafeChar = (href: string) => /\s/.test(href) || hasInvisibleChar(href);

/** # の後ろを ID として読む（% の形は戻す。戻せない形はそのまま） */
function fragmentId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * リンクの行き先。リンクにしないもの（相対のパス・mailto: などほかのスキーム・読めない URL・改行や空白を含むもの）は null。
 * //host は https として読む。基準の URL を渡さずに読むので、/\host・/api/… のような相対の形は、画面の URL に解決されずに null になる
 */
export function linkTargetOf(href: unknown): LinkTarget | null {
  if (typeof href !== "string" || href === "" || hasUnsafeChar(href)) return null;
  if (href.startsWith("#")) return href.length > 1 ? { kind: "fragment", id: fragmentId(href.slice(1)) } : null;
  let url: URL;
  try {
    url = new URL(href.startsWith("//") ? `https:${href}` : href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return { kind: "web", url: url.href };
}

/** 外のページ（http・https）の読み直した URL。ほかは null */
export function webLinkOf(href: unknown): string | null {
  const target = linkTargetOf(href);
  return target?.kind === "web" ? target.url : null;
}
