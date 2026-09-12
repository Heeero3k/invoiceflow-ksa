import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import { buildLocalInvoiceDraft, extractLocalInvoiceText } from "@/lib/local-ocr";
import { exportInvoicesToGoogleSheets } from "@/lib/google-sheets";
import { decodeSaudiQrPayload, isValidSaudiTaxId } from "@/shared/invoice-utils";

const emptyDraft: InvoiceDraft = {
  vendorName: "",
  customerName: "",
  vendorTaxId: "",
  invoiceNumber: "",
  issueDate: "",
  projectName: "",
  subtotal: 0,
  vat: 0,
  total: 0,
  currency: "SAR",
  confidence: 0.35,
  source: "camera",
  category: "مشتريات / فاتورة ضريبية",
  qrStatus: "غير مفحوص",
};

type ImageMime = "image/jpeg" | "image/png" | "application/pdf";

export default function ScanScreen() {
  const colors = useColors();
  const { addInvoice } = useInvoices();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrExtraction, setQrExtraction] = useState<Partial<InvoiceDraft> | null>(null);
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const analyze = trpc.invoice.analyze.useMutation();

  const assetToDataUrl = async (uri: string, mimeType: ImageMime) => {
    if (uri.startsWith("data:")) return uri;
    if (Platform.OS !== "web") {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return `data:${mimeType};base64,${base64}`;
    }
    const response = await fetch(uri);
    if (!response.ok) throw new Error("تعذر قراءة الملف المحلي");
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return `data:${mimeType};base64,${globalThis.btoa(binary)}`;
  };

  const mergeDrafts = (local: InvoiceDraft | null, remote: Partial<InvoiceDraft>) => ({
    ...emptyDraft,
    ...(local ?? {}),
    ...remote,
    vendorName: remote.vendorName || local?.vendorName || "",
    customerName: remote.customerName || local?.customerName || "",
    vendorTaxId: remote.vendorTaxId || local?.vendorTaxId || "",
    invoiceNumber: remote.invoiceNumber || local?.invoiceNumber || "",
    issueDate: remote.issueDate || local?.issueDate || "",
    projectName: remote.projectName || local?.projectName || "",
    subtotal: remote.subtotal || local?.subtotal || 0,
    vat: remote.vat || local?.vat || 0,
    total: remote.total || local?.total || 0,
    currency: remote.currency || local?.currency || "SAR",
    confidence: Math.max(remote.confidence ?? 0, local?.confidence ?? 0),
    source: remote.source ?? local?.source ?? "camera",
    sourceUri: remote.sourceUri ?? local?.sourceUri,
    category: remote.category || local?.category || "مشتريات / فاتورة ضريبية",
    qrStatus: remote.qrStatus || local?.qrStatus || "غير مفحوص",
  } satisfies InvoiceDraft);

  const processAsset = async (uri: string, source: InvoiceSource, mimeType: ImageMime = "image/jpeg") => {
    setImageUri(uri);
    setDraft(null);
    setExtractionError("");
    setProcessing(true);
    setProgressLabel("جاري قراءة الصورة وتحسين النص...");
    let localDraft: InvoiceDraft | null = null;

    try {
      if (source !== "pdf") {
        const localOcr = await extractLocalInvoiceText(uri);
        if (localOcr.text) {
          localDraft = { ...emptyDraft, ...buildLocalInvoiceDraft(localOcr.text), source, sourceUri: uri };
          setDraft(localDraft);
          setProgressLabel("تمت القراءة محلياً؛ نتحقق من الحقول عند توفر الاتصال...");
        }
      }

      const imageUrl = await assetToDataUrl(uri, mimeType);

      setProgressLabel("جاري تحليل الحقول بالعربية والإنجليزية...");
      const result = await analyze.mutateAsync({ imageUrl, mimeType, language: "ar" });
      setDraft(mergeDrafts(localDraft, { ...result, source, sourceUri: uri }));
    } catch (error) {
      if (localDraft) setDraft(localDraft);
      else setDraft(null);
      setExtractionError(error instanceof Error ? error.message : "تعذر استخراج بيانات الفاتورة");
      Alert.alert(
        localDraft ? "تم تجهيز الفاتورة جزئياً" : "لم يتم استخراج بيانات الفاتورة",
        localDraft ? "تم استخدام OCR المحلي. راجع الحقول قبل الحفظ." : "استخدم صورة واضحة أو PDF يحتوي نصاً قابلاً للتحديد ثم أعد المحاولة.",
      );
    } finally {
      setProcessing(false);
      setProgressLabel("");
    }
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
    if (!data || data === qrValue) return;
    const extracted = decodeSaudiQrPayload(data);
    setQrValue(data);
    if (extracted) {
      setQrExtraction(extracted);
      setShowCamera(false);
      setDraft({ ...emptyDraft, ...extracted, source: "camera", confidence: extracted.confidence ?? 0.92, qrStatus: extracted.qrStatus ?? "مطابق بنيوياً" });
    }
  };

  const saveInvoice = async () => {
    if (!draft) return;
    const savedInvoice = await addInvoice({ ...draft, vendorName: draft.vendorName || "مورد غير معروف", status: draft.confidence >= 0.82 ? "reviewed" : "needs-review" });
    let cloudCopy = false;
    try {
      await exportInvoicesToGoogleSheets([savedInvoice]);
      cloudCopy = true;
    } catch {
      // Local save is still successful when the user has not connected Google Sheets or is offline.
    }
    Alert.alert("تم الحفظ", cloudCopy ? "حُفظت الفاتورة محلياً وأُضيفت تلقائياً إلى Google Sheets." : "أضيفت الفاتورة إلى السجل المحلي. اربط Google Sheets لتصديرها تلقائياً.", [
      { text: "عرض السجل", onPress: () => router.replace("/(tabs)/invoices") },
      { text: "فاتورة جديدة", onPress: () => { setDraft(null); setImageUri(undefined); setQrValue(""); } },
    ]);
  };

  const startCamera = async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (permission?.granted) setShowCamera(true);
  };

  if (showCamera) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-black"><View style={styles.cameraWrap}><CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handleBarcode} /><View style={styles.cameraTop}><Pressable onPress={() => setShowCamera(false)} style={styles.closeButton}><Text style={styles.closeText}>إغلاق</Text></Pressable><View style={styles.qrPill}><IconSymbol name="tablecells" size={16} color="#FFFFFF" /><Text style={styles.qrText}>{qrValue ? "تم التقاط QR" : "وجّه QR داخل الإطار"}</Text></View></View><View style={styles.scanFrame} /><View style={styles.cameraBottom}><Text style={styles.cameraHint}>اجعل الفاتورة كاملة وواضحة داخل الإطار</Text><Pressable onPress={async () => { const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 }); if (photo?.uri) { setShowCamera(false); await processAsset(photo.uri, "camera"); } }} style={styles.shutter}><View style={styles.shutterInner} /></Pressable></View></View></ScreenContainer>;
  }

  if (draft) {
    const taxIdInvalid = Boolean(draft.vendorTaxId && !isValidSaudiTaxId(draft.vendorTaxId));
    const recalculateTotal = () => setDraft({ ...draft, total: Number((draft.subtotal + draft.vat).toFixed(2)) });
    return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><View style={styles.topRow}><Pressable onPress={() => { setDraft(null); setImageUri(undefined); }}><Text style={[styles.back, { color: colors.primary }]}>رجوع</Text></Pressable><View style={styles.alignEnd}><Text style={[styles.kicker, { color: colors.primary }]}>مراجعة قبل الحفظ</Text><Text style={[styles.titleSmall, { color: colors.foreground }]}>بيانات الفاتورة</Text></View></View>{imageUri && draft.source !== "pdf" && <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />}{draft.source === "pdf" && <View style={[styles.pdfPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}><IconSymbol name="doc.text.fill" size={28} color={colors.primary} /><Text style={[styles.pdfText, { color: colors.foreground }]}>ملف PDF مستورد</Text><Text style={[styles.pdfHint, { color: colors.muted }]}>راجع الحقول المستخرجة قبل الاعتماد</Text></View>}<View style={[styles.aiStatus, { backgroundColor: draft.confidence >= 0.82 ? "#E8F6F1" : "#FFF4DD" }]}><IconSymbol name={draft.confidence >= 0.82 ? "checkmark.circle.fill" : "questionmark.circle"} color={draft.confidence >= 0.82 ? colors.success : "#B67511"} size={20} /><View style={styles.flex}><Text style={[styles.aiTitle, { color: colors.foreground }]}>{draft.confidence >= 0.82 ? "البيانات موثوقة" : "راجع الحقول المظللة قبل الحفظ"}</Text><Text style={[styles.aiCopy, { color: colors.muted }]}>درجة الثقة {Math.round(draft.confidence * 100)}% · يمكنك تعديل أي قيمة يدوياً.</Text></View></View>{qrValue && <View style={[styles.qrNotice, { borderColor: colors.primary }]}><IconSymbol name="checkmark.circle.fill" size={17} color={colors.primary} /><Text style={[styles.qrNoticeText, { color: colors.foreground }]}>تم التقاط QR؛ قارنه مع الرقم الضريبي والإجمالي قبل الحفظ.</Text></View>}<ReviewHeader title="البيانات الأساسية" copy="اضغط على أي قيمة لتصحيحها" colors={colors} /><Field label="اسم المورد / البائع" value={draft.vendorName} onChangeText={(value) => setDraft({ ...draft, vendorName: value })} colors={colors} /><Field label="اسم العميل / الشركة المستلمة" value={draft.customerName} onChangeText={(value) => setDraft({ ...draft, customerName: value })} colors={colors} /><Field label="الرقم الضريبي" value={draft.vendorTaxId} onChangeText={(value) => setDraft({ ...draft, vendorTaxId: value })} keyboardType="numeric" invalid={taxIdInvalid} helper={taxIdInvalid ? "يجب أن يتكون الرقم الضريبي السعودي من 15 رقماً." : "15 رقماً عند توفره"} colors={colors} /><View style={styles.fieldRow}><Field label="رقم الفاتورة" value={draft.invoiceNumber} onChangeText={(value) => setDraft({ ...draft, invoiceNumber: value })} colors={colors} half /><Field label="التاريخ" value={draft.issueDate} onChangeText={(value) => setDraft({ ...draft, issueDate: value })} colors={colors} half /></View><Field label="المشروع / موقع العمل" value={draft.projectName} onChangeText={(value) => setDraft({ ...draft, projectName: value })} colors={colors} /><Field label="تصنيف الفاتورة" value={draft.category} onChangeText={(value) => setDraft({ ...draft, category: value })} colors={colors} /><ReviewHeader title="المبالغ" copy="استخدم الأرقام كما تظهر في الفاتورة" colors={colors} /><View style={styles.fieldRow}><Field label="قبل الضريبة" value={String(draft.subtotal || "")} onChangeText={(value) => setDraft({ ...draft, subtotal: Number(value.replace(/,/g, "")) || 0 })} keyboardType="numeric" colors={colors} half /><Field label="الضريبة" value={String(draft.vat || "")} onChangeText={(value) => setDraft({ ...draft, vat: Number(value.replace(/,/g, "")) || 0 })} keyboardType="numeric" colors={colors} half /></View><Field label="الإجمالي شامل الضريبة" value={String(draft.total || "")} onChangeText={(value) => setDraft({ ...draft, total: Number(value.replace(/,/g, "")) || 0 })} keyboardType="numeric" colors={colors} /><Pressable onPress={recalculateTotal} style={({ pressed }) => [styles.recalcButton, { borderColor: colors.border }, pressed && styles.pressed]}><IconSymbol name="tablecells" color={colors.primary} size={17} /><Text style={[styles.recalcText, { color: colors.primary }]}>احسب الإجمالي من قبل الضريبة + VAT</Text></Pressable><Pressable onPress={saveInvoice} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><IconSymbol name="checkmark.circle.fill" color="#FFFFFF" size={21} /><Text style={styles.saveText}>حفظ الفاتورة في السجل</Text></Pressable><Text style={[styles.disclaimer, { color: colors.muted }]}>المراجعة البشرية مطلوبة دائماً للحقول الضريبية. التطبيق ليس بديلاً عن نظام الفوترة أو الإقرار الرسمي.</Text></ScrollView></ScreenContainer>;
  }

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content}><View style={styles.topRow}><Pressable onPress={() => router.back()}><Text style={[styles.back, { color: colors.primary }]}>إلغاء</Text></Pressable><View style={styles.alignEnd}><Text style={[styles.kicker, { color: colors.primary }]}>التقاط سريع</Text><Text style={[styles.titleSmall, { color: colors.foreground }]}>مسح فاتورة</Text></View></View><View style={[styles.scanHero, { backgroundColor: colors.foreground }]}><View style={styles.heroCircle}><IconSymbol name="viewfinder" color={colors.background} size={34} /></View><Text style={styles.scanTitle}>حوّل الورق إلى بيانات مرتبة</Text><Text style={styles.scanCopy}>OCR محلي دون اتصال، ثم تحليل أعمق عند توفر الإنترنت.</Text><View style={styles.steps}><Step number="1" text="صوّر أو استورد" /><Step number="2" text="راجع الحقول" /><Step number="3" text="صدّر للسجل" /></View></View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>اختر مصدر الفاتورة</Text><SourceButton icon="viewfinder" title="التقاط بالكاميرا" copy="تصوير حي مع قراءة QR وOCR محلي" onPress={startCamera} colors={colors} /><SourceButton icon="plus.circle.fill" title="اختيار من الصور" copy="صورة محلية من المعرض" onPress={pickImage} colors={colors} /><SourceButton icon="doc.text.fill" title="استيراد ملف PDF" copy="فاتورة أو مستند من الجهاز" onPress={pickPdf} colors={colors} /><View style={[styles.tip, { backgroundColor: "#E8F6F1" }]}><IconSymbol name="checkmark.circle.fill" color={colors.primary} size={18} /><Text style={[styles.tipText, { color: colors.foreground }]}>لأفضل نتيجة: صوّر الفاتورة كاملة بإضاءة جيدة وتجنب الانعكاسات.</Text></View>{processing && <View style={styles.processing}><ActivityIndicator color={colors.primary} /><Text style={[styles.processingText, { color: colors.foreground }]}>{progressLabel}</Text></View>}</ScrollView></ScreenContainer>;
}

