import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useInvoices, type InvoiceDraft, type InvoiceSource } from "@/lib/invoice-context";
import { trpc } from "@/lib/trpc";

const emptyDraft: InvoiceDraft = { vendorName: "", vendorTaxId: "", invoiceNumber: "", issueDate: "", projectName: "", subtotal: 0, vat: 0, total: 0, currency: "SAR", confidence: 0.35, source: "camera" };

export default function ScanScreen() {
  const colors = useColors();
  const { addInvoice } = useInvoices();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const analyze = trpc.invoice.analyze.useMutation();

  const processAsset = async (uri: string, source: InvoiceSource, mimeType: "image/jpeg" | "image/png" | "application/pdf" = "image/jpeg") => {
    setImageUri(uri);
    setDraft(null);
    setProcessing(true);
    setProgressLabel("جاري قراءة الصورة وتحسين النص...");
    try {
      let imageUrl = uri;
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        imageUrl = `data:${mimeType};base64,${base64}`;
      } catch {
        // On web, blob URLs may not be readable by the legacy filesystem; keep a local review state.
      }
      setProgressLabel("جاري تحليل الحقول بالعربية والإنجليزية...");
      const result = await analyze.mutateAsync({ imageUrl, mimeType, language: "ar" });
      setDraft({ ...emptyDraft, ...result, source, sourceUri: uri });
    } catch {
      setDraft({ ...emptyDraft, source, sourceUri: uri, confidence: 0.35 });
      Alert.alert("تم تجهيز الصورة للمراجعة", "تعذر الوصول إلى خدمة التحليل الآن. راجع الحقول يدوياً ثم احفظ الفاتورة.");
    } finally {
      setProcessing(false);
      setProgressLabel("");
    }
  };

  const takePhoto = async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission?.granted) return;
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.9, mediaTypes: ["images"] });
    if (!result.canceled) await processAsset(result.assets[0].uri, "camera", result.assets[0].mimeType === "image/png" ? "image/png" : "image/jpeg");
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.9, mediaTypes: ["images"] });
    if (!result.canceled) await processAsset(result.assets[0].uri, "gallery", result.assets[0].mimeType === "image/png" ? "image/png" : "image/jpeg");
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (!result.canceled) await processAsset(result.assets[0].uri, "pdf", "application/pdf");
  };

  const handleBarcode = ({ data }: BarcodeScanningResult) => {
    if (data && data !== qrValue) setQrValue(data);
  };

  const saveInvoice = async () => {
    if (!draft) return;
    await addInvoice({ ...draft, vendorName: draft.vendorName || "مورد غير معروف", status: draft.confidence >= 0.82 ? "reviewed" : "needs-review" });
    Alert.alert("تم الحفظ", "أضيفت الفاتورة إلى السجل المحلي.", [{ text: "عرض السجل", onPress: () => router.replace("/(tabs)/invoices") }, { text: "فاتورة جديدة", onPress: () => { setDraft(null); setImageUri(undefined); } }]);
  };

  if (showCamera) return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-black"><View style={styles.cameraWrap}><CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handleBarcode} /><View style={styles.cameraTop}><Pressable onPress={() => setShowCamera(false)} style={styles.closeButton}><Text style={styles.closeText}>إغلاق</Text></Pressable><View style={styles.qrPill}><IconSymbol name="tablecells" size={16} color="#FFFFFF" /><Text style={styles.qrText}>{qrValue ? "تم التقاط QR" : "وجّه QR داخل الإطار"}</Text></View></View><View style={styles.scanFrame} /><View style={styles.cameraBottom}><Text style={styles.cameraHint}>اجعل الفاتورة كاملة وواضحة داخل الإطار</Text><Pressable onPress={async () => { const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 }); if (photo?.uri) { setShowCamera(false); await processAsset(photo.uri, "camera"); } }} style={styles.shutter}><View style={styles.shutterInner} /></Pressable></View></View></ScreenContainer>;

  if (draft) return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><View style={styles.topRow}><Pressable onPress={() => { setDraft(null); setImageUri(undefined); }}><Text style={[styles.back, { color: colors.primary }]}>رجوع</Text></Pressable><View style={{ alignItems: "flex-end" }}><Text style={[styles.kicker, { color: colors.primary }]}>مراجعة قبل الحفظ</Text><Text style={[styles.titleSmall, { color: colors.foreground }]}>بيانات الفاتورة</Text></View></View>{imageUri && <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />}<View style={[styles.aiStatus, { backgroundColor: draft.confidence >= 0.82 ? "#E8F6F1" : "#FFF4DD" }]}><IconSymbol name={draft.confidence >= 0.82 ? "checkmark.circle.fill" : "questionmark.circle"} color={draft.confidence >= 0.82 ? colors.success : "#B67511"} size={20} /><View style={styles.flex}><Text style={[styles.aiTitle, { color: colors.foreground }]}>{draft.confidence >= 0.82 ? "البيانات موثوقة" : "تحتاج مراجعة بسيطة"}</Text><Text style={[styles.aiCopy, { color: colors.muted }]}>درجة الثقة {Math.round(draft.confidence * 100)}% · راجع الأرقام الرسمية قبل الاعتماد.</Text></View></View><Field label="اسم المورد / البائع" value={draft.vendorName} onChangeText={(value) => setDraft({ ...draft, vendorName: value })} colors={colors} /><Field label="الرقم الضريبي" value={draft.vendorTaxId} onChangeText={(value) => setDraft({ ...draft, vendorTaxId: value })} keyboardType="numeric" colors={colors} /><View style={styles.fieldRow}><Field label="رقم الفاتورة" value={draft.invoiceNumber} onChangeText={(value) => setDraft({ ...draft, invoiceNumber: value })} colors={colors} half /><Field label="التاريخ" value={draft.issueDate} onChangeText={(value) => setDraft({ ...draft, issueDate: value })} colors={colors} half /></View><Field label="المشروع / موقع العمل" value={draft.projectName} onChangeText={(value) => setDraft({ ...draft, projectName: value })} colors={colors} /><View style={styles.fieldRow}><Field label="قبل الضريبة" value={String(draft.subtotal || "")} onChangeText={(value) => setDraft({ ...draft, subtotal: Number(value.replace(/,/g, "")) || 0 })} keyboardType="numeric" colors={colors} half /><Field label="الضريبة" value={String(draft.vat || "")} onChangeText={(value) => setDraft({ ...draft, vat: Number(value.replace(/,/g, "")) || 0 })} keyboardType="numeric" colors={colors} half /></View><Field label="الإجمالي شامل الضريبة" value={String(draft.total || "")} onChangeText={(value) => setDraft({ ...draft, total: Number(value.replace(/,/g, "")) || 0 })} keyboardType="numeric" colors={colors} /><Pressable onPress={saveInvoice} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><IconSymbol name="checkmark.circle.fill" color="#FFFFFF" size={21} /><Text style={styles.saveText}>حفظ الفاتورة في السجل</Text></Pressable><Text style={[styles.disclaimer, { color: colors.muted }]}>المراجعة البشرية مطلوبة دائماً للحقول الضريبية. التطبيق ليس بديلاً عن نظام الفوترة أو الإقرار الرسمي.</Text></ScrollView></ScreenContainer>;

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content}><View style={styles.topRow}><Pressable onPress={() => router.back()}><Text style={[styles.back, { color: colors.primary }]}>إلغاء</Text></Pressable><View style={{ alignItems: "flex-end" }}><Text style={[styles.kicker, { color: colors.primary }]}>التقاط سريع</Text><Text style={[styles.titleSmall, { color: colors.foreground }]}>مسح فاتورة</Text></View></View><View style={[styles.scanHero, { backgroundColor: colors.foreground }]}><View style={styles.heroCircle}><IconSymbol name="viewfinder" color={colors.background} size={34} /></View><Text style={styles.scanTitle}>حوّل الورق إلى بيانات مرتبة</Text><Text style={styles.scanCopy}>يدعم الفواتير العربية والإنجليزية، وحقول VAT وQR السعودية.</Text><View style={styles.steps}><Step number="1" text="صوّر أو استورد" /><Step number="2" text="راجع الحقول" /><Step number="3" text="صدّر للسجل" /></View></View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>اختر مصدر الفاتورة</Text><SourceButton icon="viewfinder" title="التقاط بالكاميرا" copy="تصوير حي مع قراءة QR" onPress={() => setShowCamera(true)} colors={colors} /><SourceButton icon="plus.circle.fill" title="اختيار من الصور" copy="صورة محلية من المعرض" onPress={pickImage} colors={colors} /><SourceButton icon="doc.text.fill" title="استيراد ملف PDF" copy="فاتورة أو مستند من الجهاز" onPress={pickPdf} colors={colors} /><View style={[styles.tip, { backgroundColor: "#E8F6F1" }]}><IconSymbol name="checkmark.circle.fill" color={colors.primary} size={18} /><Text style={[styles.tipText, { color: colors.foreground }]}>لأفضل نتيجة: صوّر الفاتورة كاملة بإضاءة جيدة وتجنب الانعكاسات.</Text></View>{processing && <View style={styles.processing}><ActivityIndicator color={colors.primary} /><Text style={[styles.processingText, { color: colors.foreground }]}>{progressLabel}</Text></View>}</ScrollView></ScreenContainer>;
}

