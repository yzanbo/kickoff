// chat がアプリの根に置く物: チャットの AI が頼んだノート・家系のチャットを開く（kickoff_chat の open_note・open_chat など）
import type { AppHost } from "@/foundation/ui/shell/points";
import { useAiOpenRequests } from "./open/aiOpenRequests";

export const aiOpenRequestsHost: AppHost = { id: "aiOpenRequests", windows: "main", useEffect: useAiOpenRequests };
