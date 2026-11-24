import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { INHERIT_LABELS, inheritHelp } from "@/features/childChats/ui";
import type { AskHandlers } from "./queueOps";

/**
 * 別のチャットで聞く項目のまとまり（前に区切り線を置く）: 新しいチャットで聞く・移す（文と添付（画像も）を新しいチャットのタブに入れて開く）と、
 * 子チャットで開く・移す（子チャットを作ってすぐ送り、設定の開き方で開く）。残す = 送信待ちに残し、このチャットでもあとで送る。
 * 子チャットは開く・移すごとに見出しを付け、その下に始め方（会話を引き継ぐ / 新しく始める。子チャットを作る画面の切り替えと同じ言葉）を並べる
 */
export function AskMenuItems({ onAsk, what }: { onAsk: AskHandlers; what: string }) {
  const { newChat, child } = onAsk;
  return (
    <>
      <div className="menu-separator" role="separator" />
      {newChat && (
        <MenuItem onSelect={() => newChat(false)} title={`${what}を新しいチャットのタブに入れて開きます。送信待ちには残り、このチャットでもあとで送られます`}>
          新しいチャットで聞く（送信待ちに残す）
        </MenuItem>
      )}
      {newChat && (
        <MenuItem onSelect={() => newChat(true)} title={`${what}を新しいチャットのタブに入れて開き、送信待ちから外します（このチャットでは送りません）`}>
          新しいチャットに移す（送信待ちから外す）
        </MenuItem>
      )}
      {child && <div className="menu-separator" role="separator" />}
      {child && <ChildAskItems what={what} remove={false} onSelect={child} />}
      {child && <ChildAskItems what={what} remove onSelect={child} />}
    </>
  );
}

/** 「子チャットで開く（送信待ちに残す）/ 子チャットに移す（送信待ちから外す）」の見出しと、その下の始め方の 2 つ */
function ChildAskItems({ what, remove, onSelect }: { what: string; remove: boolean; onSelect: (remove: boolean, inherit: boolean) => void }) {
  const then = remove ? "送信待ちから外します（このチャットでは送りません）" : "送信待ちには残り、このチャットでもあとで送られます";
  return (
    <>
      <div className="menu-label">{remove ? "子チャットに移す（送信待ちから外す）" : "子チャットで開く（送信待ちに残す）"}</div>
      {[true, false].map((inherit) => (
        <MenuItem key={String(inherit)} onSelect={() => onSelect(remove, inherit)} title={`子チャットで${what}をすぐ送って開きます。${inheritHelp(inherit, "このチャット")}。${then}`}>
          {inherit ? INHERIT_LABELS.inherit : INHERIT_LABELS.fresh}
        </MenuItem>
      ))}
    </>
  );
}
