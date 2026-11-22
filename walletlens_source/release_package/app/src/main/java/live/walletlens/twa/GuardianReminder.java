package live.walletlens.twa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * Portfolio Guardian's reminder on the phone itself.
 *
 * <p>Every time the app opens, the web side moves the Guardian deadline and
 * calls {@link WalletLensBridge#scheduleGuardianReminder}, which replaces the
 * two queued reminders (a week and three days before). So they only ever fire
 * for someone who has really stopped opening the app. No network needed, which
 * is what this adds over the push service's reminder; both use the tag
 * "guardian" on the same notification id, so when both arrive the second
 * replaces the first rather than showing twice.
 *
 * <p>WorkManager with a delay, not an exact alarm: a day either way does not
 * matter, and Play reserves exact alarms for alarm clocks.
 */
public class GuardianReminder extends Worker {

    private static final String TAG = "WalletLensGuardian";
    static final String WORK_7 = "walletlens_guardian_reminder_7";
    static final String WORK_3 = "walletlens_guardian_reminder_3";
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final String K_TITLE = "title";
    private static final String K_BODY = "body";

    public GuardianReminder(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /**
     * Queue the reminders for a deadline, replacing any queued before; a
     * deadline of 0 or less cancels them (Guardian off, or paused).
     */
    static void schedule(@NonNull Context context, long deadlineMs,
                         String title, String body7, String body3) {
        try {
            WorkManager wm = WorkManager.getInstance(context);
            if (deadlineMs <= 0) {
                wm.cancelUniqueWork(WORK_7);
                wm.cancelUniqueWork(WORK_3);
                return;
            }
            queue(wm, WORK_7, deadlineMs - 7 * DAY_MS, title, body7);
            queue(wm, WORK_3, deadlineMs - 3 * DAY_MS, title, body3);
        } catch (Throwable e) {
            Log.w(TAG, "could not schedule the Guardian reminder: " + e);
        }
    }

    private static void queue(WorkManager wm, String name, long atMs, String title, String body) {
        long delay = atMs - System.currentTimeMillis();
        // Already past: the push service's reminder or the email covers it.
        if (delay <= 0) { wm.cancelUniqueWork(name); return; }
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(GuardianReminder.class)
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setInputData(new Data.Builder()
                        .putString(K_TITLE, clip(title, 80, "Portfolio Guardian"))
                        .putString(K_BODY, clip(body, 200, "Open WalletLens to show you're OK."))
                        .build())
                .build();
        wm.enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, req);
    }

    private static String clip(String s, int max, String fallback) {
        if (s == null || s.trim().isEmpty()) return fallback;
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            Context ctx = getApplicationContext();
            NotificationHelper helper = new NotificationHelper(ctx);
            helper.createChannels();
            helper.showAlertNotification(
                    getInputData().getString(K_TITLE) != null ? getInputData().getString(K_TITLE) : "Portfolio Guardian",
                    getInputData().getString(K_BODY) != null ? getInputData().getString(K_BODY) : "",
                    "https://" + AppShellActivity.HOST + "/guardian",
                    "guardian");
        } catch (Throwable e) {
            Log.w(TAG, "could not show the Guardian reminder: " + e);
        }
        return Result.success();
    }
}
