import { BatteryWarning } from "lucide-react";
import { CheckField } from "@/ui/Field";
import { ErrorText } from "@/ui/ErrorText";
import type { useMobileSwitches } from "./useMobileSwitches";

/** スマホからつなぐ・ログイン時に起動の 2 つのスイッチと、その説明（設定の「スマホ連携」のいちばん上） */
export function MobileSwitches({ switches }: { switches: ReturnType<typeof useMobileSwitches> }) {
  const { mobileEnabled, loginItem, onBattery, action, setMobile, setLogin } = switches;
  return (
    <div className="form mobile-switches">
      <CheckField
        label="スマホからつなぐ"
        help="オンのあいだは、端末をつなげて、つないだ端末からこの Mac の Kickoff を使えます。電源につないでいる間は、Mac を眠らせません（画面は消えます）。オフにすると、つないだ端末からも使えなくなります（登録は残り、オンに戻せばそのまま使えます）。"
        checked={mobileEnabled}
        disabled={action.busy !== null}
        onChange={(on) => void setMobile(on)}
      />
      {mobileEnabled && onBattery && (
        <p className="mobile-battery-note small">
          <BatteryWarning size={14} aria-hidden />
          いまはバッテリーで動いているので、作業中でなければ Mac は眠ることがあります。眠っている間はスマホから届きません。
        </p>
      )}
      <CheckField
        label="ログイン時に Kickoff を起動する"
        help={
          loginItem?.available === false
            ? loginItem.reason
            : !window.kickoff
              ? "Mac のアプリの Kickoff で選べます。"
              : "オフだと、Mac を再起動したあとは Kickoff を開くまでスマホから届きません。オンにすると、ログインしたときに窓を出さずに裏で起動します。MacBook はふたを閉じると眠り、その間は届きません（電源と外部ディスプレイをつないでいるときを除く）。"
        }
        checked={loginItem?.openAtLogin ?? false}
        disabled={!loginItem?.available || action.busy !== null}
        onChange={(open) => void setLogin(open)}
      />
      <ErrorText message={action.error} />
    </div>
  );
}
