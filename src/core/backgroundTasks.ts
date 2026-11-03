/** 裏で動かしたサブエージェントの起動を示す、Agent / Task ツールの結果の書き出し（Claude Code が返す文） */
const BACKGROUND_LAUNCH = "Async agent launched";

/** Agent / Task ツールの結果が、裏で動かしたサブエージェントの起動の知らせか（終わったのではなく、始まっただけ） */
export function isBackgroundLaunch(content: unknown): boolean {
  return typeof content === "string" && content.includes(BACKGROUND_LAUNCH);
}
