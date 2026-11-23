// GitHub・CI のタブの取り直し方（useQuery に渡す）

/** 開いている間に GitHub から取り直す間隔（1 分） */
export const GITHUB_REFRESH_MS = 60_000;

/**
 * 開いている間だけ every ごと（既定 1 分。関数なら届いている値から決める）と、Kickoff の窓に戻ったときに取り直す。
 * 窓がほかのアプリの後ろにある間は、間隔の取り直しもしない
 */
export const githubRefresh = <T>(every: number | ((data: T | undefined) => number) = GITHUB_REFRESH_MS) =>
  ({ interval: every, pauseWhenBlurred: true, refetchOnFocus: true }) as const;
