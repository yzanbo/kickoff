/** グラフのブランチの線の色（列ごとに順に使う。コミットの札も同じ色で塗る） */
const PALETTE = ["var(--info)", "var(--sec-implementation)", "var(--sec-testing)", "var(--sec-schedule)", "var(--sec-deployment)", "var(--warn)", "var(--ok)", "var(--ng)"];

/** グラフの n 番目の色 */
export const laneColor = (n: number) => PALETTE[n % PALETTE.length];
