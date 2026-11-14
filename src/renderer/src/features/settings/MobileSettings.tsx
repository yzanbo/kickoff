import { Smartphone } from "lucide-react";
import { DEVICE_ACCESS_HELP, DEVICE_ACCESS_LABELS, DEVICE_ACCESSES, type Device, type DeviceAccess, type PairingState } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { formatPairingCode } from "@shared/devices/pairing";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useTicker } from "@/hooks/useTicker";
import { agoText, formatDayTime } from "@/lib/time";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { CommitInput } from "@/ui/CommitInput";
import { ErrorText } from "@/ui/ErrorText";
import { Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";
import { MobileSwitches } from "./MobileSwitches";
import { TailscaleGuide } from "./TailscaleGuide";
import { useMobilePairing } from "./useMobilePairing";
import { useMobileSwitches } from "./useMobileSwitches";

/** 設定: スマホ連携（スマホからつなぐ・ログイン時に起動・つなぐ先の URL・端末をつなぐ（番号と QR・Mac で確かめる）・つないだ端末の一覧と取り消し） */
export function MobileSettings() {
  const settings = useAppSettings().data;
  const pairing = useMobilePairing();
  const switches = useMobileSwitches();
  const tailscale = useAsync(() => api.tailscaleStatus());
  if (!settings) return null;
  const off = !settings.remote_enabled;
  const saveUrl = (url: string | null) =>
    void api.updateSettings({ mobile_url: url }).then(
      (saved) => settingsStore.set(saved),
      (e: unknown) => pairing.action.setError(errorMessage(e)),
    );
  return (
    <section className="section">
      <h2>スマホ連携</h2>
      <p className="muted small">
        スマホから、この Mac の Kickoff のチャットを見る・送る・答えるための設定です。つないだ端末は、この Mac の Kickoff を丸ごと動かせる鍵を持ちます（AI に頼めば何でもできます）。なくしたら、すぐ取り消してください。
      </p>
      <MobileSwitches switches={switches} />
      <h3>家の外からつなぐ（Tailscale Serve）</h3>
      <TailscaleGuide status={tailscale.data ?? null} loading={tailscale.loading} error={tailscale.error} mobileUrl={settings.mobile_url} onRecheck={tailscale.reload} onUseUrl={saveUrl} />
      <div className="form">
        <Field label="つなぐ先の URL" help="スマホから、この Mac の Kickoff に届く URL（Tailscale Serve の https://<Mac の名前>.ts.net など）。QR に入れます。空なら QR を出さず、番号だけを出します。">
          <CommitInput type="url" value={settings.mobile_url ?? ""} placeholder="https://mac.example.ts.net" onCommit={(v) => saveUrl(v || null)} />
        </Field>
      </div>
      <h3>端末をつなぐ</h3>
      {off && <p className="muted small">「スマホからつなぐ」をオンにすると、端末をつなげます。</p>}
      {pairing.state && !off && <PairingPanel state={pairing.state} qr={pairing.qr} link={pairing.link} busy={pairing.action.busy !== null} onStart={pairing.start} onCancel={pairing.cancel} onApprove={pairing.approve} onDeny={pairing.deny} />}
      <ErrorText message={pairing.action.error} />
      <h3>つないだ端末</h3>
      <DeviceList devices={pairing.devices} busy={pairing.action.busy !== null} onRevoke={pairing.revoke} onAccess={pairing.setAccess} />
    </section>
  );
}

interface PairingPanelProps {
  state: PairingState;
  qr: string | null;
  link: string | null;
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
  onApprove: (id: string, access: DeviceAccess) => void;
  onDeny: (id: string) => void;
}

/** 番号と QR・確かめを待っている頼み */
function PairingPanel({ state, qr, link, busy, onStart, onCancel, onApprove, onDeny }: PairingPanelProps) {
  useTicker(1000);
  if (state.request) {
    return (
      <div className="pairing-request">
        <Smartphone size={18} aria-hidden />
        <div className="pairing-request-text">
          <strong>「{state.request.name}」をつなぎますか？</strong>
          <span className="muted small">
            いま QR・番号を読んだ端末か確かめてください。心当たりがなければ断ってください。家族・共用の端末なら「見るだけでつなぐ」（チャットを読めますが、送る・答える・止めるはできません。あとで変えられます）。
          </span>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => onDeny(state.request!.id)}>
          断る
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => onApprove(state.request!.id, "read")}>
          見るだけでつなぐ
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onApprove(state.request!.id, "full")}>
          つなぐ
        </button>
      </div>
    );
  }
  if (!state.code || !state.expires_at) {
    return (
      <div className="pairing-start">
        <p className="muted small">押すと、5 分だけ使える番号（と、つなぐ先の URL があれば QR）を出します。スマホのアプリで読むと、この画面で確かめてからつなぎます。</p>
        <button type="button" className="btn" disabled={busy} onClick={onStart}>
          端末をつなぐ
        </button>
      </div>
    );
  }
  const left = Math.max(0, Math.round((Date.parse(state.expires_at) - Date.now()) / 1000));
  return (
    <div className="pairing-code">
      {link ? qr ? <img className="pairing-qr" src={qr} alt="ペアリングの QR" /> : <div className="pairing-qr" aria-hidden /> : null}
      <div className="pairing-code-text">
        <span className="muted small">番号</span>
        <strong className="pairing-number">{formatPairingCode(state.code)}</strong>
        <span className="muted small">
          あと {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          {!link && "（つなぐ先の URL がないので QR は出していません）"}
        </span>
        <div className="pairing-code-actions">
          <button type="button" className="btn" disabled={busy} onClick={onStart}>
            番号を出し直す
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}

const ACCESS_OPTIONS = DEVICE_ACCESSES.map((value) => ({ value, label: DEVICE_ACCESS_LABELS[value], tip: DEVICE_ACCESS_HELP[value] }));

interface DeviceListProps {
  devices: Device[];
  busy: boolean;
  onRevoke: (device: Device) => void;
  onAccess: (device: Device, access: DeviceAccess) => void;
}

/** つないだ端末の一覧（できること（使える / 見るだけ）はここで変えられ、次の頼みから効く） */
function DeviceList({ devices, busy, onRevoke, onAccess }: DeviceListProps) {
  if (devices.length === 0) return <p className="muted small">まだ端末をつないでいません。</p>;
  return (
    <ul className="device-list">
      {devices.map((d) => (
        <li key={d.id} className="device-row">
          <Smartphone size={16} aria-hidden />
          <div className="device-row-text">
            <span>{d.name}</span>
            <span className="muted small">
              つないだ: {formatDayTime(d.created_at)}・最後に使った: {d.last_used_at ? agoText(d.last_used_at) : "まだ"}
              {d.has_push && "・通知あり"}
            </span>
          </div>
          <Segmented<DeviceAccess> className="segmented theme-switch" label={`「${d.name}」ができること`} value={d.access} options={ACCESS_OPTIONS} onChange={(access) => onAccess(d, access)} />
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => onRevoke(d)}>
            取り消す
          </button>
        </li>
      ))}
    </ul>
  );
}
