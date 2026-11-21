package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;

import org.json.JSONObject;

/**
 * Which link brought this install, from the Play Install Referrer API.
 *
 * <p>A Play link can carry {@code &referrer=utm_source%3D...} and Play hands
 * that string to the app once it is installed. Read once, on the first launch
 * that gets an answer, and kept here; the web app reads it through
 * {@link WalletLensBridge#installReferrer()} and reports it once to analytics,
 * so installs can be told apart by the site, video or campaign that sent them.
 *
 * <p>Holds nothing about the person: the referrer is the campaign text that
 * was on the link they tapped, plus when they clicked and installed.
 */
final class InstallReferrer {

    private static final String TAG = "WalletLensReferrer";
    private static final String PREFS = "walletlens_referrer";
    private static final String KEY_DONE = "done";
    private static final String KEY_JSON = "json";

    private InstallReferrer() {}

    /** Ask Play once. Safe on every start: does nothing once there is an answer. */
    static void fetchOnce(@NonNull Context context) {
        final Context app = context.getApplicationContext();
        try {
            final SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (p.getBoolean(KEY_DONE, false)) return;
            final InstallReferrerClient client = InstallReferrerClient.newBuilder(app).build();
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int code) {
                    try {
                        if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                            ReferrerDetails d = client.getInstallReferrer();
                            JSONObject o = new JSONObject();
                            o.put("referrer", d.getInstallReferrer() == null ? "" : d.getInstallReferrer());
                            o.put("clickTs", d.getReferrerClickTimestampSeconds());
                            o.put("installTs", d.getInstallBeginTimestampSeconds());
                            p.edit().putString(KEY_JSON, o.toString()).putBoolean(KEY_DONE, true).apply();
                        } else if (code == InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED
                                || code == InstallReferrerClient.InstallReferrerResponse.DEVELOPER_ERROR) {
                            // Not from Play, or a Play Store too old: there will
                            // never be an answer, so stop asking.
                            p.edit().putBoolean(KEY_DONE, true).apply();
                        }
                        // SERVICE_UNAVAILABLE and the rest: ask again next start.
                    } catch (Throwable e) {
                        Log.w(TAG, "could not read the install referrer: " + e);
                    } finally {
                        try { client.endConnection(); } catch (Throwable ignored) {}
                    }
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    // Nothing to do; the next start asks again if needed.
                }
            });
        } catch (Throwable e) {
            Log.w(TAG, "install referrer unavailable: " + e);
        }
    }

    /** The stored answer as JSON, or an empty string when there is none. */
    @NonNull
    static String json(@NonNull Context context) {
        try {
            return context.getApplicationContext()
                    .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_JSON, "");
        } catch (Throwable e) {
            return "";
        }
    }
}
