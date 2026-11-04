import { createLucideIcon, MoveHorizontal } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { CHAT_WIDE } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";

/** 発言の流れ・チャット欄の幅の上限（chat.css の .timeline-inner の max-width と同じ）。流れがこれより狭ければ、広げても変わらない */
const TEXT_MAX_WIDTH = 820;

/**
 * 文の幅を標準に戻すアイコン: 真ん中へ向かう左右の矢印（広げるときの MoveHorizontal ↔ を内向きにした形。
 * パネルの「横幅いっぱい」の FoldHorizontal（真ん中の点線付き）と形を分ける）
 */
const MoveHorizontalIn = createLucideIcon("move-horizontal-in", [
  ["path", { d: "M2 12h8", key: "ll" }],
  ["path", { d: "m6 8 4 4-4 4", key: "al" }],
  ["path", { d: "M22 12h-8", key: "lr" }],
  ["path", { d: "m18 8-4 4 4 4", key: "ar" }],
]);

/** 文の幅を広げるか（設定の「表示」→「チャットの文の幅」と同じ値。どのチャットでも同じ） */
export function useWideText() {
  return useSetting(CHAT_WIDE);
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
      icon={wide ? MoveHorizontalIn : MoveHorizontal}
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
