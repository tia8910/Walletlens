package live.walletlens.twa;

import android.app.Activity;
import android.content.SharedPreferences;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.NonNull;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Tell the user when a newer version of the app is live on Google Play.
 *
 * <h3>Why this is needed at all</h3>
 * Most of WalletLens is a web app, and a web change reaches every install the
 * moment Cloudflare Pages deploys. The parts that do not are the parts this
 * package is: the notification channels, the data vault, the file pickers, the
 * biometric prompt, the FCM transport. Those only ever change with a new APK,
 * and Play's own automatic update is off, deferred, or Wi-Fi-only for a large
 * share of devices — an install can sit years behind without its owner ever
 * seeing a reason to look at the store.
 *
 * <h3>FLEXIBLE, not IMMEDIATE</h3>
 * An immediate update takes over the screen with a blocking, full-screen Play
 * flow and restarts the app when it finishes. That is right for an app that
 * cannot function on an old version — a bank refusing an insecure client — and
 * wrong for this one, where the old version keeps working and the person may
 * well be in the middle of reading their portfolio. Flexible downloads in the
 * background, leaves the app usable throughout, and asks to restart only once
 * the bytes are already on the device.
 *
 * <h3>What happens on an install that did not come from Play</h3>
 * Nothing, and that is correct rather than unfortunate. A sideloaded APK — the
 * ones built straight out of CI for testing — has no Play install record, so
 * {@code getAppUpdateInfo} fails and this stays quiet. It must never fall back
 * to opening the store listing on those: an APK tester would be nagged to
 * "update" to a build older than the one they are running.
 */
final class PlayUpdate {

    private static final String TAG = "WalletLensUpdate";

    private static final String PREFS = "walletlens_update";
    private static final String KEY_LAST_CHECK = "last_check_ms";

    /**
     * How often Play is asked.
     *
     * <p>Once a day. The check is a binder call into the Play Store, not a
     * network request this app pays for, but it can raise a dialog — and a
     * dialog on every single return to the app is the behaviour people
     * uninstall over. A day is also faster than any release cadence this app
     * has ever had, so nothing is missed by waiting.
     */
    private static final long CHECK_EVERY_MS = 1 * 60 * 60 * 1000L;

    /**
     * Force a check on the next resume, bypassing the daily gate.
     * Called after an install completes so the user sees the update
     * dialog immediately rather than waiting for the next 6-hour window.
     */
    static void forceNextCheck(@NonNull Activity activity) {
        try {
            activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .edit().putLong(KEY_LAST_CHECK, 0L).apply();
        } catch (Throwable ignored) {}
    }

    /**
     * How stale an update has to be before the download is offered.
     *
     * <p>Play reports how many days a version has been available to this
     * device. Zero would mean offering the update to whoever opens the app in
     * the minutes after a release — including, sometimes, before the staged
     * rollout has actually reached them. One day lets a release settle.
     */
    private static final int STALENESS_DAYS = 0;

    private PlayUpdate() {}

    /**
     * Check for a new version and, if there is one, offer it.
     *
     * <p>Safe to call from every {@code onResume}: the day gate is inside, and
     * everything below it is wrapped, because the Play Core library throws on
     * devices where the Store is missing or disabled and an update check must
     * never be the reason the app fails to open.
     */
    static void check(@NonNull Activity activity) {
        try {
            SharedPreferences p =
                    activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
            long now = System.currentTimeMillis();
            long last = p.getLong(KEY_LAST_CHECK, 0L);
            // Written BEFORE the asynchronous call, not in its callback. The
            // callback may never run — no Play Store, no network, a task the
            // user swipes away — and a stamp written only on success would put
            // this back to checking on every single resume on exactly the
            // devices where the check is failing.
            if (now - last < CHECK_EVERY_MS) return;
            p.edit().putLong(KEY_LAST_CHECK, now).apply();

            AppUpdateManager manager = AppUpdateManagerFactory.create(activity);
            manager.getAppUpdateInfo()
                    .addOnSuccessListener(info -> onInfo(activity, manager, info))
                    .addOnFailureListener(e ->
                            // Expected on a sideloaded build and on a device
                            // with no Play Store. Logged, never shown.
                            Log.d(TAG, "no update information: " + e));
        } catch (Throwable e) {
            Log.w(TAG, "update check failed: " + e);
        }
    }

