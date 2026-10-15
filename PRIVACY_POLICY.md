# سياسة الخصوصية — InvoiceFlow KSA

**تاريخ السريان: 15 أكتوبر 2026**

توضح هذه السياسة كيف يتعامل تطبيق **InvoiceFlow KSA** ("التطبيق") مع بياناتك عند مسح الفواتير وتنظيمها وتصديرها.

## 1. البيانات التي نعالجها

| البيانات | متى | الغرض |
|---|---|---|
| صور الفواتير وملفات PDF | عند المسح أو الاستيراد | استخراج حقول الفاتورة |
| بيانات الفاتورة (المورد، الرقم الضريبي، المبالغ، التاريخ، المشروع، التصنيف، الملاحظات) | بعد الاستخراج والمراجعة | عرضها وتصديرها ومزامنتها |
| البريد الإلكتروني والاسم | عند تسجيل الدخول (Google أو Apple أو البريد) | إنشاء الحساب والمزامنة |
| بريد حساب Google المرتبط بـ Google Sheets | عند ربط Sheets فقط | إضافة الفواتير إلى جدولك |
| معرّف الإعلانات وبيانات الجهاز العامة | عند عرض الإعلانات | عرض إعلانات غير مخصصة عبر Google AdMob |
| عدد القراءات الذكية الشهرية | عند كل قراءة | تطبيق حدود الاستخدام |

لا نطلب الموقع الجغرافي أو جهات الاتصال أو الميكروفون.

## 2. الوضع المحلي (الضيف)

يمكن استخدام التطبيق دون حساب. تُحفظ الفواتير على جهازك فقط. عند طلب القراءة الذكية تُرسل صورة الفاتورة لخادمنا لمعالجتها، ثم تبقى النتيجة على جهازك.

## 3. المعالجة بالذكاء الاصطناعي

تُرسل صورة الفاتورة أو ملف PDF عبر اتصال مشفّر إلى خادمنا (Supabase Edge Functions)، ومنه إلى خدمة Claude من Anthropic لاستخراج الحقول. لا تُستخدم بياناتك لتدريب النماذج وفق شروط Anthropic التجارية. تُعرض النتيجة عليك للمراجعة دائماً قبل اعتمادها.

## 4. التخزين السحابي

عند تسجيل الدخول تُحفظ الفواتير والدفعات وملفات Excel المصدّرة، والصور الأصلية إذا فعّلت خيار "حفظ الصور الأصلية"، في قاعدة بيانات وتخزين خاصين على Supabase. كل حساب معزول بسياسات أمان على مستوى الصفوف (Row Level Security)، ولا يستطيع أي مستخدم آخر الوصول إليها. روابط تحميل الملفات مؤقتة وتنتهي خلال 7 أيام.

## 5. Google Sheets

عند ربط Google Sheets نطلب صلاحيتي `spreadsheets` و`drive.file` فقط لإنشاء جدول InvoiceFlow والإضافة إليه. يُحفظ رمز التحديث (refresh token) مشفّراً بمعيار AES-256-GCM على الخادم ولا يُرسل إلى جهازك. يمكنك إلغاء الربط من داخل التطبيق أو من إعدادات حسابك في Google.

## 6. الإعلانات

يعرض التطبيق إعلانات من Google AdMob، ونطلب **إعلانات غير مخصصة** فقط. لا تظهر الإعلانات أثناء التصوير أو مراجعة الفاتورة. قد تجمع Google معرّف الإعلانات وبيانات تقنية عامة وفق [سياسة خصوصية Google](https://policies.google.com/privacy).

## 7. المشاركة

لا نبيع بياناتك. نشاركها فقط مع مزوّدي الخدمة اللازمين لتشغيل التطبيق: Supabase (الاستضافة وقاعدة البيانات)، وAnthropic (القراءة الذكية)، وGoogle (تسجيل الدخول وSheets والإعلانات)، وApple (تسجيل الدخول على iOS).

## 8. الحذف والتحكم

- حذف أي فاتورة أو دفعة من داخل التطبيق.
- "حذف الفواتير من هذا الجهاز" من الإعدادات.
- **"حذف الحساب"** من الإعدادات: يحذف حسابك وكل الفواتير والملفات من السحابة نهائياً وفوراً.
- أو راسلنا على البريد أدناه لطلب الحذف.

## 9. الأمان

الاتصال مشفّر (HTTPS). البيانات معزولة لكل مستخدم. الأسرار (مفاتيح الخدمات) موجودة على الخادم فقط وليست داخل التطبيق.

## 10. الأطفال

التطبيق موجّه للمحاسبين والشركات، وليس للأطفال دون 13 عاماً.

## 11. التحقق الضريبي

يقرأ التطبيق رمز QR للفاتورة الإلكترونية السعودية قراءة بنيوية فقط. هذا **ليس** تحققاً رسمياً من هيئة الزكاة والضريبة والجمارك.

## 12. التواصل

للاستفسارات أو طلبات الحذف: **ibrahim.aramed@gmail.com**

---

## Privacy Policy (English summary)

InvoiceFlow KSA processes invoice images/PDFs and the extracted invoice fields to organize and export them. Guest mode keeps invoices on the device. When you request a smart read, the file is sent over HTTPS to our backend (Supabase) and to Anthropic's Claude for extraction; it is not used for model training. Signed-in users' invoices, exports and (optionally) original images are stored in a private, per-user Supabase database and storage protected by Row Level Security. Google Sheets access (spreadsheets + drive.file scopes) is optional; the refresh token is stored encrypted server-side. Ads are served by Google AdMob as non-personalized ads only, never during capture or review. We do not sell data. You can delete invoices, local data, or your entire account (Settings → Delete account) at any time. Contact: ibrahim.aramed@gmail.com.
