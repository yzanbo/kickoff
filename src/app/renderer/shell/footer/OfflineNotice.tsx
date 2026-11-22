import { WifiOff } from "lucide-react";
import { useOnline } from "@/foundation/ui/hooks/useOnline";

/** 下の帯の「オフライン」（Wi-Fi が切れている。作業中のチャットは止まることがある。つながったら自動で再開する） */
export function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <span className="footer-offline" title="ネットワークにつながっていません。作業中のチャットが止まったら、つながったときに自動で再開します（設定の「チャット」）">
      <WifiOff size={13} aria-hidden /> オフライン
    </span>
  );
}
