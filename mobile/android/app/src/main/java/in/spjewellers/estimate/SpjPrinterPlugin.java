package in.spjewellers.estimate;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native printing for the S.P. Jewellers app.
 *
 *  - printHtml:   lays out the estimate HTML in an off-screen WebView and hands it to Android's
 *                 print framework (PrintManager). Android's print services reach Bluetooth, Wi-Fi
 *                 and USB printers; the system dialog lets the user pick one.
 *  - printEscPos: sends ESC/POS bytes to a thermal printer that is already paired in Android
 *                 Bluetooth settings, over the classic Bluetooth serial profile (SPP).
 *
 * Pairing is always done by Android, never by this app.
 */
@CapacitorPlugin(
    name = "SpjPrinter",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class SpjPrinterPlugin extends Plugin {

    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Held so the WebView is not garbage-collected while the print framework uses it. */
    private WebView printView;

    // ------------------------------------------------------------------ Android print framework

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String jobName = call.getString("jobName", "Estimate");
        if (html == null || html.isEmpty()) {
            call.reject("Nothing to print.", "EMPTY");
            return;
        }
        main.post(() -> {
            WebView wv = new WebView(getContext());
            wv.getSettings().setJavaScriptEnabled(false);
            wv.setWebViewClient(new WebViewClient() {
                private boolean started = false;

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (started) return;
                    started = true;
                    PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                    PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                        .build();
                    try {
                        PrintJob job = pm.print(jobName, adapter, attrs);
                        watchJob(call, job, System.currentTimeMillis());
                    } catch (Exception e) {
                        printView = null;
                        call.reject("Android could not start printing: " + e.getMessage(), "PRINT_START_FAILED");
                    }
                }
            });
            printView = wv;
            wv.loadDataWithBaseURL(null, html, "text/HTML", "UTF-8", null);
        });
    }

    /** Follows the job until Android reports an end state, so the app can show the real result. */
    private void watchJob(PluginCall call, PrintJob job, long startedAt) {
        main.postDelayed(() -> {
            long elapsed = System.currentTimeMillis() - startedAt;
            JSObject ret = new JSObject();
            if (job.isCompleted()) {
                printView = null;
                ret.put("state", "completed");
                call.resolve(ret);
            } else if (job.isFailed()) {
                printView = null;
                String why = job.getInfo() != null && job.getInfo().getLabel() != null ? job.getInfo().getLabel() : "";
                call.reject("The printer reported a failure." + (why.isEmpty() ? "" : " (" + why + ")"), "JOB_FAILED");
            } else if (job.isCancelled()) {
                printView = null;
                ret.put("state", "cancelled");
                call.resolve(ret);
            } else if ((job.isQueued() || job.isStarted() || job.isBlocked()) && elapsed > 45_000) {
                // Handed to the printer's print service; it may keep working in the background.
                printView = null;
                ret.put("state", job.isBlocked() ? "blocked" : "queued");
                call.resolve(ret);
            } else if (elapsed > 10 * 60_000) {
                printView = null;
                ret.put("state", "timeout");
                call.resolve(ret);
            } else {
                watchJob(call, job, startedAt);
            }
        }, 800);
    }

    // ------------------------------------------------------------------ Bluetooth ESC/POS

    private boolean needsConnectPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    @PluginMethod
    public void bluetoothStatus(PluginCall call) {
        BluetoothAdapter a = adapter();
        JSObject ret = new JSObject();
        ret.put("supported", a != null);
        ret.put("enabled", a != null && a.isEnabled());
        ret.put("permission", !needsConnectPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void listPairedPrinters(PluginCall call) {
        if (needsConnectPermission()) {
            requestPermissionForAlias("bluetooth", call, "afterPermissionList");
            return;
        }
        doList(call);
    }

    @PermissionCallback
    private void afterPermissionList(PluginCall call) {
        if (needsConnectPermission()) {
            call.reject("Bluetooth permission was not given. Allow \"Nearby devices\" for this app in Android settings.", "PERMISSION_DENIED");
            return;
        }
        doList(call);
    }

    @SuppressLint("MissingPermission")
    private void doList(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("This phone has no Bluetooth.", "NO_BLUETOOTH");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("Bluetooth is turned off. Turn it on and try again.", "BLUETOOTH_OFF");
            return;
        }
        JSArray list = new JSArray();
        Set<BluetoothDevice> bonded = a.getBondedDevices();
        for (BluetoothDevice d : bonded) {
            JSObject o = new JSObject();
            o.put("name", d.getName() == null ? d.getAddress() : d.getName());
            o.put("address", d.getAddress());
            BluetoothClass bc = d.getBluetoothClass();
            int major = bc == null ? -1 : bc.getMajorDeviceClass();
            o.put("isPrinter", major == BluetoothClass.Device.Major.IMAGING);
            o.put("isClassic", d.getType() == BluetoothDevice.DEVICE_TYPE_CLASSIC || d.getType() == BluetoothDevice.DEVICE_TYPE_DUAL);
            list.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("devices", list);
        call.resolve(ret);
    }

    @PluginMethod
    public void printEscPos(PluginCall call) {
        if (needsConnectPermission()) {
            requestPermissionForAlias("bluetooth", call, "afterPermissionPrint");
            return;
        }
        doPrintEscPos(call);
    }

    @PermissionCallback
    private void afterPermissionPrint(PluginCall call) {
        if (needsConnectPermission()) {
            call.reject("Bluetooth permission was not given. Allow \"Nearby devices\" for this app in Android settings.", "PERMISSION_DENIED");
            return;
        }
        doPrintEscPos(call);
    }

    @SuppressLint("MissingPermission")
    private void doPrintEscPos(PluginCall call) {
        String address = call.getString("address");
        String b64 = call.getString("data");
        if (address == null || b64 == null) {
            call.reject("No printer or no data.", "BAD_ARGS");
            return;
        }
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("This phone has no Bluetooth.", "NO_BLUETOOTH");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("Bluetooth is turned off. Turn it on and try again.", "BLUETOOTH_OFF");
            return;
        }
        final byte[] data = Base64.decode(b64, Base64.DEFAULT);
        io.execute(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothDevice device = a.getRemoteDevice(address);
                if (device.getBondState() != BluetoothDevice.BOND_BONDED) {
                    call.reject("This printer is no longer paired. Pair it again in Android Bluetooth settings.", "NOT_PAIRED");
                    return;
                }
                a.cancelDiscovery();
                socket = connect(device);
                OutputStream out = socket.getOutputStream();
                // Small chunks with short pauses: cheap printers have tiny receive buffers.
                for (int i = 0; i < data.length; i += 512) {
                    out.write(data, i, Math.min(512, data.length - i));
                    out.flush();
                    Thread.sleep(25);
                }
                Thread.sleep(400);
                JSObject ret = new JSObject();
                ret.put("bytes", data.length);
                call.resolve(ret);
            } catch (IOException e) {
                call.reject("Could not connect to the printer. Check it is switched on, has paper and is near the phone. (" + e.getMessage() + ")", "UNREACHABLE");
            } catch (Exception e) {
                call.reject("Printing failed: " + e.getMessage(), "FAILED");
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (IOException ignored) { }
                }
            }
        });
    }

    @SuppressLint("MissingPermission")
    private BluetoothSocket connect(BluetoothDevice device) throws IOException {
        try {
            BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            return s;
        } catch (IOException first) {
            // Some printers do not advertise SPP correctly; channel 1 works for most of them.
            try {
                Method m = device.getClass().getMethod("createRfcommSocket", int.class);
                BluetoothSocket s = (BluetoothSocket) m.invoke(device, 1);
                s.connect();
                return s;
            } catch (Exception second) {
                throw first;
            }
        }
    }

    // ------------------------------------------------------------------ save the bill (image / PDF)

    /**
     * Saves a file into the phone: PDFs to Downloads/SP Jewellers, pictures to Pictures/SP Jewellers
     * (Android 10+, through MediaStore, so no storage permission is needed). Returns where it went.
     */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String rawName = call.getString("name");
        String mime = call.getString("mime");
        String b64 = call.getString("data");
        if (rawName == null || mime == null || b64 == null || b64.isEmpty()) {
            call.reject("Nothing to save.", "BAD_ARGS");
            return;
        }
        final String name = rawName.replaceAll("[^A-Za-z0-9._-]", "_");
        final boolean image = mime.startsWith("image/");
        io.execute(() -> {
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                String folder = (image ? "Pictures" : "Downloads") + "/SP Jewellers";
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/SP Jewellers");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri collection = image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    Uri uri = resolver.insert(collection, v);
                    if (uri == null) throw new IOException("The phone would not create the file.");
                    try (java.io.OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) throw new IOException("The phone would not open the file.");
                        out.write(bytes);
                    }
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    resolver.update(uri, done, null, null);
                } else {
                    // Android 9 and older: the app's own folder (no storage permission needed).
                    File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IOException("No storage is available.");
                    File f = new File(dir, name);
                    try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                    folder = "the app's Downloads folder";
                }
                JSObject ret = new JSObject();
                ret.put("location", folder);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not save the file: " + e.getMessage(), "SAVE_FAILED");
            }
        });
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
