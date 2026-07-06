package dev.codex.linguafloat;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private String pendingText;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleProcessText(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleProcessText(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        flushPendingText();
    }

    private void handleProcessText(Intent intent) {
        if (intent == null || !Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())) {
            return;
        }

        CharSequence selected = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        if (selected == null) {
            return;
        }

        pendingText = selected.toString();
        flushPendingText();
    }

    private void flushPendingText() {
        if (pendingText == null || getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        String selected = pendingText;
        pendingText = null;
        String script =
            "window.dispatchEvent(new CustomEvent('android-process-text',{detail:{text:" +
            JSONObject.quote(selected) +
            "}}));";

        getBridge().getWebView().postDelayed(
            () -> getBridge().getWebView().evaluateJavascript(script, null),
            120
        );
    }
}
