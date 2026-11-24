import { SquarePen } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type MutableRefObject } from "react";
import type { Attachment, Chat } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { SendCancelled } from "@/features/composer/ui/useComposerSend";
import { ProjectChip } from "@/features/projects/ui/ProjectChip";
import { ChatProviderContext, ProviderPicker, useChatOptions } from "@/features/ai/ui";
import { askNewWorktreeBranch, WorkplacePicker } from "@/foundation/ui/workplace/WorkplacePicker";
import { workplacePath, type WorkplaceChoice } from "@/foundation/ui/workplace/workplace";
import { BusyNeighborsNotice } from "@/features/chat/ui/workplace/BusyNeighborsNotice";
import { useBusyNeighbors } from "@/features/chat/ui/workplace/useBusyNeighbors";
import { countBusyAt } from "@/foundation/ui/workplace/workplace";
import { chooseBusyWorkplaceAction, currentChats, useChats, chatsApi } from "@/features/chat/ui";
import { appendDraft, claimVoiceHandoff, Composer, composerPills, focusDraft, newChatComposerDraft, patchNewChatDraft, useNewChatDraft, type NewChatDraft, type VoiceReply } from "@/features/composer/ui";
import { groupNameIn, useGroups } from "@/features/groups/ui/stores/groups";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { GroupPicker } from "@/features/groups/ui/GroupPicker";
import { DraftChatPage } from "@/features/conversation/ui/screen/DraftChatPage";
import { useChatHeaderItems, useChatHeaderRowHidden } from "@/features/conversation/ui/screen/ChatDisplayMenu";
import { AgentSplit } from "@/features/chatPanel/ui/agents/AgentSplit";
import { draftScope } from "@/features/panel/ui";
import type { SidePanelHandle } from "@/features/chat/ui";

/** 送る前の新しいチャットには、読み上げる返答がまだない */
const NO_REPLIES: VoiceReply[] = [];

interface Props {
  /** 下書きのキー（このタブのキー。右の欄の範囲 draft-<key>。送ったら、できたチャットの右の欄へ中身を移す） */
  draftKey: string;
  /** いま見えているか（見えていないタブに文を戻すときは、入力欄にピントを移さない） */
  visible?: boolean;
  /** 最初のメッセージを送ってチャットができたとき（このタブをそのチャットに置き換える） */
  onCreated: (chat: Chat) => void;
}

/**
 * 右側のパネルで始める新しいチャット（最初のメッセージを送ると、そのチャットのタブになる）。中身（書きかけの文・添付・名前・作成先）は composer の下書きの店。
 * チャットの画面と同じく右の欄を持ち（AgentSplit。範囲は下書きのタブの draft-<key>）、ノートのピルから開いたノートはここに開く。送ったら中身はできたチャットの右の欄へ移る
 */
export function NewChatPane({ draftKey, visible = true, onCreated }: Props) {
  const saved = useNewChatDraft(draftKey);
  if (!saved) return null;
  return <NewChatForm draft={saved} visible={visible} onCreated={onCreated} />;
}

function NewChatForm({ draft: saved, visible, onCreated }: { draft: NewChatDraft; visible: boolean; onCreated: (chat: Chat) => void }) {
  const { key: draftKey, projectId, group, title, worktree, seed } = saved;
  const { projectsById, loaded: projectsLoaded } = useProjects();
  // 右の欄の操作（流れの中のカードへ移ることがないので、受け取るだけ）
  const side: MutableRefObject<SidePanelHandle | null> = useRef(null);
  const project = projectsById.get(projectId);
  // 使う AI（初めはプロジェクトの AI。チャット欄の札で選び直せ、送ったあとは変えない）
  const [pickedProvider, setPickedProvider] = useState<ProviderId | null>(null);
  const provider: ProviderId = pickedProvider ?? project?.provider ?? "claude";
  const options = useChatOptions({ projectId, provider });
  const chats = useChats({ projectId });
  // 作業場所（初めは本体か、作業場所別のまとまりから始めたときはそのワークツリー。並行して進めたいときにワークツリーを選ぶ）
  // GitHub の issue から「新しいワークツリー」で始めたときは、そのブランチ名の新しいワークツリー（送ったときに作る）
  const initialPlace = (): WorkplaceChoice => (worktree ? { kind: "existing", path: worktree } : seed?.newWorktreeBranch ? { kind: "new", branch: seed.newWorktreeBranch } : { kind: "main" });
  const [place, setPlace] = useState<WorkplaceChoice>(initialPlace);
  // 作業場所を選び直したら、タブのまとまり（作業場所別）も合わせる
  const changePlace = (next: WorkplaceChoice) => {
    setPlace(next);
    patchNewChatDraft(draftKey, { worktree: next.kind === "existing" ? next.path : undefined });
  };
  // 同じ作業場所で作業中のほかのチャットの数（同じファイルを触るとぶつかる。チャットの画面と同じ数え方・同じ知らせ）
  const busyNeighbors = useBusyNeighbors(projectId, workplacePath(place));
  // 作成先のグループ（作る・名前を変える・消すと、サーバーの知らせで選択肢も直る）
  const groups = useGroups(projectId);
  const groupName = groupNameIn(groups, group);
  // 作成先のグループを変える（グループ名はタブの表示に使う）
  const changeGroup = (next: number | undefined, name: string | undefined) => patchNewChatDraft(draftKey, { group: next, groupName: name });
  // グループ名が分かったら、タブにも出す
  const tellGroupName = useEffectEvent((name: string) => changeGroup(group, name));
  useEffect(() => {
    if (groupName) tellGroupName(groupName);
  }, [groupName]);

  // 見出しに出す項目（チャットの見出しと同じ設定）
  const shows = useChatHeaderItems();
  const rowHidden = useChatHeaderRowHidden();

  const ready = projectsLoaded && (chats.loaded || chats.error !== undefined);
  // 入力欄の下書きは下書きの店（書くたびにすぐ残す。送る前の添付も）
  const draft = newChatComposerDraft(draftKey);
  // 書きかけていた文（送信待ちの指示から始めたときの文も）があれば、入力欄ができたら 1 回だけピントを末尾へ。隠れているタブ（閉じたパネル・ほかのタブの裏）では移さない
  const focused = useRef(false);
  const focusOnce = useEffectEvent(() => {
    if (!ready || focused.current) return;
    focused.current = true;
    if (visible && (saved.text || seed)) focusDraft(draft, { end: true });
  });
  useEffect(() => {
    focusOnce();
  }, [ready]);

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
    const chat = await chatsApi.startChat(projectId, {
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

  const groupBadge = groups.length > 0 && shows("group");
  return (
    <AgentSplit scope={draftScope(draftKey)} handleRef={side}>
    <DraftChatPage
      provider={provider}
      badges={
        <>
          {/* チャットの見出しと同じバッジ・同じ順（プロジェクト → グループ → 作業場所）。グループと作業場所は、押すと選び直せる */}
          {project && shows("project") && <ProjectChip id={project.id} name={project.name} linked />}
          {groupBadge && <GroupPicker groups={groups} value={group} onChange={(next) => changeGroup(next, groupNameIn(groups, next))} />}
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
      {ready && (
        <ChatProviderContext.Provider value={provider}>
        <Composer
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
