import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";

/** 部品で使う操る物（状態を持ち、変わったら知らせる。外したら dispose で後片付けする） */
export interface Controller<S> {
  subscribe(listener: () => void): () => void;
  get(): S;
  dispose?(): void;
}

/** 部品が持っている操る物と、それを作ったときの deps */
export interface ControllerEntry<C> {
  readonly controller: C;
  readonly deps: readonly unknown[];
  disposed: boolean;
}

const sameDeps = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

export const createEntry = <C,>(factory: () => C, deps: readonly unknown[]): ControllerEntry<C> => ({ controller: factory(), deps, disposed: false });

/** deps が同じなら同じもの、変わったら作り直したもの（前のものの後片付けは disposeEntry） */
export const nextEntry = <C,>(entry: ControllerEntry<C>, deps: readonly unknown[], factory: () => C): ControllerEntry<C> =>
  entry.disposed || sameDeps(entry.deps, deps) ? entry : createEntry(factory, deps);

/** 後片付けする（2 回呼んでも 1 回だけ） */
export function disposeEntry<C extends Controller<unknown>>(entry: ControllerEntry<C>): void {
  if (entry.disposed) return;
  entry.disposed = true;
  entry.controller.dispose?.();
}

/**
 * 操る物（createXxx(deps) で作るもの）を部品で使う。deps が変わったら前の物を dispose して作り直し、部品を外したら dispose する。
 * 状態は useSyncExternalStore で読む。factory は描く中で呼ばれるので、作るだけにして、購読されてから動き出す物にする
 */
export function useController<C extends Controller<unknown>>(factory: () => C, deps: readonly unknown[]): [ReturnType<C["get"]>, C] {
  const [entry, setEntry] = useState(() => createEntry(factory, deps));
  const current = nextEntry(entry, deps, factory);
  if (current !== entry) setEntry(current);
  // 試しに外して付け直す（StrictMode）と後片付けしたあとの物が残るので、付け直したときに作り直す
  const recreate = useEffectEvent(() => setEntry(createEntry(factory, deps)));
  useEffect(() => {
    if (current.disposed) return recreate();
    return () => disposeEntry(current);
  }, [current]);
  const { controller } = current;
  const subscribe = (listener: () => void) => controller.subscribe(listener);
  const get = () => controller.get() as ReturnType<C["get"]>;
  return [useSyncExternalStore(subscribe, get, get), controller];
}