function SourceButton({ icon, title, copy, onPress, colors }: { icon: "viewfinder" | "plus.circle.fill" | "doc.text.fill"; title: string; copy: string; onPress: () => void; colors: ReturnType<typeof useColors> }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.sourceButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.sourceIcon, { backgroundColor: "#E8F6F1" }]}><IconSymbol name={icon} color={colors.primary} size={22} /></View><View style={styles.flex}><Text style={[styles.sourceTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.sourceCopy, { color: colors.muted }]}>{copy}</Text></View><IconSymbol name="chevron.right" color={colors.muted} size={19} /></Pressable>; }
function Field({ label, value, onChangeText, colors, keyboardType, half }: { label: string; value: string; onChangeText: (text: string) => void; colors: ReturnType<typeof useColors>; keyboardType?: "numeric"; half?: boolean }) { return <View style={[styles.field, half && { flex: 1 }]}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder="غير متوفر" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} /></View>; }
function Step({ number, text }: { number: string; text: string }) { return <View style={styles.step}><View style={styles.stepCircle}><Text style={styles.stepNumber}>{number}</Text></View><Text style={styles.stepText}>{text}</Text></View>; }

const styles = StyleSheet.create({ content: { paddingBottom: 34 }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }, back: { fontSize: 13, fontWeight: "800", marginTop: 4 }, kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 }, titleSmall: { fontSize: 24, fontWeight: "800", marginTop: 3 }, scanHero: { borderRadius: 24, padding: 22, alignItems: "center", marginBottom: 24 }, heroCircle: { width: 68, height: 68, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 14 }, scanTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", textAlign: "center" }, scanCopy: { color: "#C8E9E0", fontSize: 12, textAlign: "center", lineHeight: 19, marginTop: 7 }, steps: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 21 }, step: { alignItems: "center", gap: 6 }, stepCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }, stepNumber: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" }, stepText: { color: "#DFF5EE", fontSize: 10 }, sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 }, sourceButton: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, sourceIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, sourceTitle: { fontSize: 13, fontWeight: "800" }, sourceCopy: { fontSize: 10, marginTop: 5 }, flex: { flex: 1 }, tip: { borderRadius: 14, padding: 13, flexDirection: "row", gap: 9, alignItems: "center", marginTop: 9 }, tipText: { flex: 1, fontSize: 11, lineHeight: 17 }, processing: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 18 }, processingText: { fontSize: 12, fontWeight: "700" }, cameraWrap: { flex: 1, backgroundColor: "#000" }, cameraTop: { position: "absolute", top: 20, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, closeButton: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12 }, closeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 }, qrPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }, qrText: { color: "#FFFFFF", fontSize: 11 }, scanFrame: { position: "absolute", top: "28%", left: "10%", right: "10%", height: "38%", borderWidth: 2, borderColor: "#55D2A6", borderRadius: 18 }, cameraBottom: { position: "absolute", bottom: 30, left: 0, right: 0, alignItems: "center" }, cameraHint: { color: "#FFFFFF", fontSize: 12, marginBottom: 16 }, shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }, shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#FFFFFF" }, preview: { width: "100%", height: 145, borderRadius: 17, marginBottom: 13, backgroundColor: "#E7EFEC" }, aiStatus: { borderRadius: 15, padding: 13, flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 16 }, aiTitle: { fontSize: 13, fontWeight: "800" }, aiCopy: { fontSize: 10, lineHeight: 16, marginTop: 3 }, field: { marginBottom: 13 }, fieldRow: { flexDirection: "row", gap: 10 }, fieldLabel: { fontSize: 11, fontWeight: "700", marginBottom: 6 }, input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, textAlign: "right" }, saveButton: { height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 6 }, saveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, disclaimer: { fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 13 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] } });
