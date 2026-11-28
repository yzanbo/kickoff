import "./UpdateBanner.css";
import { saveSettings } from "@/foundation/ui/settings/appSettings";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { useCell } from "@/foundation/ui/store/cell";
import { releaseNotesUrl, RELEASES_URL } from "@shared/updates/distribution";
import { updateVersionOf } from "@shared/updates/state";
import { BANNER_ACTION_LABELS, bannerOf, showsBadge, type BannerAction } from "./updateBannerModel";
import { updatesNative } from "./native";
import { updatesCell } from "./updatesStore";

/** ［この版は飛ばす］: 飛ばした版をアプリの設定に覚え（次の確かめで印を付けない）、いまの印を消す */
async function skipVersion(version: string) {
  await saveSettings({ skipped_update_version: version });
  updatesNative.skip();
}

function runAction(action: BannerAction, version: string | null) {
  if (action === "install") updatesNative.install();
  else if (action === "cancel") updatesNative.cancelInstall();
  else if (action === "skip" && version) void skipVersion(version).catch(reportFailure("この版を飛ばせませんでした"));
  else if (action === "notes" && version) updatesNative.openPage(releaseNotesUrl(version));
  else if (action === "releases") updatesNative.openPage(RELEASES_URL);
}

/** 設定のダイアログのいちばん上の帯（新しい版・ダウンロードの進み具合・作業が終わるのを待っている・入れられなかった・手で確かめた結果） */
export function UpdateBanner() {
  const snapshot = useCell(updatesCell);
  const banner = snapshot && bannerOf(snapshot.state, snapshot.build.version);
  if (!snapshot || !banner) return null;
  const version = updateVersionOf(snapshot.state);
  return (
    <div className="update-banner" data-tone={banner.tone} role="status">
      <span className="update-banner-text">{banner.text}</span>
      {banner.percent !== null && <progress className="update-banner-progress" max={100} value={banner.percent} />}
      {banner.actions.length > 0 && (
        <span className="update-banner-actions">
          {banner.actions.map((action) => (
            <button key={action} type="button" className={action === "install" ? "btn btn-primary" : "btn"} data-size="sm" onClick={() => runAction(action, version)}>
              {BANNER_ACTION_LABELS[action]}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/** 下の帯の ⚙ に重ねる印（新しい版を入れるか飛ばすまで残す） */
export function UpdateBadge() {
  const shown = useCell(updatesCell, (s) => s !== null && showsBadge(s.state));
  return shown ? <span className="update-badge" role="img" aria-label="新しい版があります" /> : null;
}
