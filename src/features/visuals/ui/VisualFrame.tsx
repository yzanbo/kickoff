import { useEffect, useEffectEvent, useRef, useState } from "react";
import { VISUAL_MESSAGES, VISUAL_PROMPT_MAX, visualDocument } from "@shared/visuals/visualDocument";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
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
 * maxHeight: 高さの上限（超えたら枠の中でスクロール）。fill: 高さを親に合わせる（全画面）。
 * initialHeight: 中から高さが届くまでの高さ（前に描いたときの高さ。届いた高さに替わるときに上下が動かないように）。onHeight: 届いた高さ。
 * onReady: 枠のページを読み込んだ（同時に読み込む数を数えるため）。onTouch: 利用者が枠の中を触った（中にピントが入った）
 */
export function VisualFrame({
  kind,
  code,
  title,
  maxHeight,
  fill = false,
  initialHeight,
  onError,
  onPrompt,
  onHeight,
  onReady,
  onTouch,
}: {
  kind: "svg" | "html";
  code: string;
  title: string;
  maxHeight?: number;
  fill?: boolean;
  initialHeight?: number;
  onError?: (message: string) => void;
  onPrompt?: (text: string) => void;
  onHeight?: (height: number) => void;
  onReady?: () => void;
  onTouch?: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const theme = useVisualTheme();
  const [height, setHeight] = useState(initialHeight ?? INITIAL_HEIGHT);
  // 渡す中身（描き直すたびに最新の関数・テーマを使う）
  const latest = useLatest({ kind, code, theme, maxHeight, onError, onPrompt, onHeight, onReady });
  // 枠のページ（下の key ごと）を読み込んだか・中身を渡したか。隠した会話の欄（Activity）の中で枠ができると、ready の知らせを
  // 受ける購読がないので、表に戻して購読し直したときに、読み込み済みでまだ渡していなければ渡す
  const frameKey = `${kind}\n${code}${kind === "html" ? `\n${theme["--vis-bg"]}` : ""}`;
  const frameKeyRef = useLatest(frameKey);
  const loadedKey = useRef<string | null>(null);
  const deliveredKey = useRef<string | null>(null);
  const deliver = (frame: HTMLIFrameElement) => {
    const { kind: k, code: c, theme: t, maxHeight: max } = latest.current;
    deliveredKey.current = frameKeyRef.current;
    frame.contentWindow?.postMessage({ type: VISUAL_MESSAGES.render, html: visualDocument({ kind: k, code: c, vars: t, ...(max !== undefined && !fill ? { maxHeight: max } : {}) }) }, "*");
  };
  const deliverPending = useEffectEvent(() => {
    const frame = ref.current;
    if (frame && loadedKey.current === frameKey && deliveredKey.current !== frameKey) deliver(frame);
  });
  // 描いたとき・表に戻して購読し直したときだけ
  useEffect(() => {
    deliverPending();
  }, []);

  useWindowEvent("message", (e) => {
    const frame = ref.current;
    if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== "object") return;
    const data = e.data as { type?: unknown; height?: unknown; message?: unknown; text?: unknown };
    if (data.type === VISUAL_MESSAGES.ready) {
      deliver(frame);
      latest.current.onReady?.();
    } else if (data.type === VISUAL_MESSAGES.size && typeof data.height === "number") {
      const next = Math.max(MIN_HEIGHT, Math.ceil(data.height));
      setHeight(next);
      latest.current.onHeight?.(next);
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
      key={frameKey}
      ref={ref}
      onLoad={() => (loadedKey.current = frameKey)}
      onFocus={onTouch}
      className="visual-frame"
      src="/visual-frame"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      title={title}
      style={fill ? { height: "100%" } : { height: shown }}
    />
  );
}
