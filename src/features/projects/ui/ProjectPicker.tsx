import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { ChoiceMenu } from "@/foundation/ui/kit/ChoiceMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { ProjectChip } from "./ProjectChip";
import { chatTargetChoices } from "./projectTargets";
import { useProjects } from "./stores/projects";

/**
 * 新しいチャットの作成先を選び直す札。見た目はプロジェクトのバッジ（ProjectChip）に ▾ を付けたもので、押すと共通と各プロジェクト
 * （アーカイブしていないもの。並びは chatTargetChoices）から選ぶ。選んだら onPick（いまと同じなら呼ばない）
 */
export function ProjectPicker({ value, onPick }: { value: number; onPick: (projectId: number) => void }) {
  const { projects, projectName } = useProjects();
  const menu = useContextMenu();
  // 開いた札をもう一度押したら閉じる（外側のクリックとして閉じたあとに開き直さない）
  const id = useId();
  const name = projectName(value);
  const { values, labels } = chatTargetChoices(projects, value);
  return (
    <>
      <button type="button" className="project-picker" data-project-picker={id} aria-haspopup="menu" aria-expanded={menu.isOpen} onClick={(e) => menu.toggle(e)}>
        <ProjectChip id={value} name={name} title={`作成先: ${name}（押すと選び直せます。書きかけの文と添付はそのまま）`}>
          <span className="project-picker-name">{name}</span>
          <ChevronDown size={11} aria-hidden className="project-picker-caret" />
        </ProjectChip>
      </button>
      {menu.menu && (
        <ChoiceMenu
          at={menu.menu.at}
          title="作成先"
          values={values}
          labels={labels}
          value={String(value)}
          ignore={`[data-project-picker="${id}"]`}
          onPick={(next) => {
            if (Number(next) !== value) onPick(Number(next));
          }}
          onClose={menu.close}
        />
      )}
    </>
  );
}
