import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { useKnownChat, addChat } from "@/stores/chats";
import { Composer } from "@/features/chat/composer/Composer";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { chatTitle } from "@/features/chat/chatTitle";
import { ProjectChip } from "@/features/project/ProjectChip";
import { useProjects } from "@/stores/projects";

interface Props {
  /** 作る子チャットの親（右の欄を持つチャット） */
  parentId: number;
  /** 最初の文を送って子チャットができたとき（このタブを、できた子チャットのタブに置き換える） */
  onCreated: (child: Chat) => void;
}

/**
 * チャットの画面の右の欄の「＋」で開く、新しい子チャット（入力欄だけのタブ）。
 * 最初の文を送ると、このチャットの会話を引き継いだ（外せる）子チャットを作り、このタブをその子チャットのタブに置き換える（新しいチャットのタブと同じ流れ）
 */
export function NewChildPane({ parentId, onCreated }: Props) {
  const parent = useKnownChat(parentId);
  if (!parent) return <div className="page muted">読み込み中…</div>;
  // 親が分かってから作る（選択（モデルなど）を親のいまの選択から始める）
  return <NewChildForm parent={parent} onCreated={onCreated} />;
}

function NewChildForm({ parent, onCreated }: { parent: Chat; onCreated: (child: Chat) => void }) {
  const options = useChatOptions(
    { model: parent.model, effort: parent.effort, permission_mode: parent.permission_mode, fast_mode: parent.fast_mode },
    parent.project_id,
    parent.worktree_path ?? undefined,
  );
  const [inherit, setInherit] = useState(true);
  const project = useProjects().projectsById.get(parent.project_id);
  return (
    <div className="chat-page chat-panel new-chat new-child-chat">
      <header className="chat-header">
        {/* 名前と閉じるはタブに出すので、見出しには出さない（新しいチャットのタブと同じ） */}
        <div className="chat-title-row">
          <div className="chat-sub muted small">
            {project && <ProjectChip id={project.id} name={project.name} linked />}
            {/* 会話を引き継ぐか（初めはオン。「子チャットで聞く」の画面と同じ） */}
            <label className={`new-chat-group new-child-inherit ${inherit ? "has-group" : ""}`} title="親のチャットのいちばん新しい終わった作業までの会話を引き継ぎます。外すと、書いた文だけで始めます">
              <input type="checkbox" checked={inherit} onChange={(e) => setInherit(e.target.checked)} />
              会話を引き継ぐ
            </label>
          </div>
        </div>
      </header>
      <div className="timeline">
        <div className="new-chat-hero">
          <div className="new-chat-icon">
            <MessageSquarePlus size={22} />
          </div>
          <h1>新しい子チャット</h1>
          <p className="muted">「{chatTitle(parent.title)}」の作業を止めずに、横で聞く・頼むことを書いて始めます</p>
          <p className="muted small">
            {inherit ? "親のチャットの会話を引き継ぎます（「これってどういう意味？」がそのまま通じます）" : "親のチャットの会話を引き継がず、書いた文だけで始めます"}
          </p>
        </div>
      </div>
      <div className="chat-composer">
        <Composer
          chatContext={{ projectId: parent.project_id }}
          options={options}
          autoFocus
          suggestTarget={parent.worktree_path ? { projectId: parent.project_id, worktree: parent.worktree_path } : parent.project_id}
          placeholder="子チャットで聞きたいこと（Enter で送信、Shift+Enter で改行）"
          onSend={async (prompt, attachments) => {
            const child = await api.createChildChat(parent.id, { text: prompt, attachments, quote: null, inherit, event_id: null, options: options.options });
            // 作った知らせより先に一覧へ入れる（入力欄の上の札・タブの状態の印にすぐ出す）
            addChat(child);
            onCreated(child);
          }}
        />
      </div>
    </div>
  );
}
