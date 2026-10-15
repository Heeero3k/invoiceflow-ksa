import { useState } from "react";
import { View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { bannerRequestOptions, bannerUnitId } from "@/lib/ads";
import { radius, useTheme } from "@/lib/theme";

/** Quiet inline banner. Collapses entirely if no ad loads. */
export function InlineBanner() {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const unitId = bannerUnitId();
  if (!unitId || failed) return null;
  return (
    <View style={{ marginTop: 22, alignItems: "center", overflow: "hidden", borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
      <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={bannerRequestOptions} onAdFailedToLoad={() => setFailed(true)} />
    </View>
  );
}
