// queue が下の帯に出す項目: 起動したときの再開の確かめで、まだ決めていないもの（押すとダイアログを開き直す）
import type { FooterItem } from "@/foundation/ui/shell/points";
import { RestartResumeFooterButton } from "./restartResume/RestartResumeFooterButton";

export const restartResumeFooterItem: FooterItem = { id: "restartResume", side: "start", order: 70, Item: RestartResumeFooterButton };
