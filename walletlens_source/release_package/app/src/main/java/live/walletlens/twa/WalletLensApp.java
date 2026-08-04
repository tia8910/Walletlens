package live.walletlens.twa;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;

/**
 * WalletLens TWA Application.
 * Initializes analytics and schedules push notifications via WorkManager.
 */
public class WalletLensApp extends android.app.Application {

    private static final String TAG = "WalletLensApp";
    private int resumedActivityCount = 0;

    @Override
    public void onCreate() {
        super.onCreate();

        // Throwable, not Exception. A missing class after a shrinker pass
        // arrives as NoClassDefFoundError, which is an Error — it slips past a
        // catch of Exception and kills the process before any UI exists. That
        // is exactly how ReviewActivity failed, and Application.onCreate is the
        // worst place for it because nothing at all can start.
        try {
            AnalyticsHelper.init(this);
        } catch (Throwable e) {
            Log.e(TAG, "Analytics init failed: " + e.getMessage());
        }

        try {
            new NotificationHelper(this).createChannels();
            NotificationScheduler.schedule(this);
        } catch (Throwable e) {
            Log.e(TAG, "Notification init failed: " + e.getMessage());
        }

        try {
            registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
                @Override
                public void onActivityResumed(@NonNull Activity activity) {
                    resumedActivityCount++;
                    try {
                        if (resumedActivityCount == 1) AnalyticsHelper.getInstance().startSession();
                        AnalyticsHelper.getInstance().trackScreenView(activity);
                    } catch (Throwable e) {
                        Log.w(TAG, "onActivityResumed analytics failed: " + e.getMessage());
                    }
                }
                @Override
                public void onActivityPaused(@NonNull Activity activity) {
                    resumedActivityCount--;
                    try {
                        if (resumedActivityCount == 0) AnalyticsHelper.getInstance().endSession();
                    } catch (Throwable e) {
                        Log.w(TAG, "onActivityPaused analytics failed: " + e.getMessage());
                    }
                }
                @Override public void onActivityCreated(@NonNull Activity a, Bundle b) {}
                @Override public void onActivityStarted(@NonNull Activity a) {}
                @Override public void onActivityStopped(@NonNull Activity a) {}
                @Override public void onActivitySaveInstanceState(@NonNull Activity a, @NonNull Bundle b) {}
                @Override public void onActivityDestroyed(@NonNull Activity a) {}
            });
        } catch (Throwable e) {
            Log.e(TAG, "Lifecycle callbacks failed: " + e.getMessage());
        }

        Log.d(TAG, "WalletLens initialised");
    }
}
