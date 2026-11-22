// browser がアプリの根に置く物: AI（kickoff_browser）が埋め込みブラウザのタブを開く・表に出す・操作している印（別ウィンドウはチャット欄・ブラウザのタブのものだけ受け持つ）
import type { AppHost } from "@/foundation/ui/shell/points";
import { useAgentBrowserBridge } from "./agentBrowser";

export const agentBrowserHost: AppHost = { id: "agentBrowser", windows: "both", useEffect: useAgentBrowserBridge };
