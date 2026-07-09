package live.walletlens.twa;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import java.util.concurrent.Executor;

/**
 * Native biometric authentication activity for WalletLens.
 *
 * <p>Uses AndroidX {@link BiometricPrompt} to show the <b>system</b>
 * fingerprint / face unlock dialog (same look as banking apps), instead
 * of the Chrome WebAuthn dialog.
 *
 * <p>The activity can be launched in two ways:
 * <ul>
 *   <li><b>Cold start</b> – triggered from {@link LauncherActivity} when
 *       the user has biometric lock enabled.</li>
 *   <li><b>In-app unlock</b> – triggered from the web app via a custom
 *       intent URL: {@code walletlens://biometric-auth}.</li>
 * </ul>
 *
 * <p>On success a SharedPreference token is written so the app stays
 * unlocked for the current "session". On failure the user can retry
 * or cancel (which returns them to the lock screen).
 */
public class BiometricActivity extends AppCompatActivity {

    private static final String TAG = "WalletLensBiometric";

    // ── SharedPreferences keys ───────────────────────────────────────────

    /** Boolean: whether the user has opted into biometric lock. */
    public static final String PREF_BIOMETRIC_ENABLED = "biometric_enabled";
    /** Long: timestamp (epoch ms) of the last successful unlock. */
    public static final String PREF_LAST_UNLOCK_TS    = "biometric_last_unlock_ts";
    /** Preference file name. */
    private static final String PREFS_NAME = "walletlens_biometric";

    /** Session timeout: re-prompt after 5 minutes of inactivity. */
    private static final long SESSION_DURATION_MS = 5 * 60 * 1000;

    /** Intent extra: URL to return to after successful auth. */
    public static final String EXTRA_REDIRECT_URL = "redirect_url";

    private BiometricPrompt biometricPrompt;
    private BiometricPrompt.PromptInfo promptInfo;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Handle enable/disable actions from web app intents ──────────
        // The TWA sends walletlens://biometric-auth?action=enable|disable|unlock
        // For enable/disable we just set/clear the SharedPreference and redirect
        // back without showing the biometric prompt.
        Intent intent = getIntent();
        if (intent != null && intent.getData() != null) {
            String action = intent.getData().getQueryParameter("action");
            if ("enable".equals(action)) {
                setEnabled(this, true);
                Log.d(TAG, "Biometric lock enabled via intent");
                Toast.makeText(this, "🔒 Biometric lock enabled", Toast.LENGTH_SHORT).show();
                redirectBack(true);
                return;
            } else if ("disable".equals(action)) {
                setEnabled(this, false);
                Log.d(TAG, "Biometric lock disabled via intent");
                Toast.makeText(this, "🔓 Biometric lock disabled", Toast.LENGTH_SHORT).show();
                redirectBack(true);
                return;
            }
        }

        // Check if biometric hardware is available
        BiometricManager biometricManager = BiometricManager.from(this);
        int canAuth = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
                        | BiometricManager.Authenticators.BIOMETRIC_WEAK);

        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            String errorMsg = getBiometricErrorString(canAuth);
            Log.w(TAG, "Biometric not available: " + errorMsg);
            Toast.makeText(this,
                    "Biometric authentication is not available on this device: " + errorMsg,
                    Toast.LENGTH_LONG).show();
            redirectBack(false);
            return;
        }

        // Build the prompt info
        promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("WalletLens")
                .setSubtitle("Unlock your portfolio")
                .setDescription("Use your fingerprint or face to unlock the app")
                .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG
                                | BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .setNegativeButtonText("Cancel")
                .build();

        Executor executor = ContextCompat.getMainExecutor(this);

        biometricPrompt = new BiometricPrompt(this, executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(
                            @NonNull BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        Log.d(TAG, "Biometric authentication succeeded");
                        onAuthSuccess();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode,
                                                       @NonNull CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);
                        Log.d(TAG, "Biometric error " + errorCode + ": " + errString);

                        if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || errorCode == BiometricPrompt.ERROR_USER_CANCELED) {
                            // User pressed "Cancel" or back button
                            redirectBack(false);
                        } else {
                            // System error – show toast and redirect
                            Toast.makeText(BiometricActivity.this,
                                    "Authentication error: " + errString,
                                    Toast.LENGTH_SHORT).show();
                            redirectBack(false);
                        }
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                        // Biometric recognized but didn't match — do nothing,
                        // the system dialog already shows "not recognized".
                        Log.d(TAG, "Biometric authentication failed (no match)");
                    }
                });

        // Show the biometric prompt with a slight delay for smooth animation
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (!isFinishing() && !isDestroyed()) {
                biometricPrompt.authenticate(promptInfo);
            }
        }, 400);
    }

    // ── Auth success handler ─────────────────────────────────────────────

    private void onAuthSuccess() {
        // Save unlock timestamp
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putLong(PREF_LAST_UNLOCK_TS, System.currentTimeMillis())
                .apply();

        Log.d(TAG, "Unlock token saved – session active for "
                + (SESSION_DURATION_MS / 1000) + "s");

        redirectBack(true);
    }

    // ── Redirect back ────────────────────────────────────────────────────

    /**
     * After authentication (success or cancel), redirect the user back to
     * the web app or the main TWA activity.
     */
    private void redirectBack(boolean success) {
        String redirectUrl = getIntent().getStringExtra(EXTRA_REDIRECT_URL);

        if (redirectUrl != null && !redirectUrl.isEmpty()) {
            // Append result parameter
            Uri.Builder builder = Uri.parse(redirectUrl).buildUpon();
            builder.appendQueryParameter("biometric_auth", success ? "success" : "cancel");
            redirectUrl = builder.build().toString();
        } else {
            // Default: go to TWA dashboard
            redirectUrl = "https://walletlens.live/dashboard?biometric_auth="
                    + (success ? "success" : "cancel");
        }

        Intent intent = new Intent(this, LauncherActivity.class);
        intent.setData(Uri.parse(redirectUrl));
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private static String getBiometricErrorString(int canAuth) {
        switch (canAuth) {
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "Hardware unavailable";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "No biometrics enrolled. Please add a fingerprint or face in device Settings.";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "No biometric hardware found";
            default:
                return "Error code: " + canAuth;
        }
    }

    // ── Static helpers for LauncherActivity ──────────────────────────────

    /**
     * Check whether the user has biometric lock enabled.
     */
    public static boolean isEnabled(@NonNull Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(PREF_BIOMETRIC_ENABLED, false);
    }

    /**
     * Set biometric lock enabled/disabled from the web app.
     */
    public static void setEnabled(@NonNull Context context, boolean enabled) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(PREF_BIOMETRIC_ENABLED, enabled).apply();
        if (!enabled) {
            // Clear unlock token when disabling
            prefs.edit().remove(PREF_LAST_UNLOCK_TS).apply();
        }
        Log.d(TAG, "Biometric lock " + (enabled ? "enabled" : "disabled"));
    }

    /**
     * Check if the current session is still valid (unlocked within the
     * session duration window).
     */
    public static boolean isSessionValid(@NonNull Context context) {
        if (!isEnabled(context)) return true; // No lock = always valid
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long lastUnlock = prefs.getLong(PREF_LAST_UNLOCK_TS, 0);
        return (System.currentTimeMillis() - lastUnlock) < SESSION_DURATION_MS;
    }

    /**
     * Reset the unlock timestamp (force re-auth on next open).
     */
    public static void resetSession(@NonNull Context context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().remove(PREF_LAST_UNLOCK_TS).apply();
    }
}
