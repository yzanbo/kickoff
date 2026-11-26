// Mermaid の図を、画面の文書ではなく閉じた枠（コアの /mermaid-frame・sandbox="allow-scripts"・allow-same-origin なし）の中で描く。
// 枠は窓ごとに 1 つを使い回し（最初の図で作る）、頼みと結果は postMessage で受け渡す（送り主の窓と決まった形を確かめる）。
// 枠の中は外へ読み込み・通信ができず（CSP）、Kickoff の画面の DOM も持たないので、図に書いた画像の URL・getElementById が何も読めない。
// 戻ってきた SVG は信じず、renderMermaid.ts が sanitizeSvg を通してから画面に入れる
import type { MermaidConfig } from "mermaid";
import { MERMAID_FRAME_MESSAGES, MERMAID_FRAME_PATH, mermaidFrameReply } from "@shared/foundation/mermaidFrame";

/** 枠を読み込んで Mermaid を読ませ終わるまで・1 つの図を描き終わるまでの上限（超えたら枠を捨てて作り直す。固まった図で次の図を止めないように） */
const LOAD_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 30_000;

/**
 * 枠の置き方。Mermaid は文字の大きさを測るので、枠は描かれる状態（display: none でない）にして、画面の外に見えないように置く。
 * 押せず・読み上げず・Tab で入らない
 */
const FRAME_STYLE = "position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden;pointer-events:none;";

interface Pending {
  resolve: (svg: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Session {
  iframe: HTMLIFrameElement;
  /** Mermaid を読み込み終わったら解決する */
  loaded: Promise<void>;
  pending: Map<number, Pending>;
  dispose: (error: Error) => void;
}

// Mermaid のスクリプト（IIFE。約 5.5MB）は大きいので、図が出てきたときに初めて読み込む（Vite が文字として別のファイルに分ける）
let scriptText: Promise<string> | undefined;
const loadScriptText = () =>
  (scriptText ??= import("mermaid/dist/mermaid.min.js?raw").then(
    (m) => m.default,
    (e: unknown) => {
      scriptText = undefined;
      throw e;
    },
  ));

let session: Session | null = null;
let nextId = 0;

/** 枠を作る（読み込みが終わるまでは loaded が待つ） */
function openSession(): Session {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("aria-hidden", "true");
  iframe.referrerPolicy = "no-referrer";
  iframe.tabIndex = -1;
  iframe.title = "Mermaid の図を描く枠";
  iframe.style.cssText = FRAME_STYLE;
  const pending = new Map<number, Pending>();
  let markLoaded!: () => void;
  let failLoad!: (error: Error) => void;
  const loaded = new Promise<void>((resolve, reject) => {
    markLoaded = resolve;
    failLoad = reject;
  });
  // 読み込みの失敗を受ける人がいなくても、未処理の失敗にしない（描く頼みの側が受ける）
  loaded.catch(() => undefined);
  let ready = false;
  const loadTimer = setTimeout(() => dispose(new Error("Mermaid の枠を読み込めませんでした")), LOAD_TIMEOUT_MS);

  const onMessage = (e: MessageEvent) => {
    if (e.source === null || e.source !== iframe.contentWindow) return;
    const reply = mermaidFrameReply(e.data);
    if (!reply) return;
    if (reply.type === "ready") {
      // 読み込み直した枠（中の Mermaid が消えている）は捨てて、次の図で作り直す
      if (ready) return dispose(new Error("Mermaid の枠が読み込み直されました"));
      ready = true;
      loadScriptText().then(
        (script) => iframe.contentWindow?.postMessage({ type: MERMAID_FRAME_MESSAGES.load, script }, "*"),
        (err: unknown) => dispose(err instanceof Error ? err : new Error(String(err))),
      );
    } else if (reply.type === "loaded") {
      clearTimeout(loadTimer);
      markLoaded();
    } else if (reply.type === "rendered") {
      settle(reply.id)?.resolve(reply.svg);
    } else if (reply.id === null) {
      dispose(new Error(reply.message));
    } else {
      settle(reply.id)?.reject(new Error(reply.message));
    }
  };
  const settle = (id: number) => {
    const p = pending.get(id);
    if (!p) return undefined;
    clearTimeout(p.timer);
    pending.delete(id);
    return p;
  };
  const dispose = (error: Error) => {
    clearTimeout(loadTimer);
    window.removeEventListener("message", onMessage);
    iframe.remove();
    failLoad(error);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
    if (session === created) session = null;
  };

  window.addEventListener("message", onMessage);
  iframe.src = MERMAID_FRAME_PATH;
  document.body.append(iframe);
  const created: Session = { iframe, loaded, pending, dispose };
  return created;
}

/** 枠の中で Mermaid の図を SVG にする（描けない・時間内に終わらないときは失敗する。頼みは呼ぶ側が 1 つずつ順に出す） */
export async function renderInMermaidFrame(code: string, config: MermaidConfig): Promise<string> {
  const current = (session ??= openSession());
  await current.loaded;
  const id = ++nextId;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => current.dispose(new Error("Mermaid の図を時間内に描けませんでした")), RENDER_TIMEOUT_MS);
    current.pending.set(id, { resolve, reject, timer });
    current.iframe.contentWindow?.postMessage({ type: MERMAID_FRAME_MESSAGES.render, id, code, config }, "*");
  });
}
