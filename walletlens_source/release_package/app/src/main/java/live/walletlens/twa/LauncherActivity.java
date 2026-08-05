package live.walletlens.twa;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

/**
 * WalletLens TWA LauncherActivity.
 *
 * Notification-permission handling is delegated to the AndroidBrowserHelper
 * base class. Because {@code enableNotifications} is on, the base
 * {@link com.google.androidbrowserhelper.trusted.LauncherActivity} requests
 * {@code POST_NOTIFICATIONS} at launch via its own
 * {@code NotificationPermissionRequestActivity} and defers launching the TWA
 * until the user responds — so the permission dialog is shown reliably and is
 * never killed by the browser launch.
 *
 * History / gotchas:
 *  - Requesting the permission manually here (the previous approach) races with
 *    the base class finishing this activity to launch the TWA, so the dialog
 *    flashed and disappeared ("app doesn't ask for permission"). Removed.
 *  - An even earlier version returned from onResume() WITHOUT calling
 *    super.onResume() to "defer" the launch, which threw
 *    android.util.SuperNotCalledException and crashed the app on first launch.
 *    super.onResume() is ALWAYS called now.
 *  - Background notifications are scheduled UNCONDITIONALLY (WorkManager needs
 *    no permission to enqueue work). The worker simply won't display anything
 *    until the permission is granted — which is why price alerts now arrive
 *    even when the app is closed, without the user hunting through settings.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int TEST_NOTIF_MAX_LAUNCHES = 5;

    private boolean postLaunchDone = false;
    private String savedLaunchUrl = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Do not lock orientation. Android 16 ignores orientation/resizability
        // restrictions on large-screen devices (foldables, tablets), and forcing
        // portrait here only degrades the experience on those form factors. Let
        // the activity follow the device/sensor orientation.
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);

        // Record the launch URL for analytics / biometric redirect. Read it
        // defensively from the intent — calling getLaunchingUrl() here (before
        // the base class has finished initialising) previously threw an NPE.
        try {
            Intent intent = getIntent();
            Uri data = intent != null ? intent.getData() : null;
            if (data != null) {
                savedLaunchUrl = data.toString();
                Log.d(TAG, "Saved launch URL: " + savedLaunchUrl);
            }
        } catch (Throwable e) {
            Log.w(TAG, "could not read launch URL: " + e.getMessage());
        }

        // Show the crash whenever one has not been seen yet, however long ago.
        //
        // This was gated to fifteen minutes, which was wrong for the crash it
        // was built to catch: the fault fires from the background worker while
        // nobody is holding the phone, so by the time the app is next opened
        // the window has always expired and the trace is never shown. A record
        // only exists if the app actually crashed, and it is marked seen once
        // displayed, so "unseen" is the whole condition worth having.
        try {
            if (CrashReporter.hasUnseenCrash(this)) {
                startActivity(new Intent(this, CrashLogActivity.class));
                finish();
                return;
            }
        } catch (Throwable e) {
            Log.w(TAG, "crash notice failed: " + e);
        }

        // Both of these were unguarded, which made them the only paths in
        // onCreate that could stop the app opening at all. Neither is load
        // bearing for showing the site: a malformed deep link or a biometric
        // stack that misbehaves on some OEM build should cost you the lock
        // screen, not the app. Throwable rather than Exception for the same
        // reason as WalletLensApp — a shrunk-away class arrives as an Error.
        try {
            // Handle custom walletlens:// intents (biometric enable/disable/unlock).
            handleWebAppIntent(getIntent());
        } catch (Throwable e) {
            Log.w(TAG, "intent handling failed: " + e);
        }

        try {
            // Cold-start biometric gate. If a lock is required this redirects to
            // BiometricActivity and finishes, so the TWA is not shown underneath.
            handleColdStartBiometric();
        } catch (Throwable e) {
            // Failing open is deliberate. The alternative is an app that cannot
            // be opened, and the data behind the gate is already on a device
            // the user has unlocked.
            Log.w(TAG, "cold-start biometric gate failed, continuing: " + e);
        }
    }

    @Override
    protected void onResume() {
        // ALWAYS call through to super — the framework enforces this, and the
        // base class uses it to request the notification permission and then
        // launch the TWA. (See the class comment above.)
        super.onResume();

        if (postLaunchDone) return;
        postLaunchDone = true;

        // Best-effort telemetry + notification scheduling — never let it crash
        // the launch (a throw here shows as "this app has a bug" on start).
        try {
            if (savedLaunchUrl != null) {
                AnalyticsHelper.getInstance().trackAppLaunchUrl(savedLaunchUrl);
            }

            // Schedule the background price-alert worker UNCONDITIONALLY.
            // Enqueuing WorkManager work needs no runtime permission; the worker
            // only displays a notification once POST_NOTIFICATIONS is granted
            // (which the base class requests at launch). This is what makes
            // alerts arrive while the app is closed.
            NotificationScheduler.schedule(this);
            NotificationScheduler.scheduleImmediate(this);

            // Welcome/test notification — harmlessly dropped by the OS if the
            // permission hasn't been granted yet.
            fireTestNotificationIfNeeded();
        } catch (Throwable e) {
            Log.w(TAG, "post-launch setup failed: " + e.getMessage());
        }
    }

    /**
     * The biometric_auth value on the launch URL, or null if there isn't one.
     *
     * Read off the intent rather than remembered in a field: BiometricActivity
     * starts a fresh LauncherActivity, so there is no instance state to carry
     * the answer across.
     */
    private String biometricOutcome() {
        try {
            Intent intent = getIntent();
            Uri data = intent != null ? intent.getData() : null;
            if (data == null || data.getQuery() == null) return null;
            return data.getQueryParameter("biometric_auth");
        } catch (Throwable e) {
            // A malformed URL must not decide whether the app opens.
            Log.w(TAG, "could not read biometric outcome: " + e);
            return null;
        }
    }

    // ── Intent handling ─────────────────────────────────────────────────

    private void handleWebAppIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;

        Uri data = intent.getData();
        String scheme = data.getScheme();
        String host = data.getHost();

        if (!"walletlens".equalsIgnoreCase(scheme)) return;

        switch (host != null ? host : "") {
            case "biometric":
            case "biometrics":
                handleBiometricIntent(data);
                break;
            case "crashlog":
                // Deliberate route in, for when the app is working and someone
                // wants the record of the last time it was not.
                startActivity(new Intent(this, CrashLogActivity.class));
                finish();
                break;
            default:
                Log.w(TAG, "Unknown intent host: " + host);
        }
    }

    private void handleBiometricIntent(Uri data) {
        String action = data.getQueryParameter("action");
        if (action == null) action = "unlock";
        switch (action) {
            case "enable":
                BiometricActivity.setEnabled(this, true);
                Toast.makeText(this, "Biometric lock enabled", Toast.LENGTH_SHORT).show();
                break;
            case "disable":
                BiometricActivity.setEnabled(this, false);
                Toast.makeText(this, "Biometric lock disabled", Toast.LENGTH_SHORT).show();
                break;
            case "unlock":
            default:
                if (!BiometricActivity.isEnabled(this)) return;
                Intent i = new Intent(this, BiometricActivity.class);
                i.putExtra(BiometricActivity.EXTRA_REDIRECT_URL,
                        savedLaunchUrl != null ? savedLaunchUrl : "https://walletlens.live/dashboard");
                i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(i);
                break;
        }
    }

    // ── Cold-start biometric ─────────────────────────────────────────────

    private void handleColdStartBiometric() {
        if (!BiometricActivity.isEnabled(this)) return;

        // Are we arriving back from the gate rather than approaching it?
        //
        // BiometricActivity finishes by starting this activity again with the
        // outcome on the URL. Without reading it, every non-success outcome
        // came back to a session that was still invalid, so the gate opened
        // again immediately: launcher → prompt → cancel → launcher → prompt,
        // until the task collapsed and the app vanished. That is the "starts
        // and then closes by itself" report, and it only became reachable once
        // the theme crash was fixed and BiometricActivity could actually run.
        String outcome = biometricOutcome();
        if (outcome != null) {
            switch (outcome) {
                case BiometricActivity.STATUS_UNAVAILABLE:
                    // The device cannot ask — no hardware, or enrolments were
                    // removed after the lock was turned on. Refusing entry here
                    // would strand someone permanently in front of data that
                    // exists nowhere but this phone. Let them in and turn the
                    // lock off, so it does not happen again next launch.
                    Log.w(TAG, "Biometrics unavailable — disabling app lock and continuing");
                    BiometricActivity.setEnabled(this, false);
                    return;

                case BiometricActivity.STATUS_CANCEL:
                    // A deliberate refusal. Closing is correct — showing the
                    // portfolio anyway would make the lock decorative — but it
                    // has to be one clean finish, not another trip round.
                    Log.d(TAG, "Unlock cancelled — closing");
                    finish();
                    return;

                default: // success
                    return;
            }
        }

        if (BiometricActivity.isSessionValid(this)) return;

        Log.d(TAG, "Cold-start biometric required");
        Intent i = new Intent(this, BiometricActivity.class);
        i.putExtra(BiometricActivity.EXTRA_REDIRECT_URL,
                savedLaunchUrl != null ? savedLaunchUrl : "https://walletlens.live/dashboard");
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(i);
        finish();
    }

    // ── Test notifications ───────────────────────────────────────────────

    private void fireTestNotificationIfNeeded() {
        SharedPreferences prefs = getSharedPreferences("launch_count", Context.MODE_PRIVATE);
        int launches = prefs.getInt("launches", 0);
        if (launches >= TEST_NOTIF_MAX_LAUNCHES) return;

        // Don't fire (or burn a launch slot) until the permission actually
        // exists — otherwise the welcome notifications are silently consumed on
        // the very first launches before the user has granted permission.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this,
                    android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        prefs.edit().putInt("launches", launches + 1).apply();
        new NotificationHelper(this).createChannels();

        String[] msgs = {
            "WalletLens notifications active! Price alerts, tips and insights coming.",
            "Welcome back! Market updates delivered through this channel.",
            "Notifications active! Stay informed with real-time market moves."
        };
        String body = msgs[Math.min(launches, msgs.length - 1)];
        NotificationHelper h = new NotificationHelper(this);
        h.showAlertNotification("📈 WalletLens Active", body, "https://walletlens.live/dashboard");

        if (launches == 0) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                NotificationHelper h2 = new NotificationHelper(this);
                h2.showAlertNotification("📈 Price Alerts Ready",
                    "Your portfolio is being monitored.",
                    "https://walletlens.live/dashboard");
            }, 2000);
        }
    }
}
