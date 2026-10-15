import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton, haptic } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { confirmAction } from "@/lib/dialogs";
import { deleteLocalFile, persistCapture, type UploadMime } from "@/lib/files";
import { useI18n } from "@/lib/i18n";
import { useStore, type NewCapture } from "@/lib/store";
import { radius, useTheme } from "@/lib/theme";
import { newId, type InvoiceSource } from "@/shared/invoice";

type Capture = NewCapture & { key: string };
const QR_WINDOW_MS = 12_000;

export default function ScanScreen() {
  const { batchId: existingBatchId } = useLocalSearchParams<{ batchId?: string }>();
  const { colors } = useTheme();
  const { t, row, isRTL, formatShortDate } = useI18n();
  const insets = useSafeAreaInsets();
  const { createBatch, addCaptures } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const lastQr = useRef<{ data: string; at: number } | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const thumbs = useRef<ScrollView>(null);

  const addFiles = async (files: { uri: string; mimeType: UploadMime; source: InvoiceSource }[]) => {
    const persisted = await Promise.all(
      files.map(async (file) => {
        const id = newId();
        const extension = file.mimeType === "application/pdf" ? "pdf" : file.mimeType === "image/png" ? "png" : "jpg";
        const uri = await persistCapture(file.uri, id, extension);
        const qr = lastQr.current && Date.now() - lastQr.current.at < QR_WINDOW_MS ? lastQr.current.data : null;
        if (qr) lastQr.current = null;
        return { key: id, uri, mimeType: file.mimeType, source: file.source, qr } satisfies Capture;
      }),
    );
    setQrVisible(false);
    setCaptures((current) => [...current, ...persisted]);
    setTimeout(() => thumbs.current?.scrollToEnd({ animated: true }), 50);
  };

  const shoot = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      haptic();
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) await addFiles([{ uri: photo.uri, mimeType: "image/jpeg", source: "camera" }]);
    } finally {
      setBusy(false);
    }
  };

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 40, quality: 0.9 });
    if (result.canceled) return;
    await addFiles(result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType === "image/png" ? "image/png" : "image/jpeg", source: "gallery" as const })));
  };

  const pickPdfs = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    await addFiles(result.assets.map((asset) => ({ uri: asset.uri, mimeType: "application/pdf" as const, source: "pdf" as const })));
  };

  const onBarcode = ({ data }: BarcodeScanningResult) => {
    if (!data || lastQr.current?.data === data) return;
    lastQr.current = { data, at: Date.now() };
    setQrVisible(true);
    haptic("success");
  };

  const finish = () => {
    if (!captures.length) return;
    const batchId = existingBatchId ?? createBatch(t("batchNameDefault", { date: formatShortDate(new Date().toISOString()) })).id;
    addCaptures(batchId, captures.map(({ key: _key, ...capture }) => capture));
    haptic("success");
    if (existingBatchId) router.back();
    else router.replace(`/batch/${batchId}`);
  };

  const close = () => {
    if (!captures.length) return router.back();
    confirmAction(`${t("discardScanTitle")}\n${t("discardScanBody", { n: captures.length })}`, t("discard"), t("cancel"), () => {
      captures.forEach((capture) => void deleteLocalFile(capture.uri));
      router.back();
    });
  };

  const removeCapture = (key: string) => {
    setCaptures((current) => {
      const target = current.find((capture) => capture.key === key);
      if (target) void deleteLocalFile(target.uri);
      return current.filter((capture) => capture.key !== key);
    });
  };

  const cameraReady = permission?.granted;

  return (
    <View style={{ flex: 1, backgroundColor: "#07090C" }}>
      {cameraReady ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onBarcode} />
      ) : null}

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 8, flexDirection: row }]}>
        <IconButton icon="close" tone="inverse" label={t("close")} onPress={close} />
        <View style={{ alignItems: "center" }}>
          <Text variant="subheading" style={{ color: "#FFFFFF" }} align="center">
            {t("scanTitle")}
          </Text>
          {captures.length ? (
            <Text variant="caption" style={{ color: "#C9CED6" }} align="center">
              {t("capturedCount", { n: captures.length })}
            </Text>
          ) : null}
        </View>
        {cameraReady && Platform.OS !== "web" ? <IconButton icon={torch ? "flashlight" : "flashlight-off"} tone="inverse" label={t("flash")} onPress={() => setTorch((value) => !value)} /> : <View style={{ width: 40 }} />}
      </View>

      {cameraReady ? (
        <View pointerEvents="none" style={styles.frameWrap}>
          <View style={styles.frame}>
            {["tl", "tr", "bl", "br"].map((corner) => (
              <View key={corner} style={[styles.corner, cornerStyle(corner), { borderColor: qrVisible ? colors.success : "#D2B07A" }]} />
            ))}
          </View>
          <View style={[styles.hint, { backgroundColor: qrVisible ? "rgba(47,125,91,0.85)" : "rgba(0,0,0,0.55)", flexDirection: row }]}>
            <Icon name={qrVisible ? "qrcode-scan" : "file-document-outline"} size={16} color="#FFFFFF" />
            <Text variant="caption" style={{ color: "#FFFFFF" }}>
              {qrVisible ? t("qrDetected") : t("cameraHint")}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.permission, { paddingTop: insets.top + 80 }]}>
          <View style={[styles.permissionIcon, { backgroundColor: "rgba(210,176,122,0.14)" }]}>
            <Icon name="camera-outline" size={34} color="#D2B07A" />
          </View>
          <Text variant="heading" style={{ color: "#FFFFFF" }} align="center">
            {t("cameraPermissionTitle")}
          </Text>
          <Text variant="body" style={{ color: "#AEB4BE" }} align="center">
            {t("cameraPermissionBody")}
          </Text>
          {permission && !permission.granted && permission.canAskAgain !== false ? (
            <Button title={t("allowCamera")} variant="accent" icon="camera" onPress={() => void requestPermission()} style={{ marginTop: 18 }} />
          ) : null}
          <Text variant="label" style={{ color: "#8B919B", marginTop: 22 }} align="center">
            {t("importInstead")}
          </Text>
          <View style={{ flexDirection: row, gap: 10, marginTop: 10, alignSelf: "stretch" }}>
            <Button title={t("importImages")} icon="image-multiple-outline" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => void pickImages()} />
            <Button title={t("importPdfs")} icon="file-pdf-box" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => void pickPdfs()} />
          </View>
        </View>
      )}

      {/* Bottom tray */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
        {captures.length ? (
          <ScrollView
            ref={thumbs}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, flexDirection: isRTL ? "row-reverse" : "row" }}
            style={{ marginBottom: 14 }}
          >
            {captures.map((capture, index) => (
              <View key={capture.key} style={styles.thumb}>
                {capture.mimeType === "application/pdf" ? (
                  <View style={[styles.thumbImage, { alignItems: "center", justifyContent: "center", backgroundColor: "#1D222B" }]}>
                    <Icon name="file-pdf-box" size={26} color="#E47A6E" />
                  </View>
                ) : (
                  <Image source={{ uri: capture.uri }} style={styles.thumbImage} contentFit="cover" />
                )}
                <View style={styles.thumbIndex}>
                  <Text style={{ color: "#FFFFFF", fontSize: 10 }} align="center">
                    {index + 1}
                  </Text>
                </View>
                {capture.qr ? (
                  <View style={styles.thumbQr}>
                    <Icon name="qrcode" size={11} color="#FFFFFF" />
                  </View>
                ) : null}
                <Pressable accessibilityLabel={t("removePhoto")} hitSlop={8} onPress={() => removeCapture(capture.key)} style={styles.thumbRemove}>
                  <Icon name="close" size={12} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.controls, { flexDirection: row }]}>
          <View style={[styles.side, { flexDirection: row }]}>
            <SideButton icon="image-multiple-outline" label={t("gallery")} onPress={() => void pickImages()} />
            <SideButton icon="file-pdf-box" label={t("pdf")} onPress={() => void pickPdfs()} />
          </View>
          {cameraReady ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("tabScan")} onPress={() => void shoot()} style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }]}>
              <View style={styles.shutterInner}>{busy ? <ActivityIndicator color="#0F1B2D" /> : null}</View>
            </Pressable>
          ) : (
            <View style={{ width: 78 }} />
          )}
          <View style={[styles.side, { alignItems: "center", justifyContent: "center" }]}>
            <Pressable
              disabled={!captures.length}
              onPress={finish}
              style={({ pressed }) => [styles.finish, { backgroundColor: captures.length ? "#D2B07A" : "rgba(255,255,255,0.12)", flexDirection: row }, pressed && { opacity: 0.85 }]}
            >
              <Text variant="label" style={{ color: captures.length ? "#14110B" : "#8B919B" }}>
                {t("finishScan", { n: captures.length })}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function SideButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [{ alignItems: "center", gap: 4, width: 52 }, pressed && { opacity: 0.7 }]}>
      <View style={styles.sideIcon}>
        <Icon name={icon} size={22} color="#FFFFFF" />
      </View>
      <Text variant="caption" style={{ color: "#C9CED6", fontSize: 10.5 }} align="center">
        {label}
      </Text>
    </Pressable>
  );
}

