import { useState, type DragEvent } from "react";
import { showDropHint } from "@/foundation/ui/kit/DropHint";
import type { DragKind } from "./dragKind";

/** 落とし先の決まり（useDropTarget / useDropTargets。key は落とし先を見分けるもの） */
export interface DropRules<V, K> {
  /** 受ける物か（省くとすべて受ける） */
  accepts?: (value: V, key: K) => boolean;
  /** 受けないとき、外側の落とし先へ渡す物か（省くと外側へも渡さない） */
  passThrough?: (value: V, key: K) => boolean;
  /** 受ける物でも、いまは落とせない理由。あれば落とせなくし、落とし先を赤く、カーソルの横に理由を出す */
  blockedBy?: (value: V, key: K) => string | null;
}

/**
 * kind の物を落とせる所（いくつもの落とし先を key で見分けて 1 つの hook で持つ）。over は、いま重ねている落とし先の key（落とせないときも）、
 * blockedAt(key) はその落とし先に落とせない理由。propsFor(key) を落とし先の要素に渡す（ほかの種類のドラッグは受けない）。
 * accepts を渡すと受ける物だけで over にし、受けない物は外側の落とし先へも渡さない。ただし passThrough が true の物は、受けずに外側へ渡す
 */
export function useDropTargets<V, K>(kind: DragKind<V>, onDrop: (value: V, key: K) => void, { accepts, passThrough, blockedBy }: DropRules<V, K> = {}) {
  const [over, setOver] = useState<{ key: K; blocked: string | null }>();
  const ok = (value: V, key: K) => accepts === undefined || accepts(value, key);
  return {
    over: over?.key,
    blockedAt: (key: K) => (over !== undefined && over.key === key ? over.blocked : null),
    propsFor: (key: K) => ({
      onDragOver: (e: DragEvent) => {
        const value = kind.isIn(e) ? kind.current() : undefined;
        if (value === undefined) return;
        if (!ok(value, key) && passThrough?.(value, key)) return;
        e.stopPropagation();
        if (!ok(value, key)) return;
        const blocked = blockedBy?.(value, key) ?? null;
        if (over?.key !== key || over.blocked !== blocked) setOver({ key, blocked });
        // 落とせないときは既定の動き（落とせない）のまま、理由をカーソルの横に出す
        if (blocked) return showDropHint(blocked, e.clientX, e.clientY);
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((cur) => (cur?.key === key ? undefined : cur));
      },
      onDrop: (e: DragEvent) => {
        setOver(undefined);
        const value = kind.read(e);
        if (value === undefined) return;
        if (!ok(value, key) && passThrough?.(value, key)) return;
        e.stopPropagation();
        e.preventDefault();
        if (ok(value, key) && !blockedBy?.(value, key)) onDrop(value, key);
      },
    }),
  };
}

/** useDropTargets の、落とし先が 1 つの形 */
export function useDropTarget<V>(kind: DragKind<V>, onDrop: (value: V) => void, rules: DropRules<V, true> = {}) {
  const targets = useDropTargets<V, true>(kind, (value) => onDrop(value), rules);
  return { over: targets.over === true, blocked: targets.blockedAt(true), props: targets.propsFor(true) };
}
