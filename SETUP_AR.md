# دليل تشغيل InvoiceFlow KSA (الخادم المستقل)

التطبيق لم يعد يعتمد على Manus. البنية الجديدة:

| الجزء | الخدمة | من يملكه |
|---|---|---|
| تسجيل الدخول (Google / Apple / البريد / ضيف) | Supabase Auth | أنت |
| قاعدة البيانات وتخزين الملفات | Supabase (Postgres + Storage) | أنت |
| قراءة الفواتير بالذكاء الاصطناعي | Claude (Anthropic) عبر Supabase Edge Function | أنت |
| Google Sheets | Google Cloud OAuth | أنت |
| الإعلانات | AdMob | أنت |
| البناء والنشر | Expo EAS | أنت |

> لا توجد أي أسرار داخل التطبيق. المفاتيح السرية تُوضع في Supabase فقط.

---

## 1) إنشاء مشروع Supabase (مرة واحدة، 10 دقائق)

1. أنشئ حساباً في https://supabase.com ثم **New project** (المنطقة المقترحة: Frankfurt `eu-central-1`، أو الأقرب لعملائك).
2. من **Project Settings → API** انسخ:
   - `Project URL` ← قيمة `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public` key ← قيمة `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `Project ref` (الجزء قبل `.supabase.co`)
3. على جهازك داخل مجلد المشروع:

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

هذا ينشئ الجداول، وسياسات الأمان، ومخازن الملفات `invoice-files` و`exports`.

## 2) مفتاح Claude

1. أنشئ مفتاحاً من https://platform.claude.com (قسم API Keys) واشحن رصيداً.
2. ضعه في Supabase (وليس في التطبيق):

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

**النموذج والتكلفة:** الافتراضي `claude-opus-5-5` (أعلى دقة). لتقليل التكلفة كثيراً يمكنك التحويل إلى Haiku (أرخص بنحو 40 مرة) بأمر واحد بدون تحديث التطبيق:

```bash
npx supabase secrets set CLAUDE_MODEL=claude-haiku-5-5
```

حدود القراءات الشهرية: الضيف 10 (`GUEST_MONTHLY_SCANS`)، المستخدم المسجّل 40 (`FREE_MONTHLY_SCANS`)، Pro ‏2000 (`PRO_MONTHLY_SCANS`).

## 3) مفتاح التشفير

```bash
npx supabase secrets set TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

(إن لم يتوفر openssl، استخدم أي نص عشوائي طويل من 64 حرفاً.)

## 4) تسجيل الدخول

في لوحة Supabase → **Authentication → Providers**:

- **Email**: فعّله، وفي **Email Templates → Magic Link** استبدل الرابط بالرمز `{{ .Token }}` حتى يصل المستخدمَ رمز من 6 أرقام.
- **Anonymous sign-ins**: فعّله (مطلوب لوضع الضيف حتى يستخدم القراءة الذكية بحدود).
- **Google**: أنشئ OAuth Client من نوع *Web application* في Google Cloud Console، وأضف Redirect URI:
  `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`، ثم الصق Client ID/Secret في Supabase.
- **Apple** (مطلوب لنسخة iOS): من حساب Apple Developer أنشئ Services ID ومفتاح Sign in with Apple، ثم أدخلها في Supabase.

في **Authentication → URL Configuration → Redirect URLs** أضف:

```
invoiceflowksa://auth-callback
invoiceflowksa://**
exp://**
```

## 5) Google Drive وGoogle Sheets (حفظ ملفات المستخدم في حسابه)

عند **تسجيل الدخول بحساب Google** يوافق المستخدم مرة واحدة على:
- `drive.file`: ينشئ التطبيق مجلد **InvoiceFlow KSA** في Google Drive الخاص بالمستخدم، ويحفظ فيه ملف Excel لكل تصدير مع صور الفواتير الأصلية. لا يستطيع التطبيق رؤية أي ملفات أخرى في Drive.
- `spreadsheets`: ينشئ جدول "InvoiceFlow KSA — سجل الفواتير" ويضيف إليه الفواتير كصفوف.

المستخدم الذي يسجّل بالبريد أو Apple يستطيع ربط Google لاحقاً من شاشة "التصدير".

الإعداد:

1. في Google Cloud Console فعّل **Google Drive API** و**Google Sheets API**.
2. في **OAuth consent screen** أضف الصلاحيات: `drive.file`، `spreadsheets`، `openid`، `email`.
3. **مهم:** استخدم **نفس OAuth Client (Web)** في مزوّد Google داخل Supabase (الخطوة 4) وفي متغيرات الخادم أدناه. لهذا تُحفظ صلاحية Drive مباشرة بعد تسجيل الدخول دون شاشة موافقة ثانية.
4. أضف لهذا الـ Client عنواني Redirect:
   - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
   - `https://YOUR-PROJECT-REF.supabase.co/functions/v1/sheets-callback`
5. ثم:

```bash
npx supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... SHEETS_REDIRECT_URI=https://YOUR-PROJECT-REF.supabase.co/functions/v1/sheets-callback
```

> صلاحيتا `spreadsheets` و`drive.file` تحتاجان **Verification** من Google قبل فتح التسجيل للجميع؛ `spreadsheets` حساسة: قبل النشر العام اطلب **Verification** لشاشة الموافقة من Google (يأخذ أياماً). قبلها يعمل الربط لحسابات المختبرين المضافين فقط.

## 6) نشر دوال الخادم

```bash
pnpm supabase:deploy
```

## 7) إعداد التطبيق

انسخ `.env.example` إلى `.env` واملأ قيم Supabase وAdMob، ثم:

```bash
pnpm install
pnpm start
```

ولبناء EAS أضف نفس القيم كمتغيرات بيئة:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT-REF.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR-ANON-KEY --visibility plaintext
```

## 8) AdMob

- Android: App ID ووحدة البانر موجودة مسبقاً. أنشئ وحدة **Interstitial** وضع معرّفها في `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID`.
- iOS: أنشئ تطبيق iOS في AdMob، ثم ضع `ADMOB_IOS_APP_ID` و`EXPO_PUBLIC_ADMOB_BANNER_IOS` و`EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS`.
- في نسخ التطوير تُعرض إعلانات Google التجريبية تلقائياً.

## 9) البناء والرفع

```bash
pnpm build:android        # AAB للإنتاج (versionCode 12)
pnpm submit:android       # يرفع لمسار الاختبار المغلق (alpha) كمسودة
pnpm build:ios            # يحتاج حساب Apple Developer
pnpm submit:ios           # يرفع إلى TestFlight
```

`submit:android` يحتاج ملف حساب خدمة من Play Console في `secrets/play-service-account.json` (المجلد مستثنى من Git).

## 10) فحوص قبل كل إصدار

```bash
pnpm check && pnpm test && pnpm lint
```
