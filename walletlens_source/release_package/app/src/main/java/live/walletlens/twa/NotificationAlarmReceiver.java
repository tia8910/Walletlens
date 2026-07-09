package live.walletlens.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.Random;

/**
 * Receives AlarmManager broadcasts and fires native WalletLens notifications.
 *
 * Uses {@link android.app.AlarmManager#setAlarmClock} for precise scheduling
 * that survives device sleep and app closure.
 *
 * <p>Notification types cycle every 30 min:
 * <ul>
 *   <li>💡 Feature tips (32+ app features)</li>
 *   <li>💪 Investment hacks (20 wealth-building tips)</li>
 *   <li>🔔 Portfolio reminders</li>
 *   <li>📊 Portfolio review prompts</li>
 * </ul>
 */
public class NotificationAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "WalletLensAlarmRcvr";
    private static final String PREFS_NAME = "walletlens_alarm";
    private static final String KEY_NOTIF_TYPE = "last_notif_type";
    private static final String KEY_FEATURE_IDX = "feature_idx";
    private static final String KEY_HACK_IDX = "hack_idx";
    private static final String KEY_LAST_HEARTBEAT = "last_heartbeat_ts";

    // ── 32 Feature tips ───────────────────────────────────────────────
    private static final String[][] FEATURES = {
        {"🎙️ Voice Import", "Add holdings by speaking — tap the mic", "/add-holdings-by-voice"},
        {"📸 Screenshot Import", "Screenshot any exchange — portfolio reads automatically", "/import-portfolio-from-screenshot"},
        {"📄 Excel/CSV Import", "Bulk-import holdings from a spreadsheet", "/dashboard"},
        {"🔗 Wallet Import", "Paste ETH, BTC or SOL address — fetches live balances", "/dashboard"},
        {"📤 Export to Excel", "Download portfolio as Excel with cost basis & P&L", "/export-portfolio-to-excel"},
        {"🧾 Crypto Tax Report", "Export for Koinly, CoinTracker, TurboTax", "/crypto-portfolio-tax-report"},
        {"🎯 Price Targets", "Set alerts for any asset at your target price", "/track/{coin}"},
        {"😱 Fear & Greed Index", "Market sentiment at a glance — updated live", "/fear-and-greed-index"},
        {"🤖 AI Portfolio Coach", "Personalized AI analysis and advice on your holdings", "/coach"},
        {"📊 Market Index", "Live prices, heatmaps, and top movers in one place", "/market-index"},
        {"⚡ Magic Indicator", "Buy/sell signals across all your assets", "/magic-indicator"},
        {"🔬 Technical Analysis", "RSI, MACD, moving averages for any asset", "/technicals"},
        {"🏦 Multi-Exchange", "Binance, Coinbase, Kraken — all in one place", "/exchanges"},
        {"💰 Multi-Asset", "Crypto + stocks + gold + real estate + cash in one dashboard", "/dashboard"},
        {"📓 Trade Journal", "Record trades with notes, screenshots and P&L", "/transactions"},
        {"🔐 Biometric Lock", "Fingerprint or face unlock — keeps your wealth private", "/settings"},
        {"🔄 Rebalancing", "Optimal portfolio allocation calculator", "/rebalancing-calculator"},
        {"🐋 Whale Alerts", "Track large crypto transactions in real time", "/whales"},
        {"📈 Portfolio Snapshot", "Net worth, P&L, allocation charts, all together", "/dashboard"},
        {"🌍 Multi-Language", "English, Arabic and more — switch anytime", "/settings"},
        {"🔒 Privacy First", "No account — your data stays on your device always", "/privacy"},
        {"📱 Install as App", "Add to home screen for the full native experience", "/"},
        {"📰 Crypto Intel", "Latest news, analysis and market insights", "/intel"},
        {"🎓 Crypto Academy", "Learn investing fundamentals and advanced strategies", "/academy"},
        {"📊 Portfolio Analytics", "Allocation, diversification score, health check", "/dashboard"},
        {"📉 Live P&L", "Realized and unrealized gains in real time", "/dashboard"},
        {"🔔 Smart Alerts", "Notify when any asset hits your target price", "/track/{coin}"},
        {"📋 Custom Watchlist", "Follow coins without adding to portfolio", "/market-index"},
        {"📱 Push Notifications", "Alerts even when the app is closed", "/settings"},
        {"🆓 100% Free", "No premium tiers, no subscriptions, ever", "/"},
        {"🌟 Open Source", "Inspect, fork or contribute on GitHub", "https://github.com/tia8910/Walletlens"},
        {"📊 Net Worth Tracking", "Your complete wealth in one dashboard", "/dashboard"},
    };

    // ── Investment Hacks (20 tips) ────────────────────────────────────
    private static final String[][] HACKS = {
        {"📈 Dollar-Cost Averaging", "Invest fixed amounts regularly — removes emotions from investing"},
        {"🛡️ Diversify", "Spread across crypto, stocks, gold, cash — protect your wealth"},
        {"📉 Buy the Dip", "When everyone is fearful, consider buying — markets always cycle"},
        {"💰 Compound Interest", "Reinvest gains — time is your biggest wealth-building ally"},
        {"🎯 Set Stop-Losses", "Define your exit before entering — protects from bad decisions"},
        {"📊 Rebalance Quarterly", "Adjust allocations every 3 months to maintain target risk"},
        {"🔍 Do Your Research", "Always research before investing — understand what you own"},
        {"💵 Emergency Fund First", "Keep 3-6 months of expenses in cash before investing"},
        {"📋 Track Everything", "Use WalletLens — what gets measured gets managed"},
        {"🧠 Avoid FOMO", "Fear of missing out leads to buying high — stay disciplined"},
        {"📅 Be Consistent", "Small consistent investments beat trying to time the market"},
        {"🔒 Cold Storage", "Large crypto belongs in hardware wallets, not exchanges"},
        {"📊 Check Correlations", "Gold and stocks sometimes move together — know your portfolio"},
        {"💡 Tax-Loss Harvest", "Sell losing positions to offset gains — WalletLens tracks P&L"},
        {"🌍 Think Global", "International diversification reduces country-specific risk"},
        {"📈 Trend Is Your Friend", "Don't fight the market direction — let trends guide you"},
        {"⚡ Stay Liquid", "Keep cash ready for opportunities during market dips"},
        {"📚 Keep Learning", "Best investors never stop learning — WalletLens Academy helps"},
        {"🎯 Set Clear Goals", "Define financial goals — WalletLens milestones track progress"},
        {"💪 Be Patient", "The market rewards patience — zoom out and think long-term"},
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Alarm received");

        // Ensure notification channels exist
        NotificationHelper helper = new NotificationHelper(context);
        helper.createChannels();

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int notifType = prefs.getInt(KEY_NOTIF_TYPE, -1);

        // Cycle through notification types
        notifType = (notifType + 1) % 4;
        prefs.edit().putInt(KEY_NOTIF_TYPE, notifType).apply();

        switch (notifType) {
            case 0: showFeatureTip(context, prefs, helper); break;
            case 1: showInvestmentHack(context, prefs, helper); break;
            case 2: showPortfolioReminder(context, helper); break;
            case 3: showFeatureTip(context, prefs, helper); break; // Features twice
            default: showPortfolioReminder(context, helper);
        }

        // Re-schedule the next alarm
        NotificationScheduler.scheduleNextAlarm(context);

        // Save timestamp
        prefs.edit().putLong(KEY_LAST_HEARTBEAT, System.currentTimeMillis()).apply();
    }

    // ── Feature Tip ───────────────────────────────────────────────────

    private void showFeatureTip(Context context, SharedPreferences prefs, NotificationHelper helper) {
        int idx = prefs.getInt(KEY_FEATURE_IDX, 0);
        if (idx >= FEATURES.length) idx = 0;

        String[] tip = FEATURES[idx];
        String url = "https://walletlens.live" + tip[2];
        helper.showAlertNotification("💡 " + tip[0], tip[1], url);

        prefs.edit().putInt(KEY_FEATURE_IDX, idx + 1).apply();
        Log.d(TAG, "Feature tip #" + (idx + 1) + ": " + tip[0]);
    }

    // ── Investment Hack ───────────────────────────────────────────────

    private void showInvestmentHack(Context context, SharedPreferences prefs, NotificationHelper helper) {
        int idx = prefs.getInt(KEY_HACK_IDX, 0);
        if (idx >= HACKS.length) idx = 0;

        String[] hack = HACKS[idx];
        String body = hack[1];
        if (body.length() > 90) body = body.substring(0, 87) + "...";

        helper.showAlertNotification("💡 " + hack[0], body, "https://walletlens.live/academy");
        prefs.edit().putInt(KEY_HACK_IDX, idx + 1).apply();
        Log.d(TAG, "Investment hack #" + (idx + 1) + ": " + hack[0]);
    }

    // ── Portfolio Reminder ────────────────────────────────────────────

    private void showPortfolioReminder(Context context, NotificationHelper helper) {
        String[] reminders = {
            "Track your net worth today — every asset in one dashboard",
            "Check your P&L and portfolio performance",
            "Review your asset allocation — is it still balanced?",
            "Update your holdings — keep your net worth accurate",
            "View portfolio health score and AI-powered insights",
            "See how your crypto, stocks and gold are performing together",
            "Log a trade in your trade journal to track performance"
        };
        String msg = reminders[new Random().nextInt(reminders.length)];
        helper.showAlertNotification("🔔 WalletLens", msg, "https://walletlens.live/dashboard");
    }
}
