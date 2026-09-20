import { Platform, StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";

const PRODUCTION_BANNER_ID = "ca-app-pub-2689118284753908/6316280227";

export function InvoiceBannerAd() {
  if (Platform.OS === "web") return null;

  return (
    <View style={styles.container} accessibilityLabel="إعلان">
      <BannerAd
        unitId={__DEV__ ? TestIds.BANNER : PRODUCTION_BANNER_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginBottom: 18,
    overflow: "hidden",
  },
});
