import "./ScrollBottomPill.css";
import { MailOpen } from "lucide-react";
import { READ_TOGGLE_LABELS } from "@shared/chat/readTiming";
import { keyLabel } from "@/foundation/ui/commands";
import { READ_TOGGLE_KEY } from "@/features/chat/ui";
import { usePillDock } from "./usePillDock";

/**
 * ボタンで既読にする設定の既読ボタン（一番下まで来て、作業が終わって未読のとき）。上を読んでいる間の一番下へ戻るボタンと同じ場所・同じ形に、
 * 未読の色で出す（一番下へ誘う必要はないので、上下に動かさない）。⌘⇧U でも既読になる
 */
export function ReadPill({ dock, onClick }: { /** ピルの列の右端の置き場所（ChatPane の .composer-chips-dock） */ dock: HTMLElement | null; onClick: () => void }) {
  const { ref, place } = usePillDock(dock);
  const keys = keyLabel(READ_TOGGLE_KEY);
  return place(
    <button ref={ref} type="button" className="scroll-bottom guide arrived" title={`${READ_TOGGLE_LABELS.seen}（${keys}）`} aria-label={READ_TOGGLE_LABELS.seen} onClick={onClick}>
      <MailOpen size={14} aria-hidden />
      <span className="scroll-bottom-label">{READ_TOGGLE_LABELS.seen}</span>
      <kbd>{keys}</kbd>
    </button>,
  );
}
