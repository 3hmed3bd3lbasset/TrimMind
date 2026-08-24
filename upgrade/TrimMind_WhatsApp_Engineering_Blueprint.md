# TrimMind WhatsApp Engineering Blueprint
### Current State Audit + Implementation Verification + Gap Analysis + Remaining-Work Blueprint

> **منهجية هذا الملف:** كل سطر هنا مبني على قراءة فعلية للكود الحالي في `terimMind-final.zip` (النسخة
> الأحدث المرفوعة)، وليس على `WhatsApp_Chatbot_Intelligent.md` أو `WhatsApp_Booking_Implementation.md`
> أو أي ادعاء من Anti-Gravity. الوثيقتان القديمتان استُخدِمتا **فقط** لمعرفة ماذا كان مطلوبًا، ثم كل بند
> فيهما أُعيد التحقق منه سطرًا بسطر في الكود الحالي. أي مكان يُذكر فيه مسار ملف/رقم سطر فهو موقع تم فتحه
> وقراءته فعليًا في هذه الجولة.
>
> **الخلاصة المسبقة الأهم:** ادعاء "Anti-Gravity أنجز جزءًا كبيرًا من التعديلات" **صحيح جزئيًا وليس
> بمعنى ما تتوقعه**. الجزء المُنجَز فعليًا هو **Hardening أمني عام** (Rate Limiting المزدوج، JWT
> HS256، Dual-Token Rotation، Magic-Bytes Upload Validation، HMAC Webhooks Middleware، Honeypots،
> Financial Ledger المشفّر — كلها تم التحقق منها في جولات تدقيق سابقة على نفس المشروع). **لكن كل
> الأخطاء الجذرية المحددة تحديدًا في `WhatsApp_Booking_Implementation.md` §2 (الازدواجية، الـStub،
> تلوّث الحجوزات، الرسائل المتضاربة، ملفات n8n المكررة) ما زالت موجودة في الكود حرفيًا بنفس السطور
> تقريبًا.** لم يُلمَس مسار الواتساب/الحجز نفسه بعد. هذا الملف يبني الخطة المتبقية على هذا الأساس
> الدقيق.

---

## 0. Non-Negotiable Rules (سارية على كل مرحلة أدناه)

1. لا تستبدل خدمة WhatsApp الحالية — `@whiskeysockets/baileys` عبر `server/src/services/whatsapp.service.ts` يبقى طبقة النقل الوحيدة.
2. لا تُنشئ WhatsApp integration جديدة.
3. Database هي Source of Truth الوحيد — لا AI، لا n8n، لا Browser Memory، لا In-Memory Map دائم.
4. AI لا يخترع الأسعار، لا يخترع الـ Availability، لا يخترع Booking IDs أو Tracking Codes.
5. AI لا يؤكد عملية لم يؤكدها الـ Backend فعليًا بـ `success: true` حقيقي. لا Fake Success.
6. لا Secrets داخل الكود بقيمة افتراضية (`|| 'hardcoded...'`) — يجب أن يفشل الإقلاع إن غاب الـ secret من البيئة.
7. كل حجز يمر حصرًا عبر `container.createBookingUseCase.execute()` — ممنوع أي `INSERT/UPDATE INTO bookings` خام موازٍ في أي Route.
8. كل جدول/عمود جديد يُضاف عبر نفس آلية `ensureInitialDbData()` في `cleanup.service.ts` (نمط `CREATE TABLE IF NOT EXISTS` + `safeColumns` مع `ALTER TABLE`)، وليس migration منفصل.
9. لا يُعاد تنفيذ Feature موجودة بالفعل وتعمل (Two-Layer Auth، Dual-Token، Financial Ledger، Magic-Bytes Upload — هذه IMPLEMENTED ولا تُمس إلا للـ Hardening المذكور صراحة).
10. كل عملية حساسة في Database يجب أن تكون Atomic (Transaction + `FOR UPDATE` عند الحاجة).
11. العمليات الخارجية الحساسة (Webhook، إنشاء حجز، إثبات دفع) يجب أن تكون Idempotent فعليًا، لا بمتغير مُستقبَل وغير مُستخدَم.
12. لا Refactoring واسع بدون سبب هندسي موثّق (Problem → Root Cause → Risk → Solution → Impact).

---

## 1. جدول التحقق الشامل (28 بند)

