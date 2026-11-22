import { TriangleAlert } from "lucide-react";
import { openSettings } from "@/features/settings/ui";
import { useGitHubStatus, useProviders } from "./stores/providers";
import { toolNotices } from "./toolNotices";

/** 下の帯の、Claude Code・gh が使えないときの札（ふだんは出さない。押すと設定の「接続」を開き、そこで確かめ直す） */
export function FooterToolNotices() {
  const providers = useProviders();
  const github = useGitHubStatus();
  return toolNotices(providers.data, github.data).map((n) => (
    <button key={n.key} type="button" className="footer-button conn-down" title={n.title} onClick={() => openSettings("connection")}>
      <TriangleAlert size={13} aria-hidden /> {n.label}
    </button>
  ));
}
