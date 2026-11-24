// ports が window.kickoff を読む所（Mac のアプリの中か）
/** この画面で使えるか（Mac のアプリの中だけ。スマホのブラウザではコアが断る） */
export const portsAvailable = () => typeof window !== "undefined" && window.kickoff !== undefined;