| # | Requirement | Expected Behavior | Current Implementation (من الكود الفعلي) | Evidence | Status | Remaining Work | Risk |
|---|---|---|---|---|---|---|---|
| 1 | Single AI Conversation Engine | محرك محادثة واحد فقط (n8n + Gemini) يتحكم في كل رد | يوجد **محركان يعملان بالتوازي على نفس الرسالة**: `forwardToN8nWebhook(...)` و`await handleIncomingWithAI(...)` يُستدعَيان معًا من نفس `sock.ev.on('messages.upsert', ...)` بلا قفل أو تنسيق | `whatsapp.service.ts:507` و`:511` (داخل نفس المعالج المُسجَّل عند `:424`) | **BROKEN** | حذف `handleIncomingWithAI` بالكامل (الدالة + الاستدعاء) والاعتماد حصريًا على مسار n8n، أو عكسه — لكن ليس الاثنان معًا | **Critical** — كل رسالة عميل قد يصلها ردّان متضاربان من محركين مختلفين لهما سياق وذاكرة منفصلين تمامًا |
| 2 | Conversation State | حالة محادثة واحدة موثوقة لكل عميل | حالتان منفصلتان: `session` محلي في `handleIncomingWithAI` (In-Memory، ينتهي بعد 90 دقيقة) + أي حالة يديرها n8n بشكل مستقل (Window Buffer Memory) | `whatsapp.service.ts:886-891` (`bookingSessions`, `SESSION_TIMEOUT_MS`) | **BROKEN** | توحيد الحالة في جدول DB واحد (`conversation_sessions`) يقرأ/يكتب منه المحرك الوحيد المتبقي فقط | **Critical** |
| 3 | Persistent Conversation Memory | ذاكرة محادثة دائمة في MySQL، لا تُفقَد بإعادة تشغيل السيرفر أو انتهاء صلاحية Map | **لا يوجد أي جدول `conversation_sessions` أو `conversation_messages` في المشروع بالكامل.** الذاكرة الوحيدة هي `chatHistories` (`Map` في الذاكرة) — تُمسَح بالكامل عند أي `restart`/`redeploy` للسيرفر | تم البحث في كامل `server/src/**/*.ts` عن `conversation_sessions`/`conversation_messages` — صفر نتائج. `whatsapp.service.ts:113` (`chatHistories = new Map(...)`) | **NOT IMPLEMENTED** | إنشاء الجدولين عبر `ensureInitialDbData()`، ونقل كل قراءة/كتابة للسياق الحواري إليهما | **Critical** — أي Redeploy (شائع في Railway) يمحو ذاكرة كل محادثة جارية دون تنبيه العميل |
| 4 | Customer Resolution | معرفة هوية العميل من رقم الهاتف بشكل موثوق عبر DB | يوجد Endpoint حقيقي `POST /api/agent-tools/customer/lookup` يستعلم من MySQL | `agentTools.routes.ts:56` | **IMPLEMENTED** (Do not reimplement) | يحتاج فقط ربطًا بمحرك محادثة واحد بدل استخدامه من مسارين متوازيين | **Low** |
| 5 | Intent Detection | فهم نية العميل من نص حر متعدد اللهجات | موجود مرتين بشكل منفصل: منطق Keyword-matching محلي داخل `handleIncomingWithAI`، ومنطق منفصل (على الأرجح Gemini Prompt) داخل n8n Workflow 02 | `whatsapp.service.ts` (منطق الكلمات المفتاحية للـ Handoff فقط كمثال، `:901-906`)؛ لا يوجد Intent Layer موحّد موثّق في الكود | **PARTIALLY IMPLEMENTED** | بناء طبقة Intent+Entities واحدة (داخل Prompt الـAI Agent الموحّد في n8n بعد حذف المحرك المحلي) | **High** |
| 6 | AI Tools (Agent Tools API) | مجموعة أدوات Backend كاملة تعكس كل عمليات النظام، بحماية Auth | 20 أداة فعلية موجودة ومحمية بـ `requireAgentAuth` على مستوى الـ Router بالكامل (`router.use(requireAgentAuth)`) — تغطي العملاء، الفروع، الخدمات، الحلاقين، التوفر، الحجز، الحالة، الطابور، الإلغاء، الوصول، إعادة الجدولة، الدفع، التذكيرات، قائمة الانتظار، الغياب، الـ Recall | `agentTools.routes.ts:38` (`router.use(requireAgentAuth)`), قائمة الـ Endpoints أسطر 56-1512 | **IMPLEMENTED BUT NEEDS HARDENING** | (أ) إصلاح المنطق الداخلي لأدوات محددة (البنود 8، 9، 20 أدناه) — الأدوات موجودة كـ Endpoints لكن منطقها الداخلي معطوب. (ب) إزالة الـ Secret الافتراضي الثابت | **High** (بسبب (أ)) |
| 7 | Database Source of Truth | كل سعر/خدمة/باقة/حلاق/توفر يأتي من MySQL حصرًا، بلا Fallback بيانات ثابتة | كل Endpoint في `agentTools.routes.ts` يحاول MySQL أولًا، **لكن كل واحد منها لديه Fallback فعلي إلى `liveSyncedState`/`liveSyncedBookings`** (كائنات In-Memory تُهيَّأ ببيانات صالون ثابتة حقيقية عند فشل أو غياب أي صف) | مثال: `availability/check` (`agentTools.routes.ts:429-436`) يسقط إلى `branch-elhdad` ثابتة؛ `create-pending` (`:493-497`) يسقط إلى `srv-haircut`/180 جنيه ثابتة | **PARTIALLY IMPLEMENTED** | حذف كل Fallback بيانات صالون حقيقية؛ عند فشل استعلام DB الأداة يجب أن تُرجع خطأ صريح لـ AI (`success:false`) بدل بيانات مُختلَقة تبدو حقيقية | **Critical** — العميل قد يُخبَر بسعر/فرع غير موجود فعليًا في DB |
| 8 | Normal Booking | Customer→AI→Services→Package→Barber→Availability→Draft→Deposit→Proof→Review→Confirm→Queue→Notify | التسلسل موجود من ناحية الـ Endpoints، لكن حلقتان معطوبتان بداخله: (أ) `availability/check` يُرجع `isSlotAvailable: true` **حرفيًا وثابتًا دائمًا** بلا أي استعلام تعارض حقيقي. (ب) `create-pending` ينجح فعليًا في إنشاء الحجز عبر `createBooking()` الصحيح، **لكن لا يُرسِل أي `res.json`/`res.status` في المسار الناجح على الإطلاق** — الدالة تنتهي بصمت بعد `liveSyncedBookings.unshift(...)` | `agentTools.routes.ts:440` (`isSlotAvailable: true`)؛ `agentTools.routes.ts:558-565` (نهاية try بلا return، يليها مباشرة `catch (dbErr)` ثم إغلاق الدالة) | **BROKEN** | (أ) استعلام تعارض حقيقي بالحلاق+الوقت. (ب) إضافة `return res.json({success:true, data: bookingData})` في نهاية الـ try الناجح. (ج) تفعيل `idempotencyKey` (مُستقبَل حاليًا ولا يُستخدم إطلاقًا، سطر 481) | **Critical** — الحجز يُنشأ فعليًا في DB، لكن n8n/الـAI سيرى الطلب "معلّقًا بلا رد" (Timeout) ويُعيد المحاولة على الأرجح، فيُنشئ حجزًا مكررًا لعدم وجود Idempotency فعلية |
| 9 | Custom Booking | طلب مخصص → مراجعة موظف → تسعير → عربون → تأكيد، بدون اختراع سعر من الـAI | يوجد Endpoint حقيقي `POST /api/bookings/:id/customize-and-dispatch` (خارج `agentTools.routes.ts`، في `bookings.routes.ts`) مربوط بمكوّن UI حقيقي `WhatsAppCustomPricingModal.tsx`، **لكنه ينقل الحجز مباشرة لحالة `confirmed`** متجاوزًا `awaiting_payment`/`pending_review` بالكامل، وينشئ `financial_records` بعربون **مُخمَّن من كود ثابت** (`booking_fee_at_booking \|\| (vip?100:50)`) بلا أي إثبات دفع، عبر `UPDATE bookings` خام مباشر مع `.catch(()=>{})` صامت، وينهي دائمًا بـ`res.json({success:true})` بلا التحقق من نجاح الكتابة فعليًا | `bookings.routes.ts` مسار `customize-and-dispatch` (~سطر 700-800 حسب الفحص) | **PARTIALLY IMPLEMENTED / BROKEN** | إعادة بناء المسار عبر Use Case حقيقي يمر بنفس دورة حياة الحجز العادي (Draft → Deposit → Proof → Review → Confirm)، وإزالة الـ Fake Success | **Critical** — تأكيد مالي بلا أي دفع فعلي محقق |
| 10 | Payment Proof | استقبال، تخزين، ربط بالحجز، منع تكرار، عدم فقدان، مراجعة موظف، لا Confirmation قبل تأكيد Backend | مسار `POST /api/agent-tools/payments/submit-proof` يطابق الحجز بتسلسل خطير: `bookingId` صريح → آخر 8 أرقام هاتف → **أي حجز `awaiting_payment` في النظام كله بلا قيد هاتف إطلاقًا** → إن لم يوجد شيء، **يُنشئ حجزًا وهمي كاملًا ببيانات مُختلَقة** (اسم عميل افتراضي، خدمة "قص شعر كلاسيكي" افتراضية، حلاق افتراضي، سعر افتراضي) ويكتبه بـ `INSERT INTO bookings` خام داخل `try{}catch{}` صامت يتجاوز `createBooking()` بالكامل. الكتابة النهائية لإثبات الدفع تذهب لعمود `bookings.payment_proof` (JSON خام) وليس لجدول `payment_proofs` المخصص السليم البنية والموجود فعليًا في `database/schema.sql` | `agentTools.routes.ts:963-1097` (تسلسل المطابقة والـ Fallback الوهمي)، `agentTools.routes.ts:1054-1070` (`INSERT INTO bookings` خام) | **BROKEN** | حذف مسار "إنشاء حجز وهمي عند عدم العثور"، تقييد المطابقة بالهاتف دائمًا، الكتابة عبر `payment_proofs` الحقيقي وربطها بحجز فعلي فقط | **Critical** — إثبات دفع عميل A قد يُربَط بحجز عميل B (بلا قيد هاتف)، أو يُنشأ حجز كامل ببيانات مختلقة إن لم يوجد تطابق |
| 11 | Reception Approval | موظف الاستقبال يراجع إثبات الدفع ويوافق/يرفض من DB حقيقي | يوجد Realtime broadcast (`broadcastToBranch(..., 'PAYMENT_PROOF_SUBMITTED', ...)`) عند التقديم، ويوجد UI لمراجعة الحجوزات، لكن المصدر الذي يراجعه الموظف هو عمود `bookings.payment_proof` (JSON خام تم تلويثه ببيانات مُختلَقة محتملة من البند أعلاه) وليس جدول `payment_proofs` المخصص | `agentTools.routes.ts:1112-1120` | **PARTIALLY IMPLEMENTED** | نفس إصلاح البند 10 يحل هذا تلقائيًا | **High** |
| 12 | WhatsApp Booking Hub | تبويب منفصل وواضح لحجوزات WhatsApp داخل Reception Dashboard بكل الحقول المطلوبة (AI Brief، Conversation، Tracking Code، Conversation ID...) | لا يوجد تبويب/Hub منفصل. يوجد فقط شارة (`isWhatsApp = b.source==='whatsapp' \|\| Boolean(b.ai_brief)`) داخل جدول الحجوزات الموحّد `BookingsTable.tsx` تُميّز الصف بصريًا فقط | `src/components/receptionist/BookingsTable.tsx:165,339` | **NOT IMPLEMENTED** | تبويب/فلتر مخصص `source='whatsapp'` مع عرض الحقول المطلوبة كاملة (`ai_brief`, `tracking_code`, `conversation_id` — الأخيران غير موجودين أصلًا كأعمدة، انظر البند 3) | **Medium** |
| 13 | WhatsApp Booking Policy | سياسة تشغيل مختلفة (إن لزم) لحجوزات WhatsApp عن الويب | عمود `bookings.source` موجود فعليًا (`ENUM('web','whatsapp')` عبر `safeColumns`)، لكن لا يوجد أي فرع منطقي في الكود يُطبِّق قاعدة عمل مختلفة بناءً عليه (مجرد Tag تصنيفي) | `cleanup.service.ts:189` | **PARTIALLY IMPLEMENTED** | تحديد إن كانت هناك حاجة فعلية لسياسة مختلفة، وتطبيقها إن لزم | **Low** |
| 14 | custom_pricing_requested Status | حالة Enum مخصصة تظهر في الـ Hub حتى يُسعِّر الموظف | لا وجود لهذه القيمة في أي `ENUM` لعمود `status` في `schema.sql` أو `cleanup.service.ts` | بحث شامل عن `custom_pricing_requested` — صفر نتائج في الكود بأكمله | **NOT IMPLEMENTED** | إضافة القيمة لـ `ENUM` عبر `safeColumns` (`ALTER TABLE bookings MODIFY COLUMN status ENUM(...)`) وربطها بمسار Custom Booking المُصلَح (البند 9) | **Medium** |
| 15 | Queue Tracking | تتبع دور العميل الحي في الطابور | موجود وشغّال: `getBranchQueue()` (`queue.service.ts`) + Endpoint `queue/position` في Agent Tools + Realtime broadcast + قفل `FOR UPDATE` عند حساب `queue_number` في `MySQLBookingRepository.ts:83` | `agentTools.routes.ts:664`, `MySQLBookingRepository.ts:83` | **IMPLEMENTED** (Do not reimplement) | Tests فقط | **Low** |
| 16 | Arrival | تسجيل وصول العميل الفعلي | Endpoint حقيقي `POST /api/agent-tools/bookings/confirm-arrival` موجود ويحدّث DB | `agentTools.routes.ts:816` | **IMPLEMENTED** (Do not reimplement) | التحقق من انتقال الحالة الصحيح (State Machine) قبل التأكيد | **Low** |
| 17 | Notifications | إشعارات مبنية على أحداث DB فعلية، لا تخمين AI، بلا تضارب | نصّان متضاربان يُرسَلان تلقائيًا لكل حجز ناجح واحد: (1) من `CreateBookingUseCase.ts` نص يقول حرفيًا "تم استلام... **وإيصال التحويل بنجاح**" رغم عدم وجود أي دفع بعد، (2) من `booking.service.ts` مباشرة بعده نص مختلف يطلب "**يرجى إرسال صورة إيصال التحويل**" | `CreateBookingUseCase.ts:23-38` (النص الأول)، `booking.service.ts:78-108` (النص الثاني، عبر `import('./whatsapp.service.js').then(m => m.sendWhatsAppText(...))`) | **BROKEN** | حذف الإرسال من `CreateBookingUseCase` بالكامل (مسؤولية الإشعار ليست جزءًا ذريًا من إنشاء الحجز)، الإبقاء على رسالة واحدة متسقة فقط من نقطة استدعاء واحدة | **Critical** — العميل يستلم رسالتين متناقضتين لنفس الحجز خلال ثوانٍ |
| 18 | Human Handoff | تحويل بشري موثوق، يُطلَق بقرار الـAI عبر أداة، لا Race مع مصدرين | أساس جيد موجود: `toggleHumanHandoff()` يكتب لعمودين حقيقيين في `bookings` (`needs_human_attention`, `handoff_expires_at`)، **لكن** يكتب بالتوازي أيضًا لـ`bookingSessions` (In-Memory)، **ولا تُستدعى من أي أداة يستخدمها الـAI إطلاقًا** — فقط من زر يدوي في لوحة الموظف. منطق الكلمات المفتاحية المحلي في `handleIncomingWithAI` (البند 1) يُشغِّل تحويلًا محليًا منفصلًا تمامًا لا علاقة له بهذا العمود | `whatsapp.service.ts` (دالة `toggleHumanHandoff`)، `bookings.routes.ts:809-819` (`toggle-handoff` endpoint)، ومقارنة بمنطق `handoffKeywords` المحلي المنفصل `:901-906` | **PARTIALLY IMPLEMENTED** | إضافة أداة `handoff_to_reception` حقيقية للـAI Agent تكتب فقط لعمودي `bookings`، حذف الكتابة لـ`bookingSessions`، حذف منطق الـ Handoff المحلي المكرر بعد حذف `handleIncomingWithAI` (البند 1) | **High** |
| 19 | Duplicate Message Protection | رسالة واتساب واحدة لا تُعالَج مرتين | لا يوجد أي فحص تكرار على `whatsapp_message_id` قبل المعالجة في `whatsapp.service.ts`. جدول `webhook_events` موجود في DB وله Repository كامل (`MySQLWebhookEventRepository.ts`) مسجَّل في `container.ts`، **لكنه غير مُستخدَم في أي مسار معالجة رسائل فعلي** — فقط في سكربت تحقق يدوي منفصل (`scripts/verify_hardening.ts`) | بحث `MySQLWebhookEventRepository`/`webhookEventRepo` عبر كل الكود — الاستخدام الوحيد خارج التعريف هو سكربت الاختبار | **PARTIALLY IMPLEMENTED (scaffolded, not wired)** | ربط `webhookEventRepo.insertIfNotExists(whatsapp_message_id)` كبوابة أولى قبل أي معالجة في نقطة استقبال الرسالة الموحّدة (بعد حذف المحرك المحلي المزدوج) | **High** |
| 20 | Idempotency | عمليات حساسة (خصوصًا إنشاء الحجز) Idempotent فعليًا | `idempotencyKey` يُستقبَل في `bookings/create-pending` (`agentTools.routes.ts:481`) **ولا يُستخدَم في أي سطر آخر بالدالة بأكملها** | `agentTools.routes.ts:481` مقابل بحث `idempotencyKey` في باقي الملف — استخدام واحد فقط (الاستقبال) | **NOT IMPLEMENTED** (موجود بالاسم فقط) | فحص `idempotencyKey` مقابل جدول (`webhook_events` أو عمود مخصص) قبل الإنشاء، وإرجاع نفس الحجز الموجود إن تكرر المفتاح | **Critical** — مباشرة مرتبط بالبند 8(ج): بلا رد نجاح + بلا Idempotency = تكرار حجوزات شبه مؤكد عند أي إعادة محاولة من n8n |
| 21 | Double Booking Protection | منع حجز نفس الحلاق/الكرسي في نفس الوقت مرتين | `MySQLBookingRepository.ts` يستخدم `FOR UPDATE` فعليًا على صف الكرسي (`chairs`) وعلى حساب `queue_number` — حماية حقيقية على مستوى **الكرسي**. **لا يوجد أي قيد أو استعلام تعارض على مستوى الحلاق+الوقت** (`barberId` + `startsAt`) في أي مكان بالـ Repository | `MySQLBookingRepository.ts:83,94` (القفل الموجود) مقابل غياب أي `WHERE barber_id = ? AND starts_at ...` في نفس الملف | **PARTIALLY IMPLEMENTED** | إضافة قيد `UNIQUE`/فحص تعارض صريح داخل نفس الـ Transaction لحلاق+فترة زمنية، متسق مع إصلاح `availability/check` (البند 8أ) | **High** |
| 22 | n8n Routing | Workflow واحد نظيف لكل مرحلة، بلا تكرار | **يوجد ملفان لكل من Workflow 01، 02، 03، 04** بأسماء مختلفة (نسخة قصيرة/طويلة الاسم) في `n8n/workflows/`، بالضبط كما كانت وقت كتابة الوثيقة القديمة. النسخة القصيرة لـWorkflow 01 لا تحتوي ترويسة `x-agent-secret` إطلاقًا، والنسخة القصيرة لـWorkflow 02 (16 عقدة) تفتقد أدوات كاملة موجودة في النسخة الطويلة (21 عقدة) — من ضمنها أداة `submit_payment_proof` نفسها | `n8n/workflows/01_-_WhatsApp_Master_Router...json` مقابل `01_WhatsApp_Master_Router.json` (ونفس النمط لـ 02، 03، 04) — تأكيد بالحجم المختلف للملفين ووجودهما معًا في المجلد حاليًا | **BROKEN (unchanged from previous audit)** | تحديد النسخة المفعّلة فعليًا في n8n Production (حقيقة Runtime لا تظهر من الملفات)، حذف النسخة غير المستخدمة من المجلد، توحيد قبل أي تعديل إضافي | **Critical** — أي تعديل يُطبَّق على الملف الخطأ لن يظهر أثره في الإنتاج إطلاقًا |
| 23 | AI Security (Prompt Injection / Tool Abuse) | الـAI لا يمكنه استدعاء أدوات دون تفويض، ولا يُخدَع بحقن أوامر من نص العميل | حماية على مستوى الشبكة موجودة (`requireAgentAuth` بمفتاح مشترك على كل أدوات الـ Backend، البند 6). **لا يوجد أي دليل في الكود الحالي على Guardrail بعد التوليد** (Post-generation check يمنع الـAI من إرسال سعر/معرّف لم يأتِ من نتيجة أداة فعلية في نفس الجولة) — هذا منطق داخل الـ Prompt/n8n غير مرئي في كود المشروع نفسه ولا يمكن التحقق منه من الملفات المرفوعة | غياب أي ملف/كود Backend يطبّق Guardrail؛ الاعتماد الكامل حاليًا على انضباط الـPrompt نفسه (غير قابل للتحقق البرمجي) | **NOT VERIFIABLE / LIKELY NOT IMPLEMENTED** | إضافة طبقة تحقق برمجية بعد رد الـAI (قبل الإرسال للعميل) تقارن أي رقم/معرّف مذكور بنتائج الأدوات الفعلية في نفس الجولة، ترفض الرد وتُعيد توليده إن وُجد تناقض | **High** |
| 24 | Tool Authorization | كل أداة تتحقق من الصلاحية قبل التنفيذ | موجود على مستوى الوصول للـ API ككل (`requireAgentAuth`)، **لكن السرّ الافتراضي مكتوب حرفيًا في الكود** (`'trim-mind-agent-secret-key-2026'`) وأيضًا **مكتوب حرفيًا في ملف n8n JSON نفسه** كترويسة ثابتة | `agentTools.routes.ts:18-20` (`AGENT_API_SECRET = process.env... \|\| 'trim-mind-agent-secret-key-2026'`) | **IMPLEMENTED BUT NEEDS HARDENING** | إجبار وجود `AGENT_API_SECRET` من البيئة بدون Fallback، رفض إقلاع السيرفر عند غيابه، سحب نفس القيمة من ملفات n8n بمتغير بيئة داخل n8n نفسه بدل نص ثابت | **High** — أي شخص يقرأ الكود المصدري (أو ملف n8n) يملك مفتاح الوصول الكامل لكل عمليات الحجز/الدفع البرمجية |
| 25 | Error Handling | فشل أي خطوة يُعالَج بوضوح دون كتم صامت للأخطاء الحرجة | نمط متكرر عبر الكود بأكمله: `try { INSERT/UPDATE... } catch {}` صامت تمامًا لعمليات كتابة حساسة (إنشاء حجز وهمي، تحديث حالة الدفع، `customize-and-dispatch`) — الكود يُكمل وكأن الكتابة نجحت حتى لو فشلت فعليًا | `agentTools.routes.ts:1054-1070` (`catch {}` بعد `INSERT INTO bookings`)، `agentTools.routes.ts:1090-1097` (`catch {}` بعد `UPDATE bookings`)، ونمط مطابق في `customize-and-dispatch` | **BROKEN** | استبدال كل `catch {}` صامت على عمليات كتابة حرجة بمعالجة صريحة: تسجيل الخطأ + إرجاع `success:false` حقيقي لمستدعي الأداة | **Critical** — هذا هو مصدر "Fake Success" الفعلي المتكرر في كل أنحاء مسار الواتساب |
| 26 | Rate Limiting | حماية أدوات الـAI/الـWebhook من إساءة الاستخدام (فيضان رسائل، استدعاءات متكررة) | يوجد Rate Limiting عام (Redis + `rate-limiter-flexible`) على مسارات API الأخرى (`middleware/rateLimiter.ts`) تم التحقق منه سابقًا في هذا المشروع، **لكن لم يُتحقَّق من تطبيقه على `agentTools.routes.ts` تحديدًا** في هذه الجولة — الملف لا يستورد أي Rate Limiter صراحة | `agentTools.routes.ts` — لا استيراد لـ `rateLimiter.js` في رأس الملف | **NOT VERIFIED (likely NOT IMPLEMENTED on this router)** | إضافة Rate Limiter مخصص على `router.use()` في `agentTools.routes.ts`، بمفتاح مبني على `senderPhone` وليس IP فقط (لأن كل طلبات n8n قد تأتي من نفس IP) | **Medium** |
| 27 | Clean Architecture & SOLID | Route رقيق → UseCase → Repository، بلا SQL خام في الـ Route | النمط الصحيح موجود ومطبَّق فعليًا في مسارات أخرى من نفس المشروع (`usecases/waitlist/*`, `CreateBookingUseCase` + `MySQLBookingRepository`) — **هذا هو القالب المرجعي السليم**. لكن `agentTools.routes.ts` و`bookings.routes.ts` (مسار `customize-and-dispatch`) يخالفان هذا النمط بالكامل: SQL خام مباشر داخل الـ Route نفسه في عدة مواضع | مقارنة `usecases/waitlist/JoinWaitlistUseCase.ts` (نمط سليم) بمقابل `agentTools.routes.ts:1054-1091` (SQL خام داخل Route) | **PARTIALLY IMPLEMENTED (inconsistent across codebase)** | نقل منطق الحجز/الدفع المخصص في `agentTools.routes.ts` و`customize-and-dispatch` إلى UseCases جديدة تتبع نفس قالب `CreateBookingUseCase`، دون المساس بالمسارات السليمة أصلًا | **Medium** (مشكلة اتساق هندسي، ليست خطرًا مباشرًا بحد ذاتها، لكنها *سبب جذري* لمعظم البنود Critical أعلاه) |
| 28 | Tests | تغطية اختبارية آلية لمسارات الحجز/الدفع الحرجة | **لا يوجد أي ملف اختبار آلي (`*.test.*`/`*.spec.*`) في كامل المشروع.** يوجد سكربت تحقق يدوي واحد فقط (`server/src/scripts/verify_hardening.ts`) يُشغَّل يدويًا وليس ضمن CI | بحث شامل `find . -iname "*.test.*" -o -iname "*spec.*"` على كامل المشروع — نتيجة فارغة تمامًا | **NOT IMPLEMENTED** | إضافة Test Suite (انظر §4 Test Matrix) قبل أي Refactoring كبير على مسار الحجز، لضمان عدم كسر ما يعمل فعليًا اليوم (Queue Tracking، Arrival، Customer Lookup) | **High** — أي إصلاح للبنود Critical أعلاه بلا اختبارات يخاطر بكسر الأجزاء السليمة (البنود 4، 15، 16) |

