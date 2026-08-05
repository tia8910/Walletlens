package live.walletlens.twa;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Shows the last recorded crash so it can be read and shared from the phone.
 *
 * Deliberately built in code with no layout, no theme and no library: this
 * screen has to work in an app that has just proven it can fail during startup,
 * so it depends on as little as possible. Anything it inflated could be the
 * thing that was broken.
 *
 * Reachable three ways — from the crash notification, from walletlens://crashlog
 * in the web app, and via adb — because the whole point is that it must be
 * reachable when the normal way into the app does not work.
 */
public class CrashLogActivity extends Activity {

    private static final int PAD = 40;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final String trace = CrashReporter.lastTrace(this);
        CrashReporter.markSeen(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0b0f14"));
        root.setPadding(PAD, PAD * 2, PAD, PAD);

        TextView heading = new TextView(this);
        heading.setText(trace == null ? "No crash recorded" : "Last crash");
        heading.setTextColor(Color.parseColor("#10b981"));
        heading.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        heading.setTypeface(heading.getTypeface(), android.graphics.Typeface.BOLD);
        root.addView(heading);

        TextView when = new TextView(this);
        long ts = CrashReporter.lastCrashTime(this);
        when.setText(ts == 0 ? "The app has not crashed since this version was installed."
                             : java.text.DateFormat.getDateTimeInstance().format(new java.util.Date(ts)));
        when.setTextColor(Color.parseColor("#94a3b8"));
        when.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        when.setPadding(0, 8, 0, PAD / 2);
        root.addView(when);

        ScrollView scroller = new ScrollView(this);
        TextView body = new TextView(this);
        body.setText(trace == null ? "" : trace);
        body.setTextColor(Color.parseColor("#e2e8f0"));
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        body.setTypeface(android.graphics.Typeface.MONOSPACE);
        body.setTextIsSelectable(true);
        scroller.addView(body);
        // weight 1 so the trace takes the space and the buttons stay reachable
        root.addView(scroller, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        buttons.setPadding(0, PAD / 2, 0, 0);

        if (!TextUtils.isEmpty(trace)) {
            buttons.addView(button("Copy", v -> {
                try {
                    ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    cb.setPrimaryClip(ClipData.newPlainText("WalletLens crash", trace));
                    Toast.makeText(this, "Crash log copied", Toast.LENGTH_SHORT).show();
                } catch (Throwable e) {
                    Toast.makeText(this, "Could not copy", Toast.LENGTH_SHORT).show();
                }
            }));

            buttons.addView(button("Share", v -> {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_SUBJECT, "WalletLens crash log");
                    send.putExtra(Intent.EXTRA_TEXT, trace);
                    startActivity(Intent.createChooser(send, "Share crash log"));
                } catch (Throwable e) {
                    Toast.makeText(this, "Could not share", Toast.LENGTH_SHORT).show();
                }
            }));

            buttons.addView(button("Clear", v -> {
                CrashReporter.clear(this);
                Toast.makeText(this, "Cleared", Toast.LENGTH_SHORT).show();
                finish();
            }));
        }

        buttons.addView(button("Close", v -> finish()));
        root.addView(buttons);

        setContentView(root);
    }

    private Button button(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(6, 0, 6, 0);
        b.setLayoutParams(lp);
        return b;
    }
}
