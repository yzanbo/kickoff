import path from "node:path";
import { app } from "electron";

/**
 * アプリのログの場所（macOS のログの場所 ~/Library/Logs/<アプリ名>/。開発版と製品版で別）。起動の記録と性能の記録を置く。
 * データの保存先（Application Support）はエージェントから読めない（Kickoff 自身を守るため）ので、場所をチャットに貼っても読んでもらえるよう、ここに置く
 */
export function logsDir(): string {
  return path.join(app.getPath("home"), "Library", "Logs", app.getName());
}
