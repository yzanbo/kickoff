import { SquarePen } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type MutableRefObject } from "react";
import type { Attachment, Chat } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import { api } from "@/foundation/ui/api";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { SendCancelled } from "@/features/composer/ui/useComposerSend";
import { ProjectChip } from "@/features/projects/ui/ProjectChip";
import { useChatOptions } from "@/features/ai/ui/options/ChatOptionsBar";
import { askNewWorktreeBranch, WorkplacePicker } from "@/foundation/ui/workplace/WorkplacePicker";
import { workplacePath, type WorkplaceChoice } from "@/foundation/ui/workplace/workplace";
import { BusyNeighborsNotice } from "@/features/chat/ui/workplace/BusyNeighborsNotice";
import { useBusyNeighbors } from "@/features/chat/ui/workplace/useBusyNeighbors";
import { countBusyAt } from "@/foundation/ui/workplace/workplace";
import { chooseBusyWorkplaceAction, currentChats, useChats, type NewChatSeed } from "@/features/chat/ui";
import { appendDraft, Composer, composerPills, DraftTextWatch, focusDraft, memoryDraft } from "@/features/composer/ui";
import { mergeAttachments } from "@/features/attachments/ui";
import { groupNameIn, useGroups } from "@/features/groups/ui/stores/groups";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { GroupPicker } from "@/features/groups/ui/GroupPicker";
import { DraftChatPage } from "@/features/conversation/ui/screen/DraftChatPage";
import { useChatHeaderItems, useChatHeaderRowHidden } from "@/features/conversation/ui/screen/ChatDisplayMenu";
import { AgentSplit } from "@/features/chatPanel/ui/agents/AgentSplit";
import { claimVoiceHandoff } from "@/features/voice/ui/voiceHandoff";
import type { VoiceReply } from "@/features/voice/ui/voiceSession";
import { draftScope } from "@/features/panel/ui/surfaces";
import type { SidePanelHandle } from "@/features/conversation/ui";
import { ChatProviderContext } from "@/features/ai/ui/provider/chatProvider";
import { ProviderPicker } from "@/features/ai/ui";

/** 送る前の新しいチャットには、読み上げる返答がまだない */
const NO_REPLIES: VoiceReply[] = [];

