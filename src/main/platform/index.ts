// いま動いている OS の口を 1 か所で選ぶ（いまは macOS だけ。ほかの OS を足すときは、ここで選び分ける）
import { macosPlatform } from "../../core/platform/macos/index.js";
import { SPEECH_HELPER } from "../app/environment.js";
import { macosDesktopPlatform } from "./macos/index.js";

/** コアと共通の OS の口（startCore に渡す。音声認識の補助コマンドの場所も） */
export const hostPlatform = macosPlatform({ speechHelper: SPEECH_HELPER });

/** メインプロセスだけで使う OS の口 */
export const desktopPlatform = macosDesktopPlatform();
