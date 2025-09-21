package com.markit.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = getBridge().getWebView();
    webView.setWebViewClient(new WebViewClient());

    if (isNetworkAvailable()) {
      // Load your login URL if network is available
      webView.loadUrl("https://markit.co.in/login");
    } else {
      // Load offline page if network is not available
      webView.loadUrl("file:///android_asset/offline.html");
    }
  }

  private boolean isNetworkAvailable() {
    ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
    if (cm == null) return false;

    Network network = cm.getActiveNetwork();
    if (network == null) return false;

    NetworkCapabilities capabilities = cm.getNetworkCapabilities(network);
    return capabilities != null &&
      (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR));
  }
}
