import { useRef, useState, type CSSProperties, type DragEvent, type ReactElement, type ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import type { TreeNode, TreeRow } from "./tree";
import { useFixedWindow } from "./useFixedWindow";
import type { Tree } from "./useTree";

/** 木のドラッグ: dragType のドラッグの間だけ落とせる。フォルダの行に落とせばその中、ほかの行ならその親（null はいちばん上の段） */
export interface TreeDrag<K> {
  dragType: string;
  canDrag?(key: K): boolean;
  onDropInto(target: K | null, dragged: readonly K[]): void;
  /** 閉じたフォルダに重ねて待つと開くまでの時間（既定 700ms） */
  springMs?: number;
}

/** 名前を変えている行（Enter・ピントを外すと決め、Esc でやめる。使えない名前は validate が理由を返す） */
export interface TreeRenaming<K> {
  key: K;
  initial: string;
  validate?(name: string): string | null;
  submit(name: string): void;
  cancel(): void;
}

/** ドラッグを重ねている落とす先（undefined は重ねていない・null はいちばん上の段）と、閉じたフォルダを開く時計 */
function useTreeDrag<K, N extends TreeNode<K>>(tree: Tree<K, N>, drag: TreeDrag<K> | undefined) {
  const [target, setTarget] = useState<K | null | undefined>(undefined);
  const dragged = useRef<readonly K[]>([]);
  const spring = useRef<{ key: K; timer: ReturnType<typeof setTimeout> } | null>(null);
  const stopSpring = () => {
    if (spring.current) clearTimeout(spring.current.timer);
    spring.current = null;
  };
  const accepts = (e: DragEvent) => drag !== undefined && e.dataTransfer.types.includes(drag.dragType);
  const rowProps = (row: TreeRow<K, N>) => {
    if (!drag) return {};
    const into = row.hasChildren ? row.key : row.parent;
    return {
      draggable: drag.canDrag?.(row.key) ?? true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        // 選んだ行をつかめば、選んだものすべて（行の並び）
        dragged.current = tree.selection?.has(row.key) ? tree.rows.filter((r) => tree.selection?.has(r.key)).map((r) => r.key) : [row.key];
        e.dataTransfer.setData(drag.dragType, "");
        e.dataTransfer.effectAllowed = "move";
        startDragGhost(e, { count: dragged.current.length });
      },
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setTarget(into);
        if (row.hasChildren && !row.open && spring.current?.key !== row.key) {
          stopSpring();
          spring.current = { key: row.key, timer: setTimeout(() => tree.setOpen(row.key, true), drag.springMs ?? 700) };
        }
      },
      onDragLeave: () => {
        stopSpring();
        setTarget(undefined);
      },
      onDrop: (e: DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        stopSpring();
        setTarget(undefined);
        drag.onDropInto(into, dragged.current);
      },
    };
  };
  return { target, rowProps };
}

/**
 * 木を描く（状態と操作は useTree）。rowHeight を渡すと固定の高さの窓で見えている行だけを描く（渡さなければすべて）。
 * 行は --depth（段）を持つ。renderRow が行の中身、trailing が行の右の飾り、renaming の行は名前の欄になる
 */
export function TreeView<K, N extends TreeNode<K>>({
  tree,
  rowHeight,
  className,
  renderRow,
  trailing,
  renaming,
  drag,
}: {
  tree: Tree<K, N>;
  rowHeight?: number;
  className?: string;
  renderRow(row: TreeRow<K, N>, state: { focused: boolean; selected: boolean }): ReactNode;
  trailing?(row: TreeRow<K, N>): ReactNode;
  renaming?: TreeRenaming<K> | null;
  drag?: TreeDrag<K>;
}): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const win = useFixedWindow({ count: tree.rows.length, rowHeight: rowHeight ?? 0, scroller });
  const { target, rowProps: dragProps } = useTreeDrag(tree, drag);
  const first = rowHeight ? win.first : 0;
  const shown = rowHeight ? tree.rows.slice(first, win.last + 1) : tree.rows;
  return (
    <div ref={scroller} className={cx("tree-view", className)} {...tree.containerProps}>
      <div className="tree-view-rows" style={rowHeight ? { position: "relative", height: win.totalHeight } : undefined}>
        {shown.map((row, i) => {
          const focused = tree.focused === row.key;
          const selected = tree.selection?.has(row.key) ?? false;
          const place: CSSProperties = rowHeight ? { position: "absolute", insetInline: 0, top: win.offsetOf(first + i), height: rowHeight } : {};
          return (
            <div
              key={String(row.key)}
              {...tree.rowProps(row.key)}
              {...dragProps(row)}
              className={cx("list-item tree-row tree-indent", focused && "focused", selected && "selected", target === row.key && "drop-target")}
              style={{ "--depth": row.depth, ...place } as CSSProperties}
            >
              {renaming?.key === row.key ? (
                <InlineName initial={renaming.initial} validate={renaming.validate} onSubmit={renaming.submit} onCancel={renaming.cancel} />
              ) : (
                renderRow(row, { focused, selected })
              )}
              {trailing?.(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
