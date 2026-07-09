package live.walletlens.twa;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import android.util.Log;

/**
 * WalletLens TWA Application.
 *
 * Initialises native analytics tracking, notification channels and
 * schedules smart background notifications via AlarmManager.
 *
 * <p>Notifications fire every 30 minutes with:
 * <ul>
 *   <li>📊 Live price updates (BTC, ETH, SOL, gold, stocks)</li>
 *   <li>💡 Feature tips (32+ app features)</li>
 *   <li>💪 Investment hacks (wealth-building strategies)</li>
 *   <li>🔔 Portfolio reminders</li>
 * </ul>
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
        NotificationHelper helper = new NotificationHelper(this);
        helper.createChannels();

        // Show welcome notification immediately on first install
        NotificationScheduler.showWelcomeNotification(this);

        // Schedule the alarm-based notification system
        // Uses AlarmManager.setAlarmClock() which is NOT deferred by the system
        NotificationScheduler.schedule(this);

        // Fire an immediate notification (5 second delay) so the user
        // sees something right away on first install
        NotificationScheduler.scheduleImmediate(this);

        // Register screen-off receiver for auto-lock
        ScreenOffReceiver screenOffReceiver = new ScreenOffReceiver();
        registerReceiver(screenOffReceiver, new IntentFilter(Intent.ACTION_SCREEN_OFF));

        // Schedule widget data refresh (first update after 1 min)
        Handler handler = new Handler(Looper.getMainLooper());
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

        Log.d(TAG, "WalletLens initialised: AlarmManager notifications every 30 min");

        // Register a lifecycle callback to track app foreground/background
        // transitions and automatic screen views.
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {

            @Override
            public void onActivityResumed(@NonNull Activity activity) {
                resumedActivityCount++;
                if (resumedActivityCount == 1) {
                    AnalyticsHelper.getInstance().startSession();
                }
                AnalyticsHelper.getInstance().trackScreenView(activity);
            }

            @Override
            public void onActivityPaused(@NonNull Activity activity) {
                resumedActivityCount--;
                if (resumedActivityCount == 0) {
                    AnalyticsHelper.getInstance().endSession();
                }
            }

            @Override
            public void onActivityCreated(@NonNull Activity activity, Bundle savedInstanceState) {}
            @Override
            public void onActivityStarted(@NonNull Activity activity) {}
            @Override
            public void onActivityStopped(@NonNull Activity activity) {}
            @Override
            public void onActivitySaveInstanceState(@NonNull Activity activity, @NonNull Bundle outState) {}
            @Override
            public void onActivityDestroyed(@NonNull Activity activity) {}
        });
    }
}
