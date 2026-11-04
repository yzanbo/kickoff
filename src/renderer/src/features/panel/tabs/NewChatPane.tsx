import { Folder, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Project, Chat } from "@shared/types";
import { api } from "@/api";
import { useProjects } from "@/stores/projects";
import { choiceDialog } from "@/ui/dialogs";
import { Composer, SendCancelled } from "@/features/chat/composer/Composer";
import { ProjectChip } from "@/features/project/ProjectChip";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { askNewWorktreeBranch, WorkplacePicker, type Workplace } from "@/features/worktree/WorkplacePicker";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import type { ComposerFill } from "@/features/chat/messages/quoteComment";
import { currentChats, useChats } from "@/stores/chats";
import { groupNameIn, useGroups } from "@/stores/groups";
import { worktreesStore } from "@/stores/worktrees";

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
  projects?: Project[];
  onProjectChange?: (projectId: number) => void;
  /** 作成先のグループを変えたとき・グループ名が分かったとき（タブの表示に使う） */
  onGroupChange?: (group: number | undefined, groupName: string | undefined) => void;
  /** 最初のメッセージを送ってチャットができたとき（このタブをそのチャットに置き換える） */
  onCreated: (chat: Chat) => void;
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
  const { projectName, projectsById, loaded: projectsLoaded } = useProjects();
  const options = useChatOptions(undefined, projectId);
  const project = projectsById.get(projectId);
  const chats = useChats({ projectId });
  // 作業場所（初めは本体。並行して進めたいときにワークツリーを選ぶ）
  const [place, setPlace] = useState<Workplace>({ kind: "main" });
  useEffect(() => setPlace({ kind: "main" }), [projectId]);
  // 同じ作業場所で、ほかのチャットが作業中か（同じファイルを触るとぶつかる）
  const busyHere = isBusyAt(chats.chats, place);
  // 作成先のグループ（作る・名前を変える・消すと、サーバーの知らせで選択肢も直る）
  const groups = useGroups(projectId);
  const groupName = groupNameIn(groups, group);
  // グループ名が分かったら、タブにも出す
  useEffect(() => {
    if (groupName) onGroupChange?.(group, groupName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName]);

  const ready = projectsLoaded && (chats.loaded || chats.error !== undefined);
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
    <div className="chat-page chat-panel new-chat">
      <header className="chat-header">
        {/* 名前と閉じるはタブに出すので、見出しには出さない（いまのチャットの見出し ChatHeader と同じ） */}
        <div className="chat-title-row">
        <div className="chat-sub muted small">
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
            project && <ProjectChip id={project.id} name={project.name} linked />
          )}
          <WorkplacePicker projectId={projectId} value={place} onChange={setPlace} />
          {/* 作成先のグループ（グループがあるプロジェクトだけ。ここで変えられる） */}
          {groups.length > 0 && onGroupChange && (
            <label className={`new-chat-group ${group ? "has-group" : ""}`} title="作成先のグループ">
              <Folder size={12} aria-hidden />
              <select
                className="pill-select"
                aria-label="作成先のグループ"
                value={group ?? ""}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : undefined;
                  onGroupChange(next, groupNameIn(groups, next));
                }}
              >
                <option value="">グループなし</option>
                {groups.map((g) => (
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
          <h1>{project?.name ?? ""}</h1>
          <p className="muted">調べもの・設計・実装・テストなど、AI に頼みたいことを書いて始めます</p>
          {groupName && <p className="muted small">グループ「{groupName}」に追加されます</p>}
          {seed && <p className="muted small">送信待ちの指示を入力欄に入れました。直して送れます（作成先のグループは上で選べます）</p>}
          {place.kind === "new" && <p className="muted small">新しいワークツリー「{place.branch}」を作り、その中で作業します</p>}
          {busyHere && <p className="small warn-text">この作業場所では、ほかのチャットが作業中です。同じファイルを触ると作業がぶつかることがあります。</p>}
        </div>
      </div>
      <div className="chat-composer">
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
              // 作業中のチャットがある作業場所に送るときは、送る前に選んでもらう（質問だけなら、このままでよい）。
              // チャットの一覧はサーバーの知らせで直っているので、送るときのいまの一覧で確かめる
              let target = place;
              if (isBusyAt(currentChats({ projectId }), place)) {
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
              const chat = await api.startChat(projectId, {
                text: prompt,
                options: options.options,
                attachments,
                group_id: group,
                ...(target.kind === "existing" ? { worktree_path: target.path } : target.kind === "new" ? { new_worktree_branch: target.branch } : {}),
              });
              // 新しいワークツリーを作ったときは、ブランチの一覧をすぐ取り直す
              if (target.kind === "new") worktreesStore.invalidate(projectId);
              onCreated(chat);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** その作業場所（本体・いまあるワークツリー）で、作業中のチャットがあるか。新しく作るワークツリーなら、まだない */
function isBusyAt(chats: Chat[], place: Workplace): boolean {
  if (place.kind === "new") return false;
  // 本体のチャットの作業場所は null（空の文字ではない）
  const path = place.kind === "existing" ? place.path : null;
  return chats.some((r) => r.worktree_path === path && r.status === "running");
}
