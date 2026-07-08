package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Background worker — runs every 30 min.
 *
 * <ol>
 *   <li><b>📊 Price alerts</b> — monitors crypto (top 26), gold, silver,
 *       S&P 500 via free APIs. Also checks ANY assets the web app has
 *       sent via {@link DelegationService#onExtraCallback}.</li>
 *   <li><b>💡 Feature tip</b> — one per day through all 32 features</li>
 * </ol>
 *
 * <p>Privacy-first: only public free APIs, no user data sent anywhere.
 * WorkManager survives app close and device reboot.
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";
    private static final double MOVE_THRESHOLD_PCT = 1.0;

    // ── Default tracked assets ─────────────────────────────────────────
    private static final String CRYPTO_IDS =
            "bitcoin,ethereum,ripple,solana,cardano,avalanche,dogecoin,"
            + "polkadot,chainlink,shiba-inu,tron,litecoin,uniswap,"
            + "stellar,cosmos,monero,filecoin,aptos,arbitrum,sui,near,"
            + "optimism,hedera,algorand,flow,vechain";

    private static final String CRYPTO_URL =
            "https://api.coingecko.com/api/v3/simple/price"
            + "?ids=" + CRYPTO_IDS
            + "&vs_currencies=usd"
            + "&include_24hr_change=true";

    // Free metals API (no key required)
    private static final String GOLD_URL = "https://api.metals.live/v1/spot/gold";
    private static final String SILVER_URL = "https://api.metals.live/v1/spot/silver";

    // Yahoo Finance for SPY (S&P 500 ETF) and other stocks
    private static final String SPY_URL =
            "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=5d";

    // ── Preferences ────────────────────────────────────────────────────
    private static final String PREFS_NAME = "walletlens_notify";
    private static final String KEY_PRICES  = "saved_prices";  // JSON: {"bitcoin":65000, "spy":450, ...}
    private static final String KEY_FEATURE = "feature_index";
    private static final String KEY_TIP_DAY = "last_tip_day";

    // ── 32 Features ────────────────────────────────────────────────────
    private static final String[][] FEATURES = {
        {"🎙️ Voice Import", "Add holdings by speaking — tap the mic", "/add-holdings-by-voice"},
        {"📸 Screenshot Import", "Screenshot any exchange — reads automatically", "/import-portfolio-from-screenshot"},
        {"📄 Excel/CSV Import", "Bulk-import holdings from a spreadsheet", "/dashboard"},
        {"🔗 Wallet Import", "Paste ETH, BTC or SOL address — fetches live balances", "/dashboard"},
        {"📤 Export to Excel", "Download portfolio as Excel — cost basis, P&L", "/export-portfolio-to-excel"},
        {"🧾 Crypto Tax Report", "Export for Koinly, CoinTracker, TurboTax", "/crypto-portfolio-tax-report"},
        {"🎯 Price Targets", "Set alerts for any asset", "/track/{coin}"},
        {"😱 Fear & Greed Index", "Market sentiment at a glance", "/fear-and-greed-index"},
        {"🤖 AI Portfolio Coach", "Personalized analysis and advice", "/coach"},
        {"📊 Market Index", "Live prices and heatmaps", "/market-index"},
        {"⚡ Magic Indicator", "Buy/sell signals", "/magic-indicator"},
        {"🔬 Technical Analysis", "RSI, MACD, moving averages", "/technicals"},
        {"🏦 Multi-Exchange", "Binance, Coinbase — all in one place", "/exchanges"},
        {"💰 Multi-Asset", "Crypto, stocks, gold, real estate, cash", "/dashboard"},
        {"📓 Trade Journal", "Record trades with notes and P&L", "/transactions"},
        {"🔐 Biometric Lock", "Fingerprint or face unlock", "/settings"},
        {"🔄 Rebalancing Calculator", "Optimal allocation calculator", "/rebalancing-calculator"},
        {"🐋 Whale Alerts", "Track large crypto transactions", "/whales"},
        {"📈 Portfolio Snapshot", "Net worth, P&L, allocation charts", "/dashboard"},
        {"🌍 Multi-Language", "English, Arabic and more", "/settings"},
        {"🔒 Privacy First", "No account — data stays on your device", "/privacy"},
        {"📱 Install as App", "Add to home screen", "/"},
        {"📰 Crypto News", "Latest news and analysis", "/intel"},
        {"🎓 Crypto Academy", "Learn fundamentals and strategies", "/academy"},
        {"📊 Portfolio Analytics", "Allocation, diversification, health score", "/dashboard"},
        {"📉 Live P&L", "Realized and unrealized gains", "/dashboard"},
        {"🔔 Price Alerts", "Notify when any asset hits target", "/track/{coin}"},
        {"📋 Watchlist", "Follow coins without adding to portfolio", "/market-index"},
        {"📱 Push Notifications", "Alerts even when the app is closed", "/settings"},
        {"🆓 100% Free", "No premium tiers, ever", "/"},
        {"🌟 Open Source", "Inspect or contribute on GitHub", "https://github.com/tia8910/Walletlens"},
    };

    private final NumberFormat currencyFmt = NumberFormat.getCurrencyInstance(Locale.US);

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Worker started");

        try {
            SharedPreferences prefs = getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            // Load previously saved prices for comparison
            String savedJson = prefs.getString(KEY_PRICES, "{}");
            JSONObject saved = new JSONObject(savedJson);
            JSONObject newPrices = new JSONObject();
            StringBuilder movers = new StringBuilder();
            int moveCount = 0;

            // 1. Check crypto prices (CoinGecko)
            moveCount += checkCryptoPrices(saved, newPrices, movers);

            // 2. Check gold price
            moveCount += checkMetalPrice("Gold", "xau", GOLD_URL, saved, newPrices, movers);

            // 3. Check silver price
            moveCount += checkMetalPrice("Silver", "xag", SILVER_URL, saved, newPrices, movers);

            // 4. Check S&P 500 (SPY)
            moveCount += checkStockPrice("SPY", "SPY", SPY_URL, saved, newPrices, movers);

            // 5. Check user's custom assets from web app
            String[] userAssets = DelegationService.getPortfolioAssets(getApplicationContext());
            if (userAssets != null && userAssets.length > 0) {
                moveCount += checkUserAssets(userAssets, saved, newPrices, movers);
            }

            // Save all new prices
            prefs.edit().putString(KEY_PRICES, newPrices.toString()).apply();

            // First run check
            if (saved.length() == 0) {
                Log.d(TAG, "First run — prices saved for " + newPrices.length() + " assets");
                return Result.success();
            }

            // Notify if any asset moved
            if (moveCount > 0) {
                String title = "📊 Price Alert — " + moveCount + " asset" + (moveCount > 1 ? "s" : "") + " moved";
                NotificationHelper h = new NotificationHelper(getApplicationContext());
                h.showAlertNotification(title, movers.toString(), "https://walletlens.live/market-index");
                Log.d(TAG, "Alert: " + moveCount + " asset(s) moved >" + MOVE_THRESHOLD_PCT + "%");
            } else {
                Log.d(TAG, "All " + newPrices.length() + " assets stable");
            }

            // Feature tip (once per day)
            showDailyFeatureTip(prefs);

        } catch (Exception e) {
            Log.w(TAG, "Worker error", e);
        }

        return Result.success();
    }

    // ── Crypto checks via CoinGecko ────────────────────────────────────

    private int checkCryptoPrices(JSONObject saved, JSONObject newPrices,
                                   StringBuilder movers) {
        try {
            String json = httpGet(CRYPTO_URL);
            JSONObject data = new JSONObject(json);

            int count = 0;
            for (String coinId : CRYPTO_IDS.split(",")) {
                coinId = coinId.trim();
                if (!data.has(coinId)) continue;
                JSONObject c = data.getJSONObject(coinId);
                double price = c.getDouble("usd");
                newPrices.put(coinId, price);
                if (checkMove(coinId, price, saved, movers)) count++;
            }
            return count;
        } catch (Exception e) {
            Log.w(TAG, "Crypto check failed", e);
            return 0;
        }
    }

    // ── Metal price check (gold/silver) ────────────────────────────────

    private int checkMetalPrice(String name, String assetId, String url,
                                 JSONObject saved, JSONObject newPrices,
                                 StringBuilder movers) {
        try {
            String json = httpGet(url);
            // metals.live returns: [{"price": 2345.60, "high": ..., "low": ..., ...}]
            JSONArray arr = new JSONArray(json);
            if (arr.length() > 0) {
                double price = arr.getJSONObject(0).getDouble("price");
                newPrices.put(assetId, price);
                return checkMove(assetId, price, saved, movers) ? 1 : 0;
            }
            return 0;
        } catch (Exception e) {
            Log.w(TAG, name + " check failed", e);
            return 0;
        }
    }

    // ── Stock check via Yahoo Finance ──────────────────────────────────

    private int checkStockPrice(String name, String ticker, String url,
                                 JSONObject saved, JSONObject newPrices,
                                 StringBuilder movers) {
        try {
            String json = httpGet(url);
            JSONObject data = new JSONObject(json);
            JSONObject result = data.getJSONObject("chart")
                    .getJSONArray("result").getJSONObject(0);
            JSONObject meta = result.getJSONObject("meta");
            double price = meta.getDouble("regularMarketPrice");
            newPrices.put(ticker.toLowerCase(Locale.US), price);
            return checkMove(ticker, price, saved, movers) ? 1 : 0;
        } catch (Exception e) {
            Log.w(TAG, name + " check failed", e);
            return 0;
        }
    }

    // ── User's custom assets from web app ─────────────────────────────

    private int checkUserAssets(String[] assets, JSONObject saved,
                                 JSONObject newPrices, StringBuilder movers) {
        int count = 0;
        for (String asset : assets) {
            String key = asset.trim().toLowerCase(Locale.US);
            if (key.isEmpty()) continue;

            // Determine asset type by ID format
            if (key.equals("xau") || key.equals("xag") || key.equals("gold") || key.equals("silver")) {
                // Metals already checked above
                continue;
            } else if (key.matches("^[a-z]{2,30}$")) {
                // Likely a CoinGecko crypto ID — will be checked in crypto check
                continue;
            } else {
                // Stock ticker — check via Yahoo Finance
                try {
                    String url = "https://query1.finance.yahoo.com/v8/finance/chart/"
                               + key.toUpperCase(Locale.US) + "?interval=1d&range=5d";
                    String json = httpGet(url);
                    JSONObject data = new JSONObject(json);
                    JSONObject result = data.getJSONObject("chart")
                            .getJSONArray("result").getJSONObject(0);
                    JSONObject meta = result.getJSONObject("meta");
                    double price = meta.getDouble("regularMarketPrice");
                    newPrices.put(key, price);

                    if (checkMove(key, price, saved, movers)) count++;
                } catch (Exception e) {
                    Log.d(TAG, "Skipping " + key + " — price lookup failed");
                }
            }
        }
        return count;
    }

    // ── Price comparison helper ───────────────────────────────────────

    private boolean checkMove(String assetId, double price,
                               JSONObject saved, StringBuilder movers) {
        if (!saved.has(assetId)) return false;

        double oldPrice = saved.optDouble(assetId, 0);
        if (oldPrice <= 0) return false;

        double move = Math.abs(price - oldPrice) / oldPrice * 100;
        if (move < MOVE_THRESHOLD_PCT) return false;

        String symbol = assetId.length() <= 6
                ? assetId.toUpperCase(Locale.US)
                : assetId.substring(0, 1).toUpperCase(Locale.US)
                  + assetId.substring(1, Math.min(assetId.length(), 10));

        if (movers.length() > 0) movers.append("\n");
        movers.append(String.format(Locale.US, "%s: %s (%.1f%%)",
                symbol, currencyFmt.format(price), move));
        return true;
    }

    // ── Feature tip ───────────────────────────────────────────────────

    private void showDailyFeatureTip(SharedPreferences prefs) {
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String lastDay = prefs.getString(KEY_TIP_DAY, "");
        if (lastDay.equals(today)) return;

        int idx = prefs.getInt(KEY_FEATURE, 0);
        if (idx >= FEATURES.length) idx = 0;

        String[] tip = FEATURES[idx];
        NotificationHelper h = new NotificationHelper(getApplicationContext());
        h.showNotification("💡 " + tip[0], tip[1], "https://walletlens.live" + tip[2], null);

        prefs.edit().putInt(KEY_FEATURE, idx + 1).putString(KEY_TIP_DAY, today).apply();
        Log.d(TAG, "Tip #" + (idx + 1) + "/" + FEATURES.length + ": " + tip[0]);
    }

    // ── HTTP helper ───────────────────────────────────────────────────

    private static String httpGet(@NonNull String urlString) throws Exception {
        URI uri = new URI(urlString);
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(15_000);
        conn.setRequestProperty("Accept", "application/json");

        int status = conn.getResponseCode();
        if (status != 200) throw new RuntimeException("HTTP " + status + " from " + urlString);

        BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        conn.disconnect();
        return sb.toString();
    }
}
