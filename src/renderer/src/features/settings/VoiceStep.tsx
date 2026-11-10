import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** 音声入力の準備の手順 1 つ（左に番号、済んだら ✓ に変えて緑に。title の右に札を添えられる） */
export function VoiceStep({ n, done, title, badge, children }: { n: number; done: boolean | undefined; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <li className={cx("voice-step", done && "done")}>
      <span className="voice-step-mark" aria-label={done ? "済み" : `手順 ${n}`}>
        {done ? <Check size={13} aria-hidden /> : n}
      </span>
      <div className="voice-step-body">
        <div className="voice-step-title">
          {title}
          {badge}
        </div>
        {children}
      </div>
    </li>
  );
}
