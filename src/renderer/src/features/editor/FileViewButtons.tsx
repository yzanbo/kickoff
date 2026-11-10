import { CodeXml, Eye, Image, WrapText } from "lucide-react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import type { PagePreviewKind } from "./filePreview";

/** ファイルの見出しの「折り返す」（横幅に入らない行を次の行へ続けるか。エディタの中の ⌥Z と同じ） */
export function WrapToggle({ wrap, onChange }: { wrap: boolean; onChange: (wrap: boolean) => void }) {
  return (
    <IconButton
      icon={WrapText}
      className={cx(wrap && "active")}
      aria-pressed={wrap}
      label={wrap ? "折り返さない" : "折り返す"}
      title={wrap ? "折り返さない（横幅に入らない行は横にスクロールする）" : "折り返す（横幅に入らない行を次の行へ続ける）"}
      keys="⌥Z"
      onClick={() => onChange(!wrap)}
    />
  );
}

/** ファイルの見出しの「プレビュー / コードを表示」（SVG は画像、Markdown・HTML は書式を付けた表示） */
export function PreviewToggle({ kind, showCode, onClick }: { kind: PagePreviewKind | "svg"; showCode: boolean; onClick: () => void }) {
  const name = kind === "svg" ? "SVG" : kind === "html" ? "HTML" : "Markdown";
  return (
    <button
      className="btn btn-sm"
      aria-pressed={showCode}
      title={showCode ? (kind === "svg" ? "画像として表示します" : "書式を付けて表示します（スクリプトは動かさず、リンクは中で開きません）") : `${name} のコードを表示・編集します`}
      onClick={onClick}
    >
      {!showCode ? <CodeXml size={13} aria-hidden /> : kind === "svg" ? <Image size={13} aria-hidden /> : <Eye size={13} aria-hidden />} {showCode ? "プレビュー" : "コードを表示"}
    </button>
  );
}
