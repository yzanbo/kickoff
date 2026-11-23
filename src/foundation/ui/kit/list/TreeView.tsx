import "./TreeView.css";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type HTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { observeSize } from "@/foundation/ui/hooks/useSizeObserver";
import { cx } from "@/foundation/ui/lib/cx";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { guideLevels, subtreeEnds, type TreeNode, type TreeRow } from "./tree";
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
  placeholder?: string;
  /** 文字数の上限（既定 255） */
  maxLength?: number;
  /** 欄のすぐ右に添える文（拡張子など。名前には含めない） */
  suffix?: string;
  selectFrom?: number;
  /** 書き直してもらうたびに増やす（欄を作り直す。使えない名前を決めたあと、書いた名前のまま開き直すとき） */
  round?: number;
}

/** 行に足す属性（右クリック・外へのドラッグ・title・data-* など。className は行のクラスに足す） */
export type TreeRowAttrs = HTMLAttributes<HTMLElement> & { [data: `data-${string}`]: string | boolean | undefined };

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
 * 開いたフォルダの行を上に貼り付けるための、行の箱の上端から見たスクロールの量（--tree-scroll）を入れる。
 * スクロールする祖先（自分も）を探して見張り、描き直すたびにも測り直す（上の要素の高さが変わっても合うように）
 */
function useStickyScroll(box: RefObject<HTMLElement | null>, on: boolean) {
  const measure = useRef<() => void>(() => {});
  useLayoutEffect(() => measure.current());
  useEffect(() => {
    const el = box.current;
    let scroller = el;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!on || !el || !scroller) return;
    const port = scroller;
    const read = () => el.style.setProperty("--tree-scroll", `${port.getBoundingClientRect().top + port.clientTop - el.getBoundingClientRect().top}px`);
    measure.current = read;
    read();
    port.addEventListener("scroll", read, { passive: true });
    const stop = observeSize(port, read);
    return () => {
      measure.current = () => {};
      port.removeEventListener("scroll", read);
      stop();
    };
  }, [box, on]);
}

/**
 * 木を描く（状態と操作は useTree）。rowHeight を渡すと固定の高さの窓で見えている行だけを描く（渡さなければすべて）。
 * 行は --depth（段）を持つ。renderRow が行の中身（名前を変えている行は state.nameField を名前の代わりに置く）、trailing が行の右の飾り、rowProps が行の属性。
 * 縦の線は行ごとに段の数だけ描き、選んだ行（--guide-sel）・ピントのある行（--guide-focus）の段の線を濃くする（styles/types/tree.css）。
 * sticky なら開いたフォルダの行を、中身を流している間だけ上に段の順に積む（rowHeight とは一緒に使わない。行の高さは CSS の --tree-row-height）
 */
export function TreeView<K, N extends TreeNode<K>>({
  tree,
  rowHeight,
  className,
  renderRow,
  trailing,
  renaming,
  drag,
  rowProps,
  sticky = false,
}: {
  tree: Tree<K, N>;
  rowHeight?: number;
  className?: string;
  renderRow(row: TreeRow<K, N>, state: { focused: boolean; selected: boolean; nameField: ReactElement | null }): ReactNode;
  trailing?(row: TreeRow<K, N>): ReactNode;
  renaming?: TreeRenaming<K> | null;
  drag?: TreeDrag<K>;
  rowProps?(row: TreeRow<K, N>): TreeRowAttrs;
  sticky?: boolean;
}): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const win = useFixedWindow({ count: tree.rows.length, rowHeight: rowHeight ?? 0, scroller });
  const { target, rowProps: dragProps } = useTreeDrag(tree, drag);
  useStickyScroll(box, sticky);
  // キーで動かした行が見えるようにスクロールする（押して選んだときは動かさない）
  const keyMoved = useRef(false);
  const focusedIndex = tree.rows.findIndex((r) => r.key === tree.focused);
  useEffect(() => {
    if (!keyMoved.current || focusedIndex < 0) return;
    keyMoved.current = false;
    if (rowHeight) win.scrollToIndex(focusedIndex);
    else box.current?.children[focusedIndex]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);
  const selLevels = guideLevels(tree.rows, (key) => tree.selection?.has(key) ?? false);
  const focusLevels = guideLevels(tree.rows, (key) => key === tree.focused);
  const ends = sticky ? subtreeEnds(tree.rows) : [];
  const first = rowHeight ? win.first : 0;
  const shown = rowHeight ? tree.rows.slice(first, win.last + 1) : tree.rows;
  const onKeyDown = (e: KeyboardEvent) => {
    keyMoved.current = true;
    tree.containerProps.onKeyDown(e);
  };
  return (
    <div ref={scroller} className={cx("tree-view", className)} data-sticky={sticky || undefined} {...tree.containerProps} onKeyDown={onKeyDown}>
      <div ref={box} className="tree-view-rows" style={rowHeight ? { position: "relative", height: win.totalHeight } : undefined}>
        {shown.map((row, i) => {
          const index = first + i;
          const focused = tree.focused === row.key;
          const selected = tree.selection?.has(row.key) ?? false;
          const place: CSSProperties = rowHeight ? { position: "absolute", insetInline: 0, top: win.offsetOf(index), height: rowHeight } : {};
          const end = ends[index] ?? null;
          const vars: Record<`--${string}`, number | undefined> = { "--depth": row.depth, "--guide-sel": selLevels[index] ?? undefined, "--guide-focus": focusLevels[index] ?? undefined };
          if (end !== null) Object.assign(vars, { "--row-index": index, "--row-last": end });
          const nameField =
            renaming?.key === row.key ? (
              <InlineName
                key={renaming.round ?? 0}
                className="tree-rename"
                buttons={false}
                initial={renaming.initial}
                placeholder={renaming.placeholder}
                maxLength={renaming.maxLength ?? 255}
                suffix={renaming.suffix}
                selectFrom={renaming.selectFrom}
                validate={renaming.validate}
                onSubmit={renaming.submit}
                onCancel={renaming.cancel}
              />
            ) : null;
          const { className: extraClass, ...attrs } = rowProps?.(row) ?? {};
          return (
            <div
              key={String(row.key)}
              {...tree.rowProps(row.key)}
              {...dragProps(row)}
              {...attrs}
              // 名前の欄の行は押しても開閉・開くをしない
              onClick={nameField ? undefined : tree.rowProps(row.key).onClick}
              className={cx("list-item tree-row tree-indent", extraClass, focused && "focused", selected && "selected", nameField && "renaming", target === row.key && "drop-target")}
              data-guide={selLevels[index] !== null || focusLevels[index] !== null || undefined}
              data-sticky={end !== null || undefined}
              style={{ ...vars, ...place } as CSSProperties}
            >
              {renderRow(row, { focused, selected, nameField })}
              {trailing?.(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
