// Mermaid の図を描く閉じた枠のページ（コアが /mermaid-frame で配る）と、画面とのやり取りの形。
// Mermaid は描く途中で、図に書いた画像の URL を読みに行き（sequenceDiagram の properties の icon・flowchart の img など）、
// 文書全体の getElementById で要素の中身を読む（details など）。Kickoff の画面の文書で描くと、見た人の IP が外に漏れ、
// 画面の要素の中身・コアの URL を読まれるので、画面とは別の出どころ（sandbox="allow-scripts"・allow-same-origin なし）の枠で描く。
// 枠のページは外へ一切読み込み・通信ができない CSP（画像とフォントは data: だけ）で、Kickoff の画面の DOM を持たない。
// Mermaid のスクリプトは画面が文字で渡し、枠の中で Blob にして読む（開発版の dev サーバーと製品版のコアで同じ形。枠の出どころは不透明なので、
// 画面の出どころのファイルを script-src に書くと 'self' の扱いがブラウザによって違い、コアの /api も読めてしまうため）

import { isolatedFrameCsp } from "./isolatedFrame";

/** 枠のページの場所（コアの認証の外。開発版は Vite がコアへ回す） */
export const MERMAID_FRAME_PATH = "/mermaid-frame";

/** 枠と画面のやり取りの種類（postMessage の type） */
export const MERMAID_FRAME_MESSAGES = {
  /** 枠のページを読み込んだ（中 → 外） */
  ready: "kickoff-mermaid-ready",
  /** Mermaid のスクリプトを読ませる（外 → 中。script に Mermaid の IIFE の文字） */
  load: "kickoff-mermaid-load",
  /** Mermaid を読み込んだ（中 → 外） */
  loaded: "kickoff-mermaid-loaded",
  /** 図を描く（外 → 中。id・code・config） */
  render: "kickoff-mermaid-render",
  /** 描いた SVG（中 → 外。id・svg） */
  rendered: "kickoff-mermaid-rendered",
  /** 描けなかった・読み込めなかった（中 → 外。id は描く頼みの id、読み込みの失敗は null。message に理由） */
  failed: "kickoff-mermaid-failed",
} as const;

/** 枠から受ける知らせ（形を確かめたもの） */
export type MermaidFrameReply =
  | { type: "ready" }
  | { type: "loaded" }
  | { type: "rendered"; id: number; svg: string }
  | { type: "failed"; id: number | null; message: string };

/** 理由の文の長さの上限（枠の中から長い文を送らせない） */
const MESSAGE_MAX = 1_000;

/** 枠から届いた postMessage の中身を、決まった形のときだけ読む（送り主の窓の確かめは受ける側。ほかの形・余計な型は null） */
export function mermaidFrameReply(data: unknown): MermaidFrameReply | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const M = MERMAID_FRAME_MESSAGES;
  const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
  switch (d.type) {
    case M.ready:
      return { type: "ready" };
    case M.loaded:
      return { type: "loaded" };
    case M.rendered:
      return isId(d.id) && typeof d.svg === "string" ? { type: "rendered", id: d.id, svg: d.svg } : null;
    case M.failed:
      return (d.id === null || isId(d.id)) && typeof d.message === "string" ? { type: "failed", id: d.id, message: d.message.slice(0, MESSAGE_MAX) } : null;
    default:
      return null;
  }
}

/**
 * 枠のページの中のスクリプト（ページに 1 つだけの書いたままのスクリプト。CSP はこの文字のハッシュだけを許す）。
 * 外の画面（parent）からの決まった形の頼みだけを受け、Mermaid のスクリプトを Blob にして 1 回だけ読み、頼みを 1 つずつ順に描く。
 * 描くたびに本文を空に戻す（Mermaid が失敗したときに残す下書きの要素を、次の図の getElementById に見せない）
 */
export const MERMAID_FRAME_SCRIPT = `(() => {
  const M = ${JSON.stringify(MERMAID_FRAME_MESSAGES)};
  const post = (data) => parent.postMessage(data, "*");
  const fail = (id, err) => post({ type: M.failed, id, message: String((err && err.message) || err || "描けませんでした") });
  let loading = false;
  let queue = Promise.resolve();
  const render = async (d) => {
    if (!window.mermaid) throw new Error("Mermaid を読み込んでいません");
    window.mermaid.initialize(d.config);
    const out = await window.mermaid.render("mermaid-" + d.id, d.code);
    return String(out.svg);
  };
  addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== parent || !d || typeof d !== "object") return;
    if (d.type === M.load && typeof d.script === "string") {
      if (window.mermaid) { post({ type: M.loaded }); return; }
      if (loading) return;
      loading = true;
      const url = URL.createObjectURL(new Blob([d.script], { type: "text/javascript" }));
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => { URL.revokeObjectURL(url); window.mermaid ? post({ type: M.loaded }) : fail(null, "Mermaid を読み込めませんでした"); };
      s.onerror = () => { URL.revokeObjectURL(url); fail(null, "Mermaid を読み込めませんでした"); };
      document.head.append(s);
    } else if (d.type === M.render && Number.isSafeInteger(d.id) && d.id > 0 && typeof d.code === "string" && d.config && typeof d.config === "object") {
      queue = queue
        .then(() => render(d))
        .then((svg) => post({ type: M.rendered, id: d.id, svg }), (err) => fail(d.id, err))
        .finally(() => document.body.replaceChildren());
    }
  });
  post({ type: M.ready });
})();`;

/**
 * 枠のページの CSP。スクリプトは中のスクリプト（scriptHash: MERMAID_FRAME_SCRIPT の SHA-256 の base64。コアが求める）と、
 * 中で作った Blob（Mermaid）だけ。スタイルは Mermaid が SVG に書く style だけ・画像とフォントは data: だけで、外へは何も読めない
 */
export function mermaidFrameCsp(scriptHash: string): string {
  return isolatedFrameCsp({ script: [`'sha256-${scriptHash}'`, "blob:"], style: ["'unsafe-inline'"], img: ["data:"], font: ["data:"] });
}

/** 枠のページの全体 */
export const MERMAID_FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><script>${MERMAID_FRAME_SCRIPT}</script></head><body></body></html>`;
