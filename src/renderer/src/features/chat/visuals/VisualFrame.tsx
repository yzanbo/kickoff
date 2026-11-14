import { useEffect, useRef, useState } from "react";
import { VISUAL_MESSAGES, VISUAL_PROMPT_MAX, visualDocument } from "@shared/chat/visualDocument";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useVisualTheme } from "./visualTheme";

/** 中身が届くまでの高さと、いちばん小さい高さ */
const INITIAL_HEIGHT = 160;
const MIN_HEIGHT = 40;

/**
 * 利用者がいまこの枠の中を押したか。中のページの sendPrompt も押したかを見るが、中のスクリプトは直接 postMessage を
 * 送れるので、外でも確かめる: 押した操作は先祖の窓にも伝わる（navigator.userActivation）。ほかの所を押した直後に
 * 送られたものと分けるため、ピントがこの枠にあることも見る（中を押すと、外の画面のピントは iframe になる）
 */
function pressedInside(frame: HTMLIFrameElement): boolean {
  return navigator.userActivation?.isActive === true && document.activeElement === frame;
}

/**
 * AI が描いた SVG・HTML を閉じた枠に描く。枠のページ（コアの /visual-frame。図だけの CSP）を sandbox="allow-scripts"
 * （allow-same-origin なし = 中は別のオリジン）で開き、届いたら中身のページを postMessage で渡す。中からは高さ・失敗・
 * 利用者が押したときの発言だけを受け取る（送り主の窓で見分ける）。テーマを変えたら、SVG は作り直さずに変数だけを送り、
 * HTML は読み直す（Chart.js などは描いた時点の色を canvas に焼き付けるので、変数を変えても色が変わらないため）。
 * maxHeight: 高さの上限（超えたら枠の中でスクロール）。fill: 高さを親に合わせる（全画面）
 */
export function VisualFrame({
  kind,
  code,
  title,
  maxHeight,
  fill = false,
  onError,
  onPrompt,
}: {
  kind: "svg" | "html";
  code: string;
  title: string;
  maxHeight?: number;
  fill?: boolean;
  onError?: (message: string) => void;
  onPrompt?: (text: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const theme = useVisualTheme();
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  // 渡す中身（描き直すたびに最新の関数・テーマを使う）
  const latest = useRef({ kind, code, theme, maxHeight, onError, onPrompt });
  latest.current = { kind, code, theme, maxHeight, onError, onPrompt };

  useWindowEvent("message", (e) => {
    const frame = ref.current;
    if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== "object") return;
    const data = e.data as { type?: unknown; height?: unknown; message?: unknown; text?: unknown };
    if (data.type === VISUAL_MESSAGES.ready) {
      const { kind: k, code: c, theme: t, maxHeight: max } = latest.current;
      frame.contentWindow?.postMessage({ type: VISUAL_MESSAGES.render, html: visualDocument({ kind: k, code: c, vars: t, ...(max !== undefined && !fill ? { maxHeight: max } : {}) }) }, "*");
    } else if (data.type === VISUAL_MESSAGES.size && typeof data.height === "number") {
      setHeight(Math.max(MIN_HEIGHT, Math.ceil(data.height)));
    } else if (data.type === VISUAL_MESSAGES.error && typeof data.message === "string") {
      latest.current.onError?.(data.message);
    } else if (data.type === VISUAL_MESSAGES.prompt && typeof data.text === "string" && data.text.trim() && pressedInside(frame)) {
      latest.current.onPrompt?.(data.text.slice(0, VISUAL_PROMPT_MAX));
    }
  });

  // SVG は、テーマを変えたら中のページの変数だけを変える（HTML は下の key で読み直す）
  useEffect(() => {
    if (kind === "svg") ref.current?.contentWindow?.postMessage({ type: VISUAL_MESSAGES.theme, vars: theme }, "*");
  }, [theme, kind]);

  const shown = maxHeight === undefined ? height : Math.min(height, maxHeight);
  return (
    <iframe
      // 中身が変わったら枠のページから読み直す（中のスクリプトの状態を引き継がない）。HTML はテーマを変えたときも
      key={`${kind}\n${code}${kind === "html" ? `\n${theme["--vis-bg"]}` : ""}`}
      ref={ref}
      className="visual-frame"
      src="/visual-frame"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      title={title}
      style={fill ? { height: "100%" } : { height: shown }}
    />
  );
}
