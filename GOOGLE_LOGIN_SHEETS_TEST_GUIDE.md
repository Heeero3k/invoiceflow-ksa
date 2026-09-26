# دليل اختبار Google Login وGoogle Sheets — InvoiceFlow KSA

هذا الدليل يوضح ما تم تجهيزه، وما يجب ضبطه قبل اختبار تسجيل الدخول والمزامنة فعلياً.

## 1. الحالة الحالية

| العنصر | الحالة |
|---|---|
| Expo project | `@hero2011/invoiceflow-ksa` |
| Android package | `com.app.invoiceflowksa` |
| API production URL | `https://invflowksa-xluebmmk.manus.space` |
| EAS production variable | `EXPO_PUBLIC_API_BASE_URL` مضاف |
| AdMob App ID | موجود في `app.config.ts` |
| AdMob banner | موجود في التطبيق |
| TypeScript | ناجح |
| Tests | 5 ناجحة، 1 متجاوزة |
| Google Login | يحتاج قيم OAuth العامة الحقيقية قبل إعادة البناء |
| Google Sheets | يحتاج Google OAuth Web Client ومتغيرات الخادم السرية |

> فتح `https://invflowksa-xluebmmk.manus.space/` مباشرة قد يعرض `Cannot GET /`. هذا طبيعي لأن العنوان خادم API وليس صفحة ويب.

---

## 2. كيف يعمل المسار

### Google Login

1. يضغط المستخدم **دخول** داخل التطبيق.
2. التطبيق ينشئ رابط OAuth من:
   - `EXPO_PUBLIC_OAUTH_PORTAL_URL`
   - `EXPO_PUBLIC_APP_ID`
3. يفتح المتصفح صفحة Google Login.
4. يعود المستخدم إلى التطبيق عبر:
   ```text
   manusinvoiceflowksa://oauth/callback
   ```
5. التطبيق يرسل `code` و`state` إلى:
   ```text
   /api/oauth/mobile
   ```
6. الخادم ينشئ جلسة ويرجع `app_session_id`.
7. التطبيق يحفظ الجلسة في Android SecureStore ويخرج المستخدم من وضع الضيف.

### Google Sheets

1. يجب تسجيل الدخول أولاً.
2. يضغط المستخدم **ربط Google Sheets**.
3. التطبيق يطلب من الخادم بدء Google OAuth.
4. الخادم يحوّل المستخدم إلى Google للموافقة على:
   ```text
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/drive.file
   ```
5. تعيد Google المستخدم إلى:
   ```text
   https://invflowksa-xluebmmk.manus.space/api/google/sheets/callback
   ```
6. الخادم يحفظ رمز التحديث مشفراً في قاعدة البيانات.
7. يضغط المستخدم **تصدير إلى Google Sheets**.
8. ينشئ الخادم جدولاً باسم:
   ```text
   InvoiceFlow KSA — الفواتير
   ```
   وورقة باسم:
   ```text
   الفواتير
   ```

---

## 3. المتغيرات المطلوبة في EAS

في Expo افتح:

```text
Project Settings → Environment variables → Add variables
```

اختر `production`.

المتغير المؤكد والمضاف حالياً:

```env
EXPO_PUBLIC_API_BASE_URL=https://invflowksa-xluebmmk.manus.space
```

يجب إضافة المتغيرات التالية بعد الحصول على قيمها الحقيقية من إعدادات Manus/OAuth:

```env
EXPO_PUBLIC_OAUTH_PORTAL_URL=<رابط OAuth Portal الحقيقي>
EXPO_PUBLIC_OAUTH_SERVER_URL=<رابط OAuth Server الحقيقي>
EXPO_PUBLIC_APP_ID=<معرّف تطبيق Manus الحقيقي>
EXPO_PUBLIC_OWNER_OPEN_ID=<معرّف المالك الحقيقي>
EXPO_PUBLIC_OWNER_NAME=<اسم المالك الحقيقي>
```

### قواعد مهمة

- استخدم `Plain text` للمتغيرات التي تبدأ بـ `EXPO_PUBLIC_`.
- اربطها ببيئة `production`.
- لا تستخدم قيمة تجريبية أو `placeholder`.
- لا تضع أي `Client Secret` أو كلمة مرور ضمن `EXPO_PUBLIC_*`.
- هذه القيم تدخل داخل التطبيق أثناء البناء ويمكن اعتبارها عامة.

---

## 4. متغيرات الخادم المطلوبة

على خادم الإنتاج فقط، أضف:

