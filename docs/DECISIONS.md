# Architectural Decisions (ADR-lite)

> Last updated: 2026-02-12

هذا الملف لتوثيق القرارات “الخطيرة” بسرعة قبل تنفيذ كبير.

## ADR-001 — Offline Invoice Numbering

- **Status**: Proposed
- **Problem**: نحتاج رقم فاتورة واضح حتى Offline بدون تضارب بين أجهزة/فروع.
- **Options**:
  - **A) Number ranges**: حجز نطاق أرقام مسبقًا لكل (Branch/Device).
  - **B) UUID محلي** + تعيين رقم رسمي عند المزامنة.
- **Notes**:
  - Option B قد يسبب تعقيدًا ضريبيًا/محاسبيًا لو كان الرقم الرسمي مطلوب لحظة الطباعة.

## ADR-002 — Master Data Versioning

- **Status**: Proposed
- **Problem**: تنزيل تغييرات Master Data بكفاءة (delta sync) مع Offline.
- **Options**:
  - `updated_at` per record + `since` cursor.
  - Version number per dataset + change sets.

## ADR-003 — Price Changes During Offline

- **Status**: Proposed
- **Decision direction**:
  - حفظ السعر داخل Order Lines وقت البيع (historical price) + ERP يقبل الفاتورة كما هي.

## ADR-004 — Printing Strategy

- **Status**: Proposed
- **Problem**: طباعة Receipt + Kitchen على Android/Windows.
- **Next steps**:
  - تحديد منصة MVP (Android؟ Windows؟ الاثنين؟)
  - اختيار SDK للطباعة + اختبار “طابعة مطبخ متعددة” + فتح درج الكاش.
