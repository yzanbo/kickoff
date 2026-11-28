// 読み取りの木のまとまりをたどる補助と、行の頭と終わり（表・HTML のまとまり・コードの塊・リンクの定義・見出しを探す純粋な関数が共通に使う）
import type { SyntaxNode, Tree } from "@lezer/common";

/** pos を含む行の頭（文の中の位置） */
export const lineStartOf = (text: string, pos: number): number => text.lastIndexOf("\n", pos - 1) + 1;

/** pos を含む行の終わり（改行の手前。文の中の位置） */
export function lineEndOf(text: string, pos: number): number {
  const end = text.indexOf("\n", pos);
  return end < 0 ? text.length : end;
}

/** 中をたどる入れ物の節（文の中は探さない） */
const LISTS = new Set(["Document", "BulletList", "OrderedList", "ListItem"]);

interface WalkOptions {
  /** 引用の中もたどるか（コードの塊・HTML のまとまりは行の頭の > を写せないので、引用の中は飾らない） */
  quotes?: boolean;
  /** この範囲にかかる節だけ（見えている所だけを探すとき） */
  from?: number;
  to?: number;
}

/** まとまり（文書・リスト・引用）の直下の節を、書いた順に visit に渡す（入れ物はその中をたどる）。visit が true を返したらやめる */
export function walkBlocks(tree: Tree, visit: (node: SyntaxNode) => boolean | void, { quotes = false, from = 0, to = Infinity }: WalkOptions = {}): void {
  const walk = (node: SyntaxNode): boolean => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.to < from || child.from > to) continue;
      if (LISTS.has(child.name) || (quotes && child.name === "Blockquote")) {
        if (walk(child)) return true;
      } else if (visit(child)) return true;
    }
    return false;
  };
  walk(tree.topNode);
}
