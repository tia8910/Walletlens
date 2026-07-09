package live.walletlens.twa;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;

import android.os.Bundle;
import androidx.annotation.NonNull;
import android.util.Log;

/**
 * WalletLens TWA Application.
 *
 * Initialises native analytics tracking, notification channels, and
 * schedules periodic background checks for local privacy-first notifications.
 */
public class WalletLensApp extends android.app.Application {

    private static final String TAG = "WalletLensApp";

    /**
     * Tracks how many activities are currently resumed. When this counter
     * transitions 0→1 we start a session; when it drops 1→0 we end the session.
     */
    private int resumedActivityCount = 0;

    @Override
    public void onCreate() {
        super.onCreate();

        // Initialise the analytics helper once at app level.
        AnalyticsHelper.init(this);

        // Create notification channels for local notifications (Android 8+).
        new NotificationHelper(this).createChannels();

        // Schedule periodic background checks for market updates and announcements.
        // The app fetches public data from free APIs — no backend, no user data sent.
        NotificationScheduler.schedule(this);

        // Register screen-off receiver for auto-lock
        ScreenOffReceiver screenOffReceiver = new ScreenOffReceiver();
        registerReceiver(screenOffReceiver, new IntentFilter(Intent.ACTION_SCREEN_OFF));

        // Schedule widget data refresh (first update after 1 min)
        android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
        handler.postDelayed(() -> {
            try {
                android.appwidget.AppWidgetManager appWidgetManager =
                        android.appwidget.AppWidgetManager.getInstance(this);
                android.content.ComponentName thisWidget =
                        new android.content.ComponentName(this, WalletLensWidgetProvider.class);
                int[] ids = appWidgetManager.getAppWidgetIds(thisWidget);
                if (ids != null && ids.length > 0) {
                    WalletLensWidgetProvider.updateAppWidget(this, appWidgetManager, ids[0]);
                }
            } catch (Exception e) {
                Log.w(TAG, "Widget initial update failed", e);
            }
        }, 60_000);

        Log.d(TAG, "WalletLens initialised: analytics + local notifications active");

        // Register a lifecycle callback to track app foreground/background
        // transitions and automatic screen views.
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {

            @Override
            public void onActivityResumed(@NonNull Activity activity) {
                resumedActivityCount++;
                if (resumedActivityCount == 1) {
                    // App just came to the foreground – start a session.
                    AnalyticsHelper.getInstance().startSession();
                }
                // Track every resumed activity as a screen view.
                AnalyticsHelper.getInstance().trackScreenView(activity);
            }

            @Override
            public void onActivityPaused(@NonNull Activity activity) {
                resumedActivityCount--;
                if (resumedActivityCount == 0) {
                    // App is now in the background – end the session.
                    AnalyticsHelper.getInstance().endSession();
                }
            }

            @Override
            public void onActivityCreated(@NonNull Activity activity, Bundle savedInstanceState) {
                // no-op
            }

            @Override
            public void onActivityStarted(@NonNull Activity activity) {
                // no-op
            }

            @Override
            public void onActivityStopped(@NonNull Activity activity) {
                // no-op
            }

            @Override
            public void onActivitySaveInstanceState(@NonNull Activity activity, @NonNull Bundle outState) {
                // no-op
            }

            @Override
            public void onActivityDestroyed(@NonNull Activity activity) {
                // no-op
            }
        });
    }
}
