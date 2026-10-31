import { PHASES, type Phase } from "../../../core/types";
import { SECTION_META } from "../sections";

/** チャット欄で選ぶセクション（AI の役割と権限が変わる） */
export function SectionPicker({ value, onChange }: { value: Phase; onChange: (v: Phase) => void }) {
  const Icon = SECTION_META[value].icon;
  return (
    <label className={`pill-select section-pill sec-${value}`} title={SECTION_META[value].description}>
      <Icon size={14} aria-hidden />
      <select aria-label="セクション" value={value} onChange={(e) => onChange(e.target.value as Phase)}>
        {PHASES.map((p) => (
          <option key={p} value={p}>
            {SECTION_META[p].label}
          </option>
        ))}
      </select>
    </label>
  );
}
