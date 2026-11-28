// チャットのメニューの「画像の表示を許可したサイト」: そのチャットで許可したホストを並べ、選んだものの許可を外す
import { formatDayTime } from "@/foundation/ui/lib/time";
import { alert, confirm } from "@/foundation/ui/kit/ask";
import { revokeImageHost } from "./imageHosts";
import { fetchHosts, type ImageScope } from "./imageScope";

const TITLE = "画像の表示を許可したサイト";

export async function manageImageHosts(chatId: number): Promise<void> {
  const scope: ImageScope = { kind: "chat", chatId };
  const hosts = await fetchHosts(scope);
  if (hosts.length === 0) {
    await alert(TITLE, "このチャットでは、まだどのサイトも許可していません。返答の「（サイト）から画像を n 件表示」を押すと、ここに並びます。");
    return;
  }
  const picked = await confirm({
    title: TITLE,
    message: "このチャットで、押さずに画像を出すサイトです。外すサイトを選んでください（外すと、そのサイトの画像はまたボタンに戻り、覚えた画像も消えます）。",
    confirmLabel: "選んだサイトの許可を外す",
    danger: true,
    checks: hosts.map((h) => ({ label: `${h.host}（${formatDayTime(h.allowed_at)} に許可）` })),
  });
  if (!picked) return;
  for (const [i, h] of hosts.entries()) if (picked.checked[i]) await revokeImageHost(scope, h.host);
}
