import { SquarePen } from "lucide-react";
import { useProjects } from "@/stores/projects";
import { NewChatPlaceBadges, useNewChatPlace } from "@/features/chat/NewChatItem";

/**
 * サイドバーの上の「新しいチャット」（⌘N と同じ）。押したらいまどんなチャットができるかが分かるよう、
 * 右クリックのメニューの「新しいチャット」と同じグループの札と作業場所の札を添える
 * （⌘N は開いているプロジェクト（なければサイドバーで選んでいるもの）で、グループなし・本体で始めるので、札は「No Group」「本体」。
 * 乗せたときの説明にはプロジェクトの名前も出す）。プロジェクトがひとつもなければ札を出さない
 */
export function NewChatButton({ projectId, onClick }: { projectId: number | undefined; onClick: () => void }) {
  if (projectId === undefined) {
    return (
      <button className="nav-row" onClick={onClick} title="新しいチャット（⌘N）">
        <SquarePen size={15} /> 新しいチャット <kbd>⌘N</kbd>
      </button>
    );
  }
  return <NewChatButtonWithPlace projectId={projectId} onClick={onClick} />;
}

function NewChatButtonWithPlace({ projectId, onClick }: { projectId: number; onClick: () => void }) {
  const { projectName } = useProjects();
  const info = useNewChatPlace({ projectId });
  const name = projectName(projectId);
  const title = `${name ? `プロジェクト「${name}」の` : ""}グループ「${info.groupName}」・作業場所「${info.whereText}」で、新しいチャットを始める（⌘N）`;
  return (
    <button className="nav-row new-chat-row" onClick={onClick} title={title}>
      <SquarePen size={15} /> 新しいチャット
      <NewChatPlaceBadges place={info} />
      <kbd>⌘N</kbd>
    </button>
  );
}
