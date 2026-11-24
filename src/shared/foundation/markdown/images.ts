// Markdown の文に書かれた画像の拾い出し（返答の画像の数と URL の一覧・Markdown の部品が同じに使う）

const IMAGE_SYNTAX = /!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;

/**
 * Markdown の文に書かれた画像の src（書いた順。`![alt](src "title")` の形だけ。参照の形・コードの中も拾うことがある）。
 * 画面が「host から画像を n 件表示」の数と URL の一覧を作るのに使う（描くのは Markdown の部品）
 */
export function imageSourcesIn(markdown: string): string[] {
  if (!markdown.includes("![")) return [];
  return [...markdown.matchAll(IMAGE_SYNTAX)].map((m) => m[1]);
}
