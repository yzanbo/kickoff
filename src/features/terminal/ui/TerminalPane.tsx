// xterm の CSS は層の外のまま読む（vendor の層に入れると、ui の入力欄の基底が補助の textarea の隠し方に勝つ）
import "./TerminalPane.css";
import "@xterm/xterm/css/xterm.css";
import { RotateCcw } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { TerminalTabMeta } from "@shared/terminal/types";
import { useAppliedTheme } from "@/foundation/ui/theme/useAppliedTheme";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { nativeTerminal, type NativeTerminal } from "./native";
import { createTerminalSession, type TerminalSession } from "./terminalSession";
import { terminalTheme } from "./terminalTheme";
import { useTerminalSelectionMenu } from "./useTerminalSelectionMenu";

interface Props {
  /** タブのキー（裏のシェルのキー） */
  termKey: string;
  /** シェルを始めるフォルダ */
  cwd: string;
  /** 流すコマンド（Docker のシェルなど）。終わってもシェルは開き直さず「終了しました」と［もう一度流す］を出す */
  command?: string;
  /** シェルに足す環境変数（command のタブ） */
  env?: Record<string, string>;
  /** タブの持ち主（プロジェクト）と名前（つなぐたびにコアへ知らせる。AI がこのプロジェクトのターミナルの出力を読むときに使う） */
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
 * 内蔵ターミナル（xterm.js）。シェルはコアで動いていて、タブを裏に回しても・ボードを切り替えても動き続ける。
 * コアの API でシェルを用意してから WebSocket でつなぎ（スマホと同じ口）、つないだらいまの画面の内容（snapshot）をもらって描き直す。
 * 使うときだけ読み込む（Panel から lazy で読む）
 */
export default function TerminalPane({ termKey, cwd, command, env, meta, visible, focused = visible, onOpenUrl, projectId = null }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // 作ったターミナル（xterm と大きさ合わせ・流し直し。作るのは部品の外の createTerminalSession）
  const session = useRef<TerminalSession>(undefined);
  const theme = useAppliedTheme();
  const openUrl = useLatest(onOpenUrl);
  // 描き直すたびに作り直される値なので、つなぎ直しの effect の依存に入れず、つなぐときの値を読む
  const metaRef = useLatest(meta);
  // 決まったコマンドのタブが終わったか（［もう一度流す］を出す）
  const [commandDone, setCommandDone] = useState(false);
  // 選んだ文の小さな「チャットに追加 ▾」と、右クリックのコピー・「チャットに追加」
  const selectionMenu = useTerminalSelectionMenu({ projectId, cwd, term: () => session.current?.term, screen: () => ref.current });

  // 作るのはタブ（termKey）ごとに 1 回。cwd・コマンド・テーマは作るときの値（タブが変わらない限り同じ。テーマの切り替えは下の effect）
  const mount = useEffectEvent((el: HTMLDivElement, native: NativeTerminal) => {
    const created = createTerminalSession(el, {
      native,
      termKey,
      cwd,
      command,
      env,
      theme,
      meta: () => metaRef.current,
      openUrl: (url) => openUrl.current(url),
      setCommandDone,
    });
    session.current = created;
    return () => {
      created.dispose();
      session.current = undefined;
    };
  });
  useEffect(() => {
    const native = nativeTerminal();
    const el = ref.current;
    if (!native || !el) return;
    return mount(el, native);
  }, [termKey]);

  // アプリのテーマ（ダーク・ライト）に合わせる
  useEffect(() => {
    if (session.current) session.current.term.options.theme = terminalTheme(theme);
  }, [theme]);

  // 表示したら、大きさを合わせる
  useEffect(() => {
    if (!visible) return;
    const el = ref.current;
    if (el && el.clientWidth > 0) session.current?.fit.fit();
  }, [visible]);

  // 入力先になったら、入力できるようにする
  useEffect(() => {
    if (focused) session.current?.term.focus();
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
      {nativeTerminal() ? <div ref={ref} className="terminal-screen" /> : <p className="muted small">ターミナルは Mac のアプリでだけ使えます。</p>}
      {commandDone && (
        <button type="button" className="btn terminal-rerun" onClick={() => session.current?.rerun()} title={command}>
          <RotateCcw size={13} /> もう一度流す
        </button>
      )}
      {selectionMenu.element}
    </div>
  );
}
