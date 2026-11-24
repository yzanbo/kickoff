// 画面の拡張点: 入れ物が点を宣言し（definePoint）、機能が ui/contributes.ts で項目を出し、app/renderer/registry.ts が全機能ぶんを 1 回だけ入れる。
// import したときの副作用では入れない（入れるのは installContributions だけ）
import { lazy, type ComponentType } from "react";

export interface Point<T> {
  readonly name: string;
  /** 入っている項目（登録の順。order があればその順）。入れる前に読むと投げる（読み戻しより前に入れる決まりを守らせる） */
  items(): readonly T[];
  /** 1 つの項目を作る（機能の ui/contributes.ts が並べて出す。これだけでは入らない） */
  item(value: T): Contribution<T>;
}
export interface Contribution<T> {
  readonly point: Point<T>;
  readonly value: T;
}
export interface PointOptions<T> {
  /** 重なりを禁じる key（同じ key が 2 つあれば入れるときに投げる） */
  key?: (item: T) => string;
  /** 並べ替え（省けば登録の順） */
  order?: (a: T, b: T) => number;
}

/** 点ごとの並べ方（key の重なりを確かめて order で並べる。definePoint の型のまま閉じ込める） */
const arrangers = new WeakMap<Point<unknown>, (items: unknown[]) => readonly unknown[]>();
/** 入れた項目（点ごと）。null は入れる前 */
let installed: ReadonlyMap<Point<unknown>, readonly unknown[]> | null = null;
const EMPTY: readonly never[] = [];

export function definePoint<T>(name: string, options: PointOptions<T> = {}): Point<T> {
  const point: Point<T> = {
    name,
    items() {
      if (!installed) throw new Error(`拡張点 ${name} は登録の前に読まれた`);
      return (installed.get(point) as readonly T[] | undefined) ?? EMPTY;
    },
    item: (value) => ({ point, value }),
  };
  arrangers.set(point, (items) => {
    const list = items as T[];
    if (options.key) {
      const seen = new Set<string>();
      for (const item of list) {
        const key = options.key(item);
        if (seen.has(key)) throw new Error(`拡張点 ${name} に同じ key「${key}」が 2 つある`);
        seen.add(key);
      }
    }
    // sort は同じ順位なら登録の順を保つ
    return options.order ? list.sort(options.order) : list;
  });
  return point;
}

/** 項目を点ごとに分けて並べる */
function arrange(list: readonly Contribution<unknown>[]): ReadonlyMap<Point<unknown>, readonly unknown[]> {
  const byPoint = new Map<Point<unknown>, unknown[]>();
  for (const { point, value } of list) {
    const items = byPoint.get(point);
    if (items) items.push(value);
    else byPoint.set(point, [value]);
  }
  return new Map([...byPoint].map(([point, items]) => [point, arrangers.get(point)?.(items) ?? items]));
}

/** app/renderer/registry.ts が 1 回だけ呼ぶ（2 回目は投げる） */
export function installContributions(list: readonly Contribution<unknown>[]): void {
  if (installed) throw new Error("拡張点の登録は 1 回だけ（app/renderer/registry.ts が入れる）");
  installed = arrange(list);
}

/** テストだけが使う: いまの登録を退けて list を入れ（null は入れる前の形）、元に戻す関数を返す */
export function swapContributions(list: readonly Contribution<unknown>[] | null): () => void {
  const saved = installed;
  installed = list && arrange(list);
  return () => {
    installed = saved;
  };
}

/** 重い部品の遅延読み込み（項目の部品はこれで包む。contributes.ts は部品を静的に import しない） */
export type LazyPart<P> = ComponentType<P> & { preload(): Promise<void> };

export function lazyPart<P>(load: () => Promise<{ default: ComponentType<P> }>): LazyPart<P> {
  // 先に読んだ（preload）ものを描くときにも使う（読み込みは 1 回）
  let loading: Promise<{ default: ComponentType<P> }> | undefined;
  const once = () => (loading ??= load());
  const preload = () => once().then(() => undefined);
  return Object.assign(lazy(once), { preload }) as unknown as LazyPart<P>;
}
