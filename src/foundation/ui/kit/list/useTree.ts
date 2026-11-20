import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { isComposing } from "@/foundation/ui/lib/keys";
import { flattenTree, treeKeyMove, type OpenState, type TreeNode, type TreeRow } from "./tree";

export interface UseTreeOptions<K, N extends TreeNode<K>> {
  roots: readonly N[];
  /** 開閉の覚え（useFolds をそのまま渡せる） */
  open: OpenState<K>;
  /** 選んでいる行（useMultiSelect の戻り値をそのまま渡せる） */
  selection?: { has(key: K): boolean };
  /** 行を押した・Space（ファイルを開く・フォルダを開閉するかは呼ぶ側が決める） */
  onActivate(key: K, e: KeyboardEvent | MouseEvent): void;
  /** Enter で名前を変え始める（なければ Enter も onActivate） */
  onRename?(key: K): void;
  /** children が "lazy" の行を開いた */
  onLoadChildren?(key: K): void;
  /** 木の名前（aria-label） */
  label: string;
}

export interface Tree<K, N extends TreeNode<K> = TreeNode<K>> {
  rows: readonly TreeRow<K, N>[];
  focused: K | null;
  setFocused(key: K | null): void;
  /** 開く・閉じる（"lazy" の子は開いたときに読み込む） */
  setOpen(key: K, open: boolean): void;
  selection: { has(key: K): boolean } | undefined;
  containerProps: { role: "tree"; "aria-label": string; "aria-activedescendant"?: string; tabIndex: 0; onKeyDown(e: KeyboardEvent): void };
  rowProps(key: K): { id: string; role: "treeitem"; "aria-level": number; "aria-expanded"?: boolean; "aria-selected": boolean; onClick(e: MouseEvent): void };
}

/**
 * 木の状態と操作: 開いているフォルダの中だけを行に並べ、木そのものにピントを置いたまま行を移る（aria-activedescendant）。
 * キーは treeKeyMove（↑↓・Home / End・→ で開く / 子へ・← で閉じる / 親へ・Space で開く・Enter で名前の変更）
 */
export function useTree<K, N extends TreeNode<K>>(o: UseTreeOptions<K, N>): Tree<K, N> {
  const rows = flattenTree<K, N>(o.roots, o.open);
  const [focused, setFocused] = useState<K | null>(null);
  const baseId = useId();
  const idOf = (key: K) => `${baseId}-${rows.findIndex((r) => r.key === key)}`;
  const setOpen = (key: K, open: boolean) => {
    o.open.set(key, open);
    if (open && rows.find((r) => r.key === key)?.node.children === "lazy") o.onLoadChildren?.(key);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (isComposing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const move = treeKeyMove(rows, focused, e.key);
    if (!move) return;
    e.preventDefault();
    if (move.type === "focus") setFocused(move.key);
    else if (move.type === "open" || move.type === "close") setOpen(move.key, move.type === "open");
    else if (move.type === "rename" && o.onRename) o.onRename(move.key);
    else o.onActivate(move.key, e);
  };
  const focusedRow = rows.some((r) => r.key === focused) ? focused : null;
  return {
    rows,
    focused: focusedRow,
    setFocused,
    setOpen,
    selection: o.selection,
    containerProps: { role: "tree", "aria-label": o.label, "aria-activedescendant": focusedRow === null ? undefined : idOf(focusedRow), tabIndex: 0, onKeyDown },
    rowProps: (key) => {
      const row = rows.find((r) => r.key === key);
      return {
        id: idOf(key),
        role: "treeitem",
        "aria-level": (row?.depth ?? 0) + 1,
        "aria-expanded": row?.hasChildren ? row.open : undefined,
        "aria-selected": o.selection?.has(key) ?? key === focusedRow,
        onClick: (e) => {
          setFocused(key);
          o.onActivate(key, e);
        },
      };
    },
  };
}
