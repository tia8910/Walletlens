package live.walletlens.twa;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.firebase.analytics.FirebaseAnalytics;

/**
 * Native screen and usage tracking for WalletLens TWA.
 *
 * Tracks app lifecycle (opens, sessions, engagement) and screen views
 * within the Android Activity layer. Backed by Firebase Analytics for
 * real-time dashboards and export.
 */
public final class AnalyticsHelper {

    private static final String TAG = "WalletLensAnalytics";
    private static AnalyticsHelper instance;

    @Nullable
    private final FirebaseAnalytics firebaseAnalytics;

    /** Wall-clock time (System.currentTimeMillis) when the current session began. */
    private long sessionStartMs;

    // ── Custom event and parameter names ──────────────────────────────────

    private static final String EVENT_APP_LAUNCH        = "app_launch";
    private static final String EVENT_SESSION_END       = "session_end";
    private static final String EVENT_DEEP_LINK         = "deep_link_open";

    private static final String PARAM_LAUNCH_URL        = "launch_url";
    private static final String PARAM_SESSION_DURATION  = "session_duration_ms";
    private static final String PARAM_SCREEN_NAME       = FirebaseAnalytics.Param.SCREEN_NAME;
    private static final String PARAM_SCREEN_CLASS      = FirebaseAnalytics.Param.SCREEN_CLASS;

    // ── Singleton ────────────────────────────────────────────────────────

    private AnalyticsHelper(@NonNull Context context) {
        FirebaseAnalytics instance = null;
        try {
            instance = FirebaseAnalytics.getInstance(context);
        } catch (Exception e) {
            Log.w(TAG, "Firebase Analytics not available – tracking will be no-op", e);
        }
        this.firebaseAnalytics = instance;
        this.sessionStartMs = System.currentTimeMillis();
    }

    /**
     * Initialise the helper. Call once from {@link Application#onCreate()}.
     */
    public static synchronized void init(@NonNull Context context) {
        if (instance == null) {
            instance = new AnalyticsHelper(context.getApplicationContext());
            Log.d(TAG, "AnalyticsHelper initialised (" +
                    (instance.firebaseAnalytics != null ? "Firebase" : "no-op") + " backend)");
        }
    }

    /** Returns the singleton (must call {@link #init(Context)} first). */
    @NonNull
    public static synchronized AnalyticsHelper getInstance() {
        if (instance == null) {
            throw new IllegalStateException("AnalyticsHelper not initialised – call init() from Application.onCreate()");
        }
        return instance;
    }

    // ── Session lifecycle ─────────────────────────────────────────────────

    /** Call when a new top-level activity starts (i.e. the app comes to foreground). */
    public void startSession() {
        sessionStartMs = System.currentTimeMillis();
        logEvent(EVENT_APP_LAUNCH, null);
    }

    /** Call when the app goes to background. Logs engagement duration. */
    public void endSession() {
        long durationMs = System.currentTimeMillis() - sessionStartMs;
        Bundle params = new Bundle();
        params.putLong(PARAM_SESSION_DURATION, durationMs);
        logEvent(EVENT_SESSION_END, params);
    }

    // ── Screen tracking ───────────────────────────────────────────────────

    /**
     * Log a screen view event. Call from {@link Activity#onResume()} or
     * {@link androidx.lifecycle.Lifecycle.Event#ON_RESUME}.
     */
    public void trackScreenView(@NonNull Activity activity) {
        trackScreenView(activity.getClass().getSimpleName(), activity.getClass().getName());
    }

    /**
     * Log a screen view with an explicit name and class.
     *
     * @param screenName  Human-readable name of the screen.
     * @param screenClass Fully-qualified class name.
     */
    public void trackScreenView(@NonNull String screenName, @NonNull String screenClass) {
        Bundle params = new Bundle();
        params.putString(PARAM_SCREEN_NAME, screenName);
        params.putString(PARAM_SCREEN_CLASS, screenClass);
        logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, params);
    }

    // ── Custom events ─────────────────────────────────────────────────────

    /** Track a deep-link or URL that launched the TWA. */
    public void trackAppLaunchUrl(@NonNull String url) {
        Bundle params = new Bundle();
        params.putString(PARAM_LAUNCH_URL, url);
        logEvent(EVENT_DEEP_LINK, params);
    }

    /**
     * Generic event logger.
     *
     * @param name   Event name (Firebase recommends snake_case, max 40 chars).
     * @param params Optional parameters bundle (may be null).
     */
    public void logEvent(@NonNull String name, @Nullable Bundle params) {
        if (firebaseAnalytics != null) {
            firebaseAnalytics.logEvent(name, params);
        }
        if (Log.isLoggable(TAG, Log.DEBUG)) {
            Log.d(TAG, "Event: " + name + (params != null ? " " + params.toString() : ""));
        }
    }
}
