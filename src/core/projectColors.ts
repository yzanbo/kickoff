/**
 * プロジェクトの色の一覧（色相）。暗い背景でも見分けやすいよう、10 色を離して選ぶ（黄緑と緑のような、近くて似て見える色は入れない）
 */
export const PROJECT_HUES = [0, 28, 48, 135, 172, 200, 222, 262, 292, 330] as const;

/** 色相の差（0〜180） */
const distance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * 新しいプロジェクトの色: いちばん使われていない色を選ぶ。同じなら、使われている色からいちばん離れた色、それも同じなら一覧の順
 */
export function pickProjectHue(used: number[]): number {
  const count = (h: number) => used.filter((u) => u === h).length;
  const nearest = (h: number) => (used.length === 0 ? 180 : Math.min(...used.map((u) => distance(h, u))));
  return [...PROJECT_HUES].sort((a, b) => count(a) - count(b) || nearest(b) - nearest(a))[0];
}
