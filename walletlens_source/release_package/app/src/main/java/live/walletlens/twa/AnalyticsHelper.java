package live.walletlens.twa;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

/**
 * Lightweight, dependency-free usage tracker.
 *
 * Firebase Analytics was removed: the app was shipped with a stub
 * google-services.json (no real Firebase project), which made Firebase's
 * FirebaseInitProvider throw at process start — before Application.onCreate —
 * crashing the app on first launch with "this app has a bug". Native analytics
 * is optional (the web layer already reports to Google Analytics), so this is
 * now a safe no-op that only writes to Logcat. The public API is unchanged so
 * existing callers keep working.
 */
public final class AnalyticsHelper {

    private static final String TAG = "WalletLensAnalytics";
    private static AnalyticsHelper instance;

    private long sessionStartMs;

    private AnalyticsHelper() {
        this.sessionStartMs = System.currentTimeMillis();
    }

    /** Call once from {@link android.app.Application#onCreate()}. */
    public static synchronized void init(@NonNull Context context) {
        if (instance == null) instance = new AnalyticsHelper();
    }

    /** Returns the singleton, lazily creating it so it never throws. */
    @NonNull
    public static synchronized AnalyticsHelper getInstance() {
        if (instance == null) instance = new AnalyticsHelper();
        return instance;
    }

    // ── Session lifecycle ─────────────────────────────────────────────────

    public void startSession() {
        sessionStartMs = System.currentTimeMillis();
        logEvent("app_launch", null);
    }

    public void endSession() {
        long durationMs = System.currentTimeMillis() - sessionStartMs;
        Log.d(TAG, "session_end duration=" + durationMs + "ms");
    }

    // ── Screen / event tracking ────────────────────────────────────────────

    public void trackScreenView(@NonNull Activity activity) {
        if (Log.isLoggable(TAG, Log.DEBUG)) {
            Log.d(TAG, "screen_view: " + activity.getClass().getSimpleName());
        }
    }

    public void trackScreenView(@NonNull String screenName, @NonNull String screenClass) {
        if (Log.isLoggable(TAG, Log.DEBUG)) {
            Log.d(TAG, "screen_view: " + screenName + " (" + screenClass + ")");
        }
    }

    public void trackAppLaunchUrl(@NonNull String url) {
        if (Log.isLoggable(TAG, Log.DEBUG)) Log.d(TAG, "launch_url: " + url);
    }

    public void logEvent(@NonNull String name, @Nullable Bundle params) {
        if (Log.isLoggable(TAG, Log.DEBUG)) {
            Log.d(TAG, "Event: " + name + (params != null ? " " + params : ""));
        }
    }
}
