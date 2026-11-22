// database がアプリの根に置く物: 保存した DB のパスワードをキーチェーンで開けなかったときに、その場で聞く
import type { AppHost } from "@/foundation/ui/shell/points";
import { DbUnlockHost } from "./DbUnlockHost";

export const dbUnlockHost: AppHost = { id: "dbUnlock", windows: "both", order: 220, Host: DbUnlockHost };
