import { Folder, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectSummary, Run } from "../../../../core/types";
import { api } from "../../api";
import { useAsync } from "../../hooks/useAsync";
import { useProjects } from "../../projectsContext";
import { choiceDialog } from "../../dialogs";
import { Composer, SendCancelled } from "../chat/Composer";
import { ProjectChip } from "../ProjectChip";
import { useRunOptions } from "../chat/RunOptionsBar";
import { BUSY_STATUSES } from "../RunStatus";
import { askNewWorktreeBranch, WorkplacePicker, type Workplace } from "../changes/WorkplacePicker";
import { invalidateWorktrees } from "../../worktree/worktreeBranches";
import type { NewChatSeed } from "../chat/askInNewChat";
import type { ComposerFill } from "../chat/quoteComment";

interface Props {
  projectId: number;
  /** グループの＋から始めたときのグループ */
  group?: number;
  /** 初めに入力欄に入れるもの（送信待ちの指示を新しいチャットで聞くとき。文と添付） */
  seed?: NewChatSeed;
  /** 書きかけていた文（ボードを開き直した・アプリを再起動したときに入力欄へ戻す） */
  draftText?: string;
  /** いま見えているか（見えていないタブに文を戻すときは、入力欄にピントを移さない） */
  visible?: boolean;
  /** 全プロジェクトのボードでは、どのプロジェクトで始めるかを選べるようにする */
  projects?: ProjectSummary[];
  onProjectChange?: (projectId: number) => void;
  /** 作成先のグループを変えたとき・グループ名が分かったとき（タブの表示に使う） */
  onGroupChange?: (group: number | undefined, groupName: string | undefined) => void;
  /** 最初のメッセージを送ってチャットができたとき（このタブをそのチャットに置き換える） */
  onCreated: (run: Run) => void;
  /** 書いている文が変わったとき（ボードの「下書き」のカードに出す） */
  onDraftChange?: (text: string) => void;
}

