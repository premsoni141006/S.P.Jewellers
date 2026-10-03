package in.spjewellers.estimate;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SpjPrinterPlugin.class);
        super.onCreate(savedInstanceState);

        // System Back (button, or the edge-swipe gesture): ask the web app to close its topmost
        // screen or pop-up. If it did, that is the whole step. If there is nothing to close (the
        // Home screen), close the app. No browser history is involved, so one Back is always
        // exactly one step - never two.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    exitApp();
                    return;
                }
                webView.evaluateJavascript(
                    "(function(){try{return window.spjHandleBack?window.spjHandleBack():false}catch(e){return false}})()",
                    value -> {
                        if (!"true".equals(value)) exitApp();
                    }
                );
            }
        });
    }

    private void exitApp() {
        // Nothing left to go back to: close the app, as Back normally does on a root screen.
        finish();
    }
}
