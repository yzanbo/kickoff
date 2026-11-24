import "./SideChildChat.css";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { Attachment, Chat } from "@shared/chat/types";
import { PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";
import { ChatProviderContext, ProviderPicker, useChatOptions } from "@/features/ai/ui";
import { useActionButton, useKnownChat, addChat, chatTitle, quoteComment } from "@/features/chat/ui";
import { WorktreeChip } from "@/foundation/ui/workplace/WorktreeChip";
import { DraftChatPage } from "@/features/conversation/ui/screen/DraftChatPage";
import { useChatHeaderItems } from "@/features/conversation/ui/display/ChatDisplayMenu";
import { appendDraft, Composer, composerPills, focusDraft, memoryDraft } from "@/features/composer/ui";
import { childChatsApi, InheritChoice, NewChildBar } from "@/features/childChats/ui";
import { ProjectChip, useProjects } from "@/features/projects/ui";

/** 作ったときに渡すもの（always: 聞かずに「引き継いで開く」で作ったとき。設定が「開かない」でも開く） */
type OnCreated = (child: Chat, opts: { always: boolean }) => void;

interface Props {
  /** 作る子チャットの親（右の欄のチャットか、孫を作るときはその子チャット） */
  parentId: number;
  /** 入力欄に引用として初めに入れる文（選んだ文・発言。なければ空の入力欄） */
  quote?: string;
  /** 入力欄に初めに入れる文と添付（「AI に渡す」の「子チャットで聞く」） */
  text?: string;
  attachments?: Attachment[];
  /** 親の会話の聞いた位置（発言の右クリックから。親の会話のその位置に札が付く） */
  eventId?: number;
  /** 子チャットができたとき（このタブを、できた子チャットのタブに置き換える・設定どおりに開く） */
  onCreated: OnCreated;
}

/** 入力欄に初めから入れておく文（選んだ文の引用と、その下に書き始める空行） */
const initialText = (quote: string | undefined) => (quote?.trim() ? `${quoteComment(quote, "")}\n\n` : "");

/**
 * 新しい子チャット（入力欄だけのタブ。右の欄の「＋」・チャットのメニューの「子チャットを作成」・「新しい子チャットで聞く」で、いちばん上の親の右の欄に開く）。
 * 作ったあとの子チャットの画面と同じく、上の帯に親までの系譜と深さの呼び名を出す（SideChildChat と同じ並び）。選んだ文から開いたら、入力欄に引用を入れてキャレットをその下に置く。
 * 最初の文を送ると、親の会話を引き継いだ（入力欄の上の切り替えで「新しく始める」も選べる）子チャットを作り、このタブをその子チャットのタブに置き換える（新しいチャットのタブと同じ流れ）
 */
export function NewChildPane({ parentId, ...rest }: Props) {
  const parent = useKnownChat(parentId);
  if (!parent) return <div className="page muted">読み込み中…</div>;
  // 親が分かってから作る（プロジェクト・作業場所・グループは親のもの）
  return <NewChildForm parent={parent} {...rest} />;
}

function NewChildForm({ parent, quote, text: seedText, attachments: seedAttachments, eventId, onCreated }: Omit<Props, "parentId"> & { parent: Chat }) {
  // 選択（モデルなど）は親から引き継がず、新しいチャットと同じく設定どおり（プロジェクトの既定 → 設定の既定）から始める。このタブで変えたものだけ効かせる
  // 使う AI（初めは親と同じ。選び直せ、親と違う AI なら会話は引き継がない）
  const [provider, setProvider] = useState<ProviderId>(parent.provider);
  const otherAi = provider !== parent.provider;
  const options = useChatOptions({ projectId: parent.project_id, worktree: parent.worktree_path ?? undefined, provider });
  const [inheritChoice, setInherit] = useState(true);
  const inherit = inheritChoice && !otherAi;
  const project = useProjects().projectsById.get(parent.project_id);
  const shows = useChatHeaderItems();
  // 選んだ文から開いたら、引用を入力欄に入れる（キャレットはその下）。「AI に渡す」から開いたら、一言と添付も入れる
  // 開いたときに 1 回だけ（書き換えたあとで引用を入れ直さない）。書きかけは残さない
  const [draft] = useState(() => memoryDraft({ text: `${initialText(quote)}${seedText ?? ""}`, attachments: seedAttachments ?? [] }));
  const focusSeed = useEffectEvent(() => {
    const { text, attachments } = draft.read();
    if (text || attachments.length > 0) focusDraft(draft, { end: true });
  });
  useEffect(() => {
    focusSeed();
  }, []);
  // 最初の文を送って子チャットを作る（チャット欄の送信と、定型文の帯の ⌘クリック・「すぐ送る」で共通）
  const start = async (prompt: string, attachments: Attachment[]) => {
    // 選んだ文は入力欄の文に入れて送るので、quote は送らない
    const body = { text: prompt, attachments, quote: null, inherit, event_id: eventId ?? null, provider, options: options.options };
    const child = await childChatsApi("POST /api/chats/:chatId/children", { params: { chatId: parent.id }, body });
    // 作った知らせより先に一覧へ入れる（入力欄の上の札・タブの状態の印にすぐ出す）
    addChat(child);
    onCreated(child, { always: false });
  };
  // 聞くことなしで、親の会話を引き継いだ子チャットを作り、このタブをその子チャットのタブに置き換える
  // 作ってから返るまで押せない（すばやく 2 回押しても 1 つだけ作る）
  const action = useActionButton();
  const opening = action.pending("open");
  const openOnly = () =>
    action.press(
      "open",
      async () => {
        const body = { text: "", quote: null, inherit: true, event_id: eventId ?? null, options: options.options };
        const child = await childChatsApi("POST /api/chats/:chatId/children", { params: { chatId: parent.id }, body });
        addChat(child);
        onCreated(child, { always: true });
      },
      "子チャットを開けませんでした",
    );
  return (
    <div className="side-child-chat">
      <NewChildBar parentId={parent.id} />
      <div className="side-child-chat-body">
        <DraftChatPage
          provider={provider}
          className="new-child-chat"
          // 作ったあとの子チャットの見出しと同じバッジ（子チャットは親と同じ作業場所で作り、グループには入らないので、グループの札は出さない）
          badges={
            <>
              {project && shows("project") && <ProjectChip id={project.id} name={project.name} linked />}
              {shows("worktree") && <WorktreeChip chat={parent} />}
            </>
          }
          hero={
            <div className="new-chat-hero">
              <div className="new-chat-icon">
                <MessageSquarePlus size={22} />
              </div>
              <h1>新しい子チャット</h1>
              <p className="muted">「{chatTitle(parent.title)}」の作業を止めずに、横で聞く・頼むことを書いて始めます</p>
            </div>
          }
        >
          {/* 会話を引き継ぐか（初めは引き継ぐ。書きながら目に入るよう、入力欄のすぐ上に置く） */}
          {otherAi ? (
            <p className="muted small">{PROVIDER_LABELS[provider]} は親のチャットと違う AI なので、会話は引き継がずに新しく始めます</p>
          ) : (
            <InheritChoice inherit={inheritChoice} onChange={setInherit} parentLabel="親のチャット" onOpen={openOnly} opening={opening} />
          )}
          {/* 会話が始まったあとのチャット欄と同じピルの列（いまはノートだけ。中身のないピルは出さない） */}
          <div className="composer-chips">
            {composerPills().map((Pill, i) => (
              <Pill key={i} projectId={parent.project_id} chatId={null} attach={(a) => (appendDraft(draft, "", [a]), focusDraft(draft))} />
            ))}
          </div>
          <ChatProviderContext.Provider value={provider}>
          <Composer
            place={{ projectId: parent.project_id, worktree: parent.worktree_path, chatId: null }}
            options={options}
            // 使う AI（チャット欄のモデルの左。押すと選び直す）
            providerChip={<ProviderPicker value={provider} onChange={setProvider} tipPrefix="この AI で子チャットを始めます" />}
            autoFocus
            draft={draft}
            placeholder={`${inherit ? "親の会話の続きで聞きたいこと" : "新しく頼みたいこと"}（Enter で送信、Shift+Enter で改行）`}
            // 定型文の帯・右クリックの帯の表示・右下のコンテキストのメーター（まだ 0%）は、チャットの画面のチャット欄と同じ差し込み
            send={{ submit: ({ text, attachments }) => start(text, attachments), sendOther: (text) => start(text, []) }}
          />
          </ChatProviderContext.Provider>
        </DraftChatPage>
      </div>
    </div>
  );
}