---

## 2. ملخص الأمان (Security Summary)

| المشكلة | الخطورة | الموقع | الحالة |
|---|---|---|---|
| محركا معالجة متوازيان بلا تنسيق لكل رسالة واتساب | Critical | `whatsapp.service.ts:507,511` | غير مُصلَح |
| `isSlotAvailable: true` ثابت — لا حماية تعارض حجز فعلية | Critical | `agentTools.routes.ts:440` | غير مُصلَح |
| `create-pending` بلا رد نجاح + `idempotencyKey` غير مستخدَم | Critical | `agentTools.routes.ts:481,558` | غير مُصلَح |
| إثبات دفع قد يُربَط بحجز عميل آخر (Fallback بلا قيد هاتف) + إنشاء حجز وهمي ببيانات مختلقة | Critical | `agentTools.routes.ts:963-1097` | غير مُصلَح |
| `INSERT`/`UPDATE` خام على جدول `bookings` يتجاوز طبقة الـUseCase، بأخطاء مكتومة صامتًا | Critical | `agentTools.routes.ts`, `bookings.routes.ts` (customize-and-dispatch) | غير مُصلَح |
| تأكيد مالي (`confirmed` + `financial_records`) بلا إثبات دفع فعلي | Critical | `bookings.routes.ts` customize-and-dispatch | غير مُصلَح |
| رسالتا تأكيد متضاربتان تلقائيًا لكل حجز | High | `CreateBookingUseCase.ts`, `booking.service.ts` | غير مُصلَح |
| ملفات n8n مكررة، نسخة ناقصة أدوات/ترويسة أمان | Critical | `n8n/workflows/01,02,03,04` (نسخ مزدوجة) | غير مُصلَح |
| Secret افتراضي ثابت لأدوات الـAI مكتوب في الكود وفي ملف n8n JSON | High | `agentTools.routes.ts:20` + ملفات n8n | غير مُصلَح |
| لا فحص تكرار رسائل (`webhook_events` موجود لكن غير مربوط) | High | معالجة الرسائل الواردة | Scaffolded فقط |
| لا حماية تعارض حلاق+وقت (فقط حماية كرسي) | High | `MySQLBookingRepository.ts` | جزئي |
| لا Rate Limiting مؤكَّد على أدوات الـAI | Medium | `agentTools.routes.ts` | غير مُتحقَّق |
| لا Guardrail برمجي بعد توليد رد الـAI | High | غير موجود في الكود | غير مُصلَح |

