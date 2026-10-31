import { PHASE_LABELS, type Phase } from "../../../core/types";
import { api, useAsync } from "../api";
import { Composer } from "../components/Composer";
import { useRunOptions } from "../components/RunOptionsBar";
import { href, navigate } from "../router";
import { SECTION_DESCRIPTIONS, SECTION_PLACEHOLDERS } from "../sections";

/** 新しいチャット（最初のメッセージを送るとチャットが作られ、その会話の画面に移る） */
export function NewChatPage({ projectId, section }: { projectId: number; section: Phase }) {
  const options = useRunOptions();
  const project = useAsync(() => api.project(projectId), [projectId]);
  const runs = useAsync(() => api.runs(projectId), [projectId]);

  // 最初の要件定義チャットは、プロジェクト作成時のアイデアから始められるようにする
  const idea = project.data?.description.trim();
  const isFirstRequirements = section === "requirements" && runs.data && !runs.data.some((r) => r.phase === "requirements");
  const ready = !project.loading && !runs.loading;

  return (
    <div className="run-page">
      <header className="run-header">
        <a className="muted small" href={href({ name: "section", projectId, section })}>
          ← {project.data?.name ?? ""} / {PHASE_LABELS[section]}
        </a>
        <div className="run-title-row">
          <h1>新しいチャット</h1>
          <span className="status-chip">{PHASE_LABELS[section]}</span>
        </div>
      </header>

      <div className="timeline">
        <div className="new-chat-hint">
          <div className="new-chat-title">{PHASE_LABELS[section]}のチャット</div>
          <p className="muted">{SECTION_DESCRIPTIONS[section]}</p>
          <p className="muted small">{SECTION_PLACEHOLDERS[section]}</p>
        </div>
      </div>

      <div className="run-composer">
        {ready && (
          <Composer
            // セクションを切り替えたら入力欄を作り直す
            key={`${projectId}:${section}`}
            options={options}
            autoFocus
            initialText={isFirstRequirements && idea ? `次のアイデアについて、要件定義を一緒に進めてください。\n\n${idea}` : undefined}
            placeholder="メッセージを入力（⌘+Enter で送信）"
            onSend={async (prompt) => {
              const run = await api.startRun(projectId, { phase: section, prompt, options: options.options });
              navigate({ name: "run", projectId, runId: run.id }, { replace: true });
            }}
          />
        )}
      </div>
    </div>
  );
}
