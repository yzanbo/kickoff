// workplaceMove がアプリの根に置く物: 作業場所を移したチャットの右の欄のタブを、新しい作業場所に付け替える
import type { AppHost } from "@/foundation/ui/shell/points";
import { useWorkplaceMoveTabs } from "./repointTabs";

export const workplaceMoveTabsHost: AppHost = { id: "workplaceMoveTabs", windows: "main", useEffect: useWorkplaceMoveTabs };