> **للمقارنة (تم التحقق سابقًا في جولات تدقيق أمني منفصلة على نفس المشروع، خارج نطاق الواتساب):**
> Dual-Key Rate Limiting، JWT HS256 الصارم، Dual-Token Rotation مع كشف السرقة، Magic-Bytes Upload
> Validation + EXIF Stripping، HMAC Webhook Signature Middleware، Honeypots + IP Jail، Financial Ledger
> المشفّر تسلسليًا — **كل هذه IMPLEMENTED وتعمل فعليًا** وهي بالضبط ما أنجزه Anti-Gravity. المشكلة أن
> هذا العمل **لم يلمس مسار الواتساب/الحجز نفسه بعد** — وهو موضوع هذا الملف.

---

## 3. خارطة الطريق الهندسية (Roadmap)

> رُتِّبت حسب الاعتماديات الفعلية. لا تُدرَج هنا أي ميزة IMPLEMENTED فعلاً (البنود 4، 15، 16، 6-الأساس)
> إلا للربط/التوحيد اللازم بعد حذف المحرك المحلي المزدوج.

### Phase 1 — إيقاف النزيف الفوري (لا يتطلب إعادة تصميم)
**الهدف:** منع الأضرار المستمرة الآن دون انتظار إعادة الهيكلة الكاملة.
- حذف `handleIncomingWithAI` والاستدعاء له بالكامل من `whatsapp.service.ts` (البند 1) — أو، إن كان هو المحرك الفعلي المستخدم حاليًا في الإنتاج (حقيقة Runtime يجب تأكيدها أولًا مع الفريق قبل الحذف)، عندها **يُحذف الاستدعاء المزدوج للجهة الأخرى (n8n) بدلًا منه**. **قرار حرج يتطلب تأكيدًا بشريًا قبل التنفيذ: أيّهما فعليًا يرد على العملاء الآن في الإنتاج؟**
- إصلاح `isSlotAvailable` ليكون استعلام تعارض حقيقي (البند 8أ).
- إضافة `return res.json(...)` الناقص في `create-pending` (البند 8ب).
- تفعيل `idempotencyKey` فعليًا (البند 20).
- حذف الرسالة المُكرَّرة الأولى من `CreateBookingUseCase.ts` (البند 17).
- تحديد النسخة المفعّلة من كل Workflow n8n وحذف الأخرى فورًا (البند 22).
**Acceptance Criteria:** رسالة واحدة فقط لكل حدث حجز، حجز واحد فقط لكل طلب (لا تكرار عند إعادة محاولة)، لا Timeout على `create-pending`.

