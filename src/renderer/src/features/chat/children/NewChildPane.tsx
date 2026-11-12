import { MessageSquarePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Attachment, Chat } from "@shared/types";
import { api } from "@/api";
import { useKnownChat, addChat } from "@/stores/chats";
import { Composer } from "@/features/chat/composer/Composer";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { chatTitle } from "@/features/chat/chatTitle";
import { ProjectChip } from "@/features/project/ProjectChip";
import { useProjects } from "@/stores/projects";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { SnippetBar, SnippetBarToggleItem } from "@/features/snippet/SnippetBar";
import { ContextMeter } from "@/features/chat/composer/ContextMeter";
import { MemoChip } from "@/features/memo/MemoChip";
import { memoAttachment } from "@/features/memo/memoAttachment";
import { DraftChatPage } from "@/features/chat/pane/DraftChatPage";
import { useChatHeaderItems } from "@/features/chat/pane/ChatDisplayMenu";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { reportFailure } from "@/ui/dialogs";
import { quoteComment } from "@/features/chat/messages/quoteComment";
import { NewChildBar } from "./ChildChatBar";
import { InheritChoice } from "./InheritChoice";

/** 作ったときに渡すもの（always: 聞かずに「引き継いで開く」で作ったとき。設定が「開かない」でも開く） */
type OnCreated = (child: Chat, opts: { always: boolean }) => void;

interface Props {
  /** 作る子チャットの親（右の欄のチャットか、孫を作るときはその子チャット） */
  parentId: number;
  /** 入力欄に引用として初めに入れる文（選んだ文・発言。なければ空の入力欄） */
  quote?: string;
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

function NewChildForm({ parent, quote, eventId, onCreated }: Omit<Props, "parentId"> & { parent: Chat }) {
  // 選択（モデルなど）は親から引き継がず、新しいチャットと同じく設定どおり（プロジェクトの既定 → 設定の既定）から始める。このタブで変えたものだけ効かせる
  const options = useChatOptions(undefined, parent.project_id, parent.worktree_path ?? undefined);
  const [inherit, setInherit] = useState(true);
  const project = useProjects().projectsById.get(parent.project_id);
  const shows = useChatHeaderItems();
  const composer = useRef<ComposerHandle | null>(null);
  // 選んだ文から開いたら、引用を入力欄に入れる（キャレットはその下）
  useEffect(() => {
    const text = initialText(quote);
    if (text) composer.current?.fill(text);
    // 開いたときに 1 回だけ（書き換えたあとで引用を入れ直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 最初の文を送って子チャットを作る（チャット欄の送信と、定型文の帯の ⌘クリック・「すぐ送る」で共通）
  const start = async (prompt: string, attachments: Attachment[]) => {
    // 選んだ文は入力欄の文に入れて送るので、quote は送らない
    const child = await api.createChildChat(parent.id, { text: prompt, attachments, quote: null, inherit, event_id: eventId ?? null, options: options.options });
    // 作った知らせより先に一覧へ入れる（入力欄の上の札・タブの状態の印にすぐ出す）
    addChat(child);
    onCreated(child, { always: false });
  };
  // 聞くことなしで、親の会話を引き継いだ子チャットを作り、このタブをその子チャットのタブに置き換える
  const [opening, setOpening] = useState(false);
  const openOnly = async () => {
    setOpening(true);
    try {
      const child = await api.createChildChat(parent.id, { text: "", quote: null, inherit: true, event_id: eventId ?? null, options: options.options });
      addChat(child);
      onCreated(child, { always: true });
    } catch (e) {
      setOpening(false);
      reportFailure("子チャットを開けませんでした")(e);
    }
  };
  return (
    <div className="side-child-chat">
      <NewChildBar parentId={parent.id} />
      <div className="side-child-chat-body">
        <DraftChatPage
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
          <InheritChoice inherit={inherit} onChange={setInherit} parentLabel="親のチャット" onOpen={() => void openOnly()} opening={opening} />
          {/* 会話が始まったあとのチャット欄と同じピルの列（いまはメモだけ。中身のないピルは出さない） */}
          <div className="composer-chips">
            <MemoChip projectId={parent.project_id} chatId={null} onAttach={(path) => composer.current?.fill("", { append: true, attachments: [memoAttachment(path)] })} />
          </div>
          <Composer
            chatContext={{ projectId: parent.project_id }}
            options={options}
            autoFocus
            handleRef={composer}
            suggestTarget={parent.worktree_path ? { projectId: parent.project_id, worktree: parent.worktree_path } : parent.project_id}
            placeholder={`${inherit ? "親の会話の続きで聞きたいこと" : "新しく頼みたいこと"}（Enter で送信、Shift+Enter で改行）`}
            // 定型文の帯と、入力欄の右クリックの帯の表示・非表示（チャットの画面のチャット欄と同じ）
            header={<SnippetBar projectId={parent.project_id} composer={composer} onSend={(text) => start(text, [])} />}
            menuItems={<SnippetBarToggleItem />}
            // 会話が始まったあとのチャット欄と同じく右下にコンテキストのメーター（まだ 0%）
            trailing={<ContextMeter chat={null} projectId={parent.project_id} compacting={null} reserved={null} afterTurn={false} />}
            onSend={start}
          />
        </DraftChatPage>
      </div>
    </div>
  );
}
