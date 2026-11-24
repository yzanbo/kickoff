import { useState } from "react";
import { imageFileType, isSvgFile } from "@shared/files/imageFiles";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { pagePreviewKind } from "./filePreview";
import { storage } from "./storage";

/** プレビューの種類（raster = SVG 以外の画像でプレビューだけ / svg・markdown・html = プレビューとコードを切り替える / null = コードだけ） */
export type PreviewKind = "raster" | "svg" | "markdown" | "html" | null;

export interface PreviewMode {
  kind: PreviewKind;
  /** コードを出している（切り替えられる種類で、いまプレビューでない） */
  showCode: boolean;
  /** プレビューを出している（svg・markdown・html でコードを出していない。raster は含めない） */
  previewing: boolean;
  /** コードの編集の部品を作ってある（初めてコードを出すまで作らない。プレビューの間も書きかけを残すため隠すだけ） */
  codeMounted: boolean;
  /** プレビューに切り替えたときの書きかけの中身（保存していなければ、これをプレビューに出す） */
  draft: string | null;
  /** プレビューとコードを切り替える（currentText = いま書いてある中身。プレビューへ移るときに覚える） */
  toggle(currentText: string | null): void;
}

/**
 * ファイルの見出しの「プレビュー / コードを表示」の様子。SVG は初めはプレビュー、Markdown・HTML は最後に選んだ方（storage.ts の pagePreview）。
 * 検索の行・差分・新しいファイルから来たとき（startWithCode）はコード
 */
export function usePreviewMode(path: string, startWithCode: boolean): PreviewMode {
  const page = pagePreviewKind(path);
  const kind: PreviewKind = isSvgFile(path) ? "svg" : imageFileType(path) !== null ? "raster" : page;
  const [pagePreview, setPagePreview] = useSetting(storage.settings.pagePreview);
  const [showCode, setShowCode] = useState(() => startWithCode || (page !== null && !pagePreview));
  const [codeMounted, setCodeMounted] = useState(showCode);
  const [draft, setDraft] = useState<string | null>(null);
  const toggle = (currentText: string | null) => {
    if (showCode) setDraft(currentText);
    else setCodeMounted(true);
    // Markdown・HTML は、次に開くファイルも同じ出し方にする
    if (page) setPagePreview(showCode);
    setShowCode(!showCode);
  };
  return { kind, showCode, previewing: (kind === "svg" || page !== null) && !showCode, codeMounted, draft, toggle };
}
