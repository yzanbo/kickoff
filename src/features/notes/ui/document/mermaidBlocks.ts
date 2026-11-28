// ノートの Mermaid の塊を見分ける純粋な関数（Markdown 表示で図にし、コードの帯と色を付けない）。
// 返答の表示と同じ決まりで、読み取りの木のコードの塊（codeBlocks）のうち、言語名（info の先頭の語。大文字・小文字を区別しない）が mermaid のもの。
// ノートは書いている途中があるので、閉じた塊だけを図にする
import type { Tree } from "@lezer/common";
import { codeBlocks, type CodeBlockSource } from "./codeBlocks";
import { cacheByTree } from "./treeCache";

/** Mermaid の塊。from は開きの行の頭、to は閉じの行の終わり、code は中身（字下げを除いたもの） */
export interface MermaidBlock {
  from: number;
  to: number;
  code: string;
}

/** コードの塊の言語名（info の先頭の語。返答の表示の language-xxx と同じ所） */
export const fenceInfoLanguage = (info: string): string => info.split(/\s/)[0] ?? "";

/** 図にする塊か（閉じていて、言語名が mermaid） */
export const isMermaidBlock = (block: CodeBlockSource): boolean => block.closed && fenceInfoLanguage(block.info).toLowerCase() === "mermaid";

/** 文の中の Mermaid の塊（書いた順。同じ木と文には同じ結果） */
export const mermaidBlocks = cacheByTree((tree: Tree, text: string): MermaidBlock[] =>
  codeBlocks(tree, text)
    .filter(isMermaidBlock)
    .map((b) => ({ from: b.headFrom, to: b.to, code: b.code })),
);
