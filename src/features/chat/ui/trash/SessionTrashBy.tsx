// ゴミ箱の会話記録の行の「誰が消したか」（長いチャットを乗り換えたあとの古い会話記録は Kickoff が入れる）
import { History } from "lucide-react";

export function SessionTrashBy() {
  return (
    <span className="trash-row-by" title="長いチャットを直近の区切りだけの会話記録に乗り換えたので、古い会話記録を Kickoff が入れました">
      <History size={12} aria-hidden />
      Kickoff の片付け
    </span>
  );
}
