import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { errorMessage } from "@shared/errors";
import { useAppliedTheme } from "@/app/theme";
import { terminalFont, terminalTheme } from "./terminalTheme";

/** シェルが終わったときに出す文 */
const EXITED = "\r\n\x1b[2m[プロセスが終了しました。キーを押すと新しいシェルを開きます]\x1b[0m\r\n";

interface Props {
  /** タブのキー（裏のシェルのキー） */
  termKey: string;
  /** シェルを始めるフォルダ */
  cwd: string;
  /** パネルで表示しているか（表示したときに大きさを合わせる） */
  visible: boolean;
  /** 入力先か（分割したペインのうち 1 つ。省略なら表示しているとき） */
  focused?: boolean;
  /** ペインを押した・入力し始めたとき */
  onFocus?: () => void;
  /** ⌘ を押しながら URL を押したとき（アプリの中のブラウザで開く） */
  onOpenUrl: (url: string) => void;
}

/**
 * 内蔵ターミナル（xterm.js）。シェルは Electron のメインプロセスで動いていて、タブを裏に回しても・ボードを切り替えても動き続ける。
 * 表示し直したときは、いまの画面の内容をもらって描き直す。使うときだけ読み込む（SidePanel から lazy で読む）
 */
export default function TerminalPane({ termKey, cwd, visible, focused = visible, onFocus, onOpenUrl }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal>(undefined);
  const fitRef = useRef<FitAddon>(undefined);
  const theme = useAppliedTheme();
  const openUrl = useRef(onOpenUrl);
  openUrl.current = onOpenUrl;

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
        const { snapshot } = await native.open(termKey, cwd, term.cols, term.rows);
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
    const offExit = native.onExit((key) => {
      if (key !== termKey) return;
      exited = true;
      term.write(EXITED);
    });
    const input = term.onData((data) => {
      if (!exited) return native.write(termKey, data);
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
      onFocus={onFocus}
      // ⌘ のないキー（⌃B・⌃K・Esc など）はシェルのもの。アプリのショートカットやパネルを閉じる Esc に渡さない
      onKeyDown={(e) => {
        if (!e.metaKey) e.stopPropagation();
      }}
    >
      {window.kickoff?.terminal ? <div ref={ref} className="terminal-screen" /> : <p className="muted small">ターミナルは Mac のアプリでだけ使えます。</p>}
    </div>
  );
}
