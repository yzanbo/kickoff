// queue がアプリの根に置く物: 起動したときの再開の確かめ（前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャットを、続けるか・送るか聞く）
import type { AppHost } from "@/foundation/ui/shell/points";
import { RestartResumeHost } from "./restartResume/RestartResumeHost";

export const restartResumeHost: AppHost = { id: "restartResume", windows: "main", order: 160, Host: RestartResumeHost };
