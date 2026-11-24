// ノートが設定の「表示」に出す欄: チャットからノートを開く場所
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { OpenPlaceField } from "@/features/settings/ui";
import { storage } from "@/features/notes/ui/storage";

/** チャットからノートを開く場所 */
export function NoteOpenField() {
  const [noteOpenIn, setNoteOpenIn] = useSetting(storage.settings.openIn);
  return (
    <OpenPlaceField
      label="チャットからノートを開く場所"
      help="「ノートに追加」のあとの「開く」と、入力欄の上の「ノート」の一覧から開くときの開き方です。右の欄は、チャットの画面の右にタブで開き、会話を見ながら書けます。別ウィンドウは、ノートごとに新しいウィンドウで開きます。入力欄の上の「ノート」の一覧の上でも変えられ、一覧の行のボタンで、ここによらずどちらでも開けます。"
      value={noteOpenIn}
      onChange={setNoteOpenIn}
    />
  );
}