function ReviewHeader({ title, copy, colors }: { title: string; copy: string; colors: ReturnType<typeof useColors> }) { return <View style={styles.reviewHeader}><Text style={[styles.reviewTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.reviewCopy, { color: colors.muted }]}>{copy}</Text></View>; }
function SourceButton({ icon, title, copy, onPress, colors }: { icon: "viewfinder" | "plus.circle.fill" | "doc.text.fill"; title: string; copy: string; onPress: () => void; colors: ReturnType<typeof useColors> }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.sourceButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.sourceIcon, { backgroundColor: "#E8F6F1" }]}><IconSymbol name={icon} color={colors.primary} size={22} /></View><View style={styles.flex}><Text style={[styles.sourceTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.sourceCopy, { color: colors.muted }]}>{copy}</Text></View><IconSymbol name="chevron.right" color={colors.muted} size={19} /></Pressable>; }
function Field({ label, value, onChangeText, colors, keyboardType, half, invalid, helper }: { label: string; value: string; onChangeText: (text: string) => void; colors: ReturnType<typeof useColors>; keyboardType?: "numeric"; half?: boolean; invalid?: boolean; helper?: string }) { return <View style={[styles.field, half && { flex: 1 }]}><Text style={[styles.fieldLabel, { color: invalid ? colors.error : colors.muted }]}>{label}</Text><View style={styles.inputRow}><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder="غير متوفر" placeholderTextColor={colors.muted} selectionColor={colors.primary} returnKeyType="next" style={[styles.input, { color: colors.foreground, borderColor: invalid ? colors.error : colors.border, backgroundColor: colors.surface }]} />{value ? <Pressable onPress={() => onChangeText("")} style={styles.clearButton}><Text style={[styles.clearText, { color: colors.muted }]}>×</Text></Pressable> : null}</View>{helper ? <Text style={[styles.helper, { color: invalid ? colors.error : colors.muted }]}>{helper}</Text> : null}</View>; }
function Step({ number, text }: { number: string; text: string }) { return <View style={styles.step}><View style={styles.stepCircle}><Text style={styles.stepNumber}>{number}</Text></View><Text style={styles.stepText}>{text}</Text></View>; }

