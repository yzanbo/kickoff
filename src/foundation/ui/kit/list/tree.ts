// 木の行の組み立てとキーの動き（純粋。描くのは TreeView・状態は useTree）
import { stepIndex } from "./useRovingList";

/** 木の 1 つ。children があればフォルダのように開閉できる（"lazy" は開いたときに子を読み込む） */
export interface TreeNode<K> {
  key: K;
  children?: readonly TreeNode<K>[] | "lazy";
}

/** 描く 1 行（開いているフォルダの中だけを、上から順に並べたもの） */
export interface TreeRow<K, N extends TreeNode<K> = TreeNode<K>> {
  key: K;
  node: N;
  depth: number;
  parent: K | null;
  hasChildren: boolean;
  open: boolean;
}

/** 開閉の覚え（useFolds の戻り値をそのまま渡せる） */
export interface OpenState<K> {
  isOpen(key: K): boolean;
  set(key: K, open: boolean): void;
}

/** 開いているフォルダの中だけを行に並べる */
export function flattenTree<K, N extends TreeNode<K>>(roots: readonly N[], open: Pick<OpenState<K>, "isOpen">): TreeRow<K, N>[] {
  const rows: TreeRow<K, N>[] = [];
  const walk = (nodes: readonly N[], depth: number, parent: K | null) => {
    for (const node of nodes) {
      const hasChildren = node.children !== undefined;
      const isOpen = hasChildren && open.isOpen(node.key);
      rows.push({ key: node.key, node, depth, parent, hasChildren, open: isOpen });
      if (isOpen && Array.isArray(node.children)) walk(node.children as readonly N[], depth + 1, node.key);
    }
  };
  walk(roots, 0, null);
  return rows;
}

/** キーで起きること: ピントを移す・開く・閉じる・開く（ファイルなど）・名前を変え始める */
export interface TreeMove<K> {
  type: "focus" | "open" | "close" | "activate" | "rename";
  key: K;
}

/**
 * 木のキー: ↑↓ で行を移る（端では回り込む）・Home / End で先頭・最後・→ で開く（開いていれば最初の子へ）・
 * ← で閉じる（閉じていれば親へ）・Space で開く・Enter で名前を変え始める（一覧の決まり。lib/keys の isOpenKey・isRenameKey）。
 * 動かないキーは null
 */
export function treeKeyMove<K>(rows: readonly TreeRow<K, TreeNode<K>>[], focused: K | null, key: string): TreeMove<K> | null {
  const index = rows.findIndex((r) => r.key === focused);
  const row = rows[index] as TreeRow<K> | undefined;
  const focus = (target: TreeRow<K> | undefined): TreeMove<K> | null => (target ? { type: "focus", key: target.key } : null);
  switch (key) {
    case "ArrowDown":
    case "ArrowUp":
      return focus(rows[stepIndex(index, key === "ArrowDown" ? 1 : -1, rows.length)]);
    case "Home":
      return focus(rows[0]);
    case "End":
      return focus(rows[rows.length - 1]);
    case "ArrowRight":
      if (!row?.hasChildren) return null;
      if (!row.open) return { type: "open", key: row.key };
      return rows[index + 1]?.parent === row.key ? focus(rows[index + 1]) : null;
    case "ArrowLeft":
      if (!row) return null;
      if (row.open) return { type: "close", key: row.key };
      return row.parent === null ? null : focus(rows.find((r) => r.key === row.parent));
    case " ":
      return row ? { type: "activate", key: row.key } : null;
    case "Enter":
      return row ? { type: "rename", key: row.key } : null;
  }
  return null;
}
