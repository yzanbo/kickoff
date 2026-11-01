import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { BOARD_STAGE_LABELS, type BoardStage, type Phase, type ProjectSummary, type Run } from "../../../core/types";
import { api, useAsync } from "../api";
import { SECTION_META } from "../sections";
import { Composer } from "./Composer";
import { useRunOptions } from "./RunOptionsBar";
import { SectionPicker } from "./SectionPicker";

interface Props {
  projectId: number;
  section?: Phase;
  /** カンバンの列の＋から始めたときの列 */
  stage?: BoardStage;
  /** グループの＋から始めたときのグループ */
  group?: number;
  /** 全プロジェクトのボードでは、どのプロジェクトで始めるかを選べるようにする */
  projects?: ProjectSummary[];
  onProjectChange?: (projectId: number) => void;
  onClose: () => void;
  /** 最初のメッセージを送ってチャットができたとき（このタブをそのチャットに置き換える） */
  onCreated: (run: Run) => void;
}

/** 右側のパネルで始める新しいチャット（最初のメッセージを送ると、そのチャットのタブになる） */
export function NewChatPane({ projectId, section: initialSection, stage, group, projects, onProjectChange, onClose, onCreated }: Props) {
  const [section, setSection] = useState<Phase>(initialSection ?? "requirements");
  const options = useRunOptions(undefined, section, projectId);
  const project = useAsync(() => api.project(projectId), [projectId]);
  const runs = useAsync(() => api.runs(projectId), [projectId]);
  const groups = useAsync(() => api.groups(projectId), [projectId]);
  const groupName = groups.data?.find((g) => g.id === group)?.name;

  // セクションの指定がなければ、プロジェクトの既定 → 直近のチャットと同じ → 要件定義の順に決める
  useEffect(() => {
    if (initialSection) setSection(initialSection);
    else if (project.data?.defaults.section) setSection(project.data.defaults.section);
    else if (runs.data?.[0]) setSection(runs.data[0].phase);
  }, [initialSection, runs.data, project.data]);

  const idea = project.data?.description.trim();
  const isFirst = runs.data && runs.data.length === 0;
  const ready = !project.loading && !runs.loading;
  const Icon = SECTION_META[section].icon;
  const stageShown = stage ?? project.data?.defaults.stage;

  return (
    <div className="run-page run-panel new-chat">
      <header className="run-header">
        <div className="run-title-row">
          <button className="icon-button" title="閉じる（Esc）" aria-label="パネルを閉じる" onClick={onClose}>
            <X size={15} />
          </button>
          <h1>新しいチャット</h1>
        </div>
        <div className="run-sub muted small">
          {projects && projects.length > 1 && onProjectChange ? (
            <select
              className="new-chat-project"
              aria-label="プロジェクト"
              value={projectId}
              onChange={(e) => onProjectChange(Number(e.target.value))}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span>{project.data?.name ?? ""}</span>
          )}
        </div>
      </header>
      <div className="timeline">
        <div className="new-chat-hero">
          <div className={`new-chat-icon sec-${section}`}>
            <Icon size={22} />
          </div>
          <h1>{project.data?.name ?? ""}</h1>
          <p className="muted">
            {SECTION_META[section].label} — {SECTION_META[section].description}
          </p>
          {stageShown && <p className="muted small">カンバンの「{BOARD_STAGE_LABELS[stageShown]}」に追加されます</p>}
          {groupName && <p className="muted small">グループ「{groupName}」に追加されます</p>}
        </div>
      </div>
      <div className="run-composer">
        {ready && (
          <Composer
            key={projectId}
            options={options}
            autoFocus
            leading={<SectionPicker value={section} onChange={setSection} />}
            initialText={isFirst && idea ? `次のアイデアについて、要件定義を一緒に進めてください。\n\n${idea}` : undefined}
            placeholder={`${SECTION_META[section].placeholder}（Enter で送信、Shift+Enter で改行）`}
            onSend={async (prompt, attachments) => {
              const run = await api.startRun(projectId, { phase: section, prompt, options: options.options, attachments, stage, group_id: group });
              onCreated(run);
            }}
          />
        )}
      </div>
    </div>
  );
}
