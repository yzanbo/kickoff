import { SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Attachment, Chat } from "@shared/types";
import { api } from "@/api";
import { useProjects } from "@/stores/projects";
import { Composer } from "@/features/chat/composer/Composer";
import { SendCancelled } from "@/features/chat/composer/useComposerSend";
import { ProjectChip } from "@/features/project/ProjectChip";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { askNewWorktreeBranch, WorkplacePicker, workplacePath, type Workplace } from "@/features/worktree/WorkplacePicker";
import { useBusyNeighbors } from "@/features/worktree/useBusyNeighbors";
import { countBusyAt } from "@/features/worktree/workplace";
import { chooseBusyWorkplaceAction } from "@/features/worktree/busyWorkplace";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { currentChats, useChats } from "@/stores/chats";
import { groupNameIn, useGroups } from "@/stores/groups";
import { worktreesStore } from "@/stores/worktrees";
import { GroupPicker } from "@/features/group/GroupPicker";
import { DraftChatPage } from "@/features/chat/pane/DraftChatPage";
import { useChatHeaderItems, useChatHeaderRowHidden } from "@/features/chat/pane/ChatDisplayMenu";
import { SnippetBar, SnippetBarToggleItem } from "@/features/snippet/SnippetBar";

interface Props {
  projectId: number;
  /** グループの＋から始めたときのグループ */
  group?: number;
  /** 作業場所別のまとまりの「新しいチャット」から始めたときのワークツリーのフォルダ（なければ本体） */
  worktree?: string;
  /** 初めに入力欄に入れるもの（送信待ちの指示・選んだ文を新しいチャットで聞くとき。文と添付） */
  seed?: NewChatSeed;
  /** 書きかけていた文（ボードを開き直した・アプリを再起動したときに入力欄へ戻す） */
  draftText?: string;
  /** いま見えているか（見えていないタブに文を戻すときは、入力欄にピントを移さない） */
  visible?: boolean;
  /** 作業場所を選び直したとき（いまあるワークツリーならそのフォルダ、本体・新しいワークツリーなら undefined。タブのまとまりに使う） */
  onWorktreeChange?: (worktree: string | undefined) => void;
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
  worktree,
  seed,
  draftText,
  visible = true,
  onGroupChange,
  onWorktreeChange,
  onCreated,
  onDraftChange,
}: Props) {
  const { projectsById, loaded: projectsLoaded } = useProjects();
  const options = useChatOptions(undefined, projectId);
  const project = projectsById.get(projectId);
  const chats = useChats({ projectId });
  // 作業場所（初めは本体か、作業場所別のまとまりから始めたときはそのワークツリー。並行して進めたいときにワークツリーを選ぶ）
  const initialPlace = (): Workplace => (worktree ? { kind: "existing", path: worktree } : { kind: "main" });
  const [place, setPlace] = useState<Workplace>(initialPlace);
  const firstProject = useRef(projectId);
  useEffect(() => {
    // プロジェクトを選び直したら本体から（初めの描画では、渡された作業場所のまま）
    if (firstProject.current === projectId) return;
    firstProject.current = projectId;
    setPlace({ kind: "main" });
  }, [projectId]);
  const changePlace = (next: Workplace) => {
    setPlace(next);
    onWorktreeChange?.(next.kind === "existing" ? next.path : undefined);
  };
  // 同じ作業場所で、ほかのチャットが作業中か（同じファイルを触るとぶつかる。チャットの画面と同じ数え方）
  const busyHere = useBusyNeighbors(projectId, workplacePath(place)) > 0;
  // 作成先のグループ（作る・名前を変える・消すと、サーバーの知らせで選択肢も直る）
  const groups = useGroups(projectId);
  const groupName = groupNameIn(groups, group);
  // グループ名が分かったら、タブにも出す
  useEffect(() => {
    if (groupName) onGroupChange?.(group, groupName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName]);

  // 見出しに出す項目（チャットの見出しと同じ設定）
  const shows = useChatHeaderItems();
  const rowHidden = useChatHeaderRowHidden();

  const ready = projectsLoaded && (chats.loaded || chats.error !== undefined);
  // 入力欄ができたら 1 回だけ、書きかけていた文（なければ送信待ちの指示から始めたときの文）と添付を入れる（送るのは自分で）。
  // 書きかけの文は打つたびに変わるので、最初の値だけを使う。隠れているタブ（閉じたパネル・ほかのタブの裏）ではピントを移さない
  const composer = useRef<ComposerHandle | null>(null);
  const initialText = useRef(draftText);
  const seeded = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => {
    if (!ready || seeded.current) return;
    const text = initialText.current ?? seed?.text;
    if (!text && !seed) return;
    seeded.current = true;
    composer.current?.fill(text ?? "", { attachments: seed?.attachments, focus: visibleRef.current });
  }, [ready, seed]);

  // 最初の指示を送ってチャットを作る（チャット欄の送信と、定型文の帯の ⌘クリック・「すぐ送る」で共通）
  const start = async (prompt: string, attachments: Attachment[]) => {
    // 作業中のチャットがある作業場所に送るときは、送る前に選んでもらう（質問だけなら、このままでよい。既定を決めていればそのとおりに）。
    // チャットの一覧はサーバーの知らせで直っているので、送るときのいまの一覧で確かめる
    let target = place;
    const path = workplacePath(place);
    if (path !== undefined && countBusyAt(currentChats({ projectId }), path) > 0) {
      // 既定（設定の「チャット」）を決めていれば聞かない
      const choice = await chooseBusyWorkplaceAction();
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
  };

  const groupBadge = groups.length > 0 && onGroupChange && shows("group");
  return (
    <DraftChatPage
      badges={
        <>
          {/* チャットの見出しと同じバッジ・同じ順（プロジェクト → グループ → 作業場所）。グループと作業場所は、押すと選び直せる */}
          {project && shows("project") && <ProjectChip id={project.id} name={project.name} linked />}
          {groupBadge && <GroupPicker groups={groups} value={group} onChange={(next) => onGroupChange(next, groupNameIn(groups, next))} />}
          {shows("worktree") && <WorkplacePicker projectId={projectId} value={place} onChange={changePlace} />}
        </>
      }
      hero={
        <div className="new-chat-hero">
          <div className="new-chat-icon">
            <SquarePen size={22} />
          </div>
          <h1>{project?.name ?? ""}</h1>
          <p className="muted">調べもの・設計・実装・テストなど、AI に頼みたいことを書いて始めます</p>
          {groupName && <p className="muted small">グループ「{groupName}」に追加されます</p>}
          {seed && <p className="muted small">聞くことを入力欄に入れました。直して送れます{groupBadge && !rowHidden ? "（作成先のグループは上で選べます）" : ""}</p>}
          {place.kind === "new" && <p className="muted small">新しいワークツリー「{place.branch}」を作り、その中で作業します</p>}
          {busyHere && <p className="small warn-text">この作業場所では、ほかのチャットが作業中です。同じファイルを触ると作業がぶつかることがあります。</p>}
        </div>
      }
    >
      {ready && (
        <Composer
          key={projectId}
          chatContext={{ projectId }}
          options={options}
          autoFocus
          onTextChange={onDraftChange}
          handleRef={composer}
          // 新しいワークツリーはまだないので、本体から探す
          suggestTarget={place.kind === "existing" ? { projectId, worktree: place.path } : projectId}
          placeholder="例: ログイン画面を作って（Enter で送信、Shift+Enter で改行）"
          // 定型文の帯と、入力欄の右クリックの帯の表示・非表示（チャットの画面のチャット欄と同じ）
          header={<SnippetBar projectId={projectId} composer={composer} onSend={(text) => start(text, [])} />}
          menuItems={<SnippetBarToggleItem />}
          onSend={start}
        />
      )}
    </DraftChatPage>
  );
}
