import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@shared/errors";
import type { TerminalTabMeta } from "@shared/ipc";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";
import { terminalFont, terminalTheme } from "./terminalTheme";
import { useTerminalSelectionMenu } from "./useTerminalSelectionMenu";

/** シェルが終わったときに出す文 */
const EXITED = "\r\n\x1b[2m[プロセスが終了しました。キーを押すと新しいシェルを開きます]\x1b[0m\r\n";
/** 決まったコマンドのタブが終わったときに出す文（シェルは開き直さない） */
const commandExited = (code: number) => `\r\n\x1b[2m[終了しました${code === 0 ? "" : `（終了コード ${code}）`}]\x1b[0m\r\n`;

interface Props {
  /** タブのキー（裏のシェルのキー） */
  termKey: string;
  /** シェルを始めるフォルダ */
  cwd: string;
  /** 流すコマンド（Docker のシェルなど）。終わってもシェルは開き直さず「終了しました」と［もう一度流す］を出す */
  command?: string;
  /** シェルに足す環境変数（command のタブ） */
  env?: Record<string, string>;
  /** タブの持ち主（プロジェクト）と名前（つなぐたびにメインプロセスへ知らせる。AI がこのプロジェクトのターミナルの出力を読むときに使う） */
  meta?: TerminalTabMeta;
  /** パネルで表示しているか（表示したときに大きさを合わせる） */
  visible: boolean;
  /** 入力先か（分割したペインのうち 1 つ。省略なら表示しているとき） */
  focused?: boolean;
  /** ⌘ を押しながら URL を押したとき（アプリの中のブラウザで開く） */
  onOpenUrl: (url: string) => void;
  /** どのプロジェクトの欄か（選んだ文をそのプロジェクトのチャットに足す。プロジェクトの欄でなければ null） */
  projectId?: number | null;
}

/**
 * 内蔵ターミナル（xterm.js）。シェルは Electron のメインプロセスで動いていて、タブを裏に回しても・ボードを切り替えても動き続ける。
 * 表示し直したときは、いまの画面の内容をもらって描き直す。使うときだけ読み込む（Panel から lazy で読む）
 */
export default function TerminalPane({ termKey, cwd, command, env, meta, visible, focused = visible, onOpenUrl, projectId = null }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal>(undefined);
  const fitRef = useRef<FitAddon>(undefined);
  const theme = useAppliedTheme();
  const openUrl = useRef(onOpenUrl);
  openUrl.current = onOpenUrl;
  // 描き直すたびに作り直される値なので、つなぎ直しの effect の依存に入れず、つなぐときの値を読む
  const metaRef = useRef(meta);
  metaRef.current = meta;
  // 決まったコマンドのタブが終わったか（［もう一度流す］を出す）と、流し直す操作
  const [commandDone, setCommandDone] = useState(false);
  const rerun = useRef<() => void>(undefined);
  // 選んだ文の小さな「チャットに追加 ▾」と、右クリックのコピー・「チャットに追加」
  const selectionMenu = useTerminalSelectionMenu({ projectId, cwd, term: () => termRef.current, screen: () => ref.current });

  useEffect(() => {
    const native = window.kickoff?.terminal;
    const el = ref.current;
    if (!native || !el) return;
    const term = new Terminal({
      fontFamily: terminalFont(),
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // URL は ⌘ を押しながら押すと開く（VS Code と同じ）
    term.loadAddon(new WebLinksAddon((event, uri) => event.metaKey && openUrl.current(uri)));
    term.open(el);
    // GPU で描く（速く、プロンプトの区切り記号（Powerline）や罫線も、文字にない分を自前で描ける）。使えなければ普通の描き方に戻す
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // WebGL が使えない環境
    }
    termRef.current = term;
    fitRef.current = fit;
    const fitNow = () => {
      // 裏のタブ（大きさがない）では合わせない
      if (el.clientWidth > 0 && el.clientHeight > 0) fit.fit();
    };
    fitNow();

    let alive = true;
    // つなぐまでに届いた出力は、もらう画面の内容に含まれているので捨てる
    let ready = false;
    let exited = false;
    const connect = async () => {
      ready = false;
      try {
        const { snapshot } = await native.open(termKey, cwd, term.cols, term.rows, command ? { command, env } : undefined, metaRef.current);
        if (!alive) return;
        if (snapshot) term.write(snapshot);
        // つなぎ直したときは、シェルの大きさをこの画面に合わせる
        native.resize(termKey, term.cols, term.rows);
        exited = false;
        ready = true;
      } catch (e) {
        if (alive) term.write(`\r\n\x1b[31m${errorMessage(e)}\x1b[0m\r\n`);
      }
    };
    void connect();

    const offData = native.onData((key, data) => {
      if (key === termKey && ready) term.write(data);
    });
    const offExit = native.onExit((key, code) => {
      if (key !== termKey) return;
      exited = true;
      if (!command) return term.write(EXITED);
      term.write(commandExited(code));
      setCommandDone(true);
    });
    // ［もう一度流す］: 画面を消して、同じコマンドで始め直す（裏のシェルは終わったときに片付いている）
    rerun.current = () => {
      setCommandDone(false);
      exited = false;
      term.reset();
      void connect();
      term.focus();
    };
    const input = term.onData((data) => {
      if (!exited) return native.write(termKey, data);
      // 決まったコマンドのタブは、キーでは開き直さない（［もう一度流す］で）
      if (command) return;
      // 終わったあとにキーを押したら、新しいシェルを開く
      exited = false;
      term.reset();
      void connect();
    });
    const resize = term.onResize(({ cols, rows }) => native.resize(termKey, cols, rows));
    const observer = new ResizeObserver(fitNow);
    observer.observe(el);
    return () => {
      alive = false;
      offData();
      offExit();
      input.dispose();
      resize.dispose();
      observer.disconnect();
      term.dispose();
      termRef.current = undefined;
    };
    // cwd はシェルを始めるときだけ使う（タブが変わらない限り同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termKey]);

  // アプリのテーマ（ダーク・ライト）に合わせる
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = terminalTheme(theme);
  }, [theme]);

  // 表示したら、大きさを合わせる
  useEffect(() => {
    if (!visible) return;
    const el = ref.current;
    if (el && el.clientWidth > 0) fitRef.current?.fit();
  }, [visible]);

  // 入力先になったら、入力できるようにする
  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  return (
    <div
      className="terminal-pane"
      // ⌘ のないキー（⌃B・⌃K・Esc など）はシェルのもの。アプリのショートカットやパネルを閉じる Esc に渡さない
      onKeyDown={(e) => {
        selectionMenu.handlers.onKeyDown();
        if (!e.metaKey) e.stopPropagation();
      }}
      onContextMenu={selectionMenu.handlers.onContextMenu}
      onMouseUp={selectionMenu.handlers.onMouseUp}
      onWheel={selectionMenu.handlers.onWheel}
    >
      {window.kickoff?.terminal ? <div ref={ref} className="terminal-screen" /> : <p className="muted small">ターミナルは Mac のアプリでだけ使えます。</p>}
      {commandDone && (
        <button type="button" className="btn terminal-rerun" onClick={() => rerun.current?.()} title={command}>
          <RotateCcw size={13} /> もう一度流す
        </button>
      )}
      {selectionMenu.element}
    </div>
  );
}
