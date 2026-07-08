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
 * <p>Handles cold-start biometric lock, notification permission requests,
 * and test notifications for first launches.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "WalletLensLauncher";
    private static final int REQUEST_CODE_POST_NOTIFICATIONS = 1001;
    private static final int TEST_NOTIF_MAX_LAUNCHES = 5;

    private boolean permissionAskedThisSession = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        // ── Handle intent actions from the web app ─────────────────────
        handleWebAppIntent(getIntent());

        // ── Handle biometric lock (cold start) ─────────────────────────
        // MUST be called AFTER handleWebAppIntent so that newly-enabled
        // biometric takes effect on this same launch cycle.
        handleColdStartBiometric();

        // ── Notification permission (Android 13+) ──────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    requestPermissions(
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            REQUEST_CODE_POST_NOTIFICATIONS);
                    permissionAskedThisSession = true;
                }, 800);
            }
        }

        Log.d(TAG, "WalletLens TWA initialised");
    }

    @Override
    protected void onResume() {
        super.onResume();

        // Track the launch URL
        Uri launchUri = getLaunchingUrl();
        if (launchUri != null) {
            String url = launchUri.toString();
            Log.d(TAG, "Launch URL: " + url);
            AnalyticsHelper.getInstance().trackAppLaunchUrl(url);
        }

        // Fire a test notification so you can verify immediately
        fireTestNotificationIfNeeded();
    }

    // ── Intent handling from web app ─────────────────────────────────────

    /**
     * The web app communicates with native code via custom intent URLs.
     * Supported actions:
     * <ul>
     *   <li>{@code walletlens://biometric/enable} – enable biometric lock</li>
     *   <li>{@code walletlens://biometric/disable} – disable biometric lock</li>
     *   <li>{@code walletlens://biometric/unlock} – trigger unlock prompt</li>
     * </ul>
     */
    private void handleWebAppIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;

        Uri data = intent.getData();
        String scheme = data.getScheme();
        String host = data.getHost();

        // Only handle walletlens:// scheme
        if (!"walletlens".equalsIgnoreCase(scheme)) return;

        Log.d(TAG, "Handling web app intent: " + data.toString());

        switch (host != null ? host : "") {
            case "biometric":
            case "biometric-auth":
                handleBiometricIntent(data);
                break;
            default:
                Log.w(TAG, "Unknown intent host: " + host);
        }
    }

    private void handleBiometricIntent(Uri data) {
        String action = data.getQueryParameter("action");
        if (action == null) {
            // Default action: authenticate
            action = "unlock";
        }

        switch (action) {
            case "enable":
                BiometricActivity.setEnabled(this, true);
                Toast.makeText(this, "Biometric lock enabled", Toast.LENGTH_SHORT).show();
                Log.d(TAG, "Biometric lock enabled via intent");
                break;

            case "disable":
                BiometricActivity.setEnabled(this, false);
                Toast.makeText(this, "Biometric lock disabled", Toast.LENGTH_SHORT).show();
                Log.d(TAG, "Biometric lock disabled via intent");
                break;

            case "unlock":
            default:
                // Start BiometricActivity to show the native prompt
                Intent bioIntent = new Intent(this, BiometricActivity.class);
                String redirect = data.getQueryParameter("redirect");
                if (redirect != null) {
                    bioIntent.putExtra(BiometricActivity.EXTRA_REDIRECT_URL, redirect);
                }
                startActivity(bioIntent);
                break;
        }
    }

    // ── Cold-start biometric check ───────────────────────────────────────

    /**
     * If the user has enabled biometric lock and the session has expired,
     * redirect to {@link BiometricActivity} before loading the TWA.
     *
     * <p>This effectively replaces the TWA content with a native biometric
     * prompt. Once authenticated the user returns here and the TWA loads.
     */
    private void handleColdStartBiometric() {
        if (!BiometricActivity.isEnabled(this)) return;
        if (BiometricActivity.isSessionValid(this)) return;

        Log.d(TAG, "Cold-start biometric required – redirecting to BiometricActivity");

        // Build a redirect URL back to this activity with the original launch URL
        String redirectUrl = "https://walletlens.live/dashboard";
        Uri launchUri = getLaunchingUrl();
        if (launchUri != null) {
            redirectUrl = launchUri.toString();
        }

        Intent bioIntent = new Intent(this, BiometricActivity.class);
        bioIntent.putExtra(BiometricActivity.EXTRA_REDIRECT_URL, redirectUrl);
        // Use NEW_TASK + CLEAR_TOP so the biometric activity replaces this one
        bioIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(bioIntent);
        // Finish this activity so it's removed from the back stack
        finish();
    }

    // ── Test notifications ───────────────────────────────────────────────

    /**
     * Shows a test notification on the first few launches to verify the
     * app's notification channel works correctly.
     */
    private void fireTestNotificationIfNeeded() {
        SharedPreferences prefs = getSharedPreferences("launch_count", Context.MODE_PRIVATE);
        int launches = prefs.getInt("launches", 0);

        if (launches < TEST_NOTIF_MAX_LAUNCHES) {
            prefs.edit().putInt("launches", launches + 1).apply();

            // Ensure notification channels exist
            new NotificationHelper(this).createChannels();

            String[] testMessages = {
                    "📊 Track · Analyze · Grow — WalletLens notifications are active! You'll receive price alerts for crypto, stocks, gold, and silver right here.",
                    "👋 Welcome back! Price alerts, portfolio updates, and market insights delivered through this channel.",
                    "🔔 Notifications active! Stay informed with real-time market moves and smart feature tips."
            };

            String title = "📈 WalletLens Active";
            String body = testMessages[Math.min(launches, testMessages.length - 1)];

            NotificationHelper helper = new NotificationHelper(this);
            helper.showAlertNotification(title, body, "https://walletlens.live/dashboard");

            // Force notification to show immediately by sending a second one if this is first launch
            if (launches == 0) {
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    NotificationHelper h2 = new NotificationHelper(this);
                    h2.showAlertNotification(
                        "📈 Price Alerts Ready",
                        "Your portfolio is being monitored. You'll be notified when your assets move more than 1%.",
                        "https://walletlens.live/dashboard"
                    );
                }, 2000);
            }

            Log.d(TAG, "Test notification fired (launch #" + (launches + 1) + "/" + TEST_NOTIF_MAX_LAUNCHES + ")");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_CODE_POST_NOTIFICATIONS && permissionAskedThisSession) {
            permissionAskedThisSession = false;

            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS permission granted by user");
                fireTestNotificationIfNeeded();
            } else {
                Log.w(TAG, "POST_NOTIFICATIONS permission denied by user");
                Toast.makeText(this,
                        "Notification permission is needed for price alerts " +
                        "and market updates.\nYou can enable it later in " +
                        "Settings > Apps > WalletLens > Notifications.",
                        Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
