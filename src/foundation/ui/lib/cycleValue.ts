/** 並びの中で value の次（step = 1）・前（step = -1）の値（端では反対の端へ。value が並びになければ先頭から数える） */
export function cycleValue<T>(list: readonly T[], value: T, step: 1 | -1): T {
  const i = Math.max(0, list.indexOf(value));
  return list[(i + step + list.length) % list.length];
}
