import { createLucideIcon } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { cx } from "../../cx";
import { useSharedFlag } from "../../hooks/useStoredState";
import { CHAT_WIDE_KEY } from "../../storageKeys";
import { IconButton } from "../IconButton";

/** 発言の流れ・チャット欄の幅の上限（chat.css の .timeline-inner の max-width と同じ）。流れがこれより狭ければ、広げても変わらない */
const TEXT_MAX_WIDTH = 820;

/**
 * 文の幅のアイコン: 左右に矢印の付いた文の行（パネルの「横幅いっぱい」の ⇔ と形を分ける。パネルの大きさではなく、中の文の幅を変えるため）
 */
const TextWidth = createLucideIcon("text-width", [
  ["path", { d: "M8 7h8", key: "l1" }],
  ["path", { d: "M8 12h8", key: "l2" }],
  ["path", { d: "M8 17h5", key: "l3" }],
  ["path", { d: "m5 9-3 3 3 3", key: "al" }],
  ["path", { d: "m19 9 3 3-3 3", key: "ar" }],
]);

/** 文の幅を広げるか（設定の「表示」→「チャットの文の幅」と同じ値。どのチャットでも同じ） */
export function useWideText() {
  return useSharedFlag(CHAT_WIDE_KEY);
}

/**
 * 文の幅の切り替え（チャットの見出しの行。パネルの大きさは変えず、発言の流れ・チャット欄の幅の上限（820px）を外してパネルいっぱいに広げる）。
 * パネルが上限より狭いときは押しても変わらないので、押せなくしてその理由を出す（幅は panel の大きさの変化で測り直す）
 */
export function TextWidthToggle({ panel }: { panel: RefObject<HTMLElement | null> }) {
  const [wide, setWide] = useWideText();
  const [roomy, setRoomy] = useState(true);
  // （親の要素の ref は子の layout effect より後に付くので、描き終えてから測る）
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => setRoomy(el.clientWidth > TEXT_MAX_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [panel]);
  const label = wide ? "文の幅を標準に戻す" : "文の幅を広げる";
  return (
    <IconButton
      icon={TextWidth}
      size={14}
      label={label}
      title={roomy ? label : "パネルが狭いため変わりません"}
      aria-pressed={wide}
      disabled={!roomy}
      className={cx(wide && "active")}
      onClick={() => setWide(!wide)}
    />
  );
}
