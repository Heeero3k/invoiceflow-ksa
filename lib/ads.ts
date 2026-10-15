// Native AdMob integration. Web uses ads.web.ts (no ads).
import { Platform } from "react-native";
import mobileAds, { AdEventType, InterstitialAd, MaxAdContentRating, TestIds } from "react-native-google-mobile-ads";

const env = {
  bannerAndroid: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID || "ca-app-pub-2689118284753908/6316280227",
  bannerIos: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS ?? "",
  interstitialAndroid: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID ?? "",
  interstitialIos: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS ?? "",
};

/** Test units in development builds; production units only when configured. */
export function bannerUnitId(): string | null {
  if (__DEV__) return TestIds.ADAPTIVE_BANNER;
  return (Platform.OS === "ios" ? env.bannerIos : env.bannerAndroid) || null;
}

function interstitialUnitId(): string | null {
  if (__DEV__) return TestIds.INTERSTITIAL;
  return (Platform.OS === "ios" ? env.interstitialIos : env.interstitialAndroid) || null;
}

const requestOptions = { requestNonPersonalizedAdsOnly: true };
export const bannerRequestOptions = requestOptions;

let initialized = false;
export async function initAds() {
  if (initialized) return;
  initialized = true;
  try {
    await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.G, tagForChildDirectedTreatment: false });
    await mobileAds().initialize();
    preloadInterstitial();
  } catch (error) {
    console.warn("[ads] init failed", error);
  }
}

let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let lastShownAt = 0;
const MIN_INTERVAL_MS = 4 * 60 * 1000;

function preloadInterstitial() {
  const unitId = interstitialUnitId();
  if (!unitId) return;
  interstitial = InterstitialAd.createForAdRequest(unitId, requestOptions);
  interstitialLoaded = false;
  interstitial.addAdEventListener(AdEventType.LOADED, () => (interstitialLoaded = true));
  interstitial.addAdEventListener(AdEventType.CLOSED, () => preloadInterstitial());
  interstitial.addAdEventListener(AdEventType.ERROR, () => (interstitialLoaded = false));
  interstitial.load();
}

/**
 * Shown only after a finished export (a natural pause), at most every few
 * minutes — never during capture or review.
 */
export function maybeShowInterstitial() {
  if (!interstitial || !interstitialLoaded || Date.now() - lastShownAt < MIN_INTERVAL_MS) return;
  lastShownAt = Date.now();
  interstitial.show().catch(() => undefined);
}
