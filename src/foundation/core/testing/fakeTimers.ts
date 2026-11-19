// テストで手で進める時計（setTimeout の代わりに渡し、fire で待っているものをすべて呼ぶ）

export function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    timers: {
      set: (fn: () => void) => {
        pending.set(next, fn);
        return next++;
      },
      clear: (h: unknown) => void pending.delete(h as number),
    },
    /** 待っているものをすべて呼ぶ */
    fire() {
      const fns = [...pending.values()];
      pending.clear();
      fns.forEach((fn) => fn());
    },
    /** 待っているものの数 */
    get size() {
      return pending.size;
    },
  };
}
