// 内蔵ターミナル（xterm.js）を作り、コアのシェルにつなぐ（TerminalPane が使う。xterm・WebSocket とのつなぎは部品の外に置く）
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { errorMessage } from "@shared/foundation/errors";
import type { TerminalServerMessage, TerminalTabMeta } from "@shared/terminal/types";
import type { AppliedTheme } from "@/foundation/ui/theme/appliedTheme";
import { terminalSocketUrl, terminalsApi } from "./api/terminals";
import type { NativeTerminal } from "./native";
import { windowOwner } from "./terminalOwner";
import { terminalFont, terminalTheme } from "./terminalTheme";

/** シェルが終わったときに出す文 */
const EXITED = "\r\n\x1b[2m[プロセスが終了しました。キーを押すと新しいシェルを開きます]\x1b[0m\r\n";
/** 決まったコマンドのタブが終わったときに出す文（シェルは開き直さない） */
const commandExited = (code: number) => `\r\n\x1b[2m[終了しました${code === 0 ? "" : `（終了コード ${code}）`}]\x1b[0m\r\n`;
/** コアとのつなぎが切れたとき（コアが落ちた・起動し直した。シェルはコアと一緒に終わる）に出す文 */
const disconnected = (command: boolean) => `\r\n\x1b[2m[Kickoff のコアとのつなぎが切れました。${command ? "［もう一度流す］で始め直します" : "キーを押すと新しいシェルを開きます"}]\x1b[0m\r\n`;


/** 作ったターミナル（部品は返り値を ref に持つだけ） */
export interface TerminalSession {
  term: Terminal;
  fit: FitAddon;
  /** ［もう一度流す］: 画面を消して、同じコマンドで始め直す */
  rerun: () => void;
  dispose: () => void;
}

/** 作るときの値 */
export interface TerminalSessionOptions {
  native: NativeTerminal;
  termKey: string;
  cwd: string;
  command: string | undefined;
  env: Record<string, string> | undefined;
  /** 作るときのテーマ（あとの切り替えは部品が term.options.theme に入れる） */
  theme: AppliedTheme;
  /** つなぐときに読むタブの持ち主と名前 */
  meta: () => TerminalTabMeta | undefined;
  openUrl: (url: string) => void;
  /** 決まったコマンドのタブが終わった・流し直した */
  setCommandDone: (done: boolean) => void;
}

/** 内蔵ターミナルを el に作り、コアのシェルにつなぐ（部品の外に置く。xterm・WebSocket とのつなぎは React Compiler の対象にしない） */
export function createTerminalSession(el: HTMLDivElement, opts: TerminalSessionOptions): TerminalSession {
  const { native, termKey, cwd, command, env } = opts;
  const term = new Terminal({
    fontFamily: terminalFont(),
    fontSize: 12,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 5000,
    theme: terminalTheme(opts.theme),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  // URL は ⌘ を押しながら押すと開く（VS Code と同じ）
  term.loadAddon(new WebLinksAddon((event, uri) => event.metaKey && opts.openUrl(uri)));
  term.open(el);
  // GPU で描く（速く、プロンプトの区切り記号（Powerline）や罫線も、文字にない分を自前で描ける）。使えなければ普通の描き方に戻す
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // WebGL が使えない環境
  }
  const fitNow = () => {
    // 裏のタブ（大きさがない）では合わせない
    if (el.clientWidth > 0 && el.clientHeight > 0) fit.fit();
  };
  fitNow();

  let alive = true;
  // つなぐまでに届いた出力は、もらう画面の内容に含まれているので捨てる
  let ready = false;
  let exited = false;
  let socket: WebSocket | undefined;
  const sendToShell = (message: { type: "input"; data: string } | { type: "resize"; cols: number; rows: number }) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  /** シェルが終わった・つなぎが切れた（決まったコマンドのタブは［もう一度流す］を出す） */
  const ended = (text: string) => {
    exited = true;
    ready = false;
    term.write(text);
    if (command) opts.setCommandDone(true);
  };
  const connect = async () => {
    ready = false;
    socket?.close();
    socket = undefined;
    try {
      const owner = await windowOwner(native);
      const meta = opts.meta();
      await terminalsApi.openTerminal({
        key: termKey,
        cwd,
        cols: term.cols,
        rows: term.rows,
        owner,
        start: command ? { command, env: env ?? null } : null,
        meta: meta ? { project_id: meta.projectId, title: meta.title } : null,
      });
      if (!alive) return;
      const ws = new WebSocket(terminalSocketUrl(termKey));
      socket = ws;
      exited = false;
      ws.onmessage = (e) => {
        if (socket !== ws) return;
        let message: TerminalServerMessage;
        try {
          message = JSON.parse(String(e.data)) as TerminalServerMessage;
        } catch {
          return;
        }
        if (message.type === "snapshot") {
          if (message.data) term.write(message.data);
          // つなぎ直したときは、シェルの大きさをこの画面に合わせる
          sendToShell({ type: "resize", cols: term.cols, rows: term.rows });
          ready = true;
        } else if (message.type === "data") {
          if (ready) term.write(message.data);
        } else {
          ended(command ? commandExited(message.exit_code) : EXITED);
        }
      };
      // シェルの終わりを知らせずに切れた（コアが落ちた・起動し直した）ら、終わった形にする
      ws.onclose = () => {
        if (socket !== ws || !alive || exited) return;
        ended(disconnected(Boolean(command)));
      };
    } catch (e) {
      if (alive) term.write(`\r\n\x1b[31m${errorMessage(e)}\x1b[0m\r\n`);
    }
  };
  void connect();

  // ［もう一度流す］: 画面を消して、同じコマンドで始め直す（裏のシェルは終わったときに片付いている）
  const rerun = () => {
    opts.setCommandDone(false);
    exited = false;
    term.reset();
    void connect();
    term.focus();
  };
  const input = term.onData((data) => {
    if (!exited) return sendToShell({ type: "input", data });
    // 決まったコマンドのタブは、キーでは開き直さない（［もう一度流す］で）
    if (command) return;
    // 終わったあとにキーを押したら、新しいシェルを開く
    exited = false;
    term.reset();
    void connect();
  });
  const resize = term.onResize(({ cols, rows }) => sendToShell({ type: "resize", cols, rows }));
  const observer = new ResizeObserver(fitNow);
  observer.observe(el);
  const dispose = () => {
    alive = false;
    socket?.close();
    input.dispose();
    resize.dispose();
    observer.disconnect();
    term.dispose();
  };
  return { term, fit, rerun, dispose };
}
