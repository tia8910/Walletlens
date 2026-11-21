package live.walletlens.twa;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.android.gms.tasks.Tasks;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

import java.util.concurrent.TimeUnit;

/**
 * Once a day, in the background, ask Google Play whether a newer WalletLens is
 * out, and if so say so with one quiet notification.
 *
 * <p>{@link PlayUpdate} only runs while the app is open, so someone who rarely
 * opens it never hears about an update. A background job cannot start Play's
 * update flow itself (Play draws that over an activity on screen), so this
 * posts a notification instead; tapping it opens the app, and the next check
 * there, forced by {@link PlayUpdate#forceNextCheck(Context)}, starts the flow.
 *
 * <p>Quiet on purpose: the low-importance "Updates" channel (no sound), once per
 * new version code rather than once a day, and nothing at all on an install
 * that did not come from Play, where Play has no answer to give.
 * WorkManager, not an exact alarm: the day is approximate and that is fine.
 */
public class UpdateCheckWorker extends Worker {

    private static final String TAG = "WalletLensUpdate";
    static final String WORK_NAME = "walletlens_play_update_check";
    private static final int NOTIFICATION_ID = 1007;
    private static final String KEY_NOTIFIED_VC = "notified_version_code";

    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Queue the daily check. KEEP, so every app start does not reset the day. */
    static void schedule(@NonNull Context context) {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                    UpdateCheckWorker.class, 1, TimeUnit.DAYS)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .build();
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (Throwable e) {
            Log.w(TAG, "could not schedule the daily update check: " + e);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        try {
            AppUpdateInfo info = Tasks.await(
                    AppUpdateManagerFactory.create(ctx).getAppUpdateInfo(), 60, TimeUnit.SECONDS);
            boolean ready = info.installStatus() == InstallStatus.DOWNLOADED;
            boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE;
            if (!ready && !available) return Result.success();

            int vc = info.availableVersionCode();
            SharedPreferences p = ctx.getSharedPreferences(PlayUpdate.PREFS, Context.MODE_PRIVATE);
            if (p.getInt(KEY_NOTIFIED_VC, 0) == vc) return Result.success();

            // The app asks Play again the moment it opens, without the hour gate.
            PlayUpdate.forceNextCheck(ctx);
            if (notify(ctx, ready)) p.edit().putInt(KEY_NOTIFIED_VC, vc).apply();
        } catch (Throwable e) {
            // Expected on a sideloaded build or a phone without the Play Store.
            // Success, not retry: tomorrow's run asks again.
            Log.d(TAG, "background update check: " + e);
        }
        return Result.success();
    }

    private static boolean notify(@NonNull Context ctx, boolean ready) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return false;
        Intent open = new Intent(ctx, AppShellActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, NOTIFICATION_ID, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = ready ? "WalletLens update ready" : "WalletLens update available";
        String text = ready ? "Tap to restart into the new version."
                : "A new version is on Google Play. Tap to update.";
        try {
            nm.notify(NOTIFICATION_ID, new NotificationCompat.Builder(ctx, NotificationHelper.CHANNEL_QUIET_ID)
                    .setSmallIcon(R.drawable.ic_notification_logo)
                    .setColor(0xFF071A0C)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setContentIntent(tap)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .build());
            return true;
        } catch (SecurityException e) {
            // Notification permission revoked between the check and the post.
            return false;
        }
    }
}
