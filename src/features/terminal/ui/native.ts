// メインプロセスの口（window.kickoff）のうち、ターミナルが使う所（ターミナルの画面で window.kickoff を触るのはここだけ）

/** 内蔵ターミナルの口（シェルの持ち主の印を聞く） */
export type NativeTerminal = NonNullable<Window["kickoff"]>["terminal"];

/** 内蔵ターミナルの口（Mac のアプリでなければ undefined） */
export const nativeTerminal = (): NativeTerminal | undefined => globalThis.window?.kickoff?.terminal;

/** Mac のアプリか（ブラウザで開いた画面では false） */
export const isDesktopApp = (): boolean => Boolean(globalThis.window?.kickoff);
