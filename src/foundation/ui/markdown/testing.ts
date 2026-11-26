// Markdown の部品のテストの補助

type MdNode = { type?: string; data?: Record<string, unknown>; children?: unknown[] };

/**
 * ファイルのチップの差し込み（MarkdownFileLinks の remark のプラグイン）の代わり。インラインコードに、path を開くチップの印を付ける
 * （ブロックをまたがない。本物は作業場所のファイルの一覧が要るため）
 */
export const fakeFileLinks =
  (path = "x") =>
  (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (node.type === "inlineCode") node.data = { hName: "a", hProperties: { href: "#", dataFilePath: path } };
      node.children?.forEach((c) => walk(c as MdNode));
    };
    walk(tree);
  };
