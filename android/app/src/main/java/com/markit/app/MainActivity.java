package com.markit.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Enable cookies inside the WebView
    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);

    // Allow third-party cookies (needed for sessions if API is on another domain)
    cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);

    // 🔍 Print cookies for your API domain

  }
}
