# WhatsApp Booking Implementation — Implementation Specification لتنفيذ Anti-Gravity

> **حالة الوثيقة:** Implementation Specification جاهزة للتنفيذ المباشر. لم يُعدَّل أي كود أو ملف في
> المشروع أثناء إعداد هذه الوثيقة. كل بند فيها إما (أ) **مُتحقَّق منه مباشرة من الكود الفعلي** في هذه
> الجولة (مُشار إليه بـ`[VERIFIED مباشرة]` مع مسار الملف/السطر)، أو (ب) **منقول من** `WhatsApp Chatbot
> Intelligent.md` وتمت إعادة التحقق منه مطابقًا للكود الحالي (مُشار إليه بـ`[من الخطة المعمارية —
> مطابق]`)، أو (ج) **قرار تصميم جديد** بُني فوق (أ) و(ب) لسدّ فجوة موثّقة (مُشار إليه بـ`[تصميم جديد]`).
> أي فرق بين هذه الوثيقة والخطة المعمارية الأصلية بسبب اكتشاف جديد في الكود مذكور صراحة في §2.9.

> **لـAnti-Gravity:** نفّذ المراحل بالترتيب في §22. كل مرحلة لها Acceptance Criteria قابلة للاختبار.
> لا تنتقل لمرحلة تالية قبل اجتياز اختبارات المرحلة الحالية في §21. القواعد في §0 غير قابلة للتفاوض
> تحت أي ظرف، في أي مرحلة.

---

## 0. Critical Implementation Rules — غير قابلة للتفاوض

هذه القواعد تحكم كل سطر كود يُكتب في هذا المشروع من الآن فصاعدًا لمسار الواتساب. أي Pull Request أو
تغيير يخالف بندًا واحدًا منها يُرفض تلقائيًا بغض النظر عن أي مبرر:

1. **لا تستبدل خدمة WhatsApp الحالية.** `@whiskeysockets/baileys` عبر `server/src/services/whatsapp.service.ts`
   يبقى طبقة النقل الوحيدة. لا Evolution API حقيقي، لا مكتبة واتساب بديلة.
2. **لا تُنشئ WhatsApp integration جديدة.** اتصال Baileys الحالي (`sock` في `whatsapp.service.ts`) هو
   الاتصال الوحيد المسموح به لإرسال/استقبال رسائل واتساب في كامل المشروع.
3. **لا يكون AI مصدر الحقيقة لأي رقم أو حالة.** كل سعر/خدمة/باقة/حلاق/موعد/توفر/عربون/رقم حجز/Tracking
   Code/حالة طابور/حالة دفع يُذكر للعميل **يجب** أن يأتي من نتيجة استدعاء أداة طازجة في نفس الجولة
   الحوارية، لا من ذاكرة نصية ولا من تخمين النموذج.
4. **لا تُخزَّن بيانات حساسة في Browser Memory.** (localStorage/sessionStorage للتوكنات الحساسة أو بيانات
   العملاء) — هذا القيد يشمل أي تعديل على الواجهة الأمامية يلامسه هذا المشروع.
5. **لا تعتمد على In-Memory Conversation Memory كذاكرة دائمة.** `chatHistories`, `bookingSessions`
   (كلاهما `Map` في `whatsapp.service.ts`)، و`Window Buffer Memory` (n8n) تُحذف/تُصبح Cache اختياري
   فقط بعد Phase 2. المصدر الدائم الوحيد هو `conversation_sessions`/`conversation_messages` (§7).
6. **لا يُسمح للـAI باختراع الأسعار.** أي حجز بخدمات غير مُسعَّرة مسبقًا **يجب** أن يمر عبر مسار
   `custom_pricing_requested` (§10) وينتظر تسعيرًا بشريًا فعليًا.
7. **لا يُسمح للـAI بتأكيد عملية لم يؤكد نجاحها الـBackend فعليًا.** ممنوع أي رد للعميل يقول "تم" قبل
   استلام استجابة HTTP ناجحة (`success: true` بجسم استجابة حقيقي، وليس Timeout يُفسَّر تفاؤليًا).
8. **لا يُنشأ Booking بدون Database confirmation.** كل إنشاء حجز يمر حصرًا عبر
   `container.createBookingUseCase.execute()` (المسار الموجود فعليًا عبر `createBooking()` في
   `server/src/services/booking.service.ts`) — **ممنوع** أي `INSERT INTO bookings` خام موازٍ في أي
   Route (هذا يخالف الوضع الحالي في `agentTools.routes.ts:1074-1091` و`bookings.routes.ts` مسار
   `customize-and-dispatch` — كلاهما يُصلَح في Phase 3/6).
9. **لا تعتمد على n8n وحده في Business Logic.** n8n طبقة Orchestration/HTTP calls فقط. كل قاعدة عمل
   (هل الحقل ناقص، هل يوجد تعارض، هل رقم الهاتف مطابق) تُنفَّذ في الـBackend (Node/TypeScript)، وليس
   كـCode node منطق أعمال داخل n8n.
10. **Business Logic الأساسية في Backend.** انظر §9 أعلاه — نفس المبدأ، من زاوية أين تُكتب لا أين تُستدعى.
11. **Database هي Source of Truth.** حذف نهائي لأي متغيّر Fallback ثابت في الكود المصدري يحتوي أسعارًا/
    خدمات/اسم صالون حقيقية (`liveSyncedState` في `agentTools.routes.ts`، والمصفوفة الثابتة في
    `ai.routes.ts:31-42` — الأخيرة خارج نطاق الواتساب لكن تتبع نفس المبدأ إن لُمست لاحقًا).
12. **Clean Architecture وSOLID حيثما ينطبق.** القالب المرجعي الإلزامي: `usecases/waitlist/*` و
    `usecases/bookings/CreateBookingUseCase.ts` + `MySQLBookingRepository`. كل أداة جديدة أو مُصلَحة في
    §6.3/§9 **يجب** أن تتبع نفس النمط (Route رقيق → UseCase → Repository)، لا SQL خام داخل Route.
13. **Backward Compatibility.** أي Endpoint موجود يُستخدم من الواجهة الأمامية (`src/lib/api.ts`) يبقى
    بنفس التوقيع (Path + شكل الاستجابة) ما لم يُذكر صراحة تغييره في §22 مع تحديث الطرف المستهلك.
14. **قاعدة تنفيذية إضافية**: أي جدول/عمود جديد في قاعدة البيانات **يُضاف عبر نفس آلية الـMigration
    الذاتي الموجودة فعليًا** في `server/src/services/cleanup.service.ts` (دالة `ensureInitialDbData()`,
    نمط `CREATE TABLE IF NOT EXISTS` + مصفوفة `safeColumns` من `ALTER TABLE ... ADD COLUMN` بداخل
    `try/catch` صامت لكل عبارة) — **وليس** عبر أداة Migration جديدة أو ملف SQL منفصل يحتاج تشغيلًا
    يدويًا. هذا هو النمط الفعلي الوحيد المُستخدَم في المشروع حاليًا لإضافة `bookings.needs_human_attention`
    وغيرها (مُتحقَّق منه، §2.9).

---

## 1. الغرض من هذه الوثيقة وكيفية استخدامها

هذه الوثيقة تُحوّل التصميم المعماري في `WhatsApp Chatbot Intelligent.md` إلى تعليمات تنفيذ دقيقة:
مسارات ملفات فعلية، أسماء دوال فعلية، أسماء أعمدة/جداول فعلية، ونمط الكود المُتَّبع فعليًا في هذا
المشروع تحديدًا (وليس نمطًا عامًا). كل قسم يذكر: **أين الكود الآن بالضبط**، **ماذا يتغيّر بالضبط**،
**كيف يتحقق Anti-Gravity أن التغيير صحيح**.

---

## 2. ملخص التحقق من الكود (Verification Summary)

### 2.1 تأكيد الازدواجية الجذرية `[VERIFIED مباشرة]`

`server/src/services/whatsapp.service.ts:507` و`:511` بالضبط:
```
forwardToN8nWebhook(msg, base64ImageUrl, senderPhone, text);   // سطر 507
await handleIncomingWithAI(remoteJid, senderPhone, text, isImage, base64ImageUrl, pushName);  // سطر 511
```
كلاهما داخل نفس معالج `sock.ev.on('messages.upsert', ...)` (سطر 424)، بلا قفل أو تنسيق. مؤكَّد 100%.

### 2.2 تأكيد `bookings/create-pending` بلا رد نجاح `[VERIFIED مباشرة]`

`server/src/routes/agentTools.routes.ts:485-598`: الكتلة الداخلية تنتهي بـ`liveSyncedBookings.unshift(bookingData);`
في السطر 585 ثم إغلاق مباشر لـ`try` الخارجي بدون أي `res.json`/`res.status`. **`idempotencyKey`
يُستقبَل (سطر 496) ولا يُستخدَم في أي مكان بالدالة بالكامل.** مؤكَّد بقراءة كامل جسم الدالة سطرًا سطرًا.

### 2.3 تأكيد `check_availability` Stub `[VERIFIED مباشرة]`

`server/src/routes/agentTools.routes.ts:430-480`: `isSlotAvailable: true` مكتوبة حرفيًا مرتين (المسار
السعيد سطر 461، ومسار الخطأ سطر 474) — لا يوجد أي استعلام عن تعارض حجوزات. مؤكَّد.

### 2.4 تأكيد تلوّث `submit_payment_proof` `[VERIFIED مباشرة]`

`server/src/routes/agentTools.routes.ts:980-1141`: مؤكَّد تسلسل المطابقة الرباعي بالضبط كما وصفته
الخطة المعمارية (`bookingId` صريح → آخر 8 أرقام → أي حجز بحالة `awaiting_payment`/`pending_review` في
النظام كله بلا قيد هاتف سطر 1015-1018 → إنشاء حجز وهمي جديد ببيانات مُختلَقة من `bookingSessions`
سطر 1026-1092 **مع** `INSERT INTO bookings` خام مباشر (سطر 1074-1091) يتجاوز `createBooking()`/
`CreateBookingUseCase` بالكامل، داخل `try { } catch {}` صامت). الكتابة النهائية (سطر 1104-1111) تكتب
JSON خام في `bookings.payment_proof` عبر `UPDATE` مباشر، **رغم وجود جدول `payment_proofs` مخصص وسليم
البنية بالفعل** (`database/schema.sql:155-170`، به `status ENUM('pending_review','approved','rejected')`
و`UNIQUE` على `booking_id`) — الجدول موجود لكن هذا المسار لا يكتب فيه إطلاقًا. مؤكَّد.

### 2.5 تأكيد ازدواجية ملفات n8n `[VERIFIED مباشرة — بتفصيل أدق من الخطة الأصلية]`

فحصتُ محتوى JSON للملفات الستة مباشرة (عقدة بعقدة، وليس فقط أسماء):

- **Workflow 01** (نسختان): الفرق الوحيد فعلاً هو غياب `sendHeaders`/`headerParameters` بالكامل في
  عقدة `Send WhatsApp Reply via Salon Backend` بالنسخة قصيرة الاسم (`01_WhatsApp_Master_Router.json`)
  — **مؤكَّد حرفيًا**: النسخة الطويلة الاسم تحتوي `"x-agent-secret": "trim-mind-agent-secret-key-2026"`
  في الترويسة، والنسخة القصيرة لا تحتوي أي ترويسة إطلاقًا. **القيمة الافتراضية للسرّ مكتوبة حرفيًا هنا
  أيضًا في ملف الـWorkflow نفسه**، ليس فقط في كود الخادم كما ذكرت الخطة الأصلية.