function cornerStyle(corner: string) {
  const size = { width: 34, height: 34 };
  switch (corner) {
    case "tl":
      return { ...size, top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 18 };
    case "tr":
      return { ...size, top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 18 };
    case "bl":
      return { ...size, bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 18 };
    default:
      return { ...size, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 18 };
  }
}

const styles = StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, justifyContent: "space-between", alignItems: "center", zIndex: 2 },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingBottom: 120 },
  frame: { width: "80%", aspectRatio: 0.72, maxHeight: "62%" },
  corner: { position: "absolute" },
  hint: { marginTop: 18, alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill },
  permission: { flex: 1, paddingHorizontal: 28, alignItems: "center", gap: 8 },
  permissionIcon: { width: 76, height: 76, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 16, backgroundColor: "rgba(7,9,12,0.72)" },
  controls: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  side: { width: 112, gap: 6 },
  sideIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  finish: { height: 44, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  thumb: { width: 56, height: 72 },
  thumbImage: { width: 56, height: 72, borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)" },
  thumbIndex: { position: "absolute", bottom: 4, left: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center" },
  thumbQr: { position: "absolute", bottom: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: "#2F7D5B", alignItems: "center", justifyContent: "center" },
  thumbRemove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "#B4443C", alignItems: "center", justifyContent: "center" },
});
