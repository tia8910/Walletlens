package live.walletlens.twa;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.Nullable;

// review:2.0.x moved off the old com.google.android.play.core.tasks.Task and
// onto GMS Tasks, which the library pulls in transitively.
import com.google.android.gms.tasks.Task;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Shows Google Play's in-app review card.
 *
 * <p>THREE WAYS IN
 * <ol>
 *   <li><b>{@link ReviewGate}, at launch</b>, with {@link #EXTRA_CONTINUE_TO_APP}
 *       set. The first ask, from the first launch. Native because it has to be:
 *       once the Custom Tab is up this app has no foreground activity, so
 *       starting one is a background activity launch, which Android 10+ blocks.
 *       That is also why it can only fire before the app opens.</li>
 *   <li><b>The web app's automatic ask</b>, via {@code walletlens://review}.
 *       The second attempt, and the better-placed one — it lands while the user
 *       is looking at their portfolio. It arms on a timer and fires on the next
 *       tap; the tap is not decoration, it is the user activation without which
 *       Chrome refuses to navigate to an external scheme at all.</li>
 *   <li><b>"Rate WalletLens" in Settings</b>, the same web route with
 *       {@code fallback=store}.</li>
 * </ol>
 *
 * <p>Once a card has actually been shown, {@link #markCompleted} stamps native
 * SharedPreferences and ReviewGate stops asking. Crucially that stamp is only
 * written when the flow lasted long enough for the card to have been on screen
 * — see NO_CARD_THRESHOLD_MS. Writing it for a silently declined flow is what
 * previously let one swallowed attempt disable the feature permanently.
 *
 * <p>Optional query parameters on the web path:
 * <ul>
 *   <li>{@code source} — where the ask came from, for logcat only.</li>
 *   <li>{@code fallback=store} — if Play declines to show the card, open the
 *       store listing instead. Only ever set for a review the user asked for
 *       by tapping something; never for the automatic prompt, because being
 *       thrown into the Play Store unannounced is exactly the experience the
 *       in-app card exists to avoid.</li>
 * </ul>
 *
 * <p>Play controls whether the card actually appears — it is quota-limited per
 * user, and returns success without showing anything once the quota is spent.
 * That is by design and must not be worked around: the API contract forbids
 * changing app behaviour based on whether the card was shown, and forbids
 * asking the user how they feel first. This activity therefore treats "shown"
 * and "silently skipped" identically.
 *
 * <p>The activity is translucent and finishes as soon as the flow completes,
 * so from the user's point of view the card simply appears over the app.
 */
public class ReviewActivity extends Activity {

    private static final String TAG = "WalletLensReview";
    private static final String PREFS = "walletlens_review";

    /**
     * Intent extra: this activity was started by {@link ReviewGate} during
     * launch, so the app has not opened yet and this activity owes the user a
     * hand-off to it once the card is done.
     *
     * <p>Deliberately an extra carrying a boolean rather than a redirect URL.
     * The intent filter here is BROWSABLE, so anything on the device can start
     * this activity — a URL parameter would have to be validated against the
     * site origin the way BiometricActivity does. A flag that only ever means
     * "open our own launcher" cannot be pointed anywhere.
     */
    public static final String EXTRA_CONTINUE_TO_APP = "continue_to_app";

    /** Set once the flow has actually run, so the web side can stop asking. */
    private static final String KEY_COMPLETED_AT = "review_flow_completed_at";

    /** Below this, the rating card cannot have been on screen. */
    private static final long NO_CARD_THRESHOLD_MS = 1200L;

    /**
     * How long the launch path will wait on Play before opening the app anyway.
     *
     * <p>Only armed when we are holding up startup. Play normally answers in
     * well under a second, but it is a cross-process call to another app that
     * can be updating, disabled or wedged, and none of those may cost the user
     * their launch — a translucent activity that never finishes looks exactly
     * like the app failing to open.
     */
    private static final long HANDOFF_WATCHDOG_MS = 4000L;

    private boolean continueToApp = false;
    private boolean handedOff = false;
    private android.os.Handler watchdog;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String source = "unknown";
        boolean fallbackToStore = false;
        Intent intent = getIntent();
        continueToApp = intent != null && intent.getBooleanExtra(EXTRA_CONTINUE_TO_APP, false);
        if (intent != null && intent.getData() != null) {
            Uri uri = intent.getData();
            String s = uri.getQueryParameter("source");
            if (s != null && !s.isEmpty()) source = s;
            fallbackToStore = "store".equals(uri.getQueryParameter("fallback"));
        }
        if (continueToApp) {
            source = "launch";
            watchdog = new android.os.Handler(getMainLooper());
            watchdog.postDelayed(() -> {
                Log.w(TAG, "Play did not answer in time; opening the app");
                handOff();
            }, HANDOFF_WATCHDOG_MS);
        }

        final boolean openStoreOnFailure = fallbackToStore;
        Log.d(TAG, "Review requested from " + source);

        try {
            ReviewManager manager = ReviewManagerFactory.create(this);
            Task<ReviewInfo> request = manager.requestReviewFlow();
            request.addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    // Typically: sideloaded build, no Play Store, or an
                    // internal Play error. Nothing the user should see.
                    Log.w(TAG, "requestReviewFlow failed: " + task.getException());
                    finishFlow(openStoreOnFailure);
                    return;
                }
                try {
                    final long startedAt = SystemClock.elapsedRealtime();
                    manager.launchReviewFlow(ReviewActivity.this, task.getResult())
                            .addOnCompleteListener(flow -> {
                                // Play never reports whether the card was shown,
                                // and returns success either way — including for
                                // a build the user did not install from Play,
                                // where it silently shows nothing at all.
                                //
                                // Elapsed time is the only signal available. A
                                // real card cannot be dismissed in under a
                                // second, so anything faster means nothing was
                                // displayed. Only the explicit "Rate" button
                                // acts on that: it asked for something to
                                // happen, so it gets the store listing. The
                                // automatic prompt stays silent, because
                                // second-guessing the API there is exactly what
                                // Play's policy forbids.
                                long shownFor = SystemClock.elapsedRealtime() - startedAt;
                                boolean looksUnshown = shownFor < NO_CARD_THRESHOLD_MS;
                                Log.d(TAG, "review flow returned after " + shownFor + "ms");
                                if (looksUnshown) {
                                    // Play answered so fast the card cannot
                                    // have been on screen — quota spent, most
                                    // likely. Whatever happened, the user was
                                    // not asked anything.
                                    if (openStoreOnFailure) {
                                        finishFlow(true);
                                        return;
                                    }
                                    // Do NOT mark this completed. Recording a
                                    // completion for a card nobody saw is what
                                    // made a single swallowed attempt kill the
                                    // feature outright: alreadyRan() then
                                    // blocks the native gate for good, on top
                                    // of the 60-day cooldown markAsked() has
                                    // already started. Give the ask back
                                    // instead, and try again next launch.
                                    ReviewGate.rollbackAsk(ReviewActivity.this);
                                    handOff();
                                    return;
                                }
                                markCompleted();
                                handOff();
                            });
                } catch (Throwable t) {
                    Log.w(TAG, "launchReviewFlow threw: " + t);
                    finishFlow(openStoreOnFailure);
                }
            });
        } catch (Throwable t) {
            // Throwable, not Exception: if R8 ever strips the Play review
            // classes this arrives as NoClassDefFoundError, which is an Error
            // and would otherwise sail straight past and crash the activity.
            Log.w(TAG, "Play review unavailable: " + t);
            finishFlow(openStoreOnFailure);
        }
    }

    /** Close out, optionally sending the user to the listing instead. */
    private void finishFlow(boolean openStore) {
        if (openStore && openStoreListing()) {
            markCompleted();
        }
        handOff();
    }

    /**
     * Close this activity, and open the app if we interrupted its launch.
     *
     * <p>Idempotent on purpose: the watchdog and the Play callback race by
     * design, and whichever arrives first wins. Without the guard a slow Play
     * response after a watchdog hand-off would start the launcher a second
     * time, cold-starting the Custom Tab out from under a user who is already
     * looking at their dashboard.
     */
    private void handOff() {
        if (handedOff) return;
        handedOff = true;
        if (watchdog != null) watchdog.removeCallbacksAndMessages(null);

        if (continueToApp) {
            try {
                Intent app = new Intent(this, LauncherActivity.class);
                app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(app);
            } catch (Throwable t) {
                // Nothing left to try. Finishing at least returns the user to
                // their launcher rather than a blank translucent window.
                Log.w(TAG, "could not open the app after the review flow: " + t);
            }
        }
        finish();
    }

    private boolean openStoreListing() {
        String pkg = getPackageName();
        try {
            Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
            market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(market);
            return true;
        } catch (Exception ignored) {
            // No Play Store app installed — fall back to the web listing.
        }
        try {
            Intent web = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(web);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "No handler for the store listing: " + e.getMessage());
            return false;
        }
    }

    private void markCompleted() {
        try {
            SharedPreferences.Editor ed = getApplicationContext()
                    .getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            ed.putLong(KEY_COMPLETED_AT, System.currentTimeMillis());
            ed.apply();
        } catch (Exception ignored) {
            // Bookkeeping only; the web side keeps its own record.
        }
    }
}
