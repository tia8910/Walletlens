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

    /** Values for the biometric_auth query parameter LauncherActivity reads. */
    public static final String STATUS_SUCCESS     = "success";
    public static final String STATUS_CANCEL      = "cancel";
    public static final String STATUS_UNAVAILABLE = "unavailable";

    /**
     * How many times a transient sensor error re-offers the prompt.
     *
     * <p>Two, deliberately small. Enough to ride out a face read that timed
     * out or a sensor the system briefly took away, not enough to sit there
     * re-arming a prompt forever if something is genuinely wrong.
     */
    private static final int MAX_TRANSIENT_RETRIES = 2;

    /** Long enough for the previous prompt to be fully gone before the next. */
    private static final long RETRY_DELAY_MS = 350L;

    private BiometricPrompt biometricPrompt;
    private BiometricPrompt.PromptInfo promptInfo;
    private int retriesLeft = MAX_TRANSIENT_RETRIES;

    /**
     * Whether the prompt has been asked for. onResume runs again every time
     * the activity comes back to the foreground — the notification shade being
     * dismissed, a screen-off and on — and each of those would otherwise stack
     * another prompt on the one already showing. Re-arming after a transient
     * error is the error callback's job, and it has its own bounded retry.
     */
    private boolean promptShown = false;

    /**
     * True when this run exists to TURN THE LOCK ON, not to open the app.
     *
     * The prompt is the same; what happens after it is not. On success the
     * preference is written and the activity simply finishes, back to the page
     * that asked — no redirect, because the app was never locked.
     */
    private boolean enabling = false;

    /**
     * True when the prompt was raised by the bridge and must NOT relaunch.
     *
     * The redirect path delivers its result by restarting the app with
     * ?biometric_auth=success on the URL, which is three fragile steps — an
     * intent that needs a live user activation, a top-frame navigation, and a
     * cold start that has to carry the parameter through. Called from the
     * bridge there is nothing to deliver: the unlock timestamp is written
     * where isSessionValid already reads it, and the page asks.
     */
    private boolean silent = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Handle enable/disable actions from web app intents ──────────
        // The TWA sends walletlens://biometric-auth?action=enable|disable|unlock
        // For enable/disable we only set/clear the SharedPreference — no prompt.
        //
        // These finish() straight away instead of calling redirectBack(). That
        // matters more than it looks: redirectBack starts LauncherActivity with
        // FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP, which tears the
        // running task down and cold-starts the TWA on a fresh Custom Tab. The
        // web app is reloaded from its start URL with sessionStorage gone.
        //
        // For "enable" that was destructive in a very visible way: the toggle
        // lives on slide 3 of the first-run onboarding, and onboarding only
        // records completion on slide 4. Enabling the lock relaunched the app
        // before the flag was ever written, so the user was dropped back on
        // slide 1 and onboarding appeared to restart from the beginning.
        //
        // Nothing here needs a relaunch. The web side has already written its
        // own localStorage flag before firing the intent, and this activity is
        // started from Chrome's task, so finish() simply returns to the Custom
        // Tab that is still sitting underneath — same page, same scroll, same
        // onboarding slide.
        Intent intent = getIntent();
        if (intent != null && intent.getData() != null) {
            String action = intent.getData().getQueryParameter("action");
            if ("enable".equals(action)) {
                // VERIFY, then enable. This used to write the preference and
                // finish, with no prompt at all — so "Enable" on the onboarding
                // slide asked for nothing, showed nothing but a toast, and moved
                // on. Nothing about it looked like it had worked, and nothing
                // had confirmed the user could actually pass the lock they had
                // just switched on. Someone whose only enrolled fingerprint no
                // longer reads would have locked themselves out of their own
                // portfolio and found out on the next cold start.
                //
                // So it falls through to the prompt below instead of returning.
                enabling = true;
            } else if ("unlock".equals(action)
                    && "1".equals(intent.getData().getQueryParameter("noredirect"))) {
                // Raised by the bridge. Fall through to the prompt, then finish
                // without relaunching anything.
                silent = true;
            } else if ("disable".equals(action)) {
                setEnabled(this, false);
                Log.d(TAG, "Biometric lock disabled via intent");
                Toast.makeText(this, "🔓 Biometric lock disabled", Toast.LENGTH_SHORT).show();
                finish();
                return;
            }
        }

        // Check that SOMETHING here can authenticate the user.
        //
        // The mask has to be the same one the prompt is built with, below:
        // asking whether a fingerprint is usable and then showing a prompt that
        // also accepts the device PIN would turn away a phone that can in fact
        // let its owner in.
        BiometricManager biometricManager = BiometricManager.from(this);
        int canAuth = biometricManager.canAuthenticate(allowedAuthenticators());

        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            String errorMsg = getBiometricErrorString(canAuth);
            Log.w(TAG, "Biometric not available: " + errorMsg);
            Toast.makeText(this,
                    "Biometric authentication is not available on this device: " + errorMsg,
                    Toast.LENGTH_LONG).show();
            // Not a refusal — the device cannot ask. A lock nothing can open
            // is not security, it is a locked-out owner, so the lock comes off
            // rather than the user being barred from an app whose data lives
            // only on this device.
            //
            // The redirect is for the cold-start path only. Called from the
            // bridge (silent) or from the settings toggle (enabling) the app is
            // already running underneath, and relaunching it here would throw
            // away the page — clearing the preference is the whole answer,
            // because isSessionValid reports an unlocked app once the lock is
            // off and that is exactly what the page is polling for.
            setEnabled(this, false);
            if (silent || enabling) {
                finish();
                return;
            }
            redirectBack(STATUS_UNAVAILABLE);
            return;
        }

        // Build the prompt info
        BiometricPrompt.PromptInfo.Builder builder =
                new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("WalletLens")
                        .setSubtitle("Unlock your portfolio")
                        .setDescription(credentialFallback()
                                ? "Use your fingerprint, face, or screen lock to unlock the app"
                                : "Use your fingerprint or face to unlock the app")
                        .setAllowedAuthenticators(allowedAuthenticators());

        // The negative button is only legal WITHOUT a device credential: the
        // builder throws if both are set, because the credential path supplies
        // its own "Use PIN" affordance and its own cancel.
        if (!credentialFallback()) builder.setNegativeButtonText("Cancel");

        promptInfo = builder.build();

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

                        // Both branches used to end in redirectBack(false), which
                        // the launcher reads as STATUS_CANCEL and treats as a
                        // deliberate refusal — it calls finish() and the app
                        // closes. So every transient sensor hiccup looked exactly
                        // like the user saying no.
                        //
                        // That is not a rare path. ERROR_TIMEOUT fires whenever a
                        // face is not presented quickly enough, ERROR_CANCELED
                        // whenever the system takes the sensor away — a
                        // notification shade pulled down, the screen changing
                        // state — and ERROR_VENDOR is what several OEM face
                        // implementations report on an ordinary failed read. None
                        // of those is a refusal, and closing the app on them is
                        // the "it says cancelled and shuts" report.
                        if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || errorCode == BiometricPrompt.ERROR_USER_CANCELED) {
                            // An actual refusal. Closing is correct here: showing
                            // the portfolio anyway would make the lock decorative.
                            redirectBack(false);
                            return;
                        }

                        if (errorCode == BiometricPrompt.ERROR_LOCKOUT
                                || errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
                            // Too many failed attempts. Retrying is pointless —
                            // the sensor refuses until the cooldown expires — and
                            // silently closing leaves the user with no idea why.
                            Toast.makeText(BiometricActivity.this,
                                    credentialFallback()
                                            ? "Too many attempts. Reopen WalletLens and use your screen lock."
                                            : "Too many attempts. Wait a moment and reopen WalletLens.",
                                    Toast.LENGTH_LONG).show();
                            redirectBack(false);
                            return;
                        }

                        // Everything else is transient: offer the prompt again
                        // rather than throwing the user out of the app.
                        //
                        // Bounded, and that bound is the point. ERROR_CANCELED
                        // also arrives when this activity is going away, and an
                        // unbounded retry there would re-arm the prompt against a
                        // dying window — the shape of the launcher loop this file
                        // has already been through once.
                        if (retriesLeft > 0 && !isFinishing() && !isDestroyed()) {
                            retriesLeft--;
                            Log.d(TAG, "Transient biometric error; retrying ("
                                    + retriesLeft + " left)");
                            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                                if (!isFinishing() && !isDestroyed()) {
                                    biometricPrompt.authenticate(promptInfo);
                                }
                            }, RETRY_DELAY_MS);
                            return;
                        }

                        Toast.makeText(BiometricActivity.this,
                                "Authentication error: " + errString,
                                Toast.LENGTH_SHORT).show();
                        redirectBack(false);
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                        // Biometric recognized but didn't match — do nothing,
                        // the system dialog already shows "not recognized".
                        Log.d(TAG, "Biometric authentication failed (no match)");
                    }
                });

        // The prompt itself is armed from onResume(), not here. See below.
    }

    /**
     * Whether the prompt may fall back to the phone's PIN, pattern or password.
     *
     * <p>This exists because the lock had no way out. The prompt allowed
     * biometrics and nothing else, so a finger the sensor had stopped reading —
     * a cut, a wet hand, a re-enrolment that invalidated the old template, an
     * OEM face unlock that quietly stopped working after an update — left the
     * owner of the device standing in front of their own portfolio with no
     * second way in and no way to turn the lock off, because the setting that
     * turns it off is behind the lock.
     *
     * <p>API 30, deliberately. {@code DEVICE_CREDENTIAL} cannot be combined
     * with {@code BIOMETRIC_WEAK} on 28 and 29 — the builder throws — and this
     * app's minSdk is 23, so the older devices keep the biometric-only prompt
     * with its Cancel button. They are not made worse; the modern ones are made
     * escapable.
     */
    private static boolean credentialFallback() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
    }

    /** The authenticators both {@code canAuthenticate} and the prompt use. */
    private static int allowedAuthenticators() {
        int biometric = BiometricManager.Authenticators.BIOMETRIC_STRONG
                | BiometricManager.Authenticators.BIOMETRIC_WEAK;
        return credentialFallback()
                ? biometric | BiometricManager.Authenticators.DEVICE_CREDENTIAL
                : biometric;
    }

    /**
     * Show the prompt, once, as soon as the activity is actually resumed.
     *
     * <p>It used to be armed from the end of {@code onCreate} on a 400ms
     * {@code postDelayed}, "for smooth animation". That is the bug behind
     * "the fingerprint doesn't respond the first time".
     *
     * <p>{@link BiometricPrompt} is implemented as a headless Fragment, so
     * {@code authenticate()} commits a fragment transaction and needs the host
     * activity to be at least STARTED for it to be honoured. On a cold start
     * this activity is launched from {@code LauncherActivity.onCreate} while
     * that activity is still tearing itself down, and the window has to be
     * created, themed (translucent) and given focus before this one is
     * resumed. 400ms is a guess at how long all of that takes, and on the
     * first launch after install — the slowest one there is, with nothing warm
     * and the TWA starting Chrome alongside — the guess is short. The
     * transaction is dropped and no dialog is ever shown.
     *
     * <p>It looked intermittent because it is: a warm second attempt resumes
     * in a fraction of the time, so the same code works on the retry and the
     * fault reads as "the sensor was slow" rather than "the prompt was never
     * asked for".
     *
     * <p>onResume is the state the transaction actually requires, so waiting
     * for it is both correct and faster than the timer it replaces. The work
     * is posted rather than run inline because {@code authenticate()} commits
     * that transaction, and committing from inside the lifecycle callback is
     * what exposes it to "state already saved".
     */
    @Override
    protected void onResume() {
        super.onResume();

        // Null on the paths that finished in onCreate without building a
        // prompt: the enable/disable intents, and a device that cannot ask.
        if (promptShown || biometricPrompt == null || promptInfo == null) return;
        promptShown = true;

        new Handler(Looper.getMainLooper()).post(() -> {
            if (!isFinishing() && !isDestroyed()) {
                biometricPrompt.authenticate(promptInfo);
            }
        });
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

        if (silent) {
            // The timestamp above is the whole result. isSessionValid reads it,
            // the bridge exposes that, and the page is polling for it — so
            // finishing here returns to an app that is already unlocked.
            Log.d(TAG, "unlocked without a relaunch");
            finish();
            return;
        }

        if (enabling) {
            // Turning the lock ON, with the fingerprint now proven to work.
            // No redirect: the app is running underneath and was never locked,
            // and relaunching it here is what once dropped users back to slide
            // one of onboarding.
            setEnabled(this, true);
            Log.d(TAG, "Biometric lock enabled after a successful prompt");
            Toast.makeText(this, "🔒 App Lock is on", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        redirectBack(true);
    }

    // ── Redirect back ────────────────────────────────────────────────────

    /**
     * After authentication (success or cancel), redirect the user back to
     * the web app or the main TWA activity.
     */
    private void redirectBack(boolean success) {
        redirectBack(success ? STATUS_SUCCESS : STATUS_CANCEL);
    }

    /**
     * @param status one of STATUS_SUCCESS, STATUS_CANCEL, STATUS_UNAVAILABLE.
     *               LauncherActivity reads it back off the URL and must act on
     *               all three differently — passing a bare boolean is what let
     *               "cancelled" and "no biometric hardware" collapse into the
     *               same answer, and neither could be told apart from "never
     *               asked", which is what produced the relaunch loop.
     */
    private void redirectBack(String status) {
        // Nothing to redirect to when the app is already on screen.
        //
        // Both of these paths were started by a page that is still running
        // underneath this activity: the bridge unlock polls for the result, and
        // the settings toggle just wants its prompt answered. Restarting the
        // app to deliver a status parameter would take the user off whatever
        // they were doing — which is precisely how enabling the lock used to
        // drop people back on slide one of onboarding.
        if (silent || enabling) {
            finish();
            return;
        }

        String redirectUrl = getIntent().getStringExtra(EXTRA_REDIRECT_URL);

        // Also accept the redirect as a query parameter on the launch URI.
        // The web app has always sent it that way — sendNativeIntent() appends
        // "&redirect=<encoded url>" — but this method only ever read the Intent
        // extra, which the web has no way to set. The parameter was therefore
        // discarded on every call and the hard-coded /dashboard below was used
        // instead, so an unlock from any other route silently moved the user.
        if (redirectUrl == null || redirectUrl.isEmpty()) {
            Uri data = getIntent().getData();
            if (data != null) {
                try {
                    String fromQuery = data.getQueryParameter("redirect");
                    // Only same-origin URLs. This value arrives from a browsable
                    // intent filter, so any installed app can send one; without
                    // this check a malicious caller could point the TWA at a
                    // page of their choosing carrying biometric_auth=success.
                    if (fromQuery != null && fromQuery.startsWith("https://walletlens.live/")) {
                        redirectUrl = fromQuery;
                    }
                } catch (UnsupportedOperationException ignored) {
                    // Opaque URI — no query parameters to read.
                }
            }
        }

        if (redirectUrl != null && !redirectUrl.isEmpty()) {
            // Append result parameter
            Uri.Builder builder = Uri.parse(redirectUrl).buildUpon();
            builder.appendQueryParameter("biometric_auth", status);
            redirectUrl = builder.build().toString();
        } else {
            // Default: go to TWA dashboard
            redirectUrl = "https://walletlens.live/dashboard?biometric_auth=" + status;
        }

        // deepLink rather than setData: redirectUrl can arrive as a query
        // parameter on the launch URI, which the web app sets, so it is not
        // this app's own string by the time it gets here.
        startActivity(AppEntry.deepLink(this, redirectUrl));
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
