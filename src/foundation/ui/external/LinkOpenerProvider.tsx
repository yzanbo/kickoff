import type { ReactNode } from "react";
import { MarkdownLinkOpenerContext, type MarkdownLinkOpener } from "@/foundation/ui/kit/markdown/markdownLinks";
import { openWebLink } from "./linkOpen";

/**
 * Markdown の外部リンクを、確認の画面と開き先の設定で開くようにする（App と別ウィンドウが置く）。projectId はいま見ているプロジェクト
 * （Kickoff のブラウザのタブを開く所。分からなければ既定のブラウザ）
 */
export function LinkOpenerProvider({ projectId, children }: { projectId: number | undefined; children: ReactNode }) {
  const open: MarkdownLinkOpener = (e, href, text) => void openWebLink(href, text, { invert: e.metaKey || e.ctrlKey, projectId });
  return <MarkdownLinkOpenerContext.Provider value={open}>{children}</MarkdownLinkOpenerContext.Provider>;
}
