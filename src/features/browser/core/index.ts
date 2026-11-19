// 埋め込みブラウザの機能のコアの入口（ほかの機能はここだけを読む）
import type { BrowserControl } from "@shared/browser/control";
import type { CoreFeature } from "@/foundation/core/feature";

/** 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。なければ AI にブラウザのツールを出さない） */
export function createBrowser(env: { control?: BrowserControl }): CoreFeature<BrowserControl | undefined> {
  return { name: "browser", api: env.control };
}
