# PROJECT_WORKFLOW.md
## TrimMind / صالون النخبة VIP - Architecture & Implementation Blueprint

---

## 1. المعمارية المعتمدة الرسمية (Approved Production Tech Stack)

* **الواجهة الأمامية (Frontend):** React (Vite) + TypeScript + Vanilla/Tailwind CSS + Lucide Icons + React Router DOM + Zustand Store + Framer Motion.
* **الباك إند (Backend Server):** Node.js + Express.js + TypeScript + WebSockets (Socket.io) + Zod Validators + Bcrypt (12 rounds) + JWT Auth.
* **قاعدة البيانات (Database Layer):** **MySQL 8.0+ / MariaDB (SQL Database)**:
  * عميل الاتصال: `mysql2/promise` مع Connection Pool وإدارة الجلسات.
  * الاستعلامات: Parameterized Queries مع Prepared Statements لمنع الـ SQL Injection بنسبة 100%.
  * ملفات المخطط والزرع: [`database/schema.sql`](file:///d:/حلاقه/database/schema.sql) و [`database/seed.sql`](file:///d:/حلاقه/database/seed.sql).
* **طبقة الذكاء الاصطناعي (AI Layer):** Google Gemini 2.0 Flash / Flash-Lite عبر وسيط آمن في السيرفر (`/api/ai/chat`) مع حماية كاملة للمفاتيح.
* **الاستضافة السحابية (Cloud Hosting):** Railway / VPS (Unified Single-Host Service).

---

## 2. هيكل جداول قاعدة البيانات SQL (MySQL Tables)

1. `profiles`: حسابات الإدارة والموظفين وكباتن الحلاقة والعملاء مع تشفير `password_hash` بـ Bcrypt.
2. `branches`: فروع الصالون، العناوين، أرقام الهواتف، وأرقام تحويل إنستاباي وفودافون كاش.
3. `barbers`: كباتن الحلاقة، التخصصات، وسنوات الخبرة والتقييمات.
4. `chairs`: كراسي الحلاقة والخدمة الموزعة على الفروع وحالاتها اللحظية.
5. `services`: كتالوج الخدمات والأسعار الرسمية والمدد الزمنية.
6. `products`: مشروبات الكافيه ومنتجات العناية باللحية والشعر.
7. `bookings`: سجل الحجوزات، المواعيد، الحسابات التقديرية، التوكن السري، ورقم الدور في الطابور.
8. `booking_items`: الطلبات والمشروبات الإضافية المرتبطة بالحجز.
9. `payment_proofs`: إيصالات التحويل عبر إنستاباي وفودافون كاش ومسار الصورة وحالة المراجعة.
10. `queue_entries`: طابور الانتظار اللحظي المربوط بشاشات التلفزيون في الفروع.
11. `ratings`: تقييمات العملاء لجودة الخدمة والمكان والكابتن.
12. `notifications`: مركز الإشعارات الفوري للإدارة والاستقبال.
13. `audit_logs`: سجل الرقابة والأمان لكافة العمليات الحساسة مع الـ IP والتاريخ.
14. `settings`: إعدادات الصالون، الرسوم، والمواعيد الرسمية.

---

## 3. التحصين الأمني الإلزامي (Security Hardening)

* **Zero Trust:** احتساب كافة الأسعار والمواعيد ورسوم الحجز داخل السيرفر من جداول قاعدة البيانات مباشرة.
* **Zero Secrets in Client:** حظر كافة مفاتيح الـ API والـ JWT من الفرونت إند.
* **Rate Limiting:** حماية نقاط تسجيل الدخول ورفع الملفات والحجوزات من الهجمات العشوائية.
* **Prepared SQL Statements:** كل استعلام يمر عبر بروتوكول MySQL الثنائي لمنع حقن الأوامر.
* **Cron Auto-Purge:** حذف صور إيصالات الدفع بعد ساعتين تلقائياً لحفظ الخصوصية وتوفير المساحة.
