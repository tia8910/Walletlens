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
 * <p>WHY THIS EXISTS
 * The portfolio and the usage history that decide <em>when</em> to ask both
 * live in the web app's localStorage, inside the Custom Tab. The rating card
 * itself can only be shown by the Play In-App Review API, which is native. So
 * the web side owns the "is now a good moment?" decision and hands off to this
 * activity when the answer is yes.
 *
 * <p>Triggered from the web app via {@code walletlens://review}. Optional
 * query parameters:
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

    /** Set once the flow has actually run, so the web side can stop asking. */
    private static final String KEY_COMPLETED_AT = "review_flow_completed_at";

    /** Below this, the rating card cannot have been on screen. */
    private static final long NO_CARD_THRESHOLD_MS = 1200L;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String source = "unknown";
        boolean fallbackToStore = false;
        Intent intent = getIntent();
        if (intent != null && intent.getData() != null) {
            Uri uri = intent.getData();
            String s = uri.getQueryParameter("source");
            if (s != null && !s.isEmpty()) source = s;
            fallbackToStore = "store".equals(uri.getQueryParameter("fallback"));
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
                                if (looksUnshown && openStoreOnFailure) {
                                    finishFlow(true);
                                    return;
                                }
                                markCompleted();
                                finish();
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
