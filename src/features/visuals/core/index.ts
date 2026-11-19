// AI が描く図の機能のコアの入口（ほかの機能はここだけを読む）
import type { Context } from "hono";
import { VISUAL_FRAME_CSP, VISUAL_FRAME_SHELL } from "@shared/visuals/visualDocument";
import type { CoreFeature } from "@/foundation/core/feature";

/** 図を入れる枠のページ（認証の外） */
export function createVisuals(): CoreFeature<null> {
  return { name: "visuals", api: null, pages: { "/visual-frame": visualFrame } };
}

/**
 * AI が返答に描いた図（SVG・HTML）を入れる枠のページ（認証の外。中身は画面が postMessage で渡すので、秘密は何も持たない）。
 * 画面の CSP を引き継がないよう別のページにし、図だけの CSP（決めた CDN のほかへは通信しない）を見出しで付ける。画面は sandbox="allow-scripts" の iframe で開く
 */
function visualFrame(c: Context) {
  c.header("Content-Security-Policy", VISUAL_FRAME_CSP);
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  return c.html(VISUAL_FRAME_SHELL);
}