### Phase 2 — Persistent Conversation Memory (البند 2، 3)
- إنشاء `conversation_sessions` و`conversation_messages` عبر `ensureInitialDbData()`.
- ربط `webhook_events` الموجود فعليًا (البند 19) كبوابة Idempotency أولى لكل رسالة واردة.
**Acceptance Criteria:** إعادة تشغيل السيرفر لا تفقد أي محادثة جارية؛ نفس `whatsapp_message_id` لا يُعالَج مرتين.

### Phase 3 — إصلاح تلوّث الحجز والدفع (البند 8، 10، 25)
- حذف مسار "إنشاء حجز وهمي عند عدم العثور على تطابق" من `submit-proof` بالكامل.
- تقييد كل مطابقة دفع بالهاتف دائمًا (لا Fallback "أي حجز في النظام").
- الكتابة عبر جدول `payment_proofs` الحقيقي بدل عمود `bookings.payment_proof` الخام.
- استبدال كل `catch {}` صامت على كتابات حرجة بمعالجة صريحة.
**Acceptance Criteria:** لا يمكن ربط إثبات دفع بحجز رقم هاتف مختلف تحت أي ظرف؛ لا حجز يُنشأ ببيانات مُختلَقة.

### Phase 4 — إصلاح Custom Booking (البند 9، 14)
- إعادة بناء `customize-and-dispatch` عبر UseCase حقيقي يمر بدورة الحياة الكاملة (`custom_pricing_requested → awaiting_payment → payment_submitted → pending_review → confirmed`).
- إضافة قيمة `custom_pricing_requested` للـ `ENUM`.
**Acceptance Criteria:** لا حجز مخصص يصل لحالة `confirmed` بدون إثبات دفع مربوط فعليًا.