- **Workflow 02** (نسختان): **اكتشاف إضافي غير مذكور في الخطة الأصلية بهذا التفصيل** — النسختان ليستا
  شبه متطابقتين فقط في الشكل، بل النسخة قصيرة الاسم (`02_AI_Agent_Tools_Orchestrator.json`, 16 عقدة)
  **تفتقد 5 أدوات كاملة** موجودة في النسخة طويلة الاسم (21 عقدة): `join_smart_waitlist`،
  `claim_smart_waitlist_offer`، `check_waitlist_status`، `check_noshow_status`، و**`submit_payment_proof`
  نفسها**. إن كانت النسخة القصيرة هي المفعّلة فعليًا في n8n الإنتاج، فالـAI Agent **لا يملك حتى القدرة
  على استدعاء أداة إثبات الدفع** من مسار الأداة نفسه (يبقى فقط Workflow 03 المنفصل الذي يستدعيها
  مباشرة بلا مرور بالـAI أصلاً — القسم 1.2 من الخطة الأصلية).
- **القرار التنفيذي (Phase 1)**: يجب على الفريق التقني تحديد أي نسخة مفعّلة فعليًا في نسخة n8n
  الإنتاجية **قبل أي تعديل** (هذا Runtime fact لا يظهر من قراءة الملفات وحدها). المنهج الآمن: النسخة
  الجديدة المُعاد بناؤها في Phase 5 تحل محل كلا الملفين، وتُحذف النسخة الأخرى من `n8n/workflows/` فور
  التأكد من التوحيد الناجح (لا يبقى ملفان لنفس الـWorkflow).

### 2.6 اكتشاف إضافي: رسالتا تأكيد مزدوجتان لكل حجز ناجح `[VERIFIED مباشرة — غير مذكور في الخطة الأصلية]`

عند نجاح أي استدعاء لـ`createBooking()` (المسار المشترك الذي تستدعيه `agentTools.routes.ts` ومسارات
أخرى):