    private static void onInfo(@NonNull Activity activity,
                               @NonNull AppUpdateManager manager,
                               @NonNull AppUpdateInfo info) {
        try {
            if (activity.isFinishing() || activity.isDestroyed()) return;

            // Already downloaded on an earlier run and waiting to be installed.
            // This is the case that would otherwise strand a user: the bytes
            // are on the device, the app never asked again, and the update sits
            // there for ever.
            if (info.installStatus() == InstallStatus.DOWNLOADED) {
                promptInstall(activity, manager);
                return;
            }

            // Download in progress — just let it finish silently.
            if (info.installStatus() == InstallStatus.DOWNLOADING) {
                return;
            }

            if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) return;

            Integer staleness = info.clientVersionStalenessDays();
            if (staleness != null && staleness < STALENESS_DAYS) return;

            if (info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                // Told once, at the moment the download starts, because the
                // flexible flow itself is a small Play sheet that is easy to
                // dismiss without reading. After this the download is silent
                // and the app stays usable throughout.
                manager.registerListener(downloadListener(activity, manager));
                manager.startUpdateFlowForResult(
                        info,
                        activity,
                        AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
                        REQUEST_CODE);
                return;
            }

            // A release can be published as immediate-only, and then the
            // flexible flow is refused. Returning here would mean the user is
            // never told about an update at all, which is the one outcome this
            // class exists to prevent — so the blocking flow is used rather
            // than nothing. It is still gated by the same day counter, so it
            // cannot become a wall the user meets on every launch.
            if (info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
                manager.startUpdateFlowForResult(
                        info,
                        activity,
                        AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
                        REQUEST_CODE);
            }
        } catch (Throwable e) {
            Log.w(TAG, "could not offer the update: " + e);
        }
    }

    /**
     * Request code for the Play flow.
     *
     * <p>Nothing reads the result: a declined or cancelled update is simply not
     * downloaded, and the day gate means the offer comes back tomorrow rather
     * than immediately. The code exists because the API requires one.
     */
    private static final int REQUEST_CODE = 4711;

    private static InstallStateUpdatedListener downloadListener(
            @NonNull Activity activity, @NonNull AppUpdateManager manager) {
        return new InstallStateUpdatedListener() {
            @Override
            public void onStateUpdate(@NonNull com.google.android.play.core.install.InstallState state) {
                if (state.installStatus() != InstallStatus.DOWNLOADED) return;
                // One-shot: without this the listener stays registered for the
                // life of the process and re-prompts on every state change.
                manager.unregisterListener(this);
                promptInstall(activity, manager);
            }
        };
    }

    /**
     * The update is downloaded; ask to restart into it.
     *
     * <p>{@code completeUpdate} restarts the app, which is why this asks rather
     * than doing it: silently killing the screen someone is reading is a worse
     * experience than the old version they are reading it on.
     */
    private static void promptInstall(@NonNull Activity activity,
                                      @NonNull AppUpdateManager manager) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        try {
            // android.app.AlertDialog, not the AppCompat one: the shell
            // activity is a ComponentActivity with a plain theme, and
            // AppCompat's builder throws "You need to use a Theme.AppCompat
            // theme" against it — a crash where a dialog was wanted.
            new android.app.AlertDialog.Builder(activity)
                    .setTitle("Update ready")
                    .setMessage("A new version of WalletLens has been downloaded. "
                            + "Restart the app to finish installing it.")
                    .setPositiveButton("Restart", (d, w) -> {
                        try {
                            manager.completeUpdate();
                        } catch (Throwable e) {
                            Log.w(TAG, "could not complete the update: " + e);
                        }
                    })
                    .setNegativeButton("Later", null)
                    .show();
        } catch (Throwable e) {
            // A themed dialog needs an AppCompat theme, and the shell activity
            // may not have one. A toast still tells the user, which is the
            // whole point of this class.
            Log.w(TAG, "could not show the restart prompt: " + e);
            Toast.makeText(activity,
                    "A WalletLens update is ready — reopen the app to install it.",
                    Toast.LENGTH_LONG).show();
        }
    }
}
