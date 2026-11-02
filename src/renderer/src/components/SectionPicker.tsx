import { PHASES, type Phase } from "../../../core/types";
import { SECTION_META } from "../sections";
import { OptionMenu } from "./OptionMenu";

/** チャット欄で選ぶセクション（AI の役割と権限が変わる） */
export function SectionPicker({ value, onChange }: { value: Phase; onChange: (v: Phase) => void }) {
  const Icon = SECTION_META[value].icon;
  return (
    <OptionMenu
      value={value}
      icon={<Icon size={15} />}
      ariaLabel="セクション"
      title={`${SECTION_META[value].label}: ${SECTION_META[value].description}`}
      className={`section-menu sec-${value}`}
      groups={[{ label: "セクション", items: PHASES.map((p) => ({ value: p, label: SECTION_META[p].label, description: SECTION_META[p].description })) }]}
      onChange={onChange}
    />
  );
}
