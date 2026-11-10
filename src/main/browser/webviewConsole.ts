import { app } from "electron";

// 埋め込みブラウザ（webview）のコンソールの出力を、作られたときから覚えておく（AI の browser_console。agentBrowser.ts）。
// 画面がタブを登録するのはページの準備ができてからなので、そこから聞き始めると読み込み中の出力を取りこぼすため

/** 覚えておく件数（新しいものから） */
const CONSOLE_MAX = 200;

const logs = new Map<number, string[]>();

/** webview が作られたら、コンソールの出力を覚え始める（ウィンドウを作る前に一度だけ呼ぶ） */
export function watchWebviewConsoles() {
  app.on("web-contents-created", (_e, contents) => {
    if (contents.getType() !== "webview") return;
    const id = contents.id;
    const list: string[] = [];
    logs.set(id, list);
    contents.on("console-message", ({ level, message, sourceId, lineNumber }) => {
      // 開発版の Electron がどのページにも出す安全の注意は、ページの出力ではないので覚えない
      if (message.startsWith("Electron Security Warning")) return;
      list.push(`[${level}] ${message}${sourceId ? ` (${sourceId}:${lineNumber})` : ""}`);
      if (list.length > CONSOLE_MAX) list.splice(0, list.length - CONSOLE_MAX);
    });
    contents.once("destroyed", () => logs.delete(id));
  });
}

/** その webview のコンソールの出力（古い順。新しいものから CONSOLE_MAX 件） */
export const webviewConsoleOf = (id: number): string[] => [...(logs.get(id) ?? [])];
