package live.walletlens.twa;

import android.Manifest;
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

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

/**
 * WalletLens TWA LauncherActivity.
 *
 * Requests the notification permission on first launch and runs the cold-start
 * biometric gate, then lets the AndroidBrowserHelper base class launch the TWA
 * normally.
 *
 * IMPORTANT — first-run crash history: an earlier version tried to "defer" the
 * TWA launch by returning from {@link #onResume()} WITHOUT calling
 * {@code super.onResume()} while the notification-permission dialog was up.
 * Android's framework requires every {@code onResume()} to call through to
 * super; skipping it throws {@link android.util.SuperNotCalledException} in
 * {@code Activity.performResume()} and crashed the app on first launch with
 * "this app has a bug" (it only reproduced before the permission was granted,
 * which is why it looked like a cold-start / cache issue). super.onResume() is
 * now ALWAYS called. Notification permission no longer gates the launch — the
 * system dialog coexists with the launching TWA, and the library also handles
 * POST_NOTIFICATIONS on its own.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;
    private static final int TEST_NOTIF_MAX_LAUNCHES = 5;

    private boolean askedPermission = false;
    private boolean postLaunchDone = false;
    private String savedLaunchUrl = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

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
        } catch (Exception e) {
            Log.w(TAG, "could not read launch URL: " + e.getMessage());
        }

        // Handle custom walletlens:// intents (biometric enable/disable/unlock).
        handleWebAppIntent(getIntent());

        // Ask for the notification permission on first launch. This does NOT
        // gate the TWA launch — the base class proceeds normally and the system
        // dialog appears alongside it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                askedPermission = true;
                try {
                    requestPermissions(
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            REQUEST_CODE_POST_NOTIFICATIONS);
                } catch (Exception e) {
                    Log.w(TAG, "permission request failed: " + e.getMessage());
                }
            }
        }

        // Cold-start biometric gate. If a lock is required this redirects to
        // BiometricActivity and finishes, so the TWA is not shown underneath.
        handleColdStartBiometric();
    }

    @Override
    protected void onResume() {
        // ALWAYS call through to super — the framework enforces this, and the
        // base class uses it to launch the TWA. (See the class comment above.)
        super.onResume();

        if (postLaunchDone) return;
        postLaunchDone = true;

        // Everything below is best-effort telemetry/notifications — never let it
        // crash the launch (a throw here shows as "this app has a bug" on start).
        try {
            if (savedLaunchUrl != null) {
                AnalyticsHelper.getInstance().trackAppLaunchUrl(savedLaunchUrl);
            }

            // Schedule background notifications if permission is granted.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || ContextCompat.checkSelfPermission(this,
                        Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                fireTestNotificationIfNeeded();
                NotificationScheduler.schedule(this);
                if (!askedPermission) {
                    // Permission was already granted before this session.
                    NotificationScheduler.scheduleImmediate(this);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "post-launch setup failed: " + e.getMessage());
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

    // ── Permission result ────────────────────────────────────────────────

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != REQUEST_CODE_POST_NOTIFICATIONS) return;

        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;

        if (granted) {
            Log.d(TAG, "Permission GRANTED — firing test notifications + scheduling worker");
            try {
                fireTestNotificationIfNeeded();
                NotificationScheduler.schedule(this);
                NotificationScheduler.scheduleImmediate(this);
            } catch (Exception e) {
                Log.w(TAG, "post-permission setup failed: " + e.getMessage());
            }
        } else {
            Log.w(TAG, "Permission DENIED — showing rationale");
            Toast.makeText(this,
                    "⚠️ Notification permission is needed for price alerts and updates.\n" +
                    "Enable in: Settings > Apps > WalletLens > Notifications",
                    Toast.LENGTH_LONG).show();
        }
    }
}
