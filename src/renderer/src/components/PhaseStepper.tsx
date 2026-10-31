import { PHASE_LABELS, PHASES, type Phase } from "../../../core/types";

/** プロジェクトの現在地（どのフェーズにいるか）を示すステッパー */
export function PhaseStepper({ current }: { current: Phase }) {
  const currentIndex = PHASES.indexOf(current);
  return (
    <ol className="stepper">
      {PHASES.map((phase, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li key={phase} className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-index">{state === "done" ? "✓" : i + 1}</span>
            <span className="step-label">{PHASE_LABELS[phase]}</span>
          </li>
        );
      })}
    </ol>
  );
}
