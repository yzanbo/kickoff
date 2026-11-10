// 新しいチャット（送る前）の音声モードを、最初の文を送って作ったチャットへ引き継ぐ（画面のあいだの一度きりの受け渡し）。
// 新しいチャットのタブは送るとできたチャットのタブに置き換わり、チャット欄も作り直されるので、音声モードの会話がそこで切れていた。
//   1. 音声モードの間に新しいチャットのチャット欄から送るとき、送る前に armVoiceHandoff
//   2. 新しいチャットのタブが、チャットを作れたら（タブを置き換える前に）claimVoiceHandoff(できたチャット)
//   3. できたチャットのチャット欄が、描いたときに takeVoiceHandoff(自分のチャット) で受け取り、音声モードを続ける
//   4. 受け取ってすぐ（RETURN_MS 以内）にそのチャット欄が作り直されたら returnVoiceHandoff で戻し、作り直したチャット欄が受け取る
//      （開発版の StrictMode は描いた直後に一度外して描き直すので、最初のチャット欄が受け取ってすぐ止めていた）

/** 送る前に印を付けた（まだチャットができていない） */
let armed = false;
/** 引き継ぐ先のチャット */
let target: number | null = null;

/** 音声モードの間に、新しいチャットから送る（作れたら引き継ぐ） */
export function armVoiceHandoff() {
  armed = true;
}

/** 音声モードを終えた・新しいチャットを閉じた（送っても引き継がない） */
export function disarmVoiceHandoff() {
  armed = false;
}

/** チャットを作れた（印があれば、このチャットへ引き継ぐ） */
export function claimVoiceHandoff(chatId: number) {
  if (!armed) return;
  armed = false;
  target = chatId;
}

/** 受け取ってから、これより早くチャット欄が作り直されたら戻す（ずっと戻すと、閉じて開き直したチャットで勝手に始まる） */
export const RETURN_MS = 5000;

/** 受け取ったチャット欄が、すぐに作り直された（次に描くチャット欄に受け取らせる） */
export function returnVoiceHandoff(chatId: number) {
  target = chatId;
}

/** このチャットへ引き継ぐ音声モードがあれば受け取る（一度きり） */
export function takeVoiceHandoff(chatId: number): boolean {
  if (target !== chatId) return false;
  target = null;
  return true;
}
