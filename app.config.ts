import type { ExpoConfig } from "expo/config";

// Store identity. Do not change these after release: Play Console and App Store
// Connect are bound to the package / bundle identifier.
const BUNDLE_ID = "com.app.invoiceflowksa";
const SCHEME = "invoiceflowksa";

// AdMob app IDs are public identifiers (they ship inside the app binary).
// The iOS value falls back to Google's official sample app ID so iOS builds
// work before the real iOS app is created in AdMob; replace it via env.
const ADMOB_ANDROID_APP_ID = process.env.ADMOB_ANDROID_APP_ID || "ca-app-pub-2689118284753908~5629884518";
const ADMOB_IOS_APP_ID = process.env.ADMOB_IOS_APP_ID || "ca-app-pub-3940256099942544~1458002511";

const config: ExpoConfig = {
  name: "InvoiceFlow KSA",
  slug: "invoiceflow-ksa",
  owner: "hero2011",
  version: "1.2.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: SCHEME,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: ["ar", "en"],
    },
  },
  android: {
    versionCode: 14,
    adaptiveIcon: {
      backgroundColor: "#0F1B2D",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: BUNDLE_ID,
    permissions: ["com.google.android.gms.permission.AD_ID"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-localization",
    [
      "expo-camera",
      {
        cameraPermission: "يستخدم InvoiceFlow KSA الكاميرا لتصوير الفواتير وقراءة رمز QR الضريبي.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "يحتاج InvoiceFlow KSA الوصول للصور لاستيراد صور الفواتير.",
        cameraPermission: "يستخدم InvoiceFlow KSA الكاميرا لتصوير الفواتير.",
        microphonePermission: false,
      },
    ],
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: ADMOB_ANDROID_APP_ID,
        iosAppId: ADMOB_IOS_APP_ID,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#F6F4EF",
        dark: { backgroundColor: "#0B0D11" },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
          // R8: Play flags unoptimized DEX code (deadline Feb 2027); also shrinks the download.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "19309587-5e19-4b64-b9ac-bdf58b77e287",
    },
    // Keep native layout LTR; the app mirrors its own layout per language so
    // switching Arabic <-> English is instant and identical on every platform.
    supportsRTL: false,
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
