import { Fragment, useMemo } from "react";
import { useHighlight } from "@/hooks/useHighlight";
import { CodeLine } from "./CodeLine";

/**
 * 色付きのコード（行ごとに CodeLine を改行でつなぐ。枠の <pre> などは呼ぶ側に置く）。色が届くまで・色を付けない言語は文字のまま出す。
 * lang は lib/highlight の言語の名前（ファイルなら languageOf(パス)、シェルのコマンドなら "shellscript"。heredoc の本文はその言語で色を付ける）。
 * undefined なら色を付けない（閉じている欄など、見えるまで色付けを始めないときにも使う）
 */
export function HighlightedCode({ code, lang }: { code: string; lang: string | undefined }) {
  const lines = useMemo(() => code.split("\n"), [code]);
  const tokens = useHighlight(lines, lang);
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          <CodeLine tokens={tokens?.[i]} text={line} />
        </Fragment>
      ))}
    </>
  );
}