/** 右側のパネルで始める新しいチャット（最初のメッセージを送ると、そのチャットのタブになる） */
export function NewChatPane({
  projectId,
  group,
  seed,
  draftText,
  visible = true,
  projects,
  onProjectChange,
  onGroupChange,
  onCreated,
  onDraftChange,
}: Props) {
  const { projectName } = useProjects();
  const options = useRunOptions(undefined, projectId);
  const project = useAsync(() => api.project(projectId), [projectId]);
  const runs = useAsync(() => api.runs(projectId), [projectId]);
  // 作業場所（初めは本体。並行して進めたいときにワークツリーを選ぶ）
  const [place, setPlace] = useState<Workplace>({ kind: "main" });
  useEffect(() => setPlace({ kind: "main" }), [projectId]);
  // 同じ作業場所で、ほかのチャットが作業中か（同じファイルを触るとぶつかる）
  const busyHere = isBusyAt(runs.data ?? [], place);
  const groups = useAsync(() => api.groups(projectId), [projectId]);
  const groupName = groups.data?.find((g) => g.id === group)?.name;
  // グループ名が分かったら、タブにも出す
  useEffect(() => {
    if (groupName) onGroupChange?.(group, groupName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName]);

  const ready = !project.loading && !runs.loading;
  // 入力欄ができたら 1 回だけ、書きかけていた文（なければ送信待ちの指示から始めたときの文）と添付を入れる（送るのは自分で）。
  // 書きかけの文は打つたびに変わるので、最初の値だけを使う。隠れているタブ（閉じたパネル・ほかのタブの裏）ではピントを移さない
  const fillComposer = useRef<ComposerFill | null>(null);
  const initialText = useRef(draftText);
  const seeded = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => {
    if (!ready || seeded.current) return;
    const text = initialText.current ?? seed?.text;
    if (!text && !seed) return;
    seeded.current = true;
    fillComposer.current?.(text ?? "", { attachments: seed?.attachments, focus: visibleRef.current });
  }, [ready, seed]);

  return (
    <div className="run-page run-panel new-chat">
      <header className="run-header">
        {/* 名前と閉じるはタブに出すので、見出しには出さない（いまのチャットの見出し RunHeader と同じ） */}
        <div className="run-title-row">
        <div className="run-sub muted small">
          {/* どのプロジェクトで始めるかを、チャットの見出しと同じバッジで出す */}
          {projects && projects.length > 1 && onProjectChange ? (
            // 全プロジェクトのボードでは、バッジのまま選び直せる
            <ProjectChip id={projectId} name={projectName(projectId)} className="project-chip-select">
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
        </div>
      </header>
      <div className="timeline">
        <div className="new-chat-hero">
          <div className="new-chat-icon">
            <SquarePen size={22} />
          </div>
          <h1>{project.data?.name ?? ""}</h1>
          <p className="muted">調べもの・設計・実装・テストなど、AI に頼みたいことを書いて始めます</p>
          {groupName && <p className="muted small">グループ「{groupName}」に追加されます</p>}
          {seed && <p className="muted small">送信待ちの指示を入力欄に入れました。直して送れます（作成先のグループは上で選べます）</p>}
          {place.kind === "new" && <p className="muted small">新しいワークツリー「{place.branch}」を作り、その中で作業します</p>}
          {busyHere && <p className="small warn-text">この作業場所では、ほかのチャットが作業中です。同じファイルを触ると作業がぶつかることがあります。</p>}
        </div>
      </div>
      <div className="run-composer">
        {ready && (
          <Composer
            key={projectId}
            chatContext={{ projectId }}
            options={options}
            autoFocus
            onTextChange={onDraftChange}
            fillRef={fillComposer}
            // 新しいワークツリーはまだないので、本体から探す
            suggestTarget={place.kind === "existing" ? { projectId, worktree: place.path } : projectId}
            placeholder="例: ログイン画面を作って（Enter で送信、Shift+Enter で改行）"
            onSend={async (prompt, attachments) => {
              // 作業中のチャットがある作業場所に送るときは、送る前に選んでもらう（質問だけなら、このままでよい）
              // 開いたときの一覧は古くなっているので、送るときに取り直して確かめる
              let target = place;
              if (isBusyAt(await api.runs(projectId), place)) {
                const choice = await choiceDialog({
                  title: "この作業場所では、ほかのチャットが作業中です",
                  message: "同じファイルを書き換えると、作業がぶつかることがあります。新しいワークツリーで始めると、別のフォルダで並行して進められます。質問だけなど、ファイルを書き換えないチャットなら、このまま送っても大丈夫です。",
                  choices: [
                    { value: "here", label: "このまま送る" },
                    { value: "worktree", label: "新しいワークツリーで始める", primary: true },
                  ],
                });
                if (!choice) throw new SendCancelled();
                if (choice === "worktree") {
                  const branch = await askNewWorktreeBranch();
                  if (!branch) throw new SendCancelled();
                  target = { kind: "new", branch };
                  setPlace(target);
                }
              }
              const run = await api.startRun(projectId, {
                prompt,
                options: options.options,
                attachments,
                group_id: group,
                ...(target.kind === "existing" ? { worktree_path: target.path } : target.kind === "new" ? { new_worktree_branch: target.branch } : {}),
              });
              // 新しいワークツリーを作ったときは、ブランチの一覧をすぐ取り直す
              if (target.kind === "new") invalidateWorktrees(projectId);
              onCreated(run);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** その作業場所（本体・いまあるワークツリー）で、作業中のチャットがあるか。新しく作るワークツリーなら、まだない */
function isBusyAt(runs: Run[], place: Workplace): boolean {
  const path = place.kind === "existing" ? place.path : place.kind === "main" ? "" : null;
  return path !== null && runs.some((r) => r.worktree_path === path && BUSY_STATUSES.includes(r.status));
}
