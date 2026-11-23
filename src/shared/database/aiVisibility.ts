// AI に見せる接続か（ai_access が none でないもの）。コア（AI のツール・守り・open_sql・SQL の案）と画面（AI のボタン・一覧）が同じに使う
import type { DbConnection } from "./types";

export const isAiVisible = (c: Pick<DbConnection, "ai_access">): boolean => c.ai_access !== "none";
