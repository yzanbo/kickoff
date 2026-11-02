import { Folder } from "lucide-react";
import { useEffect, useState } from "react";
import type { Phase, ProjectSummary, Run } from "../../../core/types";
import { api, useAsync } from "../api";
import { SECTION_META } from "../sections";
import { Composer } from "./Composer";
import { CloseButton } from "./IconButton";
import { ProjectChip } from "./ProjectChip";
import { useRunOptions } from "./RunOptionsBar";
import { BUSY_STATUSES } from "./RunStatus";
import { SectionPicker } from "./SectionPicker";
import { WorkplacePicker, type Workplace } from "./changes/WorkplacePicker";
import { invalidateWorktrees } from "../worktreeBranches";

interface Props {
  projectId: number;
  section?: Phase;
  /** グループの＋から始めたときのグループ */
  group?: number;
  /** 全プロジェクトのボードでは、どのプロジェクトで始めるかを選べるようにする */
  projects?: ProjectSummary[];
  onProjectChange?: (projectId: number) => void;
  /** 作成先のグループを変えたとき・グループ名が分かったとき（タブの表示に使う） */
  onGroupChange?: (group: number | undefined, groupName: string | undefined) => void;
  onClose: () => void;
  /** 最初のメッセージを送ってチャットができたとき（このタブをそのチャットに置き換える） */
  onCreated: (run: Run) => void;
  /** 書いている文が変わったとき（ボードの「下書き」のカードに出す） */
  onDraftChange?: (text: string) => void;
}

/** 右側のパネルで始める新しいチャット（最初のメッセージを送ると、そのチャットのタブになる） */
export function NewChatPane({
  projectId,
  section: initialSection,
  group,
  projects,
  onProjectChange,
  onGroupChange,
  onClose,
  onCreated,
  onDraftChange,
}: Props) {
  const [section, setSection] = useState<Phase>(initialSection ?? "requirements");
  const options = useRunOptions(undefined, section, projectId);
  const project = useAsync(() => api.project(projectId), [projectId]);
  const runs = useAsync(() => api.runs(projectId), [projectId]);
  // 作業場所（初めは本体。並行して進めたいときにワークツリーを選ぶ）
  const [place, setPlace] = useState<Workplace>({ kind: "main" });
  useEffect(() => setPlace({ kind: "main" }), [projectId]);
  // 同じ作業場所で、ほかのチャットが作業中か（同じファイルを触るとぶつかる）
  const placePath = place.kind === "existing" ? place.path : place.kind === "main" ? "" : null;
  const busyHere = placePath !== null && (runs.data ?? []).some((r) => r.worktree_path === placePath && BUSY_STATUSES.includes(r.status));
  const groups = useAsync(() => api.groups(projectId), [projectId]);
  const groupName = groups.data?.find((g) => g.id === group)?.name;
  // グループ名が分かったら、タブにも出す
  useEffect(() => {
    if (groupName) onGroupChange?.(group, groupName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName]);

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
    <div className="run-page run-panel new-chat">
      <header className="run-header">
        <div className="run-title-row">
          <CloseButton label="パネルを閉じる" title="閉じる（Esc）" size={15} onClick={onClose} />
          <h1>新しいチャット</h1>
        </div>
        <div className="run-sub muted small">
          {/* どのプロジェクトで始めるかを、チャットの見出しと同じバッジで出す */}
          {projects && projects.length > 1 && onProjectChange ? (
            // 全プロジェクトのボードでは、バッジのまま選び直せる
            <ProjectChip id={projectId} name={projects.find((p) => p.id === projectId)?.name ?? ""} className="project-chip-select">
              <select className="pill-select" aria-label="プロジェクト" value={projectId} onChange={(e) => onProjectChange(Number(e.target.value))}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </ProjectChip>
          ) : (
            project.data && <ProjectChip id={project.data.id} name={project.data.name} linked />
          )}
          <WorkplacePicker projectId={projectId} value={place} onChange={setPlace} />
          {/* 作成先のグループ（グループがあるプロジェクトだけ。ここで変えられる） */}
          {groups.data && groups.data.length > 0 && onGroupChange && (
            <label className={`new-chat-group ${group ? "has-group" : ""}`} title="作成先のグループ">
              <Folder size={12} aria-hidden />
              <select
                className="pill-select"
                aria-label="作成先のグループ"
                value={group ?? ""}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : undefined;
                  onGroupChange(next, groups.data?.find((g) => g.id === next)?.name);
                }}
              >
                <option value="">グループなし</option>
                {groups.data.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
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
          {groupName && <p className="muted small">グループ「{groupName}」に追加されます</p>}
          {place.kind === "new" && <p className="muted small">新しいワークツリー「{place.branch}」を作り、その中で作業します</p>}
          {busyHere && <p className="small warn-text">この作業場所では、ほかのチャットが作業中です。同じファイルを触ると作業がぶつかることがあります。</p>}
        </div>
      </div>
      <div className="run-composer">
        {ready && (
          <Composer
            key={projectId}
            options={options}
            autoFocus
            leading={<SectionPicker value={section} onChange={setSection} />}
            onTextChange={onDraftChange}
            // 新しいワークツリーはまだないので、本体から探す
            suggestTarget={place.kind === "existing" ? { projectId, worktree: place.path } : projectId}
            initialText={isFirst && idea ? `次のアイデアについて、要件定義を一緒に進めてください。\n\n${idea}` : undefined}
            placeholder={`${SECTION_META[section].placeholder}（Enter で送信、Shift+Enter で改行）`}
            onSend={async (prompt, attachments) => {
              const run = await api.startRun(projectId, {
                phase: section,
                prompt,
                options: options.options,
                attachments,
                group_id: group,
                ...(place.kind === "existing" ? { worktree_path: place.path } : place.kind === "new" ? { new_worktree_branch: place.branch } : {}),
              });
              // 新しいワークツリーを作ったときは、ブランチの一覧をすぐ取り直す
              if (place.kind === "new") invalidateWorktrees(projectId);
              onCreated(run);
            }}
          />
        )}
      </div>
    </div>
  );
}
