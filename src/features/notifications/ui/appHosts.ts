// notifications がアプリの根に置く物: 通知（完了・失敗・回答待ち・CI の失敗）を出すかはコアが決める。画面は見ているものを知らせ、通知が押されたら開き、
// 作業中・未読・回答待ちの数を Dock のアイコンの隅に出す（設定で切り替え。設定が届くまでは出す）
import type { AppHost } from "@/foundation/ui/shell/points";
import { useRoute } from "@/foundation/ui/navigation/router";
import { useAppSettings } from "@/foundation/ui/settings/appSettings";
import { useProjects } from "@/features/projects/ui";
import { useChatStates } from "@/features/chat/ui";
import { useNotificationTargets } from "./notificationClicks";
import { useViewingReport } from "./viewingReport";
import { useDockBadge } from "./dockBadge";

function useNotificationsHost() {
  useViewingReport(useRoute());
  useNotificationTargets();
  const enabled = useAppSettings().data?.dock_badge;
  const { projects } = useProjects();
  const { pending } = useChatStates();
  useDockBadge({ enabled, projects, pending });
}

export const notificationsHost: AppHost = { id: "notifications", windows: "main", useEffect: useNotificationsHost };
