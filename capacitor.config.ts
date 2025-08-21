// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.markit.app',
  appName: 'Markit',
  webDir: '.output/public',
  server: {
    androidScheme: 'https',
    // Allow cookies to work properly
    cleartext: true,
    allowNavigation: ['markit.co.in', 'http://172.20.10.2:3000'],
    iosScheme: 'https',
    hostname: 'markit.co.in',
    url: "https://markit.co.in",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
  },
};

export default config;


