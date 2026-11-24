// まとめて動かす・ゴミ箱に入れるの繰り返し（純粋。1 件ずつ順に進め、失敗したものは飛ばして最後にまとめて返す）

/** op が false を返したもの（やめた）は done にも failed にも入れない */
export async function runEach<T>(items: readonly T[], op: (item: T) => Promise<boolean>): Promise<{ done: T[]; failed: { item: T; error: unknown }[] }> {
  const done: T[] = [];
  const failed: { item: T; error: unknown }[] = [];
  for (const item of items) {
    try {
      if (await op(item)) done.push(item);
    } catch (error) {
      failed.push({ item, error });
    }
  }
  return { done, failed };
}
