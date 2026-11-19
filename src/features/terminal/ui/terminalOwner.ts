// 内蔵ターミナルのシェルの持ち主（その画面 = wc:<WebContents の ID>。メインプロセスがその画面の生き死にを見て、消えたらシェルを止める）
import { api } from "@/foundation/ui/api";

type NativeTerminal = NonNullable<Window["kickoff"]>["terminal"];

/** この画面の持ち主の印（画面ごとに 1 回だけ聞く） */
let ownerPromise: Promise<string> | undefined;
export const windowOwner = (native: NativeTerminal) => (ownerPromise ??= native.owner());

/**
 * シェルの持ち主をこの画面にする（タブを別ウィンドウへ移す・戻すとき。移す元の画面が閉じてもシェルを止めさせない）。
 * つなぐのは、移した先でタブを表示したとき（TerminalPane）。もうシェルが終わっていれば何もしない（始めない。終わったコマンドを流し直さないため）
 */
export async function claimTerminal(key: string): Promise<void> {
  const native = globalThis.window?.kickoff?.terminal;
  if (!native) return;
  await api.setTerminalOwner(key, { owner: await windowOwner(native) }).catch(() => {});
}
