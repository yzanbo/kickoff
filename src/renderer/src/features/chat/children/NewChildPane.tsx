import { MessageSquarePlus } from "lucide-react";
import { useRef, useState } from "react";
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
import { DraftChatPage } from "@/features/chat/pane/DraftChatPage";
import { useChatHeaderItems } from "@/features/chat/pane/ChatDisplayMenu";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { NewChildBar } from "./ChildChatBar";
import { InheritChoice } from "./InheritChoice";

interface Props {
  /** 作る子チャットの親（右の欄を持つチャット） */
  parentId: number;
  /** 最初の文を送って子チャットができたとき（このタブを、できた子チャットのタブに置き換える） */
  onCreated: (child: Chat) => void;
}

/**
 * チャットの画面の右の欄の「＋」で開く、新しい子チャット（入力欄だけのタブ）。右の欄のチャットの子チャットになるので、作ったあとの子チャットの画面と同じく、
 * 上の帯に親までの系譜と深さの呼び名を出す（SideChildChat と同じ並び）。
 * 最初の文を送ると、このチャットの会話を引き継いだ（入力欄の上の切り替えで「新しく始める」も選べる）子チャットを作り、このタブをその子チャットのタブに置き換える（新しいチャットのタブと同じ流れ）
 */
export function NewChildPane({ parentId, onCreated }: Props) {
  const parent = useKnownChat(parentId);
  if (!parent) return <div className="page muted">読み込み中…</div>;
  // 親が分かってから作る（プロジェクト・作業場所・グループは親のもの）
  return <NewChildForm parent={parent} onCreated={onCreated} />;
}

function NewChildForm({ parent, onCreated }: { parent: Chat; onCreated: (child: Chat) => void }) {
  // 選択（モデルなど）は親から引き継がず、新しいチャットと同じく設定どおり（プロジェクトの既定 → 設定の既定）から始める。このタブで変えたものだけ効かせる
  const options = useChatOptions(undefined, parent.project_id, parent.worktree_path ?? undefined);
  const [inherit, setInherit] = useState(true);
  const project = useProjects().projectsById.get(parent.project_id);
  const shows = useChatHeaderItems();
  const composer = useRef<ComposerHandle | null>(null);
  // 最初の文を送って子チャットを作る（チャット欄の送信と、定型文の帯の ⌘クリック・「すぐ送る」で共通）
  const start = async (prompt: string, attachments: Attachment[]) => {
    const child = await api.createChildChat(parent.id, { text: prompt, attachments, quote: null, inherit, event_id: null, options: options.options });
    // 作った知らせより先に一覧へ入れる（入力欄の上の札・タブの状態の印にすぐ出す）
    addChat(child);
    onCreated(child);
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
          {/* 会話を引き継ぐか（初めは引き継ぐ。書きながら目に入るよう、入力欄のすぐ上に置く。「子チャットで聞く」の画面と同じ形） */}
          <InheritChoice inherit={inherit} onChange={setInherit} parentLabel="親のチャット" />
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
            onSend={start}
          />
        </DraftChatPage>
      </div>
    </div>
  );
}