### Phase 5 — Double Booking + Availability الحقيقية (البند 21)
- إضافة فحص تعارض حلاق+وقت داخل نفس الـ Transaction المستخدمة للكرسي.
**Acceptance Criteria:** محاولتا حجز متزامنتان لنفس الحلاق بنفس الوقت — واحدة فقط تنجح.

### Phase 6 — Human Handoff الموحّد (البند 18)
- أداة `handoff_to_reception` جديدة للـAI Agent تكتب فقط لعمودي `bookings`.
- حذف الكتابة لـ`bookingSessions` وحذف منطق الكلمات المفتاحية المحلي (بعد Phase 1).
**Acceptance Criteria:** تحويل بشري واحد فقط لكل طلب، مصدره الوحيد أعمدة `bookings`.

### Phase 7 — WhatsApp Bookings Hub (البند 12، 13)
- تبويب/فلتر مخصص في Reception Dashboard بالحقول الكاملة المطلوبة.
**Acceptance Criteria:** موظف الاستقبال يميّز حجوزات واتساب ويرى كل الحقول المطلوبة دون فتح كل حجز يدويًا.

### Phase 8 — Security Hardening الخاص بمسار الواتساب (البند 23، 24، 26)
- إجبار `AGENT_API_SECRET` من البيئة بلا Fallback.
- Rate Limiting مخصص على `agentTools.routes.ts` بمفتاح `senderPhone`.
- Guardrail برمجي بعد توليد رد الـAI (مقارنة أي رقم/معرّف بنتائج أدوات الجولة نفسها).
**Acceptance Criteria:** فشل إقلاع السيرفر بدون Secret حقيقي؛ رفض أي رد AI يحتوي رقمًا لم يأتِ من أداة.

