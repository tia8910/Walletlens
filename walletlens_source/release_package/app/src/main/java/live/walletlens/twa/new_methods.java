
    // ── Daily Digest ──────────────────────────────────────────────────

    private void checkDailyDigest(SharedPreferences prefs, StringBuilder movers, int moveCount) {
        long lastDigest = prefs.getLong(KEY_DIGEST_TS, 0);
        long now = System.currentTimeMillis();
        if (now - lastDigest < DIGEST_INTERVAL_HOURS * 60 * 60 * 1000L) return;

        String summary;
        if (moveCount > 0) {
            summary = "\uD83D\uDCCA Daily Market Summary\n\n"
                    + moveCount + " asset" + (moveCount > 1 ? "s" : "") + " moved >1% today:\n"
                    + movers.toString();
        } else {
            summary = "\uD83D\uDCCA Daily Market Summary\n\nAll your tracked assets are stable. No significant moves in the last 24h.";
        }

        NotificationHelper h = new NotificationHelper(getApplicationContext());
        h.showDailyDigest(summary);

        prefs.edit()
                .putLong(KEY_DIGEST_TS, now)
                .putInt(KEY_DIGEST_COUNT, 0)
                .putString(KEY_DIGEST_MOVERS, "")
                .apply();

        Log.d(TAG, "Daily digest sent");
    }

    // ── Goal Milestones ────────────────────────────────────────────────

    private void checkGoalMilestones(SharedPreferences prefs) {
        int notified = prefs.getInt(KEY_MILESTONE_NOTIFIED, 0);
        if (notified >= MILESTONES.length) return;

        double portfolioValue = prefs.getFloat("portfolio_value", 0);
        if (portfolioValue <= 0) return;

        for (int i = notified; i < MILESTONES.length; i++) {
            double ms = MILESTONES[i];
            if (portfolioValue >= ms) {
                String formattedMs;
                if (ms >= 1000000) formattedMs = "$" + (ms / 1000000) + "M";
                else if (ms >= 1000) formattedMs = "$" + (int)(ms / 1000) + "K";
                else formattedMs = "$" + (int)ms;

                NotificationHelper h = new NotificationHelper(getApplicationContext());
                h.showAlertNotification(
                    "\uD83C\uDF89 Milestone Reached!",
                    "Your portfolio has reached " + formattedMs + "! Keep tracking with WalletLens.",
                    "https://walletlens.live/dashboard"
                );

                prefs.edit().putInt(KEY_MILESTONE_NOTIFIED, i + 1).apply();
                Log.d(TAG, "Milestone notification: " + formattedMs);
            } else {
                break;
            }
        }
    }

    // ── HTTP helper ───────────────────────────────────────────────────

