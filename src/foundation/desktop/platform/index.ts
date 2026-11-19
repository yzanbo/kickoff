// いま動いている OS の口を 1 か所で選ぶ（いまは macOS だけ。ほかの OS を足すときは、ここで選び分ける。
// DB ワーカーのシェルの口だけは、別のプロセスなので src/features/database/worker/main.ts で選ぶ）
import { macosPlatform } from "@/foundation/core/platform/macos/index";
import { SPEECH_HELPER } from "@/foundation/desktop/app/environment";
import { macosDesktopPlatform } from "@/foundation/desktop/platform/macos/index";

/** コアと共通の OS の口（メインではプロセスの表・子の Electron に使う。コアのプロセスは自分で作る） */
export const hostPlatform = macosPlatform({ speechHelper: SPEECH_HELPER });

/** メインプロセスだけで使う OS の口 */
export const desktopPlatform = macosDesktopPlatform();
