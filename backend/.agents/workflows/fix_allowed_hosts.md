---
description: Fix ALLOWED_HOSTS DisallowedHost error on Render deployment
---

## خطوات إصلاح `DisallowedHost` على Render

1. **تأكد من أن الكود محدث**
   - تم تعديل `settings.py` لإضافة fallback للمتغيّر `DJANGO_ALLOWED_HOSTS` (انظر السطر 75).

2. **ضبط المتغيّر البيئي على Render**
   - افتح لوحة التحكم الخاصة بـ Render → **Your Service** → **Environment → Variables**.
   - إما:
     - احذف المتغيّر `DJANGO_ALLOWED_HOSTS` إذا لم تحتاج إلى قيم مخصصة، أو
     - حدّثه ليحتوي على القيم المطلوبة (قائمة مفصولة بفواصل):
       ```
       DJANGO_ALLOWED_HOSTS=pos-system-ciq8.onrender.com,localhost,127.0.0.1
       ```
   - احفظ التغييرات.

3. **إعادة بناء (Redeploy) الخدمة**
   - في Render Dashboard → **Deploys** → اضغط **Trigger Deploy** (أو اترك Auto‑Deploy يعمل إذا كان مفعلاً).
   - انتظر حتى يكتمل الـ Docker build وتظهر الحالة **Live**.

4. **تحقق من نجاح الإصلاح**
   - نفّذ طلب HTTP بسيط:
     ```bash
     curl -I https://pos-system-ciq8.onrender.com
     ```
   - يجب أن تحصل على `HTTP/1.1 200 OK` (أو 301/302 إلى HTTPS) ولا تظهر رسائل `DisallowedHost` في السجلات.

5. **(اختياري) إضافة إعدادات أمان إضافية**
   - أضف المتغيّرات التالية في لوحة Render كما هو موضح في الوثيقة السابقة:
     - `DJANGO_DEBUG=False`
     - `DJANGO_SECURE_SSL_REDIRECT=True`
     - `DJANGO_SESSION_COOKIE_SECURE=True`
     - `DJANGO_CSRF_COOKIE_SECURE=True`
     - `DJANGO_SECURE_HSTS_SECONDS=31536000`
     - `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=True`
     - `DJANGO_SECURE_HSTS_PRELOAD=True`
     - `DJANGO_SECURE_PROXY_SSL_HEADER=True`
     - `DJANGO_CSRF_TRUSTED_ORIGINS=https://pos-system-ciq8.onrender.com`
   - بعد تعديل المتغيّرات، أعد نشر الخدمة مرة أخرى.

---

**ملحوظة**: لا يمكن للوكيل تنفيذ تغييرات داخل لوحة Render مباشرة؛ يرجى اتباع الخطوات أعلاه يدويًا. بعد إكمالها، سيختفي خطأ `DisallowedHost` وتعمل التطبيق بأمان.
