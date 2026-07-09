package live.walletlens.twa;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

/**
 * Native data export activity.
 *
 * <p>Receives portfolio data from the web app via intent URL parameters,
 * saves it as a .json / .csv file in the Downloads folder, generates a
 * QR code image next to it, and opens the file so the user can share it.
 *
 * <p>Triggered from the web app via:
 * {@code walletlens://export?format=json&data=...}
 *
 * <p>Privacy-first: all data stays on the device, no cloud upload.
 */
public class DataExportActivity extends AppCompatActivity {

    private static final String TAG = "WalletLensExport";
    private static final int QR_SIZE_PX = 1024;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        if (intent == null || intent.getData() == null) {
            Log.w(TAG, "No intent data");
            Toast.makeText(this, "No data to export", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        Uri data = intent.getData();
        String format = data.getQueryParameter("format");
        String jsonData = data.getQueryParameter("data");
        String csvData = data.getQueryParameter("csv");

        if (jsonData == null && csvData == null) {
            Toast.makeText(this, "No portfolio data received", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        try {
            String filename;
            String content;
            String mimeType;

            if (csvData != null) {
                filename = "WalletLens_portfolio_" + System.currentTimeMillis() + ".csv";
                content = csvData;
                mimeType = "text/csv";
            } else {
                filename = "WalletLens_portfolio_" + System.currentTimeMillis() + ".json";
                content = jsonData;
                mimeType = "application/json";
            }

            // Save to Downloads folder
            File downloadsDir = Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS);
            if (!downloadsDir.exists()) downloadsDir.mkdirs();

            // Write data file
            File exportFile = new File(downloadsDir, filename);
            FileOutputStream fos = new FileOutputStream(exportFile);
            OutputStreamWriter writer = new OutputStreamWriter(fos, StandardCharsets.UTF_8);
            writer.write(content);
            writer.flush();
            writer.close();

            Log.d(TAG, "Exported to: " + exportFile.getAbsolutePath()
                    + " (" + content.length() + " bytes)");

            // Generate QR code from the data
            String qrFilename = "WalletLens_QR_" + System.currentTimeMillis() + ".png";
            File qrFile = new File(downloadsDir, qrFilename);
            try {
                Bitmap qrBitmap = generateQRCode(content, QR_SIZE_PX);
                FileOutputStream qrFos = new FileOutputStream(qrFile);
                qrBitmap.compress(Bitmap.CompressFormat.PNG, 100, qrFos);
                qrFos.close();
                Log.d(TAG, "QR code saved: " + qrFile.getAbsolutePath());
            } catch (WriterException e) {
                Log.w(TAG, "QR generation skipped: " + e.getMessage());
            }

            // Notify user
            String msg = "\u2705 Portfolio exported to Downloads/\n"
                    + filename
                    + (qrFile.exists() ? "\n\uD83D\uDCF7 QR code: " + qrFilename : "");
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();

            // Open the data file so user can view/share it
            Uri fileUri = FileProvider.getUriForFile(this,
                    getPackageName() + ".fileprovider", exportFile);
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(fileUri, mimeType);
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(viewIntent, "Open exported portfolio"));

        } catch (Exception e) {
            Log.e(TAG, "Export failed", e);
            Toast.makeText(this, "Export failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }

        finish();
    }

    /**
     * Generate a QR code bitmap from a string payload using ZXing.
     */
    private Bitmap generateQRCode(String data, int sizePx) throws WriterException {
        QRCodeWriter writer = new QRCodeWriter();
        BitMatrix bitMatrix = writer.encode(data, BarcodeFormat.QR_CODE, sizePx, sizePx);

        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565);
        for (int x = 0; x < sizePx; x++) {
            for (int y = 0; y < sizePx; y++) {
                bitmap.setPixel(x, y, bitMatrix.get(x, y) ? Color.BLACK : Color.WHITE);
            }
        }
        return bitmap;
    }
}
