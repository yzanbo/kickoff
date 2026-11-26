import "./ScrollBottomPill.css";
import { CheckCheck, MailOpen } from "lucide-react";
import { READ_DONE_LABEL, READ_TOGGLE_LABELS, type ReadPillKind } from "@shared/chat/readTiming";
import { keyLabel } from "@/foundation/ui/commands";
import { READ_TOGGLE_KEY } from "@/features/chat/ui";
import { usePillDock } from "./usePillDock";

/**
 * ボタンで既読にする設定の既読ボタン（一番下まで来て、作業が終わったとき）。上を読んでいる間の一番下へ戻るボタンと同じ場所・同じ形に出す
 * （一番下へ誘う必要はないので、上下に動かさない）。未読なら未読の色の押せるボタン（⌘⇧U でも既読になる）。
 * 既読なら消さずに、控えめな色の押せない「既読」の表示にする（押したのが効いたと分かるように。未読に戻すのは ⌘⇧U・右クリック）
 */
export function ReadPill({ kind, dock, onClick }: {
  kind: ReadPillKind;
  /** ピルの列の右端の置き場所（ChatPane の .composer-chips-dock） */
  dock: HTMLElement | null;
  onClick: () => void;
}) {
  const { ref, place } = usePillDock(dock);
  const keys = keyLabel(READ_TOGGLE_KEY);
  if (kind === "read") {
    return place(
      <span ref={ref} role="status" className="scroll-bottom guide idle read-done" title={`${READ_DONE_LABEL}（${keys} で未読に戻せます）`}>
        <CheckCheck size={14} aria-hidden />
        <span className="scroll-bottom-label">{READ_DONE_LABEL}</span>
      </span>,
    );
  }
  return place(
    <button ref={ref} type="button" className="scroll-bottom guide arrived" title={`${READ_TOGGLE_LABELS.seen}（${keys}）`} aria-label={READ_TOGGLE_LABELS.seen} onClick={onClick}>
      <MailOpen size={14} aria-hidden />
      <span className="scroll-bottom-label">{READ_TOGGLE_LABELS.seen}</span>
      <kbd>{keys}</kbd>
    </button>,
  );
}
