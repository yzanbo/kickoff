// ターミナルの画面の HTML（WebView に文字列で渡す）。xterm.js を埋め込み、アプリとは postMessage でやり取りする:
// アプリ → ページ: window.kickoffTerminal.reset(画面の内容) / write(出力) / exit(終了コード)
// ページ → アプリ: { type: "input", data } / { type: "size", cols, rows }
import { FIT_JS, XTERM_CSS, XTERM_JS } from "./xtermAssets.generated";

/** ページが送ってくるもの */
export type TerminalPageMessage = { type: "input"; data: string } | { type: "size"; cols: number; rows: number } | { type: "ready" };

export function terminalPageHtml(opts: { readOnly: boolean; background: string; foreground: string }): string {
  const script = `
(function () {
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const term = new Terminal({ fontSize: 13, cursorBlink: true, disableStdin: ${opts.readOnly}, theme: { background: ${JSON.stringify(opts.background)}, foreground: ${JSON.stringify(opts.foreground)} }, scrollback: 5000 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById("term"));
  const resize = () => { try { fit.fit(); post({ type: "size", cols: term.cols, rows: term.rows }); } catch (e) {} };
  window.addEventListener("resize", resize);
  term.onData((data) => post({ type: "input", data }));
  window.kickoffTerminal = {
    reset: (text) => { term.reset(); term.write(text); },
    write: (text) => term.write(text),
    exit: (code) => term.write("\\r\\n\\x1b[33m終了しました（終了コード " + code + "）\\x1b[0m\\r\\n"),
    focus: () => term.focus(),
  };
  resize();
  post({ type: "ready" });
})();`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${XTERM_CSS}
html,body{margin:0;height:100%;background:${opts.background};}#term{position:absolute;inset:4px;}</style></head>
<body><div id="term"></div><script>${XTERM_JS}</script><script>${FIT_JS}</script><script>${script}</script></body></html>`;
}
