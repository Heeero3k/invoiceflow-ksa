# إعداد Google Sheets

يحتاج التصدير المباشر إلى تسجيل OAuth مستقل للتطبيق، لأن التطبيق لا يستطيع استخدام موصلات Manus من داخل الهاتف. أنشئ مشروعاً في Google Cloud، فعّل Google Sheets API، واضبط OAuth consent screen، ثم أضف النطاقين `https://www.googleapis.com/auth/spreadsheets` و`https://www.googleapis.com/auth/drive.file`. استخدم Web application credentials وضع عنوان callback التالي في Google Cloud: `https://<APP_HOST>/api/google/sheets/callback`.

عرّف المتغيرات التالية في بيئة الخادم، ولا تضعها داخل تطبيق الهاتف أو Git:

```env
GOOGLE_CLIENT_ID=ضع_معرف_العميل_هنا
GOOGLE_CLIENT_SECRET=ضع_السر_هنا
GOOGLE_REDIRECT_URI=https://<APP_HOST>/api/google/sheets/callback
```

بعد تشغيل الخادم وتسجيل دخول المستخدم، يطلب التطبيق موافقة Google مرة واحدة، يحفظ refresh token مشفراً في قاعدة بيانات المستخدم، وينشئ جدولاً باسم `InvoiceFlow KSA — الفواتير` عند أول تصدير. لا يتم إرسال refresh token إلى الجهاز، وتُضاف كل فاتورة لاحقة كسطر جديد في ورقة `الفواتير`.
