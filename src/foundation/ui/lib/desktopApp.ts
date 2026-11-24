// この Mac のアプリの口のうち、機能が使う小さなもの（window.kickoff はブラウザ（スマホ・ほかのブラウザ）で開いた画面にはない）

/** この Mac のアプリの中か */
export const inDesktopApp = (): boolean => typeof window !== "undefined" && window.kickoff !== undefined;

/** 別ウィンドウ: 閉じるよう頼まれたら（窓の閉じるボタン・⌘W。メインプロセスが止めて知らせる）handler を呼ぶ。やめるときは返り値を呼ぶ */
export const onCloseRequested = (handler: () => void): (() => void) | undefined => window.kickoff?.windows.onCloseRequested(handler);
