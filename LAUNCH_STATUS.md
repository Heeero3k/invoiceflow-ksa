# حالة الإطلاق — InvoiceFlow KSA

آخر تحديث: 15 أكتوبر 2026 · الفرع: `feat/supabase-claude-redesign`

## الهوية

| البند | القيمة |
|---|---|
| Android package / iOS bundle | `com.app.invoiceflowksa` (لم يتغير) |
| الإصدار | 1.1.0 |
| Android versionCode | 12 (آخر رقم مستخدم في Play: 11) |
| iOS buildNumber | 1 |
| Expo account / project | `hero2011` / `19309587-5e19-4b64-b9ac-bdf58b77e287` |
| Deep link scheme | `invoiceflowksa://` (كان `manusinvoiceflowksa`) |

## ما تم في هذا الفرع

- إزالة كل الاعتماد على Manus (OAuth، Forge LLM، الاستضافة، قاعدة MySQL) وإزالة خادم Express/tRPC.
- خادم مستقل على Supabase: جداول بسياسات RLS، تخزين خاص، 4 دوال Edge (`extract-invoice`، `sheets`، `sheets-callback`، `delete-account`). كلها اجتازت فحص Deno.
- القراءة الذكية عبر Claude (صور + PDF مباشرة) بمخرجات JSON مقيدة بمخطط، وحدود شهرية (ضيف 10، مسجّل 40، Pro 2000) مع استرجاع الرصيد عند فشل الخدمة.
- إعادة تصميم كاملة (Ink & Champagne): خط IBM Plex Sans Arabic، وضع فاتح/داكن، عربي/إنجليزي بتبديل فوري.
- مسح متعدد بالكاميرا مع التقاط QR، واستيراد عدة صور وملفات PDF، وطابور معالجة يعمل بالخلفية ويستأنف بعد إغلاق التطبيق أو انقطاع الإنترنت.
- دفعات (Batches) مع تقدم المعالجة، ومراجعة متتالية "اعتماد والتالي"، واعتماد جماعي آمن للفواتير الواضحة فقط.
- فحوص محاسبية: تطابق المبالغ، ضريبة 15٪، صيغة الرقم الضريبي، مقارنة QR.
- تصدير Excel حقيقي (.xlsx) بأربع أوراق (سجل + ملخصات التصنيف/المورد/المشروع) — **تم التحقق بفتحه في Microsoft Excel**: RTL، تواريخ حقيقية، صيغ مجاميع.
- CSV لبرامج المحاسبة، رفع للسحابة مع روابط تحميل للكمبيوتر وسجل ملفات، وإضافة إلى Google Sheets.
- مزامنة سحابية محلية-أولاً بين الأجهزة، ونقل فواتير الضيف تلقائياً عند تسجيل الدخول.
- حذف الحساب من داخل التطبيق (مطلوب من Apple وGoogle).
- AdMob: بانر هادئ في الرئيسية والقوائم والتصدير، وإعلان بيني بعد التصدير فقط (مرة كل 4 دقائق كحد أقصى)، إعلانات غير مخصصة.

## الفحوص

| الفحص | النتيجة |
|---|---|
| `pnpm check` (TypeScript) | ناجح |
| `pnpm test` | 16/16 ناجحة |
| `pnpm lint` | بلا أخطاء |
| `expo export --platform android` | ناجح (Hermes bundle) |
| Deno type-check لدوال Supabase | ناجح |
| تشغيل الويب ومسار: إضافة ← مراجعة ← اعتماد ← تصدير Excel | ناجح |
| `expo-doctor` | 17/18 (تحذير إصدارين أحدث من المتوقع في react-navigation، غير مؤثر) |

## لم يُختبر بعد (يحتاج خطوات منك)

- القراءة الذكية الفعلية، وتسجيل الدخول، والمزامنة، وGoogle Sheets: تحتاج مشروع Supabase ومفاتيح (انظر `SETUP_AR.md`).
- الكاميرا وOCR المحلي والإعلانات على جهاز حقيقي: تحتاج build جديداً (`pnpm build:android`).

## عوائق النشر

### Google Play
1. إنشاء مشروع Supabase وتنفيذ `SETUP_AR.md` (الخطوات 1–7).
2. بناء AAB جديد ورفعه لمسار الاختبار المغلق.
3. **12 مختبراً مشتركين لمدة 14 يوماً متواصلة** (حساب شخصي) — حالياً 3 فقط.
4. تحديث Data Safety وفق `STORE_LISTING.md` (تغيّرت: Anthropic بدل Manus، الصور، حذف الحساب).
5. لقطات شاشة جديدة للتصميم الجديد.
6. Google OAuth verification لصلاحية Sheets قبل فتحها لكل المستخدمين.
7. طلب Production access بعد انتهاء الـ14 يوماً.

### App Store
1. اشتراك Apple Developer Program (99$ سنوياً) — يجب أن تسجّل بنفسك.
2. تفعيل Sign in with Apple في Supabase (مطلوب لأن التطبيق يعرض تسجيل Google).
3. إنشاء تطبيق iOS في AdMob ووضع معرّفاته.
4. `pnpm build:ios` ثم `pnpm submit:ios` إلى TestFlight، ثم المراجعة.

## خطوات يدوية متبقية (لا يمكن أتمتتها)
- إنشاء حسابات: Supabase، Anthropic (مع رصيد)، Apple Developer.
- لصق المفاتيح السرية في Supabase (`supabase secrets set`).
- ملف حساب الخدمة لـ Play (`secrets/play-service-account.json`) لرفع النسخ تلقائياً.
- دعوة المختبرين وجمع ملاحظاتهم.

## تحديث: الحفظ في Google Drive الخاص بالمستخدم (فرع `feat/google-drive-storage`)

- تسجيل الدخول بحساب Google يطلب صلاحيتي `drive.file` و`spreadsheets` مرة واحدة، ويُحفظ رمز التحديث مشفّراً تلقائياً (لا شاشة موافقة ثانية).
- التصدير إلى Drive: مجلد "InvoiceFlow KSA" في حساب المستخدم، وداخله مجلد لكل تصدير يحوي ملف Excel وصور الفواتير الأصلية (بنفس ترتيب صفوف Excel).
- الرفع يتم من الجهاز إلى Google مباشرة بتوكن مؤقت (ساعة) محدود بملفات التطبيق فقط.
- سجل الملفات في شاشة التصدير يفتح روابط Drive/Sheets.
- يتطلب: ترحيل قاعدة البيانات الثاني (`20261016000000_google_drive.sql`) وأن يستخدم مزوّد Google في Supabase نفس OAuth Client الموجود في `GOOGLE_CLIENT_ID`.
- لم يُختبر فعلياً بعد (يحتاج مشروع Supabase وحساب Google Cloud).
