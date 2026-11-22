// 子チャットが設定の「表示」に出す欄: 子チャットを開く場所
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { OpenPlaceField } from "@/features/settings/ui";
import { chatSettings } from "@/features/chat/ui";

/** 子チャットを開く場所 */
export function ChildOpenField() {
  const [childChatOpenIn, setChildChatOpenIn] = useSetting(chatSettings.childOpenIn);
  return (
    <OpenPlaceField
      label="子チャットを開く場所"
      help="会話の中・入力欄の上の子チャットの札、サイドバーの子チャットの行、答えの通知を押したときの開き方です。右の欄は、いちばん上の親のチャットの画面の右にタブで開きます（孫・ひ孫も同じ右の欄に並びます）。別ウィンドウは、子チャットごとに新しいウィンドウで開きます。右の欄のタブは、タブの右クリックの「別ウィンドウで開く」でいつでも移せます。"
      value={childChatOpenIn}
      onChange={setChildChatOpenIn}
    />
  );
}
