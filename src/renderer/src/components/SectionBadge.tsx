import type { Phase } from "../../../core/types";
import { SECTION_META } from "../sections";

/** セクションのラベル（アイコン＋名前。色はセクションごと） */
export function SectionBadge({ section, short }: { section: Phase; short?: boolean }) {
  const meta = SECTION_META[section];
  const Icon = meta.icon;
  return (
    <span className={`section-badge sec-${section}`}>
      <Icon size={12} strokeWidth={2.2} aria-hidden />
      {short ? meta.short : meta.label}
    </span>
  );
}
