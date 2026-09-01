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
 * <p>TWO WAYS IN
 * <ol>
 *   <li><b>{@link ReviewGate}, natively</b>, started by {@link AppShellActivity}
 *       once the app has been in front of the user for a while. This is the
 *       primary ask, and it is native for a reason that took three rounds of
 *       "the card still doesn't appear" to pin down: the web path can only
 *       reach Play by navigating to an external scheme, which needs a user
 *       gesture, and its whole clock lives in localStorage — the one store that
 *       gets wiped by the reinstalls people use to test this. Native state is
 *       SharedPreferences, which survives updates and does not need a tap.</li>
 *   <li><b>The web app's automatic ask</b>, via {@code walletlens://review},
 *       kept as the second attempt for the case that matters most: Play
 *       declining silently. It arms on a timer and fires on the next tap; the
 *       tap is not decoration, it is the user activation without which the
 *       WebView refuses to navigate to an external scheme at all. It may carry
 *       {@code fallback=store}.</li>
 * </ol>
 *
 * <p>The older design had ReviewGate divert the LAUNCH itself, because as a
 * Trusted Web Activity the app had no foreground activity of its own once
 * Chrome was up, and starting one would have been a background activity launch.
 * That is what {@link #EXTRA_CONTINUE_TO_APP} and the hand-off below are for.
 * The shell ended that constraint — the app is now a real foreground activity
 * the whole time the user is in it — so the card is shown over the running app
 * instead, and nothing sets that extra any more.</p>
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

    /**
     * Intent extra: {@link ReviewGate} started this, so it has already spent an
     * ask and is owed it back if Play shows nothing.
     *
     * <p>Only the native gate keeps that ledger. The web path has its own, in
     * localStorage, and calls neither markAsked nor rollbackAsk — so rolling
     * back for a web-triggered flow would clear a cooldown that belongs to a
     * different ask entirely. Read from an explicit extra rather than inferred
     * from the log source string, which anything on the device can set: this
     * activity is BROWSABLE.
     */
    public static final String EXTRA_FROM_GATE = "from_gate";

    /** Set once the flow has actually run, so the web side can stop asking. */
    private static final String KEY_COMPLETED_AT = "review_flow_completed_at";

    /** Below this, the rating card cannot have been on screen. */
    private static final long NO_CARD_THRESHOLD_MS = 800L;

    /**
     * How long to wait on Play before giving up and closing this activity.
     *
     * <p>Play normally answers in well under a second, but it is a cross-process
     * call to another app that can be updating, disabled or wedged, and this
     * activity is translucent with no UI of its own — so a call that never
     * comes back leaves an invisible window sitting on top of the app,
     * swallowing every touch. Indistinguishable, from the user's side, from the
     * app having frozen.
     *
     * <p>Armed on EVERY path, not only the old launch hand-off. It used to be
     * conditional on {@code continueToApp}, which meant the one case it fired
     * in is the case that no longer exists, and the case it now runs in — a
     * card started over the user's dashboard — had no timeout at all.
     */
    private static final long WATCHDOG_MS = 4000L;

    private boolean continueToApp = false;
    private boolean fromGate = false;
    private boolean handedOff = false;
    private android.os.Handler watchdog;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String source = "unknown";
        boolean fallbackToStore = false;
        Intent intent = getIntent();
        continueToApp = intent != null && intent.getBooleanExtra(EXTRA_CONTINUE_TO_APP, false);
        // An extra survives only an explicit Intent from inside this app; a
        // walletlens://review URL from the WebView cannot carry one.
        fromGate = intent != null && intent.getBooleanExtra(EXTRA_FROM_GATE, false);
        if (fromGate) source = "gate";
        if (intent != null && intent.getData() != null) {
            Uri uri = intent.getData();
            String s = uri.getQueryParameter("source");
            if (s != null && !s.isEmpty()) source = s;
            fallbackToStore = "store".equals(uri.getQueryParameter("fallback"));
        }
        if (continueToApp) source = "launch";
        watchdog = new android.os.Handler(getMainLooper());
        watchdog.postDelayed(() -> {
            Log.w(TAG, "Play did not answer in time; closing the review flow");
            ReviewGate.noteOutcome(ReviewActivity.this, "no_answer_from_play");
            // Play never answered, so nothing was shown. Charging the user a
            // 60-day cooldown for a card that did not exist is the mistake
            // rollbackAsk exists to undo.
            giveTheAskBack();
            handOff();
        }, WATCHDOG_MS);

        final boolean openStoreOnFailure = fallbackToStore;
        Log.d(TAG, "Review requested from " + source);

        try {
            ReviewManager manager = ReviewManagerFactory.create(this);
            Task<ReviewInfo> request = manager.requestReviewFlow();
            request.addOnCompleteListener(task -> {
                // Play has answered. Everything past this point is either an
                // immediate finish or a card the USER is reading, and the user
                // is allowed to take longer than four seconds over it — a
                // watchdog still running here would finish the activity out
                // from under a card that was displaying correctly.
                cancelWatchdog();
                if (!task.isSuccessful()) {
                    // Typically: sideloaded build, no Play Store, or an
                    // internal Play error. Nothing the user should see.
                    Log.w(TAG, "requestReviewFlow failed: " + task.getException());
                    ReviewGate.noteOutcome(ReviewActivity.this, "request_failed");
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
                                ReviewGate.noteOutcome(ReviewActivity.this,
                                        (looksUnshown ? "no_card_" : "shown_") + shownFor + "ms");
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
                                    giveTheAskBack();
                                    handOff();
                                    return;
                                }
                                markCompleted();
                                handOff();
                            });
                } catch (Throwable t) {
                    Log.w(TAG, "launchReviewFlow threw: " + t);
                    ReviewGate.noteOutcome(ReviewActivity.this, "launch_threw");
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

    /** Stop the request timeout. Safe to call more than once. */
    private void cancelWatchdog() {
        if (watchdog != null) {
            watchdog.removeCallbacksAndMessages(null);
            watchdog = null;
        }
    }

    /**
     * Return the ask the gate spent, when Play showed nothing.
     *
     * <p>A no-op for a web-triggered flow, which never spent one: the two paths
     * keep separate ledgers and only this one is native.
     */
    private void giveTheAskBack() {
        if (fromGate) ReviewGate.rollbackAsk(this);
    }

    /** Close out, optionally sending the user to the listing instead. */
    private void finishFlow(boolean openStore) {
        // Deliberately does NOT markCompleted().
        //
        // Reaching here means Play declined — it would not show a card, so the
        // store listing was opened instead. Opening a listing is not evidence
        // that anybody rated anything; the user may well have hit back at once.
        //
        // Stamping a completion here was the same "an attempt is not evidence"
        // error the flow callback above already guards against, one branch
        // over. The consequence was worse, though: alreadyRan() reads that
        // stamp, so a single tap on "Rate WalletLens" that bounced to the store
        // permanently disabled the automatic launch-time ask on that device.
        // Testing the manual button was enough to kill the feature you were
        // testing.
        //
        // Nothing is needed here to keep the volume sane. markAsked() has
        // already started the re-ask gap, and the manual button is a thing the
        // user went looking for, not an interruption we owe them a cooldown
        // for.
        if (openStore) openStoreListing();
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
        cancelWatchdog();

        if (continueToApp) {
            try {
                startActivity(AppEntry.home(this));
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
