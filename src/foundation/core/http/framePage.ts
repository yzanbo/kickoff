// 閉じた枠（sandbox="allow-scripts" の iframe）に入れるページの応答（認証の外。中身は画面が postMessage で渡すので、秘密は何も持たない）。
// 画面の CSP を引き継がないよう別のページにし、枠だけの CSP を見出しで付ける
import { createHash } from "node:crypto";
import type { Context } from "hono";
import { MERMAID_FRAME_HTML, MERMAID_FRAME_SCRIPT, mermaidFrameCsp } from "@shared/foundation/mermaidFrame";

/** 枠のページを返す口（CSP の見出し・覚えない・中身の種類を推測させない） */
export function framePage(csp: string, html: string): (c: Context) => Response {
  return (c) => {
    c.header("Content-Security-Policy", csp);
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    return c.html(html);
  };
}

/** Mermaid の図を描く枠のページ（中のスクリプトだけを、その文字の SHA-256 で許す。@shared/foundation/mermaidFrame.ts） */
export const mermaidFramePage = framePage(mermaidFrameCsp(createHash("sha256").update(MERMAID_FRAME_SCRIPT, "utf8").digest("base64")), MERMAID_FRAME_HTML);
