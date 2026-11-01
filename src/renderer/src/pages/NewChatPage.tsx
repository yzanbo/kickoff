import { useEffect, useState } from "react";
import { BOARD_STAGE_LABELS, type BoardStage, type Phase } from "../../../core/types";
import { api, useAsync } from "../api";
import { BackToBoard } from "../components/BackToBoard";
import { Composer } from "../components/Composer";
import { useRunOptions } from "../components/RunOptionsBar";
import { SectionPicker } from "../components/SectionPicker";
import { navigate } from "../router";
import { SECTION_META } from "../sections";

/** 新しいチャット（最初のメッセージを送るとチャットが作られ、その画面に移る） */
export function NewChatPage({ projectId, section: initialSection, stage }: { projectId: number; section?: Phase; stage?: BoardStage }) {
  const [section, setSection] = useState<Phase>(initialSection ?? "requirements");
  const options = useRunOptions(undefined, section, projectId);
  const project = useAsync(() => api.project(projectId), [projectId]);
  const runs = useAsync(() => api.runs(projectId), [projectId]);

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

  return (
    <div className="run-page new-chat">
      <header className="run-header">
        <div className="run-title-row">
          <BackToBoard projectId={projectId} />
          <h1>新しいチャット</h1>
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
          {(stage ?? project.data?.defaults.stage) && (
            <p className="muted small">カンバンの「{BOARD_STAGE_LABELS[(stage ?? project.data?.defaults.stage)!]}」に追加されます</p>
          )}
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
            placeholder={`${SECTION_META[section].placeholder}（⌘+Enter で送信）`}
            onSend={async (prompt, attachments) => {
              const run = await api.startRun(projectId, { phase: section, prompt, options: options.options, attachments, stage });
              navigate({ name: "run", projectId, runId: run.id }, { replace: true });
            }}
          />
        )}
      </div>
    </div>
  );
}
