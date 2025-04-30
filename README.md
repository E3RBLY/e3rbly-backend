# E3rbly Backend

هذه هي الواجهة الخلفية (Backend) لتطبيق E3rbly، تم بناؤها باستخدام Node.js و Express.js. توفر هذه الواجهة الخلفية نقاط نهاية API (Endpoints) لتحليل النصوص العربية، وتوليد التمارين النحوية والاختبارات، والتحقق من الإجابات باستخدام Google Generative AI.

**التحديثات الأخيرة:**
*   **التحقق باستخدام Zod:** تم دمج مكتبة Zod للتحقق من صحة البيانات المستلمة من Google GenAI API قبل إرسالها إلى العميل، مما يضمن تطابق بنية البيانات مع المخططات المتوقعة.
*   **مصادقة مرنة (اختياري):** تم تحديث وسيط المصادقة لدعم وضع المصادقة الاختياري عبر متغير البيئة `AUTH_MODE`. إذا تم تعيين `AUTH_MODE=optional` في ملف `.env`، سيسمح الخادم بالوصول إلى نقاط النهاية حتى بدون رمز مصادقة صالح، مما يسهل عملية التطوير والاختبار. الوضع الافتراضي هو `strict` (يتطلب رمزًا صالحًا).

## هيكل المشروع

```
e3rbly-backend/
├── node_modules/       # تبعيات المشروع
├── src/
│   ├── controllers/    # وحدات التحكم (منطق الطلبات والاستجابات)
│   ├── middleware/     # الوسطاء (مثل المصادقة)
│   ├── routes/         # تعريف مسارات API
│   ├── schemas/        # مخططات Zod للتحقق من صحة البيانات
│   ├── services/       # الخدمات (مثل التفاعل مع Google GenAI)
│   └── utils/          # الأدوات المساعدة
├── .env                # ملف متغيرات البيئة (يجب إنشاؤه)
├── firebase-service-account-key.json # مفتاح حساب خدمة Firebase (يجب إضافته)
├── package.json        # معلومات المشروع والتبعيات
├── package-lock.json   # قفل إصدارات التبعيات
├── README.md           # هذا الملف
└── server.js           # نقطة الدخول الرئيسية للخادم
```

## الإعداد والتشغيل

1.  **استنساخ أو تحميل المشروع:**
    تأكد من أن لديك جميع ملفات المشروع في مجلد واحد.

2.  **تثبيت التبعيات:**
    افتح الطرفية (Terminal) في مجلد المشروع وقم بتشغيل الأمر:
    ```bash
    npm install
    ```

3.  **إعداد متغيرات البيئة:**
    *   قم بإنشاء ملف باسم `.env` في المجلد الرئيسي للمشروع.
    *   أضف مفتاح Google Generative AI الخاص بك:
        ```
        GOOGLE_GENAI_API_KEY=YOUR_GOOGLE_GENAI_API_KEY
        ```
    *   (اختياري) لتمكين الوصول بدون مصادقة أثناء التطوير، أضف:
        ```
        AUTH_MODE=optional
        ```
        (إذا لم يتم تعيين هذا المتغير، فسيتم تطبيق المصادقة الصارمة `strict` بشكل افتراضي).
    *   (اختياري) يمكنك تحديد منفذ الخادم (الافتراضي هو 3001):
        ```
        PORT=3001
        ```

4.  **إضافة مفتاح حساب خدمة Firebase:**
    *   قم بالحصول على ملف مفتاح حساب الخدمة (Service Account Key) بصيغة JSON من إعدادات مشروع Firebase الخاص بك.
    *   ضع هذا الملف في المجلد الرئيسي للمشروع وقم بتسميته `firebase-service-account-key.json`.

5.  **تشغيل الخادم:**
    قم بتشغيل الأمر التالي في الطرفية:
    ```bash
    node server.js
    ```
    سيتم تشغيل الخادم على المنفذ المحدد (الافتراضي 3001).

## نقاط النهاية (API Endpoints)

بشكل افتراضي (`AUTH_MODE=strict`)، تتطلب جميع نقاط النهاية رمز مصادقة Firebase ID Token صالح في ترويسة `Authorization` كـ `Bearer Token`. إذا تم تعيين `AUTH_MODE=optional`، يمكن الوصول إليها بدون رمز.

*   **وحدة تحليل النصوص العربية (`/api/analysis`)**
    *   `POST /analyze`: لتحليل نص عربي.
        *   Body: `{ "arabicText": "النص العربي هنا" }`
    *   `POST /explain`: لشرح تحليل نحوي موجود.
        *   Body: `{ "analysisResult": { ... }, "arabicText": "النص الأصلي" }`

*   **وحدة التمارين (`/api/exercises`)**
    *   `POST /generate`: لتوليد تمارين نحوية.
        *   Body: `{ "difficulty": "beginner"|"intermediate"|"advanced", "exerciseType": "parsing"|"fill-in-blanks"|"error-correction"|"multiple-choice", "count": number }`
    *   `POST /check`: للتحقق من إجابة تمرين.
        *   Body: `{ "exerciseId": "string", "exerciseText": "string", "userAnswer": "string", "correctAnswer": "string", "exerciseType": "string" }`

*   **وحدة الاختبارات (`/api/quiz`)**
    *   `POST /generate`: لتوليد اختبار.
        *   Body: `{ "topic": "string", "difficulty": "beginner"|"intermediate"|"advanced", "questionCount": number }`
    *   `POST /evaluate`: لتقييم إجابة سؤال في اختبار.
        *   Body: `{ "questionId": "string", "userAnswerIndex": number, "correctAnswerIndex": number }`

## ملاحظات

*   تأكد من أن مفتاح Google GenAI API ومفتاح حساب خدمة Firebase آمنان ولا يتم رفعهما إلى مستودعات عامة.
*   تم إعداد CORS للسماح بالطلبات من أي مصدر. قد تحتاج إلى تقييد هذا في بيئة الإنتاج.

