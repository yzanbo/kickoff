// テーマの選び方と、テーマごとの画面の地の色（メモの仕様書「0023_表示を軽くする」の案 18a・U11）。
// 画面の設定（renderer の lib/storageKeys.ts の THEME）と、窓の地の色（メインプロセスの app/appearance.ts。画面を読み込む前・大きさを変えている間に見える色）で同じものを使う

/** テーマの選び方（system は OS のダーク・ライトに合わせる） */
export const THEME_CHOICES = ["dark", "light", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** 画面の地の色（styles/base/tokens.css の --bg と同じ値。テストで確かめる） */
export const THEME_BACKGROUNDS = { dark: "#141818", light: "#ffffff" } as const;

/** 出ているテーマがダークか（画面の app/theme.ts・public/boot.js と同じ決め方） */
export const isDarkTheme = (theme: ThemeChoice, osDark: boolean): boolean => theme === "dark" || (theme === "system" && osDark);

/** 窓の地の色 */
export function backgroundFor(theme: ThemeChoice, osDark: boolean): string {
  return isDarkTheme(theme, osDark) ? THEME_BACKGROUNDS.dark : THEME_BACKGROUNDS.light;
}

/** 覚えたテーマ（メインの appearance.json の theme）を読む（知らない値・壊れた値は null） */
export function parseThemeChoice(value: unknown): ThemeChoice | null {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value) ? (value as ThemeChoice) : null;
}
