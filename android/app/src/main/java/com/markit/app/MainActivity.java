package com.markit.app;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;
import android.webkit.CookieManager;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // ✅ allow cookies in WebView
    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);
    cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
  }
}
