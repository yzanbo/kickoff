// AI に返すブラウザの結果の文（純粋関数）と、AI が渡した URL の補い
import type { BrowserTabInfo, PageSnapshot } from "./control.js";

/** 見えている文の上限（AI のコンテキストを食いつぶさない） */
export const SNAPSHOT_TEXT_MAX = 12_000;

/**
 * AI が渡した URL を開ける形にする: 書いてあればそのまま、localhost・127.0.0.1・ポート付きは http、ほかの名前は https を補う。
 * http(s) 以外（file・javascript など）は null（埋め込みブラウザは http(s) だけ開く）
 */
export function normalizeBrowserUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1]?.toLowerCase();
  if (scheme && !/^(localhost|[\d.]+|\[[\da-f:]+\])$/i.test(scheme) && !/^\d+$/.test(s.slice(scheme.length + 1).split("/")[0] ?? "")) {
    return scheme === "http" || scheme === "https" ? s : null;
  }
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(s) || /^[^/]+:\d+(\/|$)/.test(s);
  return `${local ? "http" : "https"}://${s}`;
}

/** タブの一覧の文（このチャットのプロジェクトのタブを先に） */
export function formatTabs(tabs: BrowserTabInfo[], projectId: number, lastUsed: number | null): string {
  if (tabs.length === 0) return "ブラウザのタブはまだありません。browser_open で開いてください。";
  const ordered = [...tabs.filter((t) => t.project_id === projectId), ...tabs.filter((t) => t.project_id !== projectId)];
  return ordered
    .map((t) => {
      const marks = [t.project_id === projectId ? "このプロジェクト" : "ほかのプロジェクト", ...(t.id === lastUsed ? ["前に使ったタブ"] : []), ...(t.loading ? ["読み込み中"] : [])];
      return `- tab_id=${t.id}: ${t.title || "(題なし)"} — ${t.url || "about:blank"}（${marks.join("・")}）`;
    })
    .join("\n");
}

/** 1 つのタブの様子（開いた・移ったあとに返す） */
export const formatTab = (t: BrowserTabInfo) => `tab_id=${t.id}: ${t.title || "(題なし)"} — ${t.url || "about:blank"}${t.loading ? "（まだ読み込み中）" : ""}`;

/** ページの読み取りの文（題・URL・押せる要素の一覧（[ref] 種類 名前 → リンク先）・見えている文） */
export function formatSnapshot(s: PageSnapshot, tabId: number): string {
  const elements = s.elements.map((e) => `[${e.ref}] ${e.tag}${e.type ? `[${e.type}]` : ""} ${e.name || "(名前なし)"}${e.href ? ` → ${e.href}` : ""}`);
  const text = s.text.length > SNAPSHOT_TEXT_MAX ? `${s.text.slice(0, SNAPSHOT_TEXT_MAX)}\n…（以下 ${s.text.length - SNAPSHOT_TEXT_MAX} 文字を省略）` : s.text;
  const scroll = `スクロール: ${Math.round(s.scroll.y)} / ${Math.max(0, Math.round(s.scroll.height - s.scroll.viewport))}px`;
  return [
    `tab_id=${tabId}: ${s.title || "(題なし)"} — ${s.url}`,
    scroll,
    "",
    `## 押せる・入力できる要素（browser_click・browser_type の ref に番号を渡す）`,
    elements.length > 0 ? elements.join("\n") : "(なし)",
    "",
    "## ページの文",
    text || "(文なし)",
  ].join("\n");
}