### Phase 9 — Clean Architecture Consolidation (البند 27)
- نقل منطق `agentTools.routes.ts`/`customize-and-dispatch` إلى UseCases بنفس قالب `CreateBookingUseCase`.
**Acceptance Criteria:** لا SQL خام متبقٍ داخل أي Route في مسار الواتساب.

### Phase 10 — Testing (البند 28)
- Test Suite آلي يغطي مصفوفة الاختبار في §4، **قبل** إغلاق أي Phase أعلاه نهائيًا.
**Acceptance Criteria:** كل سيناريو في §4 له اختبار آلي واحد على الأقل يمر.

---

## 4. Test Matrix (للمراحل الجديدة فقط)

| السيناريو | يغطي Phase |
|---|---|
| عميل جديد — حجز عادي كامل | 1, 3, 5 |
| عميل حالي — حجز عادي | 1, 2 |
| حجز مخصص (Custom) — تسعير موظف ثم دفع | 4 |
| VIP — عربون مختلف | 4, 5 |
| خدمات متعددة في رسالة واحدة | 1 |
| عربي مصري / عربي فصيح / إنجليزي / مزيج | 1, 2 |
| أخطاء إملائية | 1 |
| رسائل مكررة (نفس `whatsapp_message_id`) | 2 |
| حجز متزامن لنفس الحلاق/الوقت | 5 |
| إثبات دفع صحيح | 3 |
| إثبات دفع لرقم هاتف مختلف عن الحجز | 3 |
| تعارض حجز (Slot مشغول) | 1, 5 |
| إلغاء / إعادة جدولة | (موجودة، تحتاج تغطية اختبارية فقط) |
| فشل الـAI / فشل n8n / فشل DB / فشل واتساب | 1, 8 |
| تحويل بشري (Handoff) | 6 |
| العودة للمحادثة بعد فترة طويلة | 2 |

---

## 5. ملاحظة ختامية لـ Anti-Gravity

لا تُعِد تنفيذ: Customer Lookup، Queue Tracking، Arrival، Two-Layer Auth، Dual-Token، Rate Limiting
العام، Magic-Bytes Upload، Financial Ledger، Honeypots — هذه تعمل فعليًا وتم التحقق منها بالكود.

ابدأ حصريًا من **Phase 1** أعلاه، وبالتحديد من القرار الحرج المذكور فيها (أيّ محرك يرد على العملاء
فعليًا في الإنتاج الآن) — هذا القرار يحدد شكل كل ما بعده، ولا يمكن لأي جهة استنتاجه من قراءة الكود
وحدها؛ يتطلب تأكيدًا من الفريق التشغيلي أو فحص لوحة n8n الحية مباشرة.
