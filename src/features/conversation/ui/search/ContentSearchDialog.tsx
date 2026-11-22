import { routeProjectId, useRoute } from "@/foundation/ui/navigation/router";
import { useExistingProject } from "@/features/projects/ui";
import { SearchPanel } from "./SearchPanel";

/** アプリのダイアログの全文検索（範囲の初めは、いまのチャット・いまのプロジェクト） */
export function ContentSearchDialog({ onClose }: { onClose(): void }) {
  const route = useRoute();
  const projectId = useExistingProject(routeProjectId(route));
  return <SearchPanel chatId={route.name === "chat" ? route.chatId : undefined} projectId={projectId} onClose={onClose} />;
}