interface Props {
  /** このタブの key（右の欄の範囲 draft-<key>。送ったら、できたチャットの右の欄へ中身を移す） */
  tabKey: string;
  projectId: number;
  /** グループの＋から始めたときのグループ */
  group?: number;
  /** 送る前に付けた名前（右クリックの「名前を変更」。あれば、その名前でチャットを作る） */
  title?: string;
  /** 作業場所別のまとまりの「新しいチャット」から始めたときのワークツリーのフォルダ（なければ本体） */
  worktree?: string;
  /** 初めに入力欄に入れるもの（送信待ちの指示・選んだ文を新しいチャットで聞くとき。文と添付） */
  seed?: NewChatSeed;
  /** 書きかけていた文（ボードを開き直した・アプリを再起動したときに入力欄へ戻す） */
  draftText?: string;
  /** 残していた送る前の添付（一度も残していなければ undefined。そのときだけ seed の添付を入れる） */
  draftAttachments?: readonly Attachment[];
  /** 送る前の添付を残す（タブに。入力欄がなくなってから終わったアップロードも） */
  saveAttachments?: (list: readonly Attachment[]) => void;
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

/**
 * 右側のパネルで始める新しいチャット（最初のメッセージを送ると、そのチャットのタブになる）。
 * チャットの画面と同じく右の欄を持ち（AgentSplit。範囲は下書きのタブの draft-<key>）、ノートのピルから開いたノートはここに開く。送ったら中身はできたチャットの右の欄へ移る
 */
export function NewChatPane({
  tabKey,
  projectId,
  group,
  title,
  worktree,
  seed,
  draftText,
  draftAttachments,
  saveAttachments,
  visible = true,
  onGroupChange,
  onWorktreeChange,
  onCreated,
  onDraftChange,
}: Props) {
  const { projectsById, loaded: projectsLoaded } = useProjects();
  // 右の欄の操作（流れの中のカードへ移ることがないので、受け取るだけ）
  const side: MutableRefObject<SidePanelHandle | null> = useRef(null);
  const project = projectsById.get(projectId);
  // 使う AI（初めはプロジェクトの AI。チャット欄の札で選び直せ、送ったあとは変えない）
  const [pickedProvider, setPickedProvider] = useState<ProviderId | null>(null);
  const provider: ProviderId = pickedProvider ?? project?.provider ?? "claude";
  const options = useChatOptions(undefined, projectId, undefined, provider);
  const chats = useChats({ projectId });
  // 作業場所（初めは本体か、作業場所別のまとまりから始めたときはそのワークツリー。並行して進めたいときにワークツリーを選ぶ）
  // GitHub の issue から「新しいワークツリー」で始めたときは、そのブランチ名の新しいワークツリー（送ったときに作る）
  const initialPlace = (): WorkplaceChoice => (worktree ? { kind: "existing", path: worktree } : seed?.newWorktreeBranch ? { kind: "new", branch: seed.newWorktreeBranch } : { kind: "main" });
  const [place, setPlace] = useState<WorkplaceChoice>(initialPlace);
  const firstProject = useRef(projectId);
  useEffect(() => {
    // プロジェクトを選び直したら本体から（初めの描画では、渡された作業場所のまま）
    if (firstProject.current === projectId) return;
    firstProject.current = projectId;
    setPlace({ kind: "main" });
  }, [projectId]);
  const changePlace = (next: WorkplaceChoice) => {
    setPlace(next);
    onWorktreeChange?.(next.kind === "existing" ? next.path : undefined);
  };
  // 同じ作業場所で作業中のほかのチャットの数（同じファイルを触るとぶつかる。チャットの画面と同じ数え方・同じ知らせ）
  const busyNeighbors = useBusyNeighbors(projectId, workplacePath(place));
  // 作成先のグループ（作る・名前を変える・消すと、サーバーの知らせで選択肢も直る）
  const groups = useGroups(projectId);
  const groupName = groupNameIn(groups, group);
  // グループ名が分かったら、タブにも出す
  const tellGroupName = useEffectEvent((name: string) => onGroupChange?.(group, name));
  useEffect(() => {
    if (groupName) tellGroupName(groupName);
  }, [groupName]);

  // 見出しに出す項目（チャットの見出しと同じ設定）
  const shows = useChatHeaderItems();
  const rowHidden = useChatHeaderRowHidden();

  const ready = projectsLoaded && (chats.loaded || chats.error !== undefined);
  // 入力欄ができたら 1 回だけ、書きかけていた文（なければ送信待ちの指示から始めたときの文）と添付を入れる（送るのは自分で）。
  // 書きかけの文は打つたびに変わるので、最初の値だけを使う。隠れているタブ（閉じたパネル・ほかのタブの裏）ではピントを移さない
  // 書きかけは入力欄の下書きの店に持ち、添付はタブに残す（文は onDraftChange で少し待ってから）。プロジェクトを選び直したら文は空から（添付は残す）
  const newDraft = (attachments: readonly Attachment[]) => memoryDraft({ attachments }, (value, next) => next.attachments && saveAttachments?.(value.attachments));
  const [draft, setDraft] = useState(() => newDraft(draftAttachments ?? []));
  const [draftProject, setDraftProject] = useState(projectId);
  if (draftProject !== projectId) {
    setDraftProject(projectId);
    setDraft(newDraft(draft.read().attachments));
  }
  const initialText = useRef(draftText);
  // seed の添付は、タブに添付をまだ残していないときだけ入れる（残していれば入力欄がそれを戻す。外した添付を戻さない）
  const seedAttachments = useRef(draftAttachments === undefined ? seed?.attachments : undefined);
  const seeded = useRef(false);
  // ピントを移すかは、入れるときに表示しているかで決める
  const seedComposer = useEffectEvent(() => {
    if (!ready || seeded.current) return;
    const text = initialText.current ?? seed?.text;
    if (!text && !seed) return;
    seeded.current = true;
    draft.write({ text: text ?? "", ...(seedAttachments.current ? { attachments: mergeAttachments(draft.read().attachments, seedAttachments.current) } : {}) });
    if (visible) focusDraft(draft, { end: true });
  });
  useEffect(() => {
    seedComposer();
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
        const branch = await askNewWorktreeBranch(projectId);
        if (!branch) throw new SendCancelled();
        target = { kind: "new", branch };
        setPlace(target);
      }
    }
    const chat = await api.startChat(projectId, {
      text: prompt,
      title,
      provider,
      options: options.options,
      attachments,
      group_id: group,
      github: seed?.github,
      ...(target.kind === "existing" ? { worktree_path: target.path } : target.kind === "new" ? { new_worktree_branch: target.branch } : {}),
    });
    // 新しいワークツリーを作ったときは、ブランチの一覧をすぐ取り直す
    if (target.kind === "new") worktreesStore.invalidate(projectId);
    // 音声モードの間に送ったなら、できたチャットのチャット欄で音声モードを続ける（このタブはそのチャットに置き換わる）
    claimVoiceHandoff(chat.id);
    onCreated(chat);
  };