1. `server/src/usecases/bookings/CreateBookingUseCase.ts:19-38`: يُرسل رسالة واتساب تأكيد أولى عبر
   `this.notificationGateway.sendWhatsApp(...)` (والتي تستدعي `sendWhatsAppText` فعليًا عبر
   `BaileysWhatsAppGateway.ts`) — نصها **يفترض خطأً أن إيصال الدفع وُصِل بالفعل** ("تم استلام طلب حجزك
   المبدئي **وإيصال التحويل بنجاح**") رغم أن هذه اللحظة هي لحظة إنشاء الحجز فقط، قبل أي دفع.
2. `server/src/services/booking.service.ts:78-100` (داخل نفس دالة `createBooking()` التي تستدعي الـ
   UseCase أعلاه): يستدعي `sendWhatsAppText` **مرة ثانية مباشرة** (`import('./whatsapp.service.js').then(...)`)
   بنص **مختلف تمامًا** يطلب من العميل إرسال صورة الإيصال ("يرجى إرسال صورة إيصال التحويل").

**النتيجة**: العميل يستلم رسالتين متضاربتين لنفس الحجز في نفس اللحظة تقريبًا — واحدة تقول "دفعك وصل"
والأخرى تقول "ابعت إيصال الدفع". هذا خلل حقيقي إضافي يجب إصلاحه في Phase 1/3 (نقطة إرسال تأكيد واحدة
فقط لكل حدث حجز، بنص متسق مع الحالة الفعلية).

### 2.7 اكتشاف إضافي: `customize-and-dispatch` موجود فعليًا لكنه معطوب بنفس الأنماط `[VERIFIED مباشرة]`

الخطة الأصلية ذكرت أن `WhatsAppCustomPricingModal.tsx` (`src/components/receptionist/`) "غير مربوطة
بأي مسار من الـAI Agent". **تحقّق إضافي**: المكوّن مربوط فعليًا بمسار Backend حقيقي وموجود بالفعل:
`POST /api/bookings/:id/customize-and-dispatch` (`server/src/routes/bookings.routes.ts:704-800`)، عبر
`api.customizeAndDispatchBooking()` في `src/lib/api.ts:109-110`. لكن هذا المسار به نفس الأعطال الجذرية
الموصوفة للأدوات الأخرى:

- `UPDATE bookings SET ... WHERE id = ?` **خام مباشر**، متبوعًا بـ`.catch(() => {})` صامت (سطر
  ~727) — إن فشل الـUPDATE، الكود **يكمل وكأن شيئًا لم يحدث** ويصل لـ`return res.json({ success: true, ... })`
  في النهاية بلا أي تحقق من نجاح الكتابة الفعلية. **Fake Success حرفي وموثّق مباشرة.**
- ينقل حالة الحجز مباشرة إلى `status = 'confirmed'` (سطر ~726) — **يتخطى بالكامل** `awaiting_payment`
  و`payment_submitted` و`pending_review`؛ أي أن التسعير المخصص من الموظف يُعتبر تلقائيًا "دفعًا
  مؤكدًا" بلا أي إثبات دفع فعلي مرتبط.
- يُنشئ `financial_records` بقيمة عربون مُخمَّنة (`booking?.booking_fee_at_booking || (booking?.booking_type
  === 'vip' ? 100 : 50)`) بطريقة دفع ثابتة `'vodafone_cash'` **بلا أي تحقق من دفع فعلي حصل**.
- لا يستخدم `container.bookingRepo`/`CreateBookingUseCase`/أي Repository — SQL خام بالكامل، مخالفة
  صريحة لقاعدة §0.12.

هذا المسار **موجود ويجب إصلاحه لا إنشاؤه من الصفر** — انظر §10.3 للتصميم المُصحَّح.

### 2.8 اكتشاف إضافي: `toggle-handoff` موجود فعليًا كأساس جزئي جيد `[VERIFIED مباشرة]`

`POST /api/bookings/toggle-handoff` (`bookings.routes.ts:809-819`) يستدعي `toggleHumanHandoff(phone,
enable)` (`whatsapp.service.ts:1100-1116`)، والتي:

- تكتب فعليًا لعمودين حقيقيين في جدول `bookings`: `needs_human_attention` و`handoff_expires_at`
  (**هذان العمودان موجودان فعليًا في قاعدة البيانات** رغم عدم ظهورهما في `database/schema.sql` —
  أُضيفا عبر آلية الـMigration الذاتي، انظر §2.9).
- **لكنها أيضًا** تكتب لنفس الشيء في `bookingSessions` (In-Memory Map) بالتوازي — نفس مشكلة الازدواجية
  ذاكرة/قاعدة بيانات المذكورة في الخطة الأصلية، هنا تحديدًا لحالة Human Handoff.
- **لا تُستدعى من أي مكان في مسار الـAI الحالي (n8n) إطلاقًا** — فقط من لوحة تحكم يدوية (الموظف يفعّلها
  يدويًا)، وليس كأداة يستدعيها النموذج نفسه كما يتطلب التصميم (§17).

هذا أساس جيد للبناء عليه في Phase 9 — **لا يُعاد اختراعه**، بل يُوسَّع (الاعتماد الحصري على عمودي
`bookings` كمصدر حقيقة، حذف الكتابة لـ`bookingSessions`، وربطه بأداة `handoff_to_reception` جديدة).

### 2.9 اكتشاف إضافي حاسم: آلية الـMigration الذاتي الفعلية للمشروع `[VERIFIED مباشرة]`

المشروع **لا يملك مجلد migrations منفصلًا يُشغَّل يدويًا**. آلية تحديث المخطط الفعلية هي:
`server/src/services/cleanup.service.ts`, دالة `ensureInitialDbData()` (سطر 66)، مُستدعاة من
`server/src/index.ts:193` عند إقلاع الخادم. النمط بالضبط:

```
CREATE TABLE IF NOT EXISTS ...   -- للجداول الجديدة (مثل webhook_events, whatsapp_analytics_logs
                                  -- الموجودان فعليًا بهذا الأسلوب بالضبط، سطر 163-182)

const safeColumns = [
  'ALTER TABLE bookings ADD COLUMN source ENUM("web","whatsapp") DEFAULT "web"',
  'ALTER TABLE bookings ADD COLUMN needs_human_attention BOOLEAN DEFAULT FALSE',
  // ... إلخ (سطر 187-197 فعليًا)
];
for (const colQuery of safeColumns) {
  try { await query(colQuery); } catch {}   // يتجاهل خطأ "العمود موجود بالفعل" بصمت، وهذا مقصود وسليم هنا
}
```

**هذا يعني عمليًا**: جدول `bookings` الفعلي في قاعدة البيانات الحالية يحتوي بالفعل أعمدة **غير موجودة**
في `database/schema.sql`: `source`, `ai_brief`, `confidence_score`, `needs_human_attention`,
`handoff_expires_at`, `custom_line_items`, `no_show_marked_at`. كما يوجد جدول `whatsapp_analytics_logs`
كامل غير موثّق في `schema.sql` (`cleanup.service.ts:172-183`، به `event_type ENUM('chat_started',
'intent_detected', 'booking_created', 'proof_uploaded', 'booking_confirmed', 'human_handoff_requested',
'revenue_recorded')`).

**القرار التنفيذي**: كل جدول/عمود جديد مطلوب في هذه الوثيقة (`conversation_sessions`,
`conversation_messages`, أعمدة `services.aliases`, قيمة Enum جديدة `custom_pricing_requested`، إلخ)
**يُضاف إلى نفس دالة `ensureInitialDbData()`** بنفس الأسلوب (`CREATE TABLE IF NOT EXISTS` + إضافة
لمصفوفة `safeColumns`)، **وليس** بملف SQL منفصل يحتاج تشغيلًا يدويًا خارجيًا. `database/schema.sql`
يُحدَّث أيضًا في نفس الـPR (كمرجع توثيقي يعكس الواقع)، لكنه ليس مصدر التنفيذ الفعلي.

### 2.10 مصادر إعدادات العربون الفعلية `[VERIFIED مباشرة]`

`database/seed.sql:79-80`: مفاتيح `settings` الفعلية هي `booking_fee_normal` (=50.00) و`booking_fee_vip`
(=150.00) — **وليس** `depositNormal`/`depositVip` كما وردت بأسماء توضيحية في الخطة الأصلية. أي أداة/
Use Case جديدة تقرأ إعدادات العربون **يجب** أن تستخدم هذين المفتاحين بالضبط.

### 2.11 نطاق خارج الموضوع: `ai.routes.ts /chat` `[VERIFIED مباشرة — Out of Scope]`

يوجد مسار ثالث كامل ومنفصل تمامًا: `POST /api/ai/chat` (`server/src/routes/ai.routes.ts`) — محرك
محادثة Gemini **مختلف تمامًا** يُستخدم لواجهة الشات على الموقع (Website Widget)، له نفس نمط
Fallback الثابت للأسعار (`ai.routes.ts:31-42`) لكنه **لا علاقة له بواتساب إطلاقًا** (لا يستدعي
Baileys ولا n8n). هذا خارج نطاق هذه الوثيقة تمامًا؛ **لا يُعدَّل** كجزء من أي Phase هنا. يُذكر فقط
لأن نفس نمط "Fallback بيانات ثابتة كمصدر حقيقة بديل" موجود فيه أيضًا، لتفادي الخلط لاحقًا.

---

## 3. حدود النطاق (Scope Boundaries)

**داخل النطاق**: `whatsapp.service.ts` (كطبقة نقل)، `agentTools.routes.ts`، `n8n/workflows/01-04`،
جداول `conversation_sessions`/`conversation_messages`/`payment_proofs`، `bookings.routes.ts` مسارات
`customize-and-dispatch`/`toggle-handoff`، `WhatsAppCustomPricingModal.tsx` (ربط فقط، لا إعادة بناء
واجهة)، `booking.service.ts`.

**خارج النطاق صراحة**: `ai.routes.ts` (شات الموقع، §2.11)، `n8n/workflows/05-06` (تقرير المدير/Recall
— يُذكران فقط للسياق)، أي تعديل على واجهة العميل في الموقع (`src/pages/`) غير المرتبطة مباشرة بمسار
الواتساب، `reminder.service.ts` إلا بقدر ربطه بالإشعارات الموحّدة في §18.

---

## 4. WhatsApp Transport Layer — مواصفة التنفيذ

### 4.1 الوضع بعد التغيير

`whatsapp.service.ts` يبقى **الاتصال الوحيد** بـBaileys. يتغيّر دوره فقط:

| الوظيفة | الوضع الحالي | بعد التنفيذ |
|---|---|---|
| استقبال الرسالة (`messages.upsert`, سطر 424) | يستدعي `forwardToN8nWebhook` **و** `handleIncomingWithAI` | يستدعي **فقط** `forwardToN8nWebhook` (مُعاد تسميتها اختياريًا، لكن نفس الوظيفة: تمرير الحدث لـWebhook n8n الموحّد) |
| `handleIncomingWithAI` (سطر 871-1098) | تنفّذ محادثة AI كاملة موازية | **تُحذف بالكامل** (الدالة والاستدعاء لها). لا بديل محلي — كل "الذكاء" ينتقل لمحرك n8n الموحّد (§6) |
| `chatHistories` (سطر 113) | ذاكرة محادثة محلية منفصلة | **تُحذف بالكامل** — الذاكرة تنتقل لـ`conversation_messages` (§7) |
| `bookingSessions` (سطر 112) | حالة حجز محلية جزئية | **تبقى مؤقتًا** كـCache اختياري فقط للأداء (غير إلزامي)، **لا** كمصدر حقيقة — أي قراءة منها يجب أن تكون Best-effort مع Fallback لقراءة DB. تُحذف نهائيًا في Phase 8 بعد التأكد من استقرار `conversation_sessions` |
| `handoffKeywords` (سطر 901-906) | تحويل بشري بكلمات مفتاحية في المسار المحلي المحذوف | تُنقَل كـ"شبكة أمان" إضافية (Regex بسيط) **داخل** طبقة الاستقبال قبل إرسالها لـn8n — إن طابقت، تُرفَق كإشارة `possible_handoff_keyword: true` ضمن حمولة Webhook، **لا تُطلِق تحويلاً تلقائيًا بنفسها** (القرار النهائي للنموذج عبر أداة `handoff_to_reception`, §17) |
| إرسال الرد (`sendWhatsAppText`, سطر 530) | نقطة واحدة، تُستدعى من مسارين متوازيين | **تبقى نفس الدالة بلا تغيير في توقيعها**، لكن تُستدعى من نقطة واحدة منطقيًا فقط: `POST /api/whatsapp-session/send` (تُستدعى من n8n) + `createBooking()`/`customize-and-dispatch` بعد إصلاح الازدواجية (§4.2) |
| تأكيد الوصول اليدوي (منطق SQL مباشر داخل المسار المحلي المحذوف) | `UPDATE bookings SET status='customer_arrived'` مباشر بلا تحقق انتقال حالة | **يُحذف مع حذف `handleIncomingWithAI`**. المسار الوحيد المتبقي: أداة `confirm_arrival` (§6.3) عبر Use Case حقيقي |

### 4.2 إصلاح ازدواجية رسائل التأكيد (من §2.6)

في `server/src/usecases/bookings/CreateBookingUseCase.ts`: **يُحذف** الاستدعاء المباشر لـ
`this.notificationGateway.sendWhatsApp(...)` (سطر 19-38 تقريبًا) بالكامل من الـUseCase. في
`server/src/services/booking.service.ts` (دالة `createBooking()`): **يبقى** استدعاء واحد فقط لـ
`sendWhatsAppText` بنص واحد متسق يعكس الحالة الفعلية للحجز عند لحظة الإنشاء (`awaiting_payment` —
"تم إنشاء طلب حجزك، يرجى إرسال إثبات الدفع" — **وليس** أي نص يفترض دفعًا مُستلمًا).

**السبب المعماري**: إرسال الإشعار مسؤولية Side-Effect خاصة بسياق الطلب (WhatsApp Agent تحديدًا)، وليس
جزءًا لا يتجزأ من "إنشاء الحجز" الذي يُستدعى أيضًا من مسارات أخرى (الموقع مثلاً) قد لا تحتاج نفس الرسالة.
إبقاء إرسال الإشعار في طبقة الاستدعاء الأعلى (`booking.service.ts`، أو أفضل: طبقة الأداة نفسها في
§6.3) يمنع تكرار الإرسال من طبقتين مختلفتين لنفس أدنى مسار واحد.

---

## 5. n8n Workflow — مواصفة إعادة الهيكلة

### 5.1 حذف الازدواجية الفعلية أولاً (Phase 1، قبل أي تصميم جديد)

1. تحديد النسخة المفعّلة فعليًا في n8n Production من بين `01_-_...json`/`01_...json` و
   `02_-_...json`/`02_...json` (فحص تشغيلي مباشر في لوحة n8n، ليس من الملفات وحدها).
2. حذف الملف غير المفعّل من `n8n/workflows/` فور التأكد (لا يبقى ملفان بنفس الغرض).
3. إصلاح فوري (بغض النظر عن أي إعادة تصميم لاحقة): إضافة `sendHeaders`/`headerParameters` (`x-agent-secret`)
   لعقدة الإرسال في أي نسخة كانت تفتقدها — وإلا فكل رد سيفشل بـ401 بعد أي عملية تنظيف.

### 5.2 البنية الجديدة (بعد Phase 5)

```
WhatsApp Router (Webhook + تحقق سرّ مشترك جديد — §19)
        ↓
Message Normalizer + Idempotency Gate
        (إدراج فوري في conversation_messages بـwhatsapp_message_id
         — فشل الإدراج بسبب UNIQUE يعني "مُعالَجة بالفعل"، توقف صامت هنا فورًا،
         بدل منطق النافذة الزمنية النصية الحالي بالكامل)
        ↓
Customer & Session Resolver
        (استدعاء أداة get_customer + قراءة/إنشاء صف في conversation_sessions
         عبر Backend endpoint جديد، ليس Code node منطق أعمال)
        ↓
AI Agent (محرك واحد فقط — Gemini + Tools مُعاد تصميمها §6.3)
        ↓
Tool Execution (HTTP لمسارات agentTools.routes.ts المُصلَحة)
        ↓
Response Formatter + Session State Update
        ↓
WhatsApp Sender (POST /api/whatsapp-session/send — نقطة الإرسال الوحيدة الموجودة فعليًا)
```

### 5.3 تغييرات محددة على عقد n8n الموجودة

| العقدة الحالية | التغيير المطلوب |
|---|---|
| `Evolution API Webhook` | إضافة تحقق من ترويسة سرّ مشترك جديد (`x-whatsapp-webhook-secret`) يُرسَل من `forwardToN8nWebhook` في `whatsapp.service.ts` — حاليًا لا يُرسَل أي توقيع (§19) |
| `Normalize Incoming Message` (Code) | حذف منطق الـDedup النصي بالكامل (`textKey`/`$getWorkflowStaticData`) — يُستبدَل بإدراج DB (§5.2). **إصلاح إلزامي إضافي**: حذف قاعدة تفريغ رقم LID الحالي (`cleanPhone = ''` لأي رقم لا يطابق نمط `01XXXXXXXXX`) — بدلها: الاحتفاظ بـ`remoteJid`/اللاحقة الحقيقية من واتساب كمفتاح جلسة أساسي دومًا، ومحاولة استخراج رقم مصري حقيقي كحقل إضافي منفصل (`displayPhone`) بلا إفراغه بالكامل عند الفشل |
| `Window Buffer Memory` | **تُحذف من الـWorkflow.** الذاكرة تُبنى يدويًا من `conversation_messages` (آخر N رسالة) داخل عقدة `Prepare Chat Input` قبل استدعاء `AI Agent` |
| `Prepare Chat Input` (Code) | بدل بناء نص واحد مدمج، تُبنى حمولة JSON منظمة (Structured Context، §6.4) تحتوي: بيانات العميل، حالة المحادثة، `active_booking_id`، آخر N رسالة، الأدوات المسموحة للحالة الحالية فقط |
| `Google Gemini Chat Model` | تحديث الـModel للإصدار المتفق عليه فعليًا مع الفريق (توثيق المشروع يذكر "2.5"، الـWorkflow الفعلي يستخدم `gemini-1.5-flash` — **يجب مطابقتهما صراحة**، ليس افتراض أيهما صحيح دون تأكيد Runtime) |
| `AI Agent` (`systemMessage`) | يُعاد بناؤه بالكامل بالطبقات الست في §6.5 بدل النص الواحد الحالي (~2500 كلمة) |
| كل عقد `Tool: *` (`toolHttpRequest`) | تحديث الـURL/Body Schema لكل أداة حسب §6.3 بعد إصلاح الـBackend، + إضافة العقد الجديدة (`get_packages`, `handoff_to_reception`, `update_booking_draft`) |
| `Send WhatsApp Reply via Salon Backend` | إضافة عقدة **قبلها** لتحديث `conversation_sessions.state`/`last_message_at` عبر Backend endpoint جديد (Response Formatter، §5.2) |
| Workflow 03 (`Payment Proof Handler`) | **يُدمَج داخل Workflow 02** (يمر عبر الـAI Agent وليس مسارًا منفصلاً يتجاوزه بالكامل) — لضمان أن قرار "لأي حجز تنتمي هذه الصورة" يمر بنفس منطق التأكد الصريح في §12، لا مطابقة تلقائية عمياء |

---

## 6. AI Architecture — Single Conversation Engine

### 6.1 المبدأ الملزم

مصدر رد واحد فقط لكل `whatsapp_message_id`. هذا يتحقق آليًا عبر: (أ) حذف `handleIncomingWithAI`
(§4.1)، (ب) قيد `UNIQUE` على `conversation_messages.whatsapp_message_id` (§7) يمنع معالجة الرسالة
مرتين حتى لو وصل الـWebhook مكررًا من واتساب نفسه أو أُعيد تشغيل n8n منتصف المعالجة.

### 6.2 طبقة Intent + Entities

`[من الخطة المعمارية — مطابق، §3.2]` — تُنفَّذ كجزء من استدعاء `AI Agent` نفسه (LangChain Agent
Structured Output)، لا كاستدعاء منفصل إضافي (لتقليل زمن الاستجابة/التكلفة). الشكل:
```json
{
  "intents": ["booking_request"],
  "entities": {"date": "...", "service_hint": "...", "barber_hint": null},
  "requires_clarification": ["service_exact_match"],
  "handoff_signal": null
}
```
هذا الحقل الأخير (`handoff_signal`) هو ما تقرأه طبقة Response Formatter لتقرير استدعاء
`handoff_to_reception` تلقائيًا إن لزم (§17).

### 6.3 مواصفات الأدوات النهائية (Input/Output/Backend Endpoint)

كل أداة أدناه **تستبدل أو تُصلِح** مسارًا موجودًا فعليًا في `agentTools.routes.ts` ما لم يُذكر أنها
جديدة بالكامل. عمود "الإصلاح المطلوب في الكود" يشير للمشكلة المؤكَّدة تحديدًا (§2).

| الأداة | Backend Route | الإصلاح المطلوب في الكود |
|---|---|---|
| `get_customer` | `POST /api/agent-tools/customer/lookup` (موجود، يحتاج فقط ضمان قراءة `profiles`+آخر حجز، لا تغيير جذري) | لا شيء حرج — التحقق من الوجود الفعلي فقط |
| `get_services` | `POST /api/agent-tools/services/list` (موجود) | إضافة عمود `services.aliases` (JSON) عبر آلية §2.9؛ تعديل الـSELECT لإرجاعه |
| `get_packages` **[جديد بالكامل]** | `POST /api/agent-tools/packages/list` **[جديد]** | لا يوجد جدول `packages` — يُبنى Endpoint جديد يُجمِّع `services WHERE category='vip_package'` مع حقل `includedServiceIds` يُستنتَج من `services.description`/عمود جديد `services.bundle_service_ids` (JSON، يُضاف عبر §2.9) |
| `get_package_details` **[جديد]** | `POST /api/agent-tools/packages/details` **[جديد]** | يعتمد على نفس التوسعة أعلاه |
| `get_barbers` | `POST /api/agent-tools/barbers/list` (موجود) | لا تغيير جذري |
| `check_availability` | `POST /api/agent-tools/availability/check` (موجود، **يُعاد بناؤه بالكامل**) | استبدال `isSlotAvailable: true` الثابت (سطر 461/474) باستعلام فعلي: تعارض نفس `barberId` (إن حُدِّد) أو نفس `chairId` المتاحة في نافذة `[startsAt, startsAt + duration]` ضمن حجوزات `status IN ('confirmed','awaiting_payment','payment_submitted','pending_review','customer_arrived','in_service')` لنفس `branch_id`/`booking_date` — إعادة استخدام نفس منطق `FOR UPDATE`/فحص الكراسي الموجود فعليًا وسليم في `MySQLBookingRepository.ts:83-94` بدل كتابة استعلام جديد من الصفر |
| `create_booking_draft` (إعادة تسمية `create_pending_booking`) | `POST /api/agent-tools/bookings/create-pending` (موجود، **يُصلَح**) | **إصلاح إلزامي فوري (Phase 3)**: إضافة `return res.json({ success: true, data: bookingData })` فور نجاح `liveSyncedBookings.unshift(bookingData)` (بعد السطر 585 مباشرة). **إصلاح إلزامي ثانٍ**: تفعيل `idempotencyKey` فعليًا عبر `container.webhookEventRepo.recordEventIfNew(idempotencyKey, 'agent_tool', 'create_booking', payload)` (الـRepository موجود وجاهز فعليًا، §2.9 من غير استخدام) — إن أُعيد الاستدعاء بنفس المفتاح، يُعاد نفس `bookingId` السابق بدل إنشاء حجز مكرر |
| `update_booking_draft` **[جديد]** | `PATCH /api/agent-tools/bookings/:id/draft` **[جديد]** | لا توجد طريقة حالية لتعديل حجز `draft`/`awaiting_payment` دون إلغاء وإعادة إنشاء — Endpoint جديد رقيق يستدعي Use Case جديد `UpdateBookingDraftUseCase` (بنفس نمط `CancelBookingUseCase`)، يمنع صراحة تعديل حجز بحالة غير `draft`/`awaiting_payment` |
| `create_custom_booking_request` **[جديد]** | `POST /api/agent-tools/bookings/create-custom-request` **[جديد]** | انظر §10.2 |
| `submit_payment_proof` | `POST /api/agent-tools/payments/submit-proof` (موجود، **يُعاد بناؤه بالكامل**) | انظر §12 بالتفصيل الكامل |
| `get_booking_status` | `POST /api/agent-tools/bookings/status` (موجود) | تعديل القراءة لتأتي من `payment_proofs.status` الحقيقي بدل الاعتماد فقط على `bookings.status` النصي عند وجود Payment Proof مرتبط |
| `get_queue_position` (إعادة تسمية `get_waiting_position`) | `POST /api/agent-tools/queue/position` (موجود) | لا تغيير جذري |
| `confirm_arrival` | `POST /api/agent-tools/bookings/confirm-arrival` (موجود) | التحقق أن هذا هو **المسار الوحيد** بعد حذف منطق `UPDATE` المباشر من `handleIncomingWithAI` المحذوفة (§4.1) — إضافة تحقق صريح أن الحالة الحالية `confirmed` قبل الانتقال لـ`customer_arrived` (منع تخطي حالات) |
| `cancel_booking` | `POST /api/agent-tools/bookings/cancel` (موجود، **يُصلَح**) | استبدال مطابقة "آخر 8-9 أرقام" بمطابقة كاملة صارمة لـ`customer_phone` + حذف أي مسار Fallback يُلغي حجزًا بلا قيد هاتف مطابق تمامًا |
| `reschedule_booking` | `POST /api/agent-tools/bookings/reschedule` (موجود، **يُصلَح**) | نفس إصلاح مطابقة الهاتف أعلاه |
| `handoff_to_reception` **[جديد]** | `POST /api/agent-tools/handoff/request` **[جديد]** | يستدعي `toggleHumanHandoff(phone, true)` الموجودة فعليًا (`whatsapp.service.ts:1100`) بعد تعديلها (§17.3) لتقرأ/تكتب من `conversation_sessions` حصرًا بدل `bookingSessions` |
| `get_booking_settings` **[جديد]** | `POST /api/agent-tools/settings/booking` **[جديد]** | قراءة مباشرة لمفاتيح `settings`: `booking_fee_normal`, `booking_fee_vip`, `working_hours_text`, `instapay_username`, `vodafone_cash_number` (الأسماء الفعلية المؤكَّدة، §2.10) — **بلا** أي Fallback ثابت مبرمج |

### 6.4 Structured Context (بدل النص الخام)

كل استدعاء لـ`AI Agent` يستقبل حمولة JSON (وليس نصًا مُدمَجًا كما في `Prepare Chat Input` الحالية):

```json
{
  "customer": {"phone": "...", "name": "...", "isReturning": true, "isVip": false},
  "session": {"state": "COLLECTING_INFORMATION", "activeBookingId": null, "pendingEntities": {"service": "قص شعر", "date": null}},
  "recentMessages": ["... آخر 10-20 رسالة من conversation_messages ..."],
  "currentMessage": {"text": "...", "hasImage": false, "whatsappMessageId": "..."},
  "availableTools": ["get_services", "check_availability", "..."]
}
```

`availableTools` تُفلتَر برمجيًا حسب `session.state` (جدول §8.2) — لا تُعرَض `cancel_booking` إن لم
يوجد `activeBookingId` مثلاً.

### 6.5 Prompt Architecture (الطبقات الست) `[من الخطة المعمارية — مطابق، §14]`

```
1. Core Behavior (ثابت)         — الهوية، الأسلوب، لا اختراع بيانات (تكرار §0.3)
2. Salon Context (Cache دقيقة)   — من get_branches (اسم الصالون، الفروع، أوقات العمل)
3. Current Customer (كل رسالة)   — من customer في §6.4
4. Current Booking State         — من session.activeBookingId إن وُجد (استعلام get_booking_status طازج)
5. Available Tools (حسب الحالة)   — من availableTools في §6.4
6. Safety Rules (تكرار في النهاية) — تكرار §0.3/§0.6/§0.7 حرفيًا في آخر الـPrompt
```

### 6.6 Post-generation Guardrail (تحقق لاحق) `[تصميم جديد يطبّق §15 من الخطة الأصلية عمليًا]`

عقدة جديدة بعد `AI Agent` مباشرة وقبل `Send WhatsApp Reply`: فحص Regex بسيط على نص الرد النهائي —
هل يحتوي رقمًا يُشبه سعرًا (`\d+\s*(ج|جنيه|EGP)`) أو رقم حجز (`BK-\d+`) **غير موجود** في نتائج الأدوات
المُستدعاة في نفس الجولة (متاحة من `intermediateSteps` في مخرجات LangChain Agent)؟ إن كان كذلك:
تسجيل الحالة في `audit_logs` (الجدول الموجود فعليًا، `actor_role`, `action='ai_unverified_claim'`)
للمراجعة الدورية، **دون** منع الإرسال في هذه المرحلة (Detection أولاً، Blocking لاحقًا بعد جمع بيانات
كافية عن معدل False Positives).

---

## 7. Database — الجداول الجديدة والتعديلات

> يُضاف كل ما يلي إلى `server/src/services/cleanup.service.ts` بنفس نمط §2.9 بالضبط (`CREATE TABLE
> IF NOT EXISTS` + إضافة لمصفوفة `safeColumns`)، **و**إلى `database/schema.sql` كتوثيق مطابق للواقع.

### 7.1 جدولان جديدان بالكامل `[من الخطة المعمارية — مطابق، §6.1]`

```sql
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id VARCHAR(64) PRIMARY KEY,
  customer_phone VARCHAR(20) NOT NULL,
  whatsapp_remote_jid VARCHAR(64) NULL,          -- الاحتفاظ بالـJID الخام دومًا (إصلاح مشكلة تفريغ LID، §5.3)
  channel ENUM('whatsapp') DEFAULT 'whatsapp',
  state VARCHAR(40) NOT NULL DEFAULT 'IDLE',
  active_booking_id VARCHAR(64) NULL,
  pending_entities JSON NULL,
  last_intent VARCHAR(40) NULL,
  human_handoff_active TINYINT(1) DEFAULT 0,
  human_handoff_expires_at TIMESTAMP NULL,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cs_phone (customer_phone),
  FOREIGN KEY (active_booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  whatsapp_message_id VARCHAR(128) NULL,
  role ENUM('customer','assistant','system') NOT NULL,
  content TEXT NOT NULL,
  extracted_intent JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cm_session (session_id),
  UNIQUE KEY uq_cm_wa_msg (whatsapp_message_id),
  FOREIGN KEY (session_id) REFERENCES conversation_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**ملاحظة تنفيذية مهمة**: `UNIQUE KEY uq_cm_wa_msg (whatsapp_message_id)` مع القيمة `NULL` مسموحة
(رسائل `assistant`/`system` لا تملك `whatsapp_message_id` بالضرورة) — MySQL/InnoDB يسمح بعدة قيم
`NULL` في عمود `UNIQUE`، وهذا هو السلوك المطلوب هنا تحديدًا (لا يُطبَّق التفرّد إلا على رسائل العميل
الفعلية الواردة من واتساب).

### 7.2 توسعات على جداول موجودة

| الجدول | العمود الجديد | الغرض |
|---|---|---|
| `services` | `aliases JSON NULL` | مرادفات العملاء الشائعة (§6.3 `get_services`) |
| `services` | `bundle_service_ids JSON NULL` | لدعم `get_packages` دون جدول `packages` منفصل جديد (إعادة استخدام `services` بفئة `vip_package` كما هي فعليًا الآن) |
| `bookings` | قيمة Enum جديدة `custom_pricing_requested` تُضاف بين `draft` و`awaiting_payment` في `status ENUM(...)` | §10 |
| `bookings` | `custom_pricing_notes TEXT NULL` | وصف الطلب الحر الذي أدخله العميل قبل تسعيره (يُستخدم في `WhatsAppCustomPricingModal.tsx` الموجود فعليًا) |

> **لا يُنشأ جدول `customers` منفصل** — الخطة الأصلية وثّقت هذا بدقة: "العميل" فعليًا هو `profiles` +
> آخر حجز بنفس `customer_phone`. هذا يبقى كما هو؛ `get_customer` (§6.3) يستعلم الاثنين معًا، لا يوجد
> داعٍ تقني لتغيير هذا حاليًا.

### 7.3 إعادة استخدام `payment_proofs` (لا جدول جديد، فقط تفعيل الاستخدام) `[انظر §12]`

الجدول موجود بالفعل (`database/schema.sql:155-170`) بكل الأعمدة المطلوبة. المطلوب فقط:
`MySQLPaymentProofRepository` جديد (يتبع نمط `MySQLWaitlistRepository.ts` كقالب) + Use Case
`SubmitPaymentProofUseCase` — لا تغيير في بنية الجدول نفسه.

### 7.4 إعادة استخدام `webhook_events` لـIdempotency `[انظر §14]`

الجدول والـRepository (`MySQLWebhookEventRepository`) والواجهة (`IWebhookEventRepository`) **موجودون
فعليًا في `container.ts`** لكن غير مُستخدَمين لأي شيء عمليًا (§2.9/§2.4). يُستخدَمان مباشرة لـ:
(أ) `idempotencyKey` في `create_booking_draft`، (ب) Deduplication `whatsapp_message_id` كطبقة ثانية
احتياطية فوق قيد `UNIQUE` في `conversation_messages`.

---

## 8. Booking State Machine — Mapping دقيق

### 8.1 حالات المحادثة الجديدة ↔ `bookings.status` الموجود فعليًا

القيم الحالية لـ`bookings.status` (`database/schema.sql:115`، مؤكَّدة): `draft`, `awaiting_payment`,
`payment_submitted`, `pending_review`, `confirmed`, `customer_arrived`, `in_service`, `completed`,
`rejected`, `cancelled`, `expired`, `no_show`. **إضافة واحدة فقط مطلوبة**: `custom_pricing_requested`.

| حالة المحادثة (`conversation_sessions.state`) | `bookings.status` المقابلة (إن وُجد حجز نشط) |
|---|---|
| `IDLE` / `NEW_CONTACT` | لا يوجد حجز نشط بالضرورة |
| `DISCOVERING_INTENT` | لا يوجد بعد |
| `COLLECTING_INFORMATION` | لا يوجد بعد (البيانات في `pending_entities` فقط) |
| `CONFIRMING_REQUEST` | لا يوجد بعد |
| `CHECKING_AVAILABILITY` | لا يوجد بعد |
| `BOOKING_DRAFT` | `draft` |
| `AWAITING_CUSTOM_PRICING` **[جديد]** | `custom_pricing_requested` |
| `AWAITING_PAYMENT` | `awaiting_payment` |
| `PAYMENT_PROOF_SUBMITTED` | `payment_submitted` |
| `PENDING_REVIEW` | `pending_review` |
| `CONFIRMED` | `confirmed` |
| `QUEUE_TRACKING` | `confirmed` (حالة استعلامية، لا تُغيّر `bookings.status`) |
| `ARRIVAL` | `customer_arrived` |
| `IN_SERVICE` | `in_service` |
| `COMPLETED` | `completed` |
| `HUMAN_HANDOFF` | أي حالة (`conversation_sessions.human_handoff_active=1` مستقل عن `bookings.status`) |

### 8.2 جدول الأدوات المتاحة لكل حالة (لتفعيل §6.4 `availableTools`)

| الحالة | الأدوات المتاحة |
|---|---|
| `IDLE`/`NEW_CONTACT`/`DISCOVERING_INTENT` | `get_services`, `get_packages`, `get_barbers`, `get_customer` |
| `COLLECTING_INFORMATION` | + `check_availability` (فور اكتمال الحقول) |
| `CONFIRMING_REQUEST`/`CHECKING_AVAILABILITY` | + `create_booking_draft`, `create_custom_booking_request` |
| `BOOKING_DRAFT`/`AWAITING_PAYMENT` | `get_booking_status`, `update_booking_draft`, `submit_payment_proof`, `handoff_to_reception` |
| `AWAITING_CUSTOM_PRICING` | `get_booking_status`, `handoff_to_reception` فقط (بانتظار الموظف، لا أدوات كتابة أخرى) |
| `PENDING_REVIEW` | `get_booking_status`, `handoff_to_reception` فقط |
| `CONFIRMED` | `get_booking_status`, `get_queue_position`, `cancel_booking`, `reschedule_booking`, `handoff_to_reception` |
| `QUEUE_TRACKING`/`ARRIVAL`/`IN_SERVICE` | `get_queue_position`, `confirm_arrival`, `handoff_to_reception` |
| أي حالة | `handoff_to_reception` متاحة دومًا |

---

## 9. Normal Booking — Flow الكامل خطوة بخطوة

```
1. WhatsApp Message وارد
   → Router (n8n) + Idempotency Gate (conversation_messages, §7.1)
   → إن كانت الرسالة مُعالَجة بالفعل (UNIQUE violation): توقف صامت، لا رد يُرسَل، تسجيل في السجلات فقط.

2. Intent Detection (داخل استدعاء AI Agent نفسه، §6.2)
   → intent = "booking_request"

3. Customer Resolution
   → أداة get_customer(phone) → {exists, name, isVip, lastServiceId}
   → قراءة/إنشاء conversation_sessions لهذا الرقم (state='IDLE' إن جديد)

4. Service Resolution
   → أداة get_services() → مطابقة entities.service_hint مقابل aliases (§6.3/§7.2)
   → إن غامض: سؤال توضيحي واحد فقط (لا إعادة سؤال حقل موجود، §6.4 pending_entities)

5. Availability
   → أداة check_availability(branchId, barberId?, serviceIds[], date) — الإصدار الحقيقي بعد §6.3
   → غير متاح؟ عرض بدائل فعلية أو اقتراح join_smart_waitlist (الأداة الموجودة فعليًا، لا تغيير)

6. Booking Draft
   → أداة create_booking_draft(...) → status='draft'/'awaiting_payment' (حسب منطق CreateBookingUseCase الحالي، لا تغيير في هذا الانتقال نفسه)
   → رد HTTP فعلي مضمون الآن (إصلاح §2.2/§6.3) → رسالة تأكيد واحدة فقط للعميل (إصلاح §4.2)

7. Deposit / Payment Instructions
   → من get_booking_settings (§6.3) — لا بيانات ثابتة في الـPrompt

8. Payment Proof
   → العميل يرسل صورة → أداة submit_payment_proof (المُعاد بناؤها بالكامل، §12)
   → status → 'payment_submitted' فورًا، ثم 'pending_review' (تمييز صريح بين الحالتين، إصلاح §11 من الخطة الأصلية)

9. Reception Review
   → موظف بشري يعتمد/يرفض عبر لوحة الاستقبال الموجودة فعليًا (PATCH /bookings/:id/payment-proof)
   → عند الاعتماد: payment_proofs.status='approved' → bookings.status='confirmed' (المسار الموجود فعليًا، لا تغيير جذري، فقط التأكد أنه يقرأ من payment_proofs الحقيقي بعد §12)

10. Confirmation
    → إشعار واتساب تلقائي (Notification Event "Booking Confirmed"، §18)

11. Queue
    → أداة get_queue_position عند الطلب، أو Push استباقي (Notification "Queue Almost Ready"، §18 — جديد)

12. Notifications
    → مصفوفة كاملة في §18
```

---

## 10. Custom Booking — Flow الكامل

### 10.1 المبدأ

`[من الخطة المعمارية — مطابق، §9]` + إصلاح الاكتشاف الإضافي في §2.7 (المسار موجود لكنه معطوب).

### 10.2 الأداة الجديدة

`create_custom_booking_request(customerPhone, customerName, freeTextDescription, extractedServiceHints[])`
→ `POST /api/agent-tools/bookings/create-custom-request`:

- ينشئ صفًا في `bookings` عبر **نفس** `container.createBookingUseCase.execute()` (لا SQL خام) بحالة
  ابتدائية `custom_pricing_requested` (القيمة الجديدة في Enum، §7.2)، `total_at_booking = 0.00`،
  `custom_pricing_notes = freeTextDescription`.
- إشعار Socket.IO حقيقي: `broadcastToBranch(branchId, 'CUSTOM_PRICING_REQUESTED', {...})` — الحدث
  **موجود بالفعل بنفس الاسم تقريبًا كنمط** في مسارات أخرى (`PAYMENT_PROOF_SUBMITTED` مثلاً)، يُتبَع
  نفس النمط بالضبط.
- الرد للـAI: `{bookingId, status: 'custom_pricing_requested'}` → الـAI يخبر العميل أن الطلب وصل
  للاستقبال وسيصله السعر قريبًا — **بلا أي رقم سعر مذكور**.

### 10.3 إصلاح `customize-and-dispatch` (من §2.7)

في `server/src/routes/bookings.routes.ts:704-800`:

1. **حذف** `UPDATE bookings SET ... .catch(() => {})` الصامت — استبداله باستدعاء Use Case جديد
   `ApplyCustomPricingUseCase` (نمط `CancelBookingUseCase`) يستخدم `container.bookingRepo` مع
   `withTransaction`، ويُرجِع خطأ حقيقي (`res.status(500)`) إن فشلت الكتابة فعليًا — **لا** `catch`
   صامت يليه `return res.json({ success: true })` بلا شرط.
2. **تصحيح الانتقال**: بدل القفز المباشر لـ`status='confirmed'`، الانتقال الصحيح بعد التسعير من
   الموظف هو `status='awaiting_payment'` (**ما لم** يكن الموظف قد استلم الدفع كاش يدويًا في نفس
   اللحظة — في هذه الحالة الواجهة تُرسِل علمًا صريحًا `paymentAlreadyCollected: boolean` بدل افتراضه
   دومًا كما يحدث حاليًا).
3. **حذف الإدراج التلقائي المُخمَّن في `financial_records`** (سطر يحتوي `depositVal` مُخمَّن بقيمة
   50/100 ثابتة) — يُستبدَل بنفس مسار `submit_payment_proof`/اعتماد الموظف الفعلي في §12 لضمان مصدر
   حقيقة واحد للدفعات، بدل مصدرين (هذا المسار + مسار الدفع العادي).
4. حساب العربون/المتبقي بعد التسعير المخصص يستخدم **نفس** إعدادات `booking_fee_normal`/`booking_fee_vip`
   من `settings` (§6.3 `get_booking_settings`) — **ممنوع** تمريره كرقم حر من الواجهة الأمامية بلا
   ربطه بإعدادات النظام (ما لم يكن الموظف يُدخل خصمًا يدويًا صريحًا موثّقًا كحقل منفصل `discount`).

---

## 11. Database Source of Truth — الجدول الملزم

| المعلومة | المصدر الوحيد المسموح | ممنوع صراحة |
|---|---|---|
| الأسعار | `services.price` / `bookings.total_at_booking` بعد الحفظ | أي رقم في الـPrompt أو `liveSyncedState` |
| الخدمات | `services` (`is_active=1`) | قوائم ثابتة في الكود (`ai.routes.ts:31-42` كمرجع لما يُمنَع تكراره هنا) |
| الباقات | `services WHERE category='vip_package'` + `bundle_service_ids` (§7.2) | تخمين النموذج لمكونات الباقة |
| الحلاقون | `barbers` (`is_active=1`) | أسماء ثابتة (`liveSyncedState.branches` الحالي) |
| Availability | نتيجة `check_availability` الحقيقية بعد §6.3 (استعلام `bookings`+`chairs`) | `isSlotAvailable: true` ثابت (الوضع الحالي المُصلَح) |
| حالة الحجز | `bookings.status` | أي حالة يذكرها النموذج من الذاكرة النصية بلا استعلام طازج |
| حالة الدفع | `payment_proofs.status` (بعد §12) | `bookings.payment_proof` JSON خام (الوضع الحالي المُصلَح) |
| موقع الطابور | `queue_entries`/`get_waiting_position` الحية | تقدير النموذج |
| Tracking Code / Booking ID | `bookings.id`/`bookings.secure_token` الفعليان بعد الإنشاء الناجح | أي معرّف يُنشئه النموذج أو Fallback عشوائي (`BK-${Math.random()}` — هذا النمط موجود حاليًا في أكثر من مكان كـFallback، §2.4/§2.7، ويُحذف) |
| قواعد العربون | `settings.booking_fee_normal`/`settings.booking_fee_vip` (الأسماء الفعلية، §2.10) | أرقام ثابتة (`50`/`100`/`180` المكتوبة حرفيًا في أكثر من مسار حاليًا) |

---

## 12. Payment Proof — Flow آمن (تفصيل كامل)

### 12.1 المكوّنات الجديدة المطلوبة

- `server/src/domain/repositories/IPaymentProofRepository.ts` (واجهة جديدة، نمط `IWaitlistRepository`)
- `server/src/adapters/repositories/MySQLPaymentProofRepository.ts` (تنفيذ، نمط `MySQLWaitlistRepository.ts` حرفيًا كقالب)
- `server/src/usecases/payments/SubmitPaymentProofUseCase.ts` (نمط `JoinWaitlistUseCase.ts`)
- تسجيلها في `container.ts` (نفس نمط بقية الـRepositories/UseCases)

### 12.2 التسلسل المُصحَّح

1. العميل: "أنا حولت" → إن `conversation_sessions.active_booking_id` **غير معروف بوضوح** لهذا الرقم:
   الـAI يسأل تأكيدًا صريحًا لرقم الحجز (`"الحجز رقم #BK-... صح؟"`) — **لا تخمين إطلاقًا**.
2. العميل يرسل الصورة → `submit_payment_proof(bookingId, phone, proofImageUrl, transferredAmount?)`.
3. **شرط الربط الصارم الوحيد المسموح** في `SubmitPaymentProofUseCase`:
   ```
   IF booking.customer_phone === normalizePhone(senderPhone)  // تطابق كامل، لا slice(-8)
     AND booking.status IN ('draft', 'awaiting_payment')
   THEN proceed
   ELSE reject_with_clear_message  // "معلش يا فندم، رقم الحجز مش متطابق مع رقمك، ممكن تأكد؟"
   ```
   **لا يوجد أي مسار Fallback** يبحث عن "أي حجز `awaiting_payment` في النظام" أو يُنشئ حجزًا وهميًا
   جديدًا (حذف كامل للسطور 1004-1092 من `agentTools.routes.ts` الحالية).
4. عند القبول: `status → 'payment_submitted'` **فورًا** (خطوة منفصلة صراحة، ليست نفس لحظة
   `pending_review`) — ثم مباشرة `status → 'pending_review'` بعد إدراج ناجح في `payment_proofs`.
5. الكتابة الفعلية: `INSERT INTO payment_proofs (id, booking_id, image_path, payment_method,
   sender_phone, transferred_amount, status, submitted_at) VALUES (...)` عبر `MySQLPaymentProofRepository`
   داخل `withTransaction` مع تحديث `bookings.status` في نفس المعاملة (منع حالة وسيطة غير متسقة).
   `UNIQUE KEY` على `payment_proofs.booking_id` (موجود بالفعل في المخطط) يمنع تلقائيًا **Duplicate
   Submission** لنفس الحجز (محاولة ثانية تفشل بخطأ DB واضح يُترجَم لرسالة عميل مفهومة، لا كتابة صامتة فوق القديم).
6. **ممنوع** أي رد "تم تأكيد الدفع/الحجز" قبل قراءة `payment_proofs.status = 'approved'` فعليًا من
   DB بعد إجراء بشري حقيقي عبر `PATCH /api/bookings/:id/payment-proof` (المسار الموجود فعليًا، لا تغيير في منطقه، فقط التأكد أنه يكتب لجدول `payment_proofs` الحقيقي وليس عمود JSON).

---

## 13. Fake Success Prevention — قائمة مواقع الإصلاح الملزمة

كل موقع أدناه **مؤكَّد من الكود مباشرة** (§2) ويجب إصلاحه بالضبط كما يلي — لا رد نجاح للعميل يسبق
تأكيد Backend حقيقي:

| العملية | الموقع الحالي | الخلل المؤكَّد | الإصلاح |
|---|---|---|---|
| Booking creation | `agentTools.routes.ts:485-598` | لا رد HTTP إطلاقًا عند النجاح (§2.2) | إضافة `res.json` صريح (§6.3) |
| Payment proof submission | `agentTools.routes.ts:980-1141` | ينشئ حجزًا وهميًا ويُرجِع نجاحًا لعملية لم تُطلَب أصلاً (§2.4) | رفض صريح بدل الاختراع (§12) |
| Payment approval | `bookings.routes.ts` (`payment-proof` PATCH) | يحتاج تحقق أنه يقرأ/يكتب `payment_proofs` الحقيقي لا عمود JSON | ربط بـ`MySQLPaymentProofRepository` (§12.1) |
| Custom pricing dispatch | `bookings.routes.ts:704-800` | `catch(() => {})` صامت + `res.json({success:true})` غير مشروط (§2.7) | Use Case حقيقي مع Transaction (§10.3) |
| Cancellation | `agentTools.routes.ts:745-833` (`/bookings/cancel`) | يحتاج تحقق أن `cancelBooking()`/`CancelBookingUseCase` يُرجِع فشلاً حقيقيًا يُترجَم لرد HTTP فاشل، لا نجاحًا افتراضيًا | تأكيد وجود `if (!success) return res.status(...)` صريح — فحص تنفيذي مطلوب في Phase 3 |
| Reschedule | `agentTools.routes.ts:909-980` | نفس نمط الفحص أعلاه | نفس الإصلاح |
| Queue updates | `queue.service.ts`/`queue.routes.ts` | لم يُفحَص بعمق في هذه الجولة — بند فحص صريح في Phase 8 | فحص + إصلاح إن وُجد نفس النمط |

---

## 14. Concurrency

| المطلوب | أين يُستخدَم |
|---|---|
| **Transactions** (`withTransaction`, موجودة فعليًا في `config/database.js`) | كل كتابة متعددة الخطوات: `create_booking_draft`، `submit_payment_proof` (تحديث `payment_proofs`+`bookings` معًا)، `ApplyCustomPricingUseCase` (§10.3) |
| **Row locking** (`FOR UPDATE`, موجود فعليًا في `MySQLBookingRepository.ts:83-94`) | إعادة استخدامه حرفيًا داخل `check_availability` الجديدة (§6.3) بدل كتابة قفل جديد |
| **Unique constraints** | `conversation_messages.whatsapp_message_id` (جديد، §7.1)، `payment_proofs.booking_id` (موجود فعليًا)، `bookings.secure_token` (موجود فعليًا) |
| **Idempotency keys** | `create_booking_draft.idempotencyKey` عبر `container.webhookEventRepo.recordEventIfNew()` (الـRepository موجود، غير مُستخدَم حاليًا، §2.9/§7.4) |
| **Message IDs** | `msg.key.id` من Baileys (موجود فعليًا في الكود) → `conversation_messages.whatsapp_message_id` كخطوة أولى في n8n (§5.2) قبل أي معالجة أخرى |

**تحديدًا لمنع**:
- Double Booking → `check_availability` الحقيقي (§6.3) + `FOR UPDATE` عند الإدراج الفعلي.
- Duplicate Booking (نفس العميل يطلب نفس الشيء مرتين بغلطة) → `idempotencyKey` (أعلاه).
- Duplicate Payment Proof → `UNIQUE KEY` على `payment_proofs.booking_id` (موجود بالفعل، يحتاج فقط
  استخدامه الفعلي بدل تجاوزه بالكتابة على عمود JSON).
- Duplicate WhatsApp Message Processing → `UNIQUE` على `conversation_messages.whatsapp_message_id`.

---

## 15. Customer Context — الحدود الدقيقة

| ماذا | أين يُحفَظ | متى يُسترجَع |
|---|---|---|
| اسم العميل، رقم الهاتف، عدد الزيارات، VIP | `profiles`/`bookings` (موجود، دائم) | كل رسالة عبر `get_customer` |
| الحجز الحالي (Draft قيد الجمع، لم يُثبَّت بعد) | `conversation_sessions.pending_entities` (مؤقت، حتى `create_booking_draft`) | كل رسالة أثناء `COLLECTING_INFORMATION` |
| الحجز النشط بعد الإثبات | `conversation_sessions.active_booking_id` → صف حقيقي في `bookings` | كل استفسار عنه (استعلام طازج، لا Cache) |
| آخر N رسالة (نبرة العميل، أسلوبه) | `conversation_messages` (دائم، قاعدة بيانات) | بناء `recentMessages` في §6.4 |
| السعر/الحالة/الطابور/رقم الحجز | **لا يُحفَظ كنص في الذاكرة كمصدر حقيقة أبدًا** — يُعاد استرجاعه من DB في كل مرة (§0.3/§11) | فوري، كل استفسار |

**القاعدة الحاكمة**: `bookingSessions`/`chatHistories` (In-Memory) **لا تُستخدَم كمصدر حقيقة** بعد
Phase 2 — إن بقيتا مؤقتًا لأداء (Cache)، فأي قراءة منهما Best-effort فقط مع Fallback إجباري لقراءة DB
عند أي شك.

---

## 16. Natural Language — كيف يُعالَج كل نمط

`[من الخطة المعمارية — مطابق، §7]` — Gemini نفسه هو طبقة الفهم اللغوي لكل الأنماط المذكورة (مصري،
فصيح، إنجليزي، مزيج، أخطاء إملائية، رسائل قصيرة/طويلة، طلبات متعددة، تغيير الطلب/الموضوع، بلا علامات
ترقيم) — **لا حاجة لمحرك قواعد منفصل لكل حالة**. الإضافة الهيكلية الوحيدة المطلوبة فعليًا:

1. `services.aliases` (§7.2) — يحل "الوصف بدل الاسم الرسمي" كمسؤولية بيانات لا مسؤولية تخمين.
2. Structured Context (§6.4) بدل نص خام — يحل "لا يعرف متى يحتاج سؤال إضافي" عبر `pending_entities`
   قابلة للفحص برمجيًا.
3. **قيد صارم عند فشل Gemini**: الوضع الحالي يسقط لمطابقة كلمات مفتاحية بدائية عند فشل الاتصال
   (`whatsapp.service.ts:1083-1091`، ضمن الدالة المحذوفة §4.1). **بعد التنفيذ، لا يوجد "Fallback
   ذكاء بديل" إطلاقًا** — فشل استدعاء Gemini من داخل n8n يُعامَل كـ"Tool failure" قياسي (§20)، رسالة
   اعتذار صادقة + تحويل بشري، **وليس** خوارزمية مطابقة نصوص صامتة يظن العميل أنها "ذكاء اصطناعي" فعلي.

---

## 17. Human Handoff

### 17.1 الوضع بعد §2.8 (البناء على الموجود فعليًا)

`toggle-handoff` endpoint و`toggleHumanHandoff()` **موجودان وصالحان جزئيًا** — يُوسَّعان لا يُعاد
اختراعهما.

### 17.2 التعديل المطلوب على `toggleHumanHandoff()`

```
// server/src/services/whatsapp.service.ts:1100-1116 — التعديل:
// 1. حذف الكتابة إلى bookingSessions (سطر 1102-1105) بالكامل.
// 2. الكتابة الوحيدة: UPDATE conversation_sessions SET human_handoff_active=?, human_handoff_expires_at=?
//    WHERE customer_phone=? (بدل UPDATE bookings الحالي — الحجز والمحادثة مفهومان مختلفان،
//    قد يوجد Handoff بلا حجز نشط إطلاقًا، مثال: استفسار عام غاضب بلا نية حجز).
```

### 17.3 أداة `handoff_to_reception` الجديدة (§6.3)

معايير التفعيل `[من الخطة المعمارية — مطابق، §10.2]`: طلب صريح، غضب واضح، `handoff_signal` من
Structured Output (§6.2)، طلب غير مغطى بأي أداة، مشكلة دفع/حجز، أكثر من محاولتين فاشلتين. الكلمات
المفتاحية الحالية (`handoffKeywords`, §4.1) تبقى **كشبكة أمان إضافية فقط** على مستوى n8n
Normalizer، لا كمصدر القرار الوحيد.

**ما يظهر للموظف** (عبر Socket.IO، نفس القناة المستخدمة فعليًا لـ`PAYMENT_PROOF_SUBMITTED` وغيرها):
```json
{
  "customerName": "...", "phone": "...",
  "conversationSummary": "ملخص آخر 5-10 رسائل من conversation_messages، وليس اللوج الكامل",
  "currentIntent": "...", "activeBookingId": "...",
  "triggerReason": "customer_requested | anger_detected | low_confidence | unsupported_request",
  "lastMessages": ["..."]
}
```

بعد التحويل: `conversation_sessions.human_handoff_active=1` → n8n Router يتحقق من هذا الحقل **قبل**
استدعاء `AI Agent` لأي رسالة تالية من نفس الرقم، ويتخطى الرد الآلي بالكامل حتى يُلغي الموظف الحالة
يدويًا (عبر `toggle-handoff` الموجود فعليًا) أو تنتهي المهلة (ساعتان، القيمة الحالية في
`toggleHumanHandoff`، تبقى كما هي).

---

## 18. Notifications — المصفوفة الكاملة

| الحدث | Trigger | Data Source | الحالة الحالية |
|---|---|---|---|
| Booking Accepted (Draft created) | نجاح `create_booking_draft` | `bookings` بعد الإنشاء | ✅ موجود جزئيًا، يُوحَّد لرسالة واحدة (§4.2) |
| Payment Approved | تحديث `payment_proofs.status='approved'` من الموظف | `payment_proofs`+`bookings` | ⚠️ يحتاج ربط فعلي بعد §12 |
| Booking Reminder | Workflow 04 (Cron ساعي، موجود) | `bookings` القادمة | ✅ موجود، لا تغيير جذري مطلوب هنا |
| Queue Almost Ready **[جديد]** | Cron/Event عند اقتراب دور العميل (يُبنى فوق `queue_entries` الموجود) | `queue_entries.position` | ❌ غير موجود — يُضاف كمهمة مجدولة قصيرة الدورة (كل 5 دقائق) تفحص من هو "التالي بعد 2" وترسل تنبيهًا مرة واحدة فقط (Flag لمنع التكرار) |
| One Customer Ahead **[جديد]** | نفس آلية أعلاه، عتبة مختلفة | `queue_entries` | ❌ غير موجود، نفس آلية أعلاه |
| Your Turn **[جديد]** | `position=0`/استدعاء الكابتن فعليًا | `queue_entries` | ❌ غير موجود، نفس آلية أعلاه |
| Arrival Confirmation | نجاح `confirm_arrival` | `bookings.status='customer_arrived'` | ✅ بعد توحيد المسار (§6.3) |
| Cancellation | نجاح `cancel_booking` أو إلغاء من لوحة التحكم | `bookings.status='cancelled'` | ⚠️ يحتاج تحقق تشغيلي: هل تغيير الحالة من اللوحة يُطلِق إشعار واتساب تلقائي؟ (لم يُتحقَّق بعمق، بند فحص Phase 8) |
| Reschedule | نجاح `reschedule_booking` | `bookings.starts_at` الجديد | نفس بند الفحص أعلاه |
| Custom Price Approved | نجاح `ApplyCustomPricingUseCase` (§10.3) | `bookings.total_at_booking` بعد التسعير | ❌ يُبنى مع §10.3 مباشرة |

---

## 19. Security

| التهديد | الوضع المؤكَّد | الإصلاح |
|---|---|---|
| **القيمة الافتراضية للسرّ** | مكتوبة حرفيًا في الكود **و**في ملف n8n JSON نفسه (`trim-mind-agent-secret-key-2026`، مؤكَّد §2.5) | حذف القيمة الافتراضية من الكود، رفض الإقلاع بلا `AGENT_API_SECRET` بيئي في الإنتاج؛ تحديث ملف n8n الموحّد الجديد ليستخدم Credential مُدار من n8n (لا نص خام في JSON قابل للتصدير) |
| **صلاحيات غير متدرجة** | سرّ واحد يفتح كل الأدوات القرائية والتدميرية | فصل سرّين: `AGENT_API_SECRET_READ` (قراءة فقط) و`AGENT_API_SECRET_WRITE` (حجز/إلغاء/دفع) — `requireAgentAuth` (`agentTools.routes.ts:21`) يُوسَّع لقبول Scope كمعامل |
| **Unauthorized Cancellation/Reschedule** | مطابقة جزئية + Fallback بلا قيد هاتف (مؤكَّد، §6.3) | تطابق كامل إلزامي + استخدام `bookings.secure_token` الموجود فعليًا كتحقق ثانٍ |
| **Webhook Authenticity** | `Evolution API Webhook` بلا أي تحقق توقيع/مصدر (مؤكَّد) | سرّ مشترك جديد بين `forwardToN8nWebhook` (`whatsapp.service.ts`) وعقدة الـWebhook في n8n (§5.3) |
| **Customer Data Isolation** | نفس مشكلة مطابقة الهاتف الجزئية | نفس الإصلاح أعلاه يحلها |
| **Payment Proof Manipulation** | مؤكَّد بالتفصيل، §2.4/§12 | §12 بالكامل |
| **Prompt Injection** | لا فلترة صريحة، الاعتماد على تعليمات النموذج فقط | إبقاء المبدأ (النموذج لا ينفّذ SQL مباشرة أصلاً) + تسجيل محاولات واضحة (`"ignore previous instructions"` ونحوها) في `audit_logs` للمراجعة |
| **Rate Limiting على أدوات الـAI** | غير مؤكَّد وجوده تحديدًا لـ`/api/agent-tools/*` (بند فحص) | فحص تشغيلي في Phase 10: هل `rateLimiter.ts` مُطبَّق على هذا الـRouter؟ إن لا، إضافة حد صريح لكل رقم هاتف/دقيقة |

---

## 20. Error Handling — المصفوفة الكاملة

| الحالة | ماذا يرى العميل | ماذا يُسجَّل | Retry؟ | Handoff؟ |
|---|---|---|---|---|
| Database unavailable | اعتذار صادق + تحويل فوري، **لا** بيانات بديلة مُختلَقة (حذف `liveSyncedState`) | خطأ كامل + Stack في `audit_logs`/logs | لا | ✅ فوري |
| Backend/n8n unavailable | نفس أعلاه | تنبيه تشغيلي | محاولة واحدة تلقائية | ✅ إن فشلت |
| WhatsApp send failure | (العميل لن يرى شيئًا بالتعريف) | تسجيل الفشل + الهاتف | Backoff محدود | لا |
| Media upload failure | "الصورة ما وصلتش، ممكن تبعتها تاني؟" | خطأ التحميل | يدوي من العميل | لا |
| Payment proof بلا حجز مطابق تمامًا | سؤال توضيحي صريح لرقم الحجز (§12.2) | — | لا | بعد محاولتين فاشلتين |
| Booking conflict (بعد إصلاح `check_availability`) | بدائل فعلية أو قائمة انتظار | — | لا | لا |
| Duplicate message (`whatsapp_message_id` مكرر) | يُتجاهَل بصمت، لا رد مكرر | تسجيل تجاهل | لا | لا |
| AI timeout | اعتذار + إعادة محاولة صامتة واحدة | — | مرة واحدة | ✅ إن فشلت مجددًا |
| AI hallucination detected (§6.6) | لا يُمنَع الإرسال في هذه المرحلة (Detection فقط) | `audit_logs` | — | حسب الخطورة، مراجعة دورية |
| Tool failure (5xx) | اعتذار صادق | الخطأ الكامل | محاولة واحدة | ✅ إن استمر |

---

## 21. Test Matrix

| الفئة | السيناريوهات | السلوك المتوقع |
|---|---|---|
| عميل جديد/حالي | أول رسالة، عميل بحجز سابق، VIP | ترحيب واحد، تحميل سياق صحيح من DB |
| حجز عادي/مخصص | خدمة واحدة، خدمات متعددة، وصف حر بلا سعر معروف | تحويل صحيح لـ`custom_pricing_requested` عند الحاجة |
| لغة | مصري، فصيح، إنجليزي، مزيج، بلا ترقيم، أخطاء إملائية | فهم صحيح بلا إعادة سؤال غير ضرورية |
| رسائل | قصيرة جدًا، طويلة، طلبات متعددة في رسالة واحدة | استخراج كل الـEntities معًا |
| تكرار (نفس `whatsapp_message_id`) | إرسال نفس الرسالة/Webhook مرتين | معالجة مرة واحدة فقط، لا حجز مكرر |
| Duplicate Booking (نفس idempotencyKey) | استدعاء `create_booking_draft` مرتين بنفس المفتاح | إرجاع نفس `bookingId`، لا حجز ثانٍ |
| Payment Proof (صالح) | حجز صريح مطابق تمامًا للهاتف | ربط ناجح، `payment_submitted` ثم `pending_review` |
| Payment Proof (غير صالح) | صورة بلا حجز نشط معروف، هاتف مطابق جزئيًا فقط لحجز آخر | رفض الربط التلقائي، سؤال توضيحي |
| Booking Conflict | نفس الكابتن/الوقت لعميلين | `check_availability` يرصد التعارض فعليًا |
| Cancellation/Reschedule (صحيح) | هاتف مطابق تمامًا | نجاح |
| Cancellation/Reschedule (انتحال) | هاتف مطابق جزئيًا فقط | رفض صريح |
| Queue/Arrival | استعلام دور، تأكيد وصول عبر الأداة الموحّدة | لا مسار SQL مباشر مواز |
| AI Failure | فشل استدعاء Gemini | اعتذار + Handoff، **لا** Fallback كلمات مفتاحية |
| n8n Failure | Workflow لا يستجيب | Retry واحد ثم Handoff |
| Database Failure | MySQL غير متاح | اعتذار صادق، **لا** `liveSyncedState` |
| WhatsApp Failure | فشل إرسال Baileys | تسجيل + Backoff، بلا تأثير على حالة الحجز في DB |
| Human Handoff | طلب صريح، غضب، فشل فهم متكرر | استدعاء `handoff_to_reception` من النموذج نفسه |
| أمان | حقن تعليمات، محاولة إلغاء حجز عميل آخر | رفض واضح، لا تسريب |
| **ازدواجية المحرك (Regression خاص بهذا المشروع)** | إرسال رسالة واحدة، عدّ الردود الواصلة | **رد واحد فقط** دومًا — اختبار صريح لبقاء §4.1 مُطبَّقًا |
| **ازدواجية رسائل التأكيد (Regression جديد، §2.6)** | إنشاء حجز ناجح، عدّ رسائل التأكيد الواصلة | **رسالة تأكيد واحدة فقط**، نصها متسق مع الحالة الفعلية (`awaiting_payment`، لا يفترض دفعًا مُستلَمًا) |
| **Fake Success على `customize-and-dispatch` (Regression جديد، §2.7)** | محاكاة فشل DB أثناء الاستدعاء | الرد يجب أن يكون فشلاً حقيقيًا (500)، لا `{success:true}` غير مشروط |

---

## 22. Implementation Roadmap — المراحل التفصيلية

### Phase 1 — توحيد محرك المحادثة + إصلاحات ازدواجية فورية
- **الملفات المعدَّلة**: `server/src/services/whatsapp.service.ts` (حذف `handleIncomingWithAI`،
  `chatHistories`، الاستدعاء المزدوج سطر 507/511)، `server/src/usecases/bookings/CreateBookingUseCase.ts`
  (حذف الإشعار المزدوج، §4.2)، `server/src/services/booking.service.ts` (توحيد نص التأكيد).
- **n8n**: تحديد النسخة المفعّلة فعليًا (§5.1)، حذف الملف المكرر، إصلاح `headerParameters` الناقصة
  فورًا في أي نسخة تفتقدها.
- **Database Changes**: لا شيء بعد.
- **API Changes**: لا شيء بعد.
- **Tests**: سيناريو "ازدواجية المحرك" و"ازدواجية رسائل التأكيد" في §21 — **يجب أن ينجحا كلاهما قبل المتابعة**.
- **Acceptance Criteria**: رسالة واحدة → رد واحد فقط، دومًا. حجز واحد ناجح → رسالة تأكيد واحدة فقط.

### Phase 2 — Conversation State & Context (قاعدة بيانات دائمة)
- **الملفات المُنشأة**: `server/src/domain/repositories/IConversationSessionRepository.ts`،
  `server/src/adapters/repositories/MySQLConversationSessionRepository.ts` (نمط `MySQLWaitlistRepository.ts`).
- **Database Changes**: `conversation_sessions`, `conversation_messages` (§7.1) عبر `cleanup.service.ts` (§2.9).
- **API Changes**: Endpoints داخلية جديدة يستدعيها n8n لقراءة/تحديث الجلسة (لا تُعرَض للعميل مباشرة).
- **n8n Changes**: حذف `Window Buffer Memory`، إضافة عقد قراءة/كتابة الجلسة (§5.3).
- **Tests**: إعادة تشغيل الـBackend/n8n أثناء محادثة نشطة لا تفقد السياق.
- **Acceptance Criteria**: `conversation_messages` تحتوي كل رسالة واردة/صادرة فعليًا بعد أي اختبار يدوي.

### Phase 3 — إصلاح أدوات قاعدة البيانات الحرجة
- **الملفات المعدَّلة**: `server/src/routes/agentTools.routes.ts` (`create-pending` رد النجاح +
  `idempotencyKey`، `availability/check` استعلام حقيقي).
- **Dependencies**: Phase 2 (لـ`idempotencyKey` عبر `webhookEventRepo`).
- **Tests**: سيناريوهات "تكرار"، "Duplicate Booking"، "Booking Conflict" في §21.
- **Acceptance Criteria**: كل استدعاء ناجح لـ`create_booking_draft` يُرجِع `res.json` فعليًا؛
  `check_availability` يرصد تعارضًا حقيقيًا في بيئة اختبار مُحضَّرة له.

### Phase 4 — Database Tools الكاملة
- **الملفات المُنشأة**: Endpoints/Use Cases لـ`get_packages`, `get_package_details`,
  `update_booking_draft`, `get_booking_settings`.
- **Database Changes**: `services.aliases`, `services.bundle_service_ids` (§7.2).
- **Dependencies**: Phase 3.
- **Acceptance Criteria**: كل أداة في جدول §6.3 لها Endpoint فعلي يستجيب بالشكل المحدد.

### Phase 5 — AI Prompt Architecture + n8n إعادة الهيكلة الكاملة
- **n8n Changes**: إعادة بناء `Prepare Chat Input` (Structured Context، §6.4)، الطبقات الست
  (§6.5)، عقدة Post-generation Guardrail (§6.6)، تحديث كل عقد `Tool:*` لتطابق §6.3.
- **Dependencies**: Phase 2، Phase 4.
- **Tests**: سيناريوهات "لغة" و"رسائل" في §21 — عدم إعادة سؤال حقل مُجاب عنه.
- **Acceptance Criteria**: فحص Structured Output لعينة من المحادثات يطابق الشكل في §6.2.

### Phase 6 — Booking Engine (Normal + Custom)
- **الملفات المعدَّلة**: `server/src/routes/bookings.routes.ts` (`customize-and-dispatch`، §10.3)،
  `WhatsAppCustomPricingModal.tsx` (ربط بالحالة الجديدة `custom_pricing_requested` إن احتاج تعديلاً
  بصريًا بسيطًا لعرض الحالة الجديدة، لا إعادة بناء).
- **الملفات المُنشأة**: `ApplyCustomPricingUseCase.ts`, Endpoint `create-custom-request` (§10.2).
- **Database Changes**: قيمة Enum جديدة `custom_pricing_requested`، `bookings.custom_pricing_notes` (§7.2).
- **Dependencies**: Phase 3، Phase 4.
- **Tests**: سيناريو "حجز عادي/مخصص" في §21 + "Fake Success على customize-and-dispatch".
- **Acceptance Criteria**: طلب حر يصل فعليًا لموظف الاستقبال عبر الواجهة الموجودة، بلا اختراع سعر،
  وفشل DB مُحاكَى يُنتِج ردًا فاشلاً حقيقيًا لا `success:true` وهميًا.

### Phase 7 — Payment Flow الآمن
- **الملفات المُنشأة**: `IPaymentProofRepository.ts`, `MySQLPaymentProofRepository.ts`,
  `SubmitPaymentProofUseCase.ts` (§12.1).
- **الملفات المعدَّلة**: `agentTools.routes.ts` (`payments/submit-proof` إعادة بناء كاملة).
- **Dependencies**: Phase 2، Phase 3.
- **Tests**: كل سيناريوهات "Payment Proof" في §21 — **يجب اختبار Shadow Mode أولاً** (تشغيل المنطق
  الجديد بالتوازي مع القديم دون التأثير على ردود العميل الفعلية، لمقارنة النتائج قبل التفعيل الكامل،
  نظرًا لحساسية هذا المسار ماليًا).
- **Acceptance Criteria**: صفر حالات تلوث ممكنة نظريًا في اختبارات الأمان.

### Phase 8 — Queue & Notifications + تنظيف الذاكرة المتبقية
- **الملفات المعدَّلة**: `whatsapp.service.ts` (حذف `bookingSessions` نهائيًا بعد التأكد من استقرار
  Phase 2)، إضافة مهمة Cron جديدة لإشعارات الطابور الاستباقية (§18).
- **بند فحص إلزامي**: هل تغيير حالة الحجز من لوحة التحكم يُطلِق إشعار واتساب تلقائي فعليًا؟ (§18) —
  التحقق التشغيلي المباشر، ثم الإصلاح إن لزم.
- **Dependencies**: Phase 1، Phase 2.
- **Acceptance Criteria**: لا `UPDATE bookings` مباشر خارج طبقة Use Cases في كامل مسار الواتساب
  (فحص Grep نهائي: `grep -rn "UPDATE bookings" server/src/routes/agentTools.routes.ts` يجب أن يُرجِع
  صفر نتائج خارج طبقة الـRepository).

### Phase 9 — Human Handoff
- **الملفات المعدَّلة**: `toggleHumanHandoff()` (§17.2)، إضافة أداة `handoff_to_reception` (§17.3).
- **Dependencies**: Phase 4، Phase 5.
- **Acceptance Criteria**: كل معايير §17.3 تعمل، الملخص يصل كاملاً للوحة الموظف.

### Phase 10 — Security & Scalability
- **الملفات المعدَّلة**: `agentTools.routes.ts` (`requireAgentAuth` فصل الصلاحيات)، إزالة القيمة
  الافتراضية للسرّ من الكود ومن ملف n8n الموحّد، إضافة تحقق توقيع Webhook (§19).
- **Dependencies**: يمكن التوازي مع Phase 1-9، لكن **يُغلَق قبل أي إطلاق إنتاجي فعلي**.
- **Acceptance Criteria**: اختبارات "أمان" في §21 تنجح كاملة؛ صفر قيمة سرّ افتراضية متبقية (فحص Grep:
  `grep -rn "trim-mind-agent-secret-key-2026"` يُرجِع صفر نتائج في كامل المشروع بما فيه `n8n/workflows/`).

### Phase 11 — Testing & Production Verification
- **الهدف**: أتمتة كامل §21 كاختبارات متكررة (وليس يدوية فقط).
- **Dependencies**: كل المراحل السابقة.
- **Acceptance Criteria**: كل سيناريو في §21 مؤتمت وأخضر قبل أي نشر جديد.

---

## IMPLEMENTATION ACCEPTANCE CHECKLIST

> يستخدمها Anti-Gravity بعد كل مرحلة (وبعد التنفيذ الكامل) للتأكد من اكتمال البناء. كل بند إما ✅
> (تحقَّق فعليًا، وليس افتراضًا) أو ❌ (لم يتحقق بعد).

### محرك المحادثة
- [ ] رسالة واحدة واردة → رد واحد فقط يصل للعميل، في كل الحالات (اختبار حي على رقم اختبار حقيقي).
- [ ] `handleIncomingWithAI` و`chatHistories` محذوفان بالكامل من `whatsapp.service.ts` (Grep يؤكد).
- [ ] حجز واحد ناجح → رسالة تأكيد واحدة فقط، نصها لا يفترض دفعًا لم يحصل بعد.
- [ ] لا يوجد إلا ملف n8n واحد لكل رقم Workflow في `n8n/workflows/`.

### Database
- [ ] `conversation_sessions`/`conversation_messages` موجودان فعليًا في قاعدة البيانات الإنتاجية
      (فحص مباشر: `SHOW TABLES`)، وتُملآن فعليًا أثناء محادثة حقيقية.
- [ ] `UNIQUE KEY` على `conversation_messages.whatsapp_message_id` يمنع فعليًا معالجة رسالة مكررة
      (اختبار حي: إرسال نفس الـWebhook Payload مرتين).
- [ ] `payment_proofs` هو المصدر الوحيد لحالة الدفع (فحص: `bookings.payment_proof` لم تعد تُكتَب من
      أي مسار جديد).
- [ ] قيمة Enum `custom_pricing_requested` موجودة فعليًا في عمود `bookings.status`.

### الأدوات (Tools)
- [ ] `create_booking_draft` تُرجِع `res.json` فعليًا عند كل نجاح (فحص مباشر لعينة استدعاءات حقيقية).
- [ ] `idempotencyKey` يمنع فعليًا حجزًا مكررًا عند إعادة الاستدعاء بنفس المفتاح.
- [ ] `check_availability` يرصد تعارضًا حقيقيًا في سيناريو اختبار مُحضَّر (حجزان لنفس الكابتن/الوقت).
- [ ] `submit_payment_proof` يرفض أي محاولة ربط بلا `bookingId` مطابق تمامًا لرقم الهاتف — صفر مسارات
      Fallback متبقية.
- [ ] `cancel_booking`/`reschedule_booking` يرفضان أي محاولة بمطابقة هاتف جزئية فقط.
- [ ] `handoff_to_reception` أداة فعلية يستدعيها النموذج نفسه، وليست كلمات مفتاحية خارجية فقط.
- [ ] `get_packages`/`get_package_details`/`update_booking_draft`/`get_booking_settings` موجودة
      وتستجيب بالشكل المحدد في §6.3.

### Custom Booking
- [ ] طلب حر يصل فعليًا للوحة الاستقبال (`WhatsAppCustomPricingModal.tsx`) عبر Socket.IO حقيقي.
- [ ] `customize-and-dispatch` يُرجِع فشلاً حقيقيًا عند فشل DB مُحاكَى (لا `success:true` غير مشروط).
- [ ] الانتقال بعد التسعير المخصص يمر بـ`awaiting_payment` (لا قفز مباشر لـ`confirmed` بلا دفع فعلي).

### الأمان
- [ ] صفر قيمة سرّ افتراضية (`trim-mind-agent-secret-key-2026` أو أي بديل مكتوب حرفيًا) في أي ملف
      كود أو JSON في المشروع.
- [ ] `Evolution API Webhook` في n8n يتحقق من سرّ مشترك قبل معالجة أي حمولة واردة.
- [ ] صلاحيات القراءة منفصلة عن صلاحيات الكتابة/التدمير في `requireAgentAuth`.

### الاختبارات
- [ ] كل سيناريو في §21 (بلا استثناء) مُنفَّذ فعليًا (يدويًا على الأقل مرة، ويُفضَّل مؤتمتًا) وناجح.
- [ ] سيناريو "ازدواجية المحرك" (Regression) يبقى أخضر بعد كل تعديل لاحق على `whatsapp.service.ts` أو n8n.
- [ ] سيناريو "ازدواجية رسائل التأكيد" (Regression) يبقى أخضر بعد كل تعديل لاحق على مسار إنشاء الحجز.

### Clean Architecture
- [ ] صفر استعلام `INSERT`/`UPDATE` خام مباشر على `bookings`/`payment_proofs` داخل أي ملف في
      `server/src/routes/` (فحص Grep نهائي، كل كتابة تمر عبر Use Case/Repository).
- [ ] كل أداة جديدة تتبع نمط Route رقيق → UseCase → Repository (مطابقة `usecases/waitlist/*` كقالب).
