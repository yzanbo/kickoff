// 入力の参照が前と同じなら前の結果を返す覚え（店の値から作る見え方を、中身が同じなら同じ配列にする）

const sameInputs = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/** 作り直すとき compute は前の結果（初めは undefined）も受ける。中身が同じなら前の配列を返して、使う部品を描き直さないため */
type Compute<I extends readonly unknown[], R> = (...args: [...inputs: I, prev: R | undefined]) => R;

/** 入力の参照がすべて前と同じなら、前の結果を返す */
export function createSelector<I extends readonly unknown[], R>(compute: Compute<I, R>): (...inputs: I) => R {
  let last: { inputs: I; result: R } | undefined;
  return (...inputs) => {
    if (last && sameInputs(last.inputs, inputs)) return last.result;
    const result = compute(...inputs, last?.result);
    last = { inputs, result };
    return result;
  };
}

/** key ごとに覚える版（プロジェクトごとの見え方など。forget で、もう使わない key の分を捨てる） */
export function createKeyedSelector<K, I extends readonly unknown[], R>(
  compute: (key: K, ...args: [...inputs: I, prev: R | undefined]) => R,
): { get(key: K, ...inputs: I): R; forget(key: K): void } {
  const memo = new Map<K, { inputs: I; result: R }>();
  return {
    get(key, ...inputs) {
      const last = memo.get(key);
      if (last && sameInputs(last.inputs, inputs)) return last.result;
      const result = compute(key, ...inputs, last?.result);
      memo.set(key, { inputs, result });
      return result;
    },
    forget: (key) => void memo.delete(key),
  };
}