```env
GOOGLE_CLIENT_ID=<Google OAuth Web Client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth Web Client Secret>
GOOGLE_REDIRECT_URI=https://invflowksa-xluebmmk.manus.space/api/google/sheets/callback
JWT_SECRET=<سر طويل وعشوائي وثابت>
DATABASE_URL=<رابط قاعدة البيانات>
OAUTH_SERVER_URL=<رابط OAuth Server الحقيقي>
VITE_APP_ID=<معرّف التطبيق الحقيقي>
OWNER_OPEN_ID=<معرّف المالك الحقيقي>
```

لا تضع هذه القيم في GitHub أو داخل تطبيق Expo:

- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET`
- `DATABASE_URL`

---

## 5. إنشاء Google OAuth Client لـ Sheets

من Google Cloud Console:

1. افتح مشروع Google Cloud الصحيح.
2. فعّل:
   - Google Sheets API
   - Google Drive API
3. اضبط OAuth consent screen.
4. أضف Scopes:
   ```text
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/drive.file
   ```
5. أنشئ OAuth Client ID من النوع:
   ```text
   Web application
   ```
6. أضف Authorized redirect URI حرفياً:
   ```text
   https://invflowksa-xluebmmk.manus.space/api/google/sheets/callback
   ```
7. انسخ `Client ID` و`Client Secret` إلى متغيرات الخادم فقط.

### أخطاء Google Cloud الشائعة

| الرسالة | التصحيح |
|---|---|
| `redirect_uri_mismatch` | طابق العنوان حرفياً، بما فيه `https` والمسار الكامل |
| `access_denied` | أضف حساب الاختبار في OAuth consent screen أو أرسل التطبيق للمراجعة |
| لا يظهر Google Sheets | فعّل Sheets API وDrive API في نفس المشروع |
| لا يعود التطبيق | تحقق من Deep Link ووجود `manusinvoiceflowksa` في البناء |

---

## 6. فحص الخادم قبل تشغيل التطبيق

نفّذ من جهاز التطوير:

```bash
curl -i https://invflowksa-xluebmmk.manus.space/api/google/sheets/status
```

النتيجة المتوقعة قبل تسجيل الدخول:

```text
HTTP 401
```

مع رد قريب من:

```json
{"connected":false}
```

هذا يعني أن المسار موجود وأنه ينتظر جلسة مصادقة.

أما:

```bash
curl -i https://invflowksa-xluebmmk.manus.space/
```

فقد يرجع:

```text
Cannot GET /
```

وهذا ليس فشل API.

---

## 7. الاختبار المحلي على الويب

بعد توفير متغيرات OAuth العامة في ملف `.env` محلياً:

```env
EXPO_PUBLIC_API_BASE_URL=https://invflowksa-xluebmmk.manus.space
EXPO_PUBLIC_OAUTH_PORTAL_URL=<القيمة الحقيقية>
EXPO_PUBLIC_OAUTH_SERVER_URL=<القيمة الحقيقية>
EXPO_PUBLIC_APP_ID=<القيمة الحقيقية>
EXPO_PUBLIC_OWNER_OPEN_ID=<القيمة الحقيقية>
EXPO_PUBLIC_OWNER_NAME=<القيمة الحقيقية>
```

لا ترفع `.env` إلى GitHub.

شغّل:

```bash
pnpm install
pnpm check
pnpm test
pnpm dev
```

ثم افتح رابط Expo web الذي يظهر في الطرفية.

### اختبار Login

1. افتح **الإعدادات**.
2. اضغط **دخول**.
3. سجّل الدخول بحساب Google.
4. وافق على الصلاحيات المطلوبة.
5. يجب العودة إلى التطبيق.
6. يجب أن يظهر اسم المستخدم والبريد بدلاً من **وضع الضيف**.
7. أعد تحميل الصفحة وتأكد من بقاء الجلسة.

### اختبار Sheets

1. بعد نجاح تسجيل الدخول، افتح **الإعدادات**.
2. اضغط **ربط Google Sheets**.
3. وافق على الصلاحيات.
4. اضغط **تصدير إلى Google Sheets**.
5. افتح الرابط الناتج.
6. تحقق من وجود ورقة `الفواتير`.
7. تحقق من ظهور صف الفاتورة والعناوين.

---

## 8. الاختبار على Android

متغيرات Expo لا تدخل في AAB موجود مسبقاً. بعد إضافة القيم الحقيقية:

```bash
pnpm check
pnpm test
npx expo config --type public
npx eas build --platform android --profile production
```

يجب رفع `versionCode` أعلى من النسخة السابقة (`8`). مثال:

```text
versionCode = 9
```

بعد تثبيت AAB على Android:

1. افتح التطبيق.
2. افتح الإعدادات.
3. اختبر Google Login.
4. تأكد من العودة إلى:
   ```text
   manusinvoiceflowksa://oauth/callback
   ```
5. اختبر ربط Google Sheets.
6. أغلق التطبيق وافتحه من جديد.
7. تأكد أن الجلسة ما زالت محفوظة.
8. اختبر تسجيل الخروج ثم تسجيل الدخول مرة أخرى.

لا تضغط على إعلانات AdMob أثناء الاختبار، ولا تطلب من المختبرين الضغط عليها.

---

## 9. التحقق من AdMob

تم التحقق من وجود:

- AdMob App ID في `app.config.ts`.
- Banner داخل التطبيق.
- وحدة إعلانية باسم `InvoiceFlow Banner` في AdMob.
- وجود طلبات ومرات ظهور.

حالة AdMob الحالية ما زالت تعرض **يتطلب مراجعة / عرض إعلانات محدود**. لا يعني ذلك أن دمج SDK فاشل؛ يجب ربط التطبيق بصفحة Google Play وانتظار مراجعة Google.

لا نضيف Banner ثانياً الآن حتى لا نؤثر على تجربة المستخدم أو مراجعة Play.

---

## 10. تشخيص سريع للأخطاء

| الخطأ | السبب |
|---|---|
| التطبيق يعرض وضع الضيف فقط | متغيرات OAuth العامة غير موجودة في البناء |
| `تسجيل الدخول غير مهيأ لهذا الإصدار` | `EXPO_PUBLIC_OAUTH_PORTAL_URL` أو `EXPO_PUBLIC_APP_ID` مفقود |
| `Google Sheets OAuth is not configured` | متغيرات Google OAuth غير موجودة على الخادم |
| `401 Invalid session cookie` | الطلب تم قبل تسجيل الدخول أو بدون Bearer token |
| `Cannot GET /` | تم فتح خادم API على المسار الجذري، وهذا طبيعي |
| `redirect_uri_mismatch` | عنوان callback في Google Cloud غير مطابق |
| العودة إلى رابط غير صحيح | أعد بناء التطبيق بعد ضبط scheme ومتغيرات OAuth |
| لا يظهر الجدول | يجب إتمام ربط Google Sheets قبل أول تصدير |

---

## 11. ما تم إنجازه وما بقي

### تم إنجازه

- دمج AdMob SDK والبانر.
- ضبط App ID في Expo.
- رفع الإصلاحات إلى GitHub `main`.
- إضافة `EXPO_PUBLIC_API_BASE_URL` في EAS production.
- إصلاح Deep Link الاحتياطي لـ Google Sheets.
- فحص TypeScript والاختبارات.
- تجهيز مسارات OAuth وGoogle Sheets في الخادم.

### يحتاج قيمة حقيقية من حساب المستخدم

1. `EXPO_PUBLIC_OAUTH_PORTAL_URL`
2. `EXPO_PUBLIC_OAUTH_SERVER_URL`
3. `EXPO_PUBLIC_APP_ID`
4. `EXPO_PUBLIC_OWNER_OPEN_ID`
5. `EXPO_PUBLIC_OWNER_NAME`
6. `GOOGLE_CLIENT_ID`
7. `GOOGLE_CLIENT_SECRET`
8. `DATABASE_URL` و`JWT_SECRET` إذا لم يكونا مضبوطين على الخادم

لا يمكن استخراج هذه القيم بأمان من الكود الحالي، ولا يجوز إنشاء قيم بديلة.

### بعد توفير القيم

1. ضبط EAS production.
2. ضبط أسرار الخادم.
3. تشغيل اختبارات الويب.
4. إنشاء AAB جديد برقم إصدار أعلى.
5. تثبيت النسخة على Android.
6. اختبار Login ثم Sheets.
7. رفع البناء إلى Closed Alpha.
8. استمرار اختبار 12 مستخدماً لمدة 14 يوماً.
9. بعد نجاح الفترة، تقديم طلب Production access في Play Console.

---

## 12. قائمة قبول نهائية

- [ ] تسجيل الدخول يفتح Google OAuth.
- [ ] يعود التطبيق إلى `manusinvoiceflowksa://oauth/callback`.
- [ ] يظهر اسم المستخدم والبريد.
- [ ] تبقى الجلسة بعد إعادة فتح التطبيق.
- [ ] زر ربط Google Sheets يعمل بعد تسجيل الدخول.
- [ ] تتم الموافقة على Sheets وDrive.
- [ ] ينشأ جدول `InvoiceFlow KSA — الفواتير`.
- [ ] تضاف الفاتورة إلى ورقة `الفواتير`.
- [ ] زر فتح الجدول يفتح الرابط الصحيح.
- [ ] لا توجد أسرار في GitHub أو داخل Expo public variables.
- [ ] AdMob SDK موجود في النسخة المختبرة.
- [ ] اختبار Play المغلق مستمر مع 12 مختبراً فعلياً لمدة 14 يوماً.