  const groupBadge = groups.length > 0 && onGroupChange && shows("group");
  return (
    <AgentSplit scope={draftScope(tabKey)} handleRef={side}>
    <DraftChatPage
      provider={provider}
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
          {seed?.github && <p className="muted small">作るチャットは GitHub の #{seed.github.number} と結び付きます</p>}
          {place.kind === "new" && <p className="muted small">新しいワークツリー「{place.branch}」を作り、その中で作業します</p>}
        </div>
      }
    >
      {/* 会話が始まったあとのチャット欄と同じく、ピルの列の上に作業中のほかのチャットの知らせ */}
      <BusyNeighborsNotice count={busyNeighbors} />
      {/* 会話が始まったあとのチャット欄と同じピルの列（いまはノートだけ。指示の履歴・ToDo・サブエージェント・子チャットは中身がないので出さない） */}
      <div className="composer-chips">
        {composerPills().map((Pill, i) => (
          <Pill key={i} projectId={projectId} chatId={null} attach={(a) => (appendDraft(draft, "", [a]), focusDraft(draft))} />
        ))}
      </div>
      {/* 書いた文を少し待ってからタブに知らせる（下書きのカードに出す） */}
      {onDraftChange && <DraftTextWatch key={projectId} draft={draft} onChange={onDraftChange} />}
      {ready && (
        <ChatProviderContext.Provider value={provider}>
        <Composer
          key={projectId}
          // 新しいワークツリーはまだないので、本体から探す
          place={{ projectId, worktree: place.kind === "existing" ? place.path : null, chatId: null }}
          options={options}
          // 使う AI（チャット欄のモデルの左。押すと選び直す）
          providerChip={<ProviderPicker value={provider} onChange={setPickedProvider} />}
          autoFocus
          draft={draft}
          placeholder="例: ログイン画面を作って（Enter で送信、Shift+Enter で改行）"
          // 定型文の帯・右クリックの帯の表示・右下のコンテキストのメーター（まだ 0%）は、チャットの画面のチャット欄と同じ差し込み
          send={{ submit: ({ text, attachments }) => start(text, attachments), sendOther: (text) => start(text, []) }}
          // 音声モード（話して最初の指示を送ると、チャットを作り、できたチャットで音声モードを続ける。送る前に確かめてやめたら何もしない）
          voiceMode={{
            replies: NO_REPLIES,
            draft: true,
            send: (text) =>
              start(text, []).catch((e: unknown) => {
                if (!(e instanceof SendCancelled)) throw e;
              }),
          }}
        />
        </ChatProviderContext.Provider>
      )}
    </DraftChatPage>
    </AgentSplit>
  );
}
