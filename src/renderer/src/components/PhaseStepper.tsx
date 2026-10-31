import { PHASE_LABELS, PHASES, type Phase } from "../../../core/types";
import { href } from "../router";

/** プロジェクトの現在地（どのフェーズにいるか）。各フェーズをクリックするとその画面へ */
export function PhaseStepper({ projectId, current, selected }: { projectId: number; current: Phase; selected?: Phase }) {
  const currentIndex = PHASES.indexOf(current);
  return (
    <ol className="stepper">
      {PHASES.map((phase, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li key={phase}>
            <a
              href={href({ name: "phase", projectId, phase })}
              className={`step step-${state} ${selected === phase ? "step-selected" : ""}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="step-index">{state === "done" ? "✓" : i + 1}</span>
              <span className="step-label">{PHASE_LABELS[phase]}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