const styles = StyleSheet.create({ content: { paddingBottom: 34 }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }, alignEnd: { alignItems: "flex-end" }, back: { fontSize: 13, fontWeight: "800", marginTop: 4 }, kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 }, titleSmall: { fontSize: 24, fontWeight: "800", marginTop: 3 }, scanHero: { borderRadius: 24, padding: 22, alignItems: "center", marginBottom: 24 }, heroCircle: { width: 68, height: 68, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 14 }, scanTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", textAlign: "center" }, scanCopy: { color: "#C8E9E0", fontSize: 12, textAlign: "center", lineHeight: 19, marginTop: 7 }, steps: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 21 }, step: { alignItems: "center", gap: 6 }, stepCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }, stepNumber: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" }, stepText: { color: "#DFF5EE", fontSize: 10 }, sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 }, sourceButton: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, sourceIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, sourceTitle: { fontSize: 13, fontWeight: "800" }, sourceCopy: { fontSize: 10, marginTop: 5 }, flex: { flex: 1 }, tip: { borderRadius: 14, padding: 13, flexDirection: "row", gap: 9, alignItems: "center", marginTop: 9 }, tipText: { flex: 1, fontSize: 11, lineHeight: 17 }, processing: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 18 }, processingText: { fontSize: 12, fontWeight: "700" }, cameraWrap: { flex: 1, backgroundColor: "#000" }, cameraTop: { position: "absolute", top: 20, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, closeButton: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12 }, closeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 }, qrPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }, qrText: { color: "#FFFFFF", fontSize: 11 }, scanFrame: { position: "absolute", top: "28%", left: "10%", right: "10%", height: "38%", borderWidth: 2, borderColor: "#55D2A6", borderRadius: 18 }, cameraBottom: { position: "absolute", bottom: 30, left: 0, right: 0, alignItems: "center" }, cameraHint: { color: "#FFFFFF", fontSize: 12, marginBottom: 16 }, shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }, shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#FFFFFF" }, preview: { width: "100%", height: 145, borderRadius: 17, marginBottom: 13, backgroundColor: "#E7EFEC" }, pdfPreview: { height: 105, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 13 }, pdfText: { fontSize: 13, fontWeight: "800", marginTop: 7 }, pdfHint: { fontSize: 10, marginTop: 4 }, aiStatus: { borderRadius: 15, padding: 13, flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 12 }, aiTitle: { fontSize: 13, fontWeight: "800" }, aiCopy: { fontSize: 10, lineHeight: 16, marginTop: 3 }, qrNotice: { borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 15 }, qrNoticeText: { flex: 1, fontSize: 10, lineHeight: 16 }, reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 4, marginBottom: 10 }, reviewTitle: { fontSize: 16, fontWeight: "800" }, reviewCopy: { fontSize: 10 }, field: { marginBottom: 13 }, fieldRow: { flexDirection: "row", gap: 10 }, fieldLabel: { fontSize: 11, fontWeight: "700", marginBottom: 6 }, inputRow: { position: "relative" }, input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingRight: 36, fontSize: 13, textAlign: "right" }, clearButton: { position: "absolute", right: 10, top: 12, width: 22, height: 22, alignItems: "center", justifyContent: "center" }, clearText: { fontSize: 20, lineHeight: 20 }, helper: { fontSize: 10, marginTop: 4 }, recalcButton: { height: 42, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 13 }, recalcText: { fontSize: 11, fontWeight: "800" }, saveButton: { height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 2 }, saveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, disclaimer: { fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 13 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] } });
