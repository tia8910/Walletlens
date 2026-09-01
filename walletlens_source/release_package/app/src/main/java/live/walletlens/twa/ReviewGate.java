package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Decides whether this launch should show Google Play's in-app review card.
 *
 * <p>THIS IS THE PRIMARY ASK
 * {@link AppShellActivity} counts launches here on every cold start and calls
 * {@link #shouldAsk} once the app has been in front of the user long enough
 * for the card not to be interrupting a launch. What that buys over the web
 * app's own ask is an attempt that needs no tap, does not depend on the web
 * deploy having reached the device, and — the part that actually mattered —
 * keeps its clock in SharedPreferences rather than localStorage. Every attempt
 * to test the web gate by reinstalling wiped the very state the gate was
 * counting, so it could never reach three opens across two days.
 *
 * <p>This used to divert the LAUNCH itself, because as a Trusted Web Activity
 * the app had no foreground activity of its own once Chrome was up. It was
 * never wired, and it no longer needs to be: the shell is a real activity for
 * as long as the user is in the app.
 *
 * <p>The web app keeps its own in-session ask as the second attempt, for the
 * case that matters most: Play declining. Play returns success and shows
 * nothing when its per-user quota is spent, and there is no way to tell that
 * apart from success — so rather than guess, the web path simply tries again
 * later.
 *
 * <p>They do not double-ask when the first one worked. {@link ReviewActivity}
 * stamps {@code review_flow_completed_at} whenever a flow completes, whichever
 * side started it, and both sides consult it. Native storage is the only state
 * they share — localStorage is invisible from here, but every web-triggered ask
 * still passes through this process on its way to Play.
 *
 * <p>WHERE THE NUMBERS COME FROM
 * Launch count and first-seen date are ours, written on every cold start.
 * Portfolio size is not — it lives in the web app's localStorage, which native
 * code cannot read. What we do get is whatever the widget bridge last pushed
 * over ({@link WidgetSyncActivity} stores net worth and a tracked-asset count
 * for the widgets). That is treated as corroboration, not a requirement: if a
 * sync has happened and it says the portfolio is empty, we stay quiet; if no
 * sync has ever happened we proceed, because most users never add a widget and
 * refusing to ask them would shrink the audience to almost nobody.
 *
 * <p>WHAT THIS MUST NEVER DO
 * Play's policy forbids asking the user any opinion question before or while
 * showing the card — no "enjoying WalletLens?" gate, no routing only happy
 * users to the store. Nothing here screens on sentiment and nothing here should
 * ever grow a prompt of its own.
 */
final class ReviewGate {

    private static final String TAG = "WalletLensReviewGate";
    private static final String PREFS = "walletlens_review_gate";

    private static final String KEY_FIRST_SEEN = "first_seen";
    private static final String KEY_LAUNCHES   = "launches";
    private static final String KEY_FG_MS      = "foreground_ms";
    private static final String KEY_LAST_ASKED = "last_asked";
    private static final String KEY_ASK_COUNT  = "ask_count";
    private static final String KEY_FEATURE_USED = "feature_used";

    private static final long DAY_MS = 24L * 60 * 60 * 1000;

    /** No waiting period: eligible from the first launch. */
    private static final int MIN_DAYS = 0;

    /**
     * Cold starts, including this one, on an install that arrived as an UPDATE.
     *
     * <p>One is right for these: the person has already been using the app, for
     * however long, and the counter only started at zero because nothing was
     * calling {@link #noteLaunch} before. Making them wait a launch would be
     * asking them to prove something they have already proved.
     */
    private static final int MIN_LAUNCHES_UPDATED = 1;

    /**
     * Cold starts required on a FIRST install.
     *
     * <p>Sixty seconds into somebody's very first session is the middle of
     * onboarding — they are typing in their first holding, not forming a view
     * of the app. Coming back a second time is the smallest honest signal that
     * there is anything to have an opinion about, and unlike a longer wait it
     * does not depend on a clock the user cannot see.
     */
    private static final int MIN_LAUNCHES_FRESH = 2;

    /**
     * Our own cooldown. Play applies an undisclosed per-user quota on top and
     * simply shows nothing once it is spent, so asking inside a short window
     * achieves nothing except spending a launch on a card nobody sees.
     */
    private static final int REASK_AFTER_DAYS = 60;

    /**
     * After this many asks the cadence slows down. It does NOT stop.
     *
     * <p>This was a hard lifetime cap, and the reasoning behind it does not
     * survive contact with how the Play API behaves. launchReviewFlow
     * completes identically whether the card was shown, was dismissed, or was
     * silently suppressed because the user is over Google's quota — the
     * outcome is deliberately hidden. An "ask" is therefore an ATTEMPT and
     * nothing more, never evidence that anybody saw anything.
     *
     * <p>So a device could spend all four attempts inside one quota window,
     * be shown nothing at all, and then be retired for life. The people most
     * likely to hit that are exactly the ones who have never rated: somebody
     * who rates on their first card stops being asked anyway, because Play
     * stops serving it and ReviewActivity stamps the completion.
     *
     * <p>Nothing is lost by continuing. An attempt outside the quota costs
     * nothing and shows nothing; Google, not this file, is the authority on
     * how often a card may appear. Our job is a cadence that is not rude,
     * which is what the longer gap below is for.
     *
     * <p>Mirrors SETTLED_ASKS in client/src/reviewPrompt.js, which made the
     * same change on the web side for the same reason.
     */
    private static final int SETTLED_ASKS = 4;

    /** The gap once settled. Longer, but never infinite. */
    private static final int SETTLED_REASK_DAYS = 180;

    /**
     * Total time the app must have been in front of the user, ACROSS launches,
     * before the first ask.
     *
     * <p>Why lifetime and not per-session: the most common session in a
     * portfolio app is a twenty-second price check, and the people who do that
     * every day are precisely the users most worth asking. A per-session dwell
     * of a minute — the first design — would have skipped every one of them,
     * for ever, while asking only whoever happened to linger once. Ninety
     * seconds of accumulated attention is two or three quick checks or one
     * unhurried session, whichever comes first.
     */
    static final long MIN_FOREGROUND_MS = 90_000L;

    private ReviewGate() {}

    /** The last thing Play actually did, for the readout in Settings. */
    private static final String KEY_LAST_OUTCOME    = "last_outcome";
    private static final String KEY_LAST_OUTCOME_AT = "last_outcome_at";

    /**
     * Record what came back from Play.
     *
     * <p>Three rounds of "the rate card still doesn't appear" have now gone by
     * with no way to tell which of these happened, because the whole feature is
     * invisible when it works AND when it fails. Play returns success whether
     * or not it drew anything, so the only honest report is the raw outcome:
     * whether the request failed, how long the flow took, and whether this
     * build even came from Play.
     */
    static void noteOutcome(Context c, String outcome) {
        try {
            prefs(c).edit()
                    .putString(KEY_LAST_OUTCOME, outcome)
                    .putLong(KEY_LAST_OUTCOME_AT, System.currentTimeMillis())
                    .apply();
        } catch (Throwable e) {
            Log.w(TAG, "could not record the review outcome: " + e);
        }
    }

    static String lastOutcome(Context c) {
        try { return prefs(c).getString(KEY_LAST_OUTCOME, ""); }
        catch (Throwable e) { return ""; }
    }

    static long lastOutcomeAt(Context c) {
        try { return prefs(c).getLong(KEY_LAST_OUTCOME_AT, 0L); }
        catch (Throwable e) { return 0L; }
    }

    /**
     * Who installed this build.
     *
     * <p>"com.android.vending" is Play. Anything else — a shell install, a file
     * manager, null for adb — means the in-app review card CANNOT be shown, no
     * matter how long the gates have been satisfied. That single fact would
     * have answered this question days ago.
     */
    static String installer(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                String s = c.getPackageManager()
                        .getInstallSourceInfo(c.getPackageName())
                        .getInstallingPackageName();
                return s == null ? "sideload" : s;
            }
            String s = c.getPackageManager().getInstallerPackageName(c.getPackageName());
            return s == null ? "sideload" : s;
        } catch (Throwable e) {
            return "unknown";
        }
    }

    /**
     * Whether this install arrived as an update rather than a first install.
     *
     * <p>Play sets both timestamps on a first install and moves only the second
     * on an update, so they are equal exactly once in an install's life. A few
     * seconds of slack because the two are written by different steps of the
     * install and are not guaranteed to land in the same millisecond.
     *
     * <p>Unknown counts as fresh here, which is the cautious direction: it
     * costs one extra launch before the first ask, rather than an ask landing
     * on somebody's first-ever screen.
     */
    private static boolean isUpdatedInstall(Context c) {
        try {
            android.content.pm.PackageInfo info =
                    c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return info.lastUpdateTime - info.firstInstallTime > 10_000L;
        } catch (Throwable t) {
            return false;
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Record a cold start. Call once per launch, before {@link #shouldAsk}.
     *
     * <p>The first call also stamps the install date. Nothing reads it while
     * MIN_DAYS is zero, but it is recorded from the start so that reinstating a
     * waiting period later is a constant change, rather than a rule that has to
     * wait for everyone's clock to begin again.
     */
    /**
     * Add a stretch of foreground time to the lifetime total.
     *
     * <p>Called from the shell's onPause with the length of the stretch that
     * just ended. Kept as a total rather than per-session numbers because the
     * question the gate asks is "has this person used the app enough to have
     * an opinion", and attention across five short sessions answers it exactly
     * as well as one long one.
     */
    static void noteForeground(Context c, long deltaMs) {
        if (deltaMs <= 0) return;
        try {
            SharedPreferences p = prefs(c);
            p.edit().putLong(KEY_FG_MS, p.getLong(KEY_FG_MS, 0) + deltaMs).apply();
        } catch (Throwable t) {
            Log.w(TAG, "could not record foreground time: " + t);
        }
    }

    /** Lifetime foreground milliseconds, for the shell's timer arithmetic. */
    static long foregroundTotal(Context c) {
        try { return prefs(c).getLong(KEY_FG_MS, 0); }
        catch (Throwable t) { return 0; }
    }

    static void noteLaunch(Context c) {
        try {
            SharedPreferences p = prefs(c);
            SharedPreferences.Editor ed = p.edit();
            if (p.getLong(KEY_FIRST_SEEN, 0) == 0) {
                ed.putLong(KEY_FIRST_SEEN, System.currentTimeMillis());
            }
            ed.putInt(KEY_LAUNCHES, p.getInt(KEY_LAUNCHES, 0) + 1);
            ed.apply();
        } catch (Throwable t) {
            Log.w(TAG, "could not record launch: " + t);
        }
    }

    /**
     * True when this launch has earned an ask.
     *
     * <p>Called from {@link AppShellActivity} after the dwell, never at launch:
     * every gate here is about the launch's HISTORY, and none of them knows
     * whether the user is currently reading the dashboard or still watching it
     * paint. That part is the caller's to judge.
     */
    static boolean shouldAsk(Context c) {
        try {
            SharedPreferences p = prefs(c);
            long now = System.currentTimeMillis();

            int needed = isUpdatedInstall(c) ? MIN_LAUNCHES_UPDATED : MIN_LAUNCHES_FRESH;
            if (p.getInt(KEY_LAUNCHES, 0) < needed) return false;

            // Enough accumulated attention, across however many sessions it
            // took. The caller flushes the current stretch into the total
            // before asking, so this reads one number and stays authoritative.
            if (p.getLong(KEY_FG_MS, 0) < MIN_FOREGROUND_MS) return false;

            long first = p.getLong(KEY_FIRST_SEEN, 0);
            if (first == 0 || now - first < MIN_DAYS * DAY_MS) return false;

            // Slows after SETTLED_ASKS; never stops. See the constant for why
            // a count of attempts cannot be read as a count of cards seen.
            int askCount = p.getInt(KEY_ASK_COUNT, 0);
            int gapDays = askCount >= SETTLED_ASKS ? SETTLED_REASK_DAYS : REASK_AFTER_DAYS;
            long asked = p.getLong(KEY_LAST_ASKED, 0);
            if (asked != 0 && now - asked < (long) gapDays * DAY_MS) return false;

            // App Lock on, and this session has not been unlocked. The web
            // side learned this the expensive way: its dwell clock ran behind
            // the lock screen, so the card arrived on the fingerprint prompt
            // itself — the one moment the user is certainly not admiring the
            // app. Native has the same exposure, because the lock is also drawn
            // as a page inside the shell, which stays resumed the whole time.
            if (BiometricActivity.isEnabled(c) && !BiometricActivity.isSessionValid(c)) return false;

            // A flow has already completed on this device, from either side.
            // Not a tidiness nicety: Play's per-user quota is small and
            // undisclosed, so a second ask would most likely be swallowed in
            // silence, having cost the user an interrupted launch for nothing.
            if (alreadyRan(c)) return false;

            return hasPortfolio(c);
        } catch (Throwable t) {
            // A gate that throws must not take the app's startup with it.
            Log.w(TAG, "gate check failed, staying quiet: " + t);
            return false;
        }
    }

    /**
     * Whether a review flow has completed recently on this device, from either
     * path.
     *
     * <p>ReviewActivity writes this on every completion, including the ones the
     * web app triggers -- those still run through this process to reach Play.
     * It is the only state the two sides share.
     *
     * <p>Unlike the previous permanent block, this now resets after
     * {@link #SETTLED_REASK_DAYS} days.  The permanent block assumed Play's
     * per-user quota was spent for good, but the quota refreshes over time.
     * Blocking forever meant users who completed one review could never be
     * asked again -- even months later when Play would happily show a new card.
     * A time-limited window keeps the "don't re-ask right away" protection
     * while allowing the gate to reopen when a fresh ask has a real chance.
     */
    private static boolean alreadyRan(Context c) {
        try {
            long completedAt = c.getSharedPreferences("walletlens_review", Context.MODE_PRIVATE)
                    .getLong("review_flow_completed_at", 0);
            if (completedAt == 0) return false;
            long elapsed = System.currentTimeMillis() - completedAt;
            return elapsed < (long) SETTLED_REASK_DAYS * DAY_MS;
        } catch (Throwable t) {
            // Unreadable prefs must not turn into a duplicate ask.
            return true;
        }
    }

    /**
     * Whether we have any reason to believe there is something to have an
     * opinion about.
     *
     * <p>Absence of evidence is not evidence of absence here. The widget prefs
     * are only populated once the web app has pushed a sync, which most users
     * never trigger, so "no data" means "we don't know" and we go ahead. Only a
     * sync that actually reports an empty portfolio stops the ask.
     */
    private static boolean hasPortfolio(Context c) {
        try {
            SharedPreferences w = c.getSharedPreferences("walletlens_widget", Context.MODE_PRIVATE);
            if (!w.getBoolean("portfolio_synced", false)) return true;   // unknown
            return w.getFloat("alloc_total", 0f) > 0f;
        } catch (Throwable t) {
            return true;
        }
    }

    /**
     * Undo the last {@link #markAsked}, for a flow that returned too fast for
     * the card to have been displayed.
     *
     * <p>markAsked deliberately runs before the activity starts, so a crashed
     * or killed flow cannot cause an ask on every launch forever. The cost of
     * that ordering is this: when Play declines silently we have charged the
     * user for something they never saw. This gives it back.
     *
     * <p>It cannot underflow past zero, and it clears the timestamp rather than
     * restoring the previous one — the previous value is not kept anywhere, and
     * treating "never asked" as the fallback errs towards asking again, which
     * is the right direction when we know the last attempt showed nothing.
     */
    static void rollbackAsk(Context c) {
        try {
            SharedPreferences p = prefs(c);
            int n = p.getInt(KEY_ASK_COUNT, 0);
            p.edit()
             .putInt(KEY_ASK_COUNT, Math.max(0, n - 1))
             .putLong(KEY_LAST_ASKED, 0)
             .apply();
            Log.d(TAG, "ask rolled back; Play showed nothing");
        } catch (Throwable t) {
            Log.w(TAG, "could not roll back ask: " + t);
        }
    }

    /**
     * Record that the card was requested.
     *
     * <p>Called before the activity is started, never after. If the flow throws,
     * is killed, or Play declines silently, the alternative is re-asking on the
     * next launch and every launch after it — far worse than losing one ask.
     */
    static void markAsked(Context c) {
        try {
            SharedPreferences p = prefs(c);
            p.edit()
             .putLong(KEY_LAST_ASKED, System.currentTimeMillis())
             .putInt(KEY_ASK_COUNT, p.getInt(KEY_ASK_COUNT, 0) + 1)
             .apply();
        } catch (Throwable t) {
            Log.w(TAG, "could not record ask: " + t);
        }
    }
}
