// 編集の部品の文と、そこから見つけた表・HTML のまとまり（飾りの組み立て・セルで書く部品・コードの色付けが共通に読む）
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Text } from "@codemirror/state";
import { htmlBlocks, type HtmlBlockSource } from "./htmlBlocks";
import { tableBlocks, type TableBlock } from "./tableBlocks";

const textByDoc = new WeakMap<Text, string>();

/** 本体の文（同じ文は 1 回だけ作る。飾りの組み立てで何度も読むため） */
export function docText(state: EditorState): string {
  let text = textByDoc.get(state.doc);
  if (text === undefined) {
    text = state.doc.toString();
    textByDoc.set(state.doc, text);
  }
  return text;
}

/** 本体の文の中の表 */
export const tablesOf = (state: EditorState): TableBlock[] => tableBlocks(syntaxTree(state), docText(state));

/** 本体の文の中の HTML のまとまり */
export const htmlBlocksOf = (state: EditorState): HtmlBlockSource[] => htmlBlocks(syntaxTree(state), docText(state));
