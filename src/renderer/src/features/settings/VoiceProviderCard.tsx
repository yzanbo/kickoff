import { Check, Minus } from "lucide-react";
import { cx } from "@/lib/cx";
import type { ProviderInfo } from "./voiceOptions";

/** 方法を選ぶカード（名前と「無料」「有料」の札・ひとこと・良いところ ✓ と気を付けるところ −）。文字起こしの方法と読み上げの声で共通 */
export function VoiceProviderCard({ name, info, selected, onSelect }: { name: string; info: ProviderInfo; selected: boolean; onSelect: () => void }) {
  return (
    <label className={cx("voice-provider", selected && "selected")}>
      <span className="voice-provider-head">
        <input type="radio" name={name} checked={selected} onChange={onSelect} />
        <span className="voice-provider-title">{info.title}</span>
        <span className={cx("voice-price", info.free ? "free" : "paid")}>{info.price}</span>
      </span>
      <span className="voice-provider-summary">{info.summary}</span>
      <ul className="voice-points">
        {info.pros.map((t) => (
          <li key={t} className="pro">
            <Check size={12} aria-hidden />
            {t}
          </li>
        ))}
        {info.cons.map((t) => (
          <li key={t} className="con">
            <Minus size={12} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </label>
  );
}
