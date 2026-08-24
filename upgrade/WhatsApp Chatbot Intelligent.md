# WhatsApp Chatbot Intelligent — خطة هندسية كاملة لصالون TrimMind

> **ملاحظة منهجية:** كل ما ورد في هذا الملف مبني على قراءة فعلية للكود الموجود في الأرشيف المرفوع
> (Reverse Engineering مباشر، وليس افتراضًا). كل نتيجة مرفقة بمسار الملف/السطر الذي استُخرجت منه.
> لم يتم تعديل أي ملف في المشروع، ولم يُكتب أي كود تنفيذي داخل المشروع — هذا الملف هو الوحيد
> المُنشأ في هذه المرحلة. تم أيضًا الاطلاع على `upgrade/solving problem in trimmind.md` (تدقيق
> هندسي شامل سابق للمشروع كله) واستُخدم كمرجع تكميلي حيث توافق مع القراءة المباشرة للكود الحالي؛
> أي فارق بين ما ورد هناك وما هو موجود فعليًا الآن في الكود مذكور صراحةً (الكود تغيّر عن وقت كتابة
> ذلك التدقيق في بعض المواضع، مثل `bookings/create-pending`).

---

## 0. ملخص تنفيذي (Executive Summary)

TrimMind لديه **نظامان منفصلان وغير منسّقين** يتعاملان مع نفس رسائل واتساب الواردة في آنٍ واحد:

1. **مسار n8n**: `Evolution-style Webhook → n8n Master Router → n8n AI Agent Orchestrator
   (Gemini 1.5 Flash + LangChain Tools) → Backend `/api/agent-tools/*` → MySQL → إرسال الرد عبر
   `POST /api/whatsapp-session/send`.
2. **مسار Baileys المباشر**: نفس الرسالة الواردة تُعالَج **في نفس اللحظة** داخل
   `server/src/services/whatsapp.service.ts` عبر دالة `handleIncomingWithAI()` التي تستدعي Gemini
   مباشرة (نماذج مختلفة: `gemini-flash-lite-latest` وغيرها)، ولها Prompt مختلف تمامًا، وذاكرة
   منفصلة (`chatHistories` Map)، ولا تنفّذ حجوزات فعلية بل توجّه العميل لموقع الويب.

**العميل يستقبل رسالتين منفصلتين، بشخصيتين مختلفتين، بدون أي ذاكرة مشتركة، لكل رسالة يرسلها.**
هذا هو السبب الجذري الأكبر لأغلب الأعراض المذكورة في طلب الفحص (تكرار الترحيب، نسيان الاسم، تضارب
الردود، عدم اتساق الأسعار/الحجوزات). التفاصيل الكاملة في القسم 2.

بالإضافة إلى ذلك، تم توثيق 3 أعطال حرجة أخرى بالكود مباشرة:

- **`POST /api/agent-tools/bookings/create-pending` لا يُرجع أي استجابة نجاح على الإطلاق** في
  المسار السعيد (لا يوجد `res.json`/`res.status` بعد إنشاء الحجز بنجاح) — أي حجز ناجح فعليًا في
  قاعدة البيانات سيجعل طلب الأداة (Tool Call) من n8n "يعلّق" حتى انتهاء المهلة (Timeout)، فيظن
  الـAI أن العملية فشلت.
- **`check_availability` هو Stub ثابت** يُرجع دائمًا `isSlotAvailable: true` بغض النظر عن أي
  حجوزات فعلية أو سعة الكراسي أو جدول الكابتن — لا يوجد أي فحص حقيقي للتعارض.
- **`submit_payment_proof` يربط صورة الدفع بأي حجز "قيد الدفع" في النظام كله** إذا لم يجد تطابقًا
  دقيقًا لرقم الهاتف (fallback إلى "أي حجز قيد الدفع" لأي عميل آخر)، وقد يُنشئ حجزًا وهميًا جديدًا
  ببيانات مُخترعة من جلسة محلية منفصلة إذا لم يجد شيئًا إطلاقًا.

هذه الوثيقة تشرح لماذا تحدث كل مشكلة مذكورة في الطلب (بالسبب الجذري من الكود)، ثم تضع تصميمًا
هندسيًا كاملاً (State Machine، Context، Tools، Prompt Architecture، Guardrails، Security،
Testing) لتحويل هذا النظام إلى مساعد واحد موحّد وذكي، ثم خطة تنفيذ مرحلية.

---

## 1. فهم النظام الحالي (Reverse Engineering)

### 1.1 الخريطة الكاملة للمكونات الفعلية الموجودة

| المكوّن | موجود فعليًا؟ | أين | ملاحظات |
|---|---|---|---|
| نقل رسائل واتساب | ✅ نعم، لكن ليس كما توثّق `docs/` | `server/src/services/whatsapp.service.ts` عبر `@whiskeysockets/baileys` (WhatsApp Web Protocol مباشر) | التوثيق في `docs/WHATSAPP_AI_ARCHITECTURE.md` و`WHATSAPP_AI_SETUP.md` يصف **Evolution API** كطبقة نقل. هذا **غير مطابق للكود الفعلي إطلاقًا** — لا يوجد أي استدعاء لـEvolution API في `server/`. الكود يستخدم Baileys مباشرة، ومنه يُرسِل نسخة من كل رسالة واردة إلى Webhook خاص بـn8n يحمل مسار `/webhook/whatsapp-webhook` بأسلوب يحاكي شكل حمولة Evolution API (`event: 'messages.upsert'`) — على الأرجح كانت الخطة الأصلية Evolution API ثم تم استبدالها بـBaileys داخليًا دون تحديث التوثيق. |
| استقبال الرسائل | ✅ مرتين بالتوازي | `whatsapp.service.ts:424` (`sock.ev.on('messages.upsert', ...)`) | كل رسالة تُعالَج محليًا (`handleIncomingWithAI`) **و** تُرسَل لـn8n (`forwardToN8nWebhook`) في نفس الوقت — انظر القسم 2.1. |
| إرسال الرسائل | ✅ نقطة واحدة فعلية | `sendWhatsAppText()` في نفس الملف، تُستدعى من مسارين: مباشرة من `handleIncomingWithAI`، وأيضًا من `POST /api/whatsapp-session/send` (الذي يستخدمه n8n لإرسال رد الـAI Agent) | كلا المسارين يستخدمان نفس اتصال Baileys الوحيد — لا يوجد تعارض تقني هنا، لكن **يوجد تعارض منطقي**: قد يصل ردّان لنفس الرسالة. |
| استقبال الصور | ✅ | `whatsapp.service.ts:454` (`downloadMediaMessage`) يحوّلها Base64 ثم يُرسلها ضمن `forwardToN8nWebhook` | لكن مسار Baileys المحلي (`handleIncomingWithAI`) لا يعالج الصورة فعليًا؛ فقط يردّ برسالة ثابتة توجّه العميل للموقع (`whatsapp.service.ts:985-988`)، بينما مسار n8n هو من يستدعي أداة `submit_payment_proof` الفعلية. |
| Message IDs | ✅ يُستخرَج (`msg.key.id`) | كل من `whatsapp.service.ts` و`Normalize Incoming Message` node في n8n | **لا يُستخدم فعليًا لأي Deduplication حقيقي** في أي من المسارين — انظر 1.2. |
| Session Management | ⚠️ موجود لكن **مزدوج ومنفصل** | `bookingSessions` Map + `chatHistories` Map (محليًا في `whatsapp.service.ts`) **مقابل** `Window Buffer Memory` node في n8n (LangChain memory) | كلاهما في-الذاكرة (In-Process)، غير مُخزَّن في قاعدة بيانات، **يُفقد بالكامل عند أي إعادة تشغيل/إعادة نشر (Redeploy)** — وهو أمر متكرر على Railway. |
| Message Deduplication | ⚠️ ناقص وبه خلل | `Normalize Incoming Message` (n8n) يستخدم `$getWorkflowStaticData('global')` مع نافذة زمنية للنص (6 ثوانٍ) | **الخلل**: مفتاح Dedup هو **نص الرسالة نفسه فقط** (`textKey = text.trim().toLowerCase()`) — بدون ربطه برقم الهاتف. أي عميلين مختلفين أرسلا نفس الكلمة (مثلاً "تمام" أو "ايوة") خلال 6 ثوانٍ ستُسقَط رسالة الثاني منهما بالكامل! هذا Cross-Customer Bug حقيقي. |
| n8n Workflows | ✅ 4-6 ملفات (بعضها مكرر باسمين) | `n8n/workflows/*.json` | انظر القسم 1.3 للتفصيل الكامل لكل Workflow. |
| AI Agent الحالي | ✅ **يوجد اثنان منفصلان** | (أ) `AI Agent` node في n8n (LangChain Agent + Gemini 1.5 Flash + Tools)، (ب) دالة `handleIncomingWithAI` في `whatsapp.service.ts` (استدعاء REST مباشر لـGemini بدون Tools) | انظر القسم 2.1 — هذا هو الخلل الجذري الأكبر. |
| Prompts الحالية | ✅ Prompt واحد ضخم لكل محرك (اثنان بالمجمل) | `AI Agent.parameters.options.systemMessage` (n8n، ~2500 كلمة عربي) و`systemInstruction` داخل `handleIncomingWithAI` (~250 كلمة، قواعد مختلفة تمامًا) | لا يوجد أي تقسيم طبقي (Core / Context / Tools منفصلة) — راجع القسم 14. |
| Memory الحالية | ⚠️ In-Memory فقط، غير دائمة | `Window Buffer Memory` (n8n، آخر 20 رسالة، مفتاح الجلسة = رقم الهاتف) و`chatHistories` (محلي، آخر 8 رسائل، Timeout=90 دقيقة) | لا يوجد أي جدول DB لتخزين المحادثة أو حالتها — عند إعادة تشغيل n8n أو الـBackend تُفقد الذاكرة بالكامل فورًا. |
| Backend APIs | ✅ موجودة، مختلطة الأنماط | `server/src/routes/agentTools.routes.ts` (1548 سطر) هو الواجهة الرئيسية لأدوات الـAI | نصف الـRoutes في المشروع (الفروع، الخدمات، الكباتن، وأغلب `agentTools.routes.ts`) تنفّذ SQL مباشرة داخل ملف الـRoute نفسه، متجاوزة طبقة `usecases/repositories` النظيفة الموجودة فعليًا للحجوزات فقط. |
| Agent Tools | ✅ 20 أداة مسجّلة في n8n | `Tool: get_branches/get_customer/get_services/get_barbers/check_availability/create_pending_booking/get_booking_status/get_waiting_position/cancel_booking/reschedule_booking/confirm_arrival/join_smart_waitlist/claim_smart_waitlist_offer/check_waitlist_status/check_noshow_status/submit_payment_proof` | لا توجد أداة `get_packages` أو `handoff_to_reception` أو `update_booking_draft` بالاسم المطلوب في التصميم — التصميم الجديد (قسم 6) يضيفها. |
| Authentication | ✅ سرّ مشترك واحد | `requireAgentAuth` في `agentTools.routes.ts:20-53` يقارن `x-agent-secret` بـ`AGENT_API_SECRET` بمقارنة Constant-Time (جيد تقنيًا) | لكن **لا يوجد أي Scope/صلاحية متدرجة** — نفس السرّ يفتح كل الأدوات القرائية والتدميرية (الإلغاء، الحجز) دون تمييز. راجع 17.3. |
| Database Schema | ✅ 20 جدول MySQL، علاقات ومفاتيح خارجية سليمة | `database/schema.sql` | لا يوجد أي جدول لحالة/سياق المحادثة (Conversation State) — سيُضاف في القسم 6. |
| Customer Data | ✅ جدول `profiles` + بحث بالهاتف في `bookings` | — | لا يوجد جدول `customers` مستقل موحّد — كل بحث عن "العميل" فعليًا هو بحث عن آخر حجز بنفس رقم الهاتف. |
| Bookings | ✅ `bookings` + `booking_items` | `database/schema.sql:104-154` | الحالة (`status`) تشمل بالفعل: `draft, awaiting_payment, payment_submitted, pending_review, confirmed, customer_arrived, in_service, completed, rejected, cancelled, expired, no_show` — أوسع بكثير مما تستخدمه أدوات الـAI فعليًا. |
| Services / Packages | ⚠️ الخدمات موجودة، الباقات جزئية | `services` جدول به `category ENUM(... 'vip_package' ...)` | لا يوجد جدول `packages` منفصل ولا أداة `get_package_details` — "الباقة" فعليًا هي مجرد خدمة بفئة `vip_package`. |
| Barbers / Captains | ✅ | `barbers` جدول + أداة `get_barbers` | — |
| Availability | ❌ **غير موجود فعليًا رغم وجود الأداة** | `agentTools.routes.ts:430-478` (`/availability/check`) | **Stub كامل** يُرجع `isSlotAvailable: true` دائمًا بلا أي استعلام حقيقي عن تعارض حجوزات أو سعة كراسي. |
| Queue | ✅ منطق حقيقي | `queue.routes.ts`, `queue.service.ts`, `queue_entries` جدول | يُستخدم بشكل صحيح عبر `get_waiting_position`/`get_booking_status`. |
| Waitlist | ✅ Clean Architecture كاملة | `usecases/waitlist/*`, `MySQLWaitlistRepository` | من أفضل الأجزاء هندسيًا في المشروع بالكامل — نموذج يُحتذى به لبقية الأدوات. |
| Payments / Payment Proofs | ⚠️ **جدول منفصل موجود لكنه غير مُستخدَم من مسار الـAI** | جدول `payment_proofs` (منظم، فيه `status ENUM('pending_review','approved','rejected')`) موجود في `schema.sql:155-172` | لكن `agentTools.routes.ts /payments/submit-proof` **لا يكتب في هذا الجدول إطلاقًا** — يكتب JSON خام في عمود `bookings.payment_proof` عبر SQL مباشر، متجاوزًا الجدول المخصص والـRepository الخاص به بالكامل. لوحة الاستقبال قد تقرأ من مصدر مختلف عمّا يكتبه الـAI (نقطة تحتاج تحقق تشغيلي إضافي). |
| Booking Settings | ✅ جدول `settings` | — | يُستخدم كـFallback للعربون وبيانات الدفع. |
| Notifications | ✅ جزئي | `reminder.service.ts`, Workflow 04 (Cron) | لا يوجد نظام إشعارات موحّد لكل الأحداث المطلوبة (queue almost ready, one ahead, إلخ) — بعضها فقط مُطبَّق. |
| أي نظام WhatsApp آخر | ✅ لوحة ربط QR/Pairing Code | `whatsappSession.routes.ts` (صفحة HTML كاملة لربط الرقم) | جيدة تشغيليًا، لا علاقة لها بمنطق المحادثة. |

### 1.2 تحليل الـn8n Workflows (بالتفصيل، مقروءة عقدة بعقدة)

يحتوي `n8n/workflows/` على **6 ملفات، بعضها بنسختين متطابقتين تقريبًا بأسماء مختلفة** (نسخة قصيرة
الاسم ونسخة طويلة الاسم بنفس المحتوى تقريبًا — فرق وحيد في نسخة الـMaster Router هو حذف
`headerParameters` من عقدة إرسال الرد، أي أن إحدى النسختين لم تعد تُرسل `x-agent-secret` عند إرسال
الرد — إذا كانت هذه هي النسخة الفعّالة حاليًا في n8n، فإن استدعاء `/api/whatsapp-session/send` سيفشل
بـ401 لأن ذلك المسار محمي بنفس آلية `requireManagerOrAgent`). **يجب على الفريق التقني تحديد أي نسخة
هي المفعّلة فعليًا في n8n قبل أي تعديل** — هذا مثال حي على خطر وجود نسخ مكررة غير متزامنة.

**Workflow 01 — WhatsApp Master Router** (6 عقد):
1. `Evolution API Webhook` — Webhook عام (`POST /webhook/whatsapp-webhook`)، **بدون أي تحقق من
   توقيع أو مصدر الطلب** — أي طرف يعرف الرابط يمكنه إرسال حمولة مزيفة وتشغيل الـAI Agent باسم أي
   رقم هاتف.
2. `Normalize Incoming Message` (Code node) — يستخرج النص/الصورة، وفيه منطق الـDedup المعيب
   الموصوف في 1.1 (مفتاح عام غير مرتبط برقم الهاتف)، وفيه أيضًا قاعدة: أي رقم لا يبدأ بـ`01` ولا
   طوله 11 خانة يُفرَّغ بالكامل (`cleanPhone = ''`) — أي أن أرقام الـLID الحديثة في واتساب (أرقام
   وهمية للخصوصية) تجعل الـAI "يفقد" رقم العميل كل مرة ويُضطر لسؤاله عنه من جديد رغم أنه ذكره أو
   أن واتساب أرسله ضمن البيانات.
3. `Is Payment Proof Image?` (If) → يوجّه للـWorkflow المناسب.
4. `Execute Payment Proof Handler` (Workflow 03).
5. `Execute AI Agent Orchestrator` (Workflow 02).
6. `Send WhatsApp Reply via Salon Backend` → `POST /api/whatsapp-session/send`.

**Workflow 02 — AI Agent Tools Orchestrator** (21 عقدة، الأهم في النظام):
- `Prepare Chat Input` (Code): يبني `sessionId = cleanPhone` (أو `remoteJid` كـFallback)، ويحقن
  التاريخ/اليوم بتوقيت القاهرة داخل النص المُرسَل للنموذج (حل جيد وعملي لمشكلة "الذكاء الاصطناعي لا
  يعرف التاريخ الصحيح"). لكنه يُعيد بناء الجملة النصية الكاملة كـString واحد بدل تمرير بيانات
  منظّمة (JSON) للنموذج — يُصعّب فصل الـMetadata عن نية العميل الفعلية لاحقًا.
- `Window Buffer Memory`: `sessionKey = phone`, `contextWindowLength = 20` رسالة. **In-Memory فقط
  (LangChain Buffer Memory القياسي في n8n لا يُخزَّن في قاعدة بيانات ما لم يُربَط صراحة بعقدة
  Postgres/Redis Memory)** — لا يوجد ربط كهذا هنا. أي عملية Restart لعامل (Worker) n8n أو انتهاء
  دورة الحياة (خصوصًا في بيئة تشغيل متعددة النسخ Scale-out) يعني فقدان الذاكرة فورًا.
- `Google Gemini Chat Model`: `models/gemini-1.5-flash`, `temperature: 0.3`. **ملاحظة**: توثيق
  المشروع (`docs/WHATSAPP_AI_ARCHITECTURE.md`) يذكر "Gemini 2.5 / Flash" — النموذج الفعلي المُكوَّن
  في الـWorkflow هو **1.5 Flash**، وهو نموذج أقدم بفارق جيل كامل عن "2.5" الذي توثقه الوثائق — فارق
  توثيقي إضافي (مثل فارق Evolution API/Baileys) يحتاج تصحيحًا فور مطابقته مع الإصدار الفعلي المفعّل.
- **System Message واحد ضخم (~2500 كلمة عربي)** يحتوي كل القواعد: التحية، الحجز، قائمة الانتظار،
  الطابور، الوصول، إثبات الدفع، الإلغاء/التعديل، No-Show — كل شيء في رسالة نظام واحدة. لا يوجد أي
  قاعدة صريحة تمنع اختراع الأسعار/المواعيد (الاعتماد الكامل على أن النموذج "سيستخدم الأداة الصحيحة"
  دون أي قيد صارم أو تحقق لاحق من أن الرد يطابق نتيجة الأداة).
- 15 أداة (`toolHttpRequest` nodes)، كل واحدة HTTP Request مباشر لمسار في `agentTools.routes.ts`
  بترويسة `x-agent-secret` ثابتة.

**Workflow 03 — Payment Proof Handler** (صغير، 103 أسطر) — يستقبل الصورة ويستدعي
`/api/agent-tools/payments/submit-proof` مباشرة (بدون المرور بالـAI Agent إطلاقًا) — هذا يعني: أي
صورة يرسلها العميل تُعالَج بمنطق **مطابقة تلقائية للحجز الأقرب** (الموصوف بمشاكله في القسم 1.1) بلا
أي طبقة فهم للنية أو تأكيد من العميل قبل الربط.

**Workflow 04 — Appointment Reminders (Cron)** — يستدعي `/api/agent-tools/reminders/upcoming` على
جدول زمني، يبدو منطقيًا وسليم البنية من قراءة الأسماء، لم يُفحص عقدة بعقدة في هذه المرحلة (خارج نطاق
التركيز المطلوب على "النظام الحالي" الأساسي).

**Workflow 05/06 — تقرير المدير اليومي / استرجاع العملاء (Recall)** — أدوات إدارية منفصلة عن محادثة
العميل المباشرة، لم تُفحص بعمق في هذه الجولة لأنها خارج نطاق "شات بوت واتساب الذكي" المطلوب تحسينه،
لكنها تستخدم نفس نمط الاتصال بـ`agentTools.routes.ts`.

### 1.3 تحليل مسار Baileys المحلي المباشر (`handleIncomingWithAI`)

هذه الدالة (`whatsapp.service.ts:871-1098`) تُنفَّذ **لكل رسالة واردة، بالتوازي التام** مع تنفيذ
Workflow 01/02 في n8n (نفس الحدث `messages.upsert` يُطلق الاثنين معًا، دون أي تنسيق أو قفل). أهم ما
فيها:

- كلمات مفتاحية صريحة (Keyword Matching) لتفعيل "تحويل بشري" (`handoffKeywords` قائمة ثابتة من
  عبارات) — هذا **بالضبط** نمط "Keyword Bots" الذي طلب المستخدم صراحة الابتعاد عنه في التصميم
  الجديد، وهو موجود فعليًا في القسم "الذكي" المفترض من الكود.
- منطق "تأكيد الوصول" مستقل تمامًا عن أداة `confirm_arrival` في n8n: يبحث مباشرة بـSQL خام عن حجز
  اليوم لنفس الرقم ويحدّث حالته إلى `customer_arrived` مباشرة عبر `UPDATE bookings SET status = ...`
  **بدون المرور بأي Use Case أو تحقق من صحة الانتقال** (مثلاً: لا يتحقق أن الحجز كان `confirmed`
  أصلاً قبل تحويله لـ`customer_arrived`).
- عند استقبال صورة: لا يُحلّلها إطلاقًا، فقط يرسل نصًا ثابتًا يوجّه العميل لموقع الويب — بينما في
  نفس اللحظة تمامًا، Workflow 03 في n8n يستقبل نفس الصورة ويحاول ربطها بحجز فعلي. العميل قد يستقبل
  رسالة "روح احجز من الموقع" ورسالة "تم استلام إثبات الدفع" لنفس الصورة في نفس الثانية تقريبًا.
- ذاكرة محادثة محلية منفصلة (`chatHistories`, حد أقصى 8 رسائل، Timeout 90 دقيقة) — مختلفة تمامًا عن
  ذاكرة n8n (20 رسالة، بدون Timeout صريح غير حجم النافذة).
- عند فشل استدعاء Gemini (أو غياب المفتاح)، **يتحول لمطابقة نصية بدائية جدًا** (`textLower.includes
  ('سلام')`, `.includes('حجز')`, إلخ) وثلاث ردود ثابتة فقط — هذا Fallback حرفيًا هو "Keyword Bot"
  كامل، يُفعَّل بصمت دون أي إشعار بأن النموذج فشل.

---

## 2. تحديد مشاكل الواتساب AI الحالي (بالسبب الجذري من الكود)

### 2.1 السبب الجذري الأشمل: يوجد "دماغان" يجيبان على نفس الرسالة

**الجذر**: `whatsapp.service.ts:506-515` — عند وصول أي رسالة، يتم:
```
forwardToN8nWebhook(...)          // مسار 1: يُطلق سلسلة n8n كاملة (AI Agent + Tools)
await handleIncomingWithAI(...)   // مسار 2: يردّ فورًا بمحرك AI منفصل تمامًا
```
كلاهما يستخدم نفس اتصال Baileys لإرسال الرد النهائي (`sendWhatsAppText`)، دون أي قفل تبادلي (Mutex)
أو علم مشترك يقول "الرد الآخر قيد المعالجة، لا ترد". **هذا هو السبب المباشر أو المساهم في تقريبًا كل
عرض مذكور في طلب الفحص**، وتفصيله لكل عرض تحديدًا:

| العرض من الطلب | السبب الجذري في الكود |
|---|---|
| الـAI يحيي العميل في كل رسالة | مسار Baileys المحلي فيه علم `session.greeted` معرّف في الواجهة (`UserBookingSession.greeted`) لكنه **لا يُقرأ ولا يُستخدم في أي مكان فعليًا** بالكود (متغيّر ميت). كما أن الذاكرتين المنفصلتين (n8n وBaileys) لا تعرف كل منهما ماذا قالت الأخرى، فقد يبدأ أحد المحركين محادثة "جديدة" ظنًا منه أنه أول تواصل بينما الآخر يكمل سياقًا موجودًا. |
| ينسى اسم العميل / السياق / الحجز الحالي / Tracking Code | الذاكرتان كلتاهما In-Memory (لا قاعدة بيانات)، تُفقدان تمامًا عند أي Redeploy لـn8n أو للـBackend (شائع في Railway)، وحتى بدون Redeploy فهما منفصلتان عن بعضهما أصلاً. |
| يخلط بين أكثر من Booking | `submit_payment_proof` (انظر 2.3) يربط الصورة بـ"أي حجز قيد الدفع بالنظام" عند غياب تطابق دقيق — تلوث بين عملاء مختلفين وليس فقط بين حجوزات نفس العميل. |
| لا يفهم طريقة كلام العميل / اللهجة | الجزء الفعلي "الذكي" هو Gemini نفسه (جيد لغويًا)، لكن عند فشل الاتصال بـGemini في المسار المحلي، **يسقط النظام لمطابقة نصية بالكلمات المفتاحية فقط** (`whatsapp.service.ts:1083-1091`) — عندها فعليًا "يحتاج العميل أن يتكلم بطريقة معينة" لأن الكلمات المفتاحية محدودة (`سلام`, `حجز`, `vip`...). |
| يخترع أسعارًا / خدمات / مواعيد | `check_availability` Stub ثابت يُرجع `isSlotAvailable: true` دائمًا (`agentTools.routes.ts:430-478`) — لا معلومة حقيقية عن التعارض تصل للنموذج أصلاً، فهو "يخترع" توفّرًا غير حقيقي بحكم أن الأداة نفسها تخترعه أولاً. كذلك `liveSyncedState` كـFallback يحتوي بيانات صالون آخر مبرمجة صراحة في الكود (`branch-elhdad`, أسعار VIP ثابتة) — إن فشل MySQL يُقدَّم هذا كحقيقة. |
| يعطي معلومات قديمة | `getLiveSalonContext()` (مسار Baileys) يُخزَّن مؤقتًا 60 ثانية فقط (جيد نسبيًا)، لكن `liveSyncedState` (مسار n8n) لا ينعش نفسه إلا عبر `/sync-store` الذي يستدعيه الـFrontend فقط — إن لم يفتح أحد لوحة التحكم لفترة، تبقى بيانات n8n قديمة رغم تحديثها في MySQL. |
| يعتمد على Prompt بدل Database | مسار Baileys المحلي (وليس n8n) لا يملك أي أداة استعلام حقيقية إطلاقًا — كل معرفته هي نص System Prompt مبني من `getLiveSalonContext()` مرة واحدة عند الرد، وليس عبر Tool Calling حقيقي قابل لإعادة الاستعلام أثناء المحادثة. |
| يقول للعميل إن الحجز تم بينما العملية فشلت فعليًا | `bookings/create-pending` لا يُرجع استجابة نجاح إطلاقًا حاليًا (انظر 2.2) — الـAI Agent في n8n سيتلقى Timeout/خطأ رغم أن الحجز أُنشئ فعليًا في MySQL، وقد يخبر العميل أن الحجز "فشل" رغم نجاحه، أو (الأخطر) يُعيد المحاولة فيُنشئ حجزًا مكررًا حقيقيًا. |
| يفقد Payment Proof / لا يربطه بالحجز الصحيح | انظر تفصيل 2.3 أدناه — مشكلة موثّقة ومؤكدة مباشرة من الكود. |
| ينشئ حجزًا مكررًا عند تكرار الرسالة | (أ) `idempotencyKey` في `bookings/create-pending` يُستقبَل من الطلب **ولا يُستخدَم في أي مكان بالدالة** — معطّل تمامًا رغم أن اسم الـPath يحمل تعليق "(Idempotent)". (ب) الـDedup في n8n معطوب لأنه عام (نص فقط) وليس مرتبطًا برقم الهاتف. (ج) لا يوجد أي تحقق "هل يوجد حجز مطابق بنفس الرقم/الخدمة/الوقت خلال آخر N دقائق؟" قبل الإدراج. |
| لا يعرف متى يحتاج إلى سؤال إضافي / يسأل أسئلة كثيرة بدون داعٍ | لا يوجد تمثيل صريح لـ"الحقول الناقصة" (Slot Filling) — الاعتماد الكامل على قدرة النموذج على "تذكّر" أنه سأل من قبل عبر نافذة ذاكرة نصية خام، وليس عبر حالة منظمة (Structured State) يمكن فحصها آليًا. |
| لا يعرف متى ينقل المحادثة لموظف بشري | يوجد تفعيل جزئي فقط بكلمات مفتاحية ثابتة في المسار المحلي (`handoffKeywords`) — **غير موجود إطلاقًا** كقاعدة داخل الـSystem Prompt الخاص بمسار n8n (الذي هو المسار الذي فعليًا يُنفّذ الحجوزات). أي: أداة "التحويل البشري" الفعلية تعمل فقط في المسار الذي **لا** يملك صلاحية الحجز، بينما المسار الذي يملك صلاحية الحجز لا يعرف كيف يحوّل العميل بشريًا. |
| لا يتعامل جيدًا مع تغيير الموضوع / أكثر من طلب في رسالة واحدة | لا يوجد تمثيل صريح لـIntent متعدد أو لـIntent حالي/سابق منفصلين — النص التاريخي الخام هو كل السياق المتاح للنموذج، بلا أي طبقة تحليل Intent/Entities منفصلة قبل تمريره للنموذج. |

### 2.2 توثيق دقيق: `bookings/create-pending` بلا استجابة نجاح

من القراءة المباشرة لـ`server/src/routes/agentTools.routes.ts:485-598`: المسار السعيد (`try` block
الداخلي بعد `createBooking(...)`) ينتهي بـ`liveSyncedBookings.unshift(bookingData);` ثم إغلاق
الـ`try/catch` الخارجي **دون أي استدعاء لـ`res.json`/`res.status`**. الاستدعاءات الوحيدة لـ
`res.status(...)` في كامل الدالة هي: خطأ "رقم الهاتف مطلوب" (400)، خطأ فشل قاعدة البيانات (500)، وخطأ
عام غير متوقع (500). **لا يوجد رد ناجح البتة.**

من `upgrade/solving problem in trimmind.md §17.2`: هذا القسم وصف سلوكًا مختلفًا (كتلة `catch` كانت
تُرجع نجاحًا وهميًا `201` ببيانات حجز غير حقيقية) — هذا **لا يطابق الكود الحالي** الذي قرأناه (كتلة
الـ`catch` الحالية تُرجع `500` صحيحًا وصادقًا). الاستنتاج: تم تعديل هذا المسار بين وقت كتابة ذلك
التدقيق والآن — **أُصلحت مشكلة "النجاح الوهيم عند فشل قاعدة البيانات"، لكن نشأ عطل جديد مكانها: لا
استجابة إطلاقًا عند النجاح الفعلي**. هذا يعني عمليًا أن **كل** استدعاء ناجح لهذه الأداة من الـAI
Agent سينتهي بـTimeout من طرف n8n (حسب مهلة عقدة `toolHttpRequest` الافتراضية)، والنموذج سيتلقى
خطأ اتصال رغم أن الحجز أُنشئ فعلاً وبنجاح في MySQL.

### 2.3 توثيق دقيق: تلوّث Payment Proof بين العملاء

من `agentTools.routes.ts:980-1093`: عند استدعاء `submit_payment_proof`، ترتيب المحاولات هو:
1. مطابقة بـ`bookingId` صريح (إن أُرسِل — نادرًا ما يعرفه العميل بنفسه).
2. مطابقة بآخر 8 أرقام من الهاتف (`LIKE '%${cleanPhone.slice(-8)}%'`) على أي حجز بحالة
   `awaiting_payment`/`draft`/`pending_review` — مطابقة جزئية بها احتمال تصادم فعلي (خصوصًا أن أرقام
   الهواتف المصرية غالبًا تشترك في نفس آخر 8 أرقام لمشغّلين/بادئات شائعة نسبيًا).
3. إن فشل: **أي حجز بالنظام كله بحالة `awaiting_payment`/`pending_review`، بلا أي قيد على رقم
   الهاتف إطلاقًا** (`liveSyncedBookings.find((b) => b.status === 'awaiting_payment' || ...)`).
4. إن لم يوجد أي حجز أصلاً: **يُنشئ حجزًا وهميًا جديدًا** ببيانات مسروقة من جلسة `bookingSessions`
   المحلية (التي هي جزء من المحرك المحلي المنفصل تمامًا — قد تكون فارغة أو تخص محادثة مختلفة)، مع
   اسم افتراضي `"أحمد (xxxx)"` وسعر افتراضي `180` جنيه وكابتن افتراضي `"كابتن محمد الحداد"` — **كل
   هذه بيانات مُخترعة وليست حقيقة العميل الفعلي**.

وفوق ذلك، الكتابة النهائية للإثبات (`UPDATE bookings SET ... payment_proof = ?`) تكتب JSON خام في
عمود على جدول `bookings`، **متجاوزة تمامًا** جدول `payment_proofs` المخصص والمنظّم أصلاً في المخطط
(`payment_proofs` به `status ENUM`, `reviewed_by`, `rejection_reason`, قيد `UNIQUE` على
`booking_id`) — طبقتان منفصلتان لنفس المفهوم، والـAI يكتب في الطبقة "الخاطئة" هندسيًا.

---

## 3. تصميم Intelligent Conversation Engine

### 3.1 المبدأ المعماري الأساسي

**محرك محادثة واحد فقط.** يجب حذف الازدواجية الموصوفة في القسم 2.1 من الجذر: تصبح
`whatsapp.service.ts` **طبقة نقل (Transport Gateway) فقط** — تستقبل من Baileys وترسل رسالة موحّدة
عبر Webhook واحد نحو محرك تنسيق واحد، ولا تتخذ أي قرار محادثة أو استدعاء Gemini بنفسها إطلاقًا.
كل "الذكاء" ينتقل لمكوّن واحد (سواء بقي داخل n8n أو انتقل لخدمة Node مستقلة — القرار التقني في
القسم 24، لكن المبدأ صارم: **مصدر رد واحد لكل رسالة واردة**).

### 3.2 من الفهم الحرفي إلى Intent + Entities + Context

بدل الاعتماد على نص خام + System Prompt ضخم، تمر كل رسالة عبر طبقة تحليل صريحة (يمكن أن تكون جزءًا
من نفس استدعاء النموذج بصيغة Structured Output، أو استدعاء أول خفيف قبل التنفيذ) تُنتج:

```json
{
  "intents": ["booking_request"],
  "entities": {
    "date": "tomorrow",
    "time_after": "19:00",
    "service_hint": "حلاقة",
    "barber_hint": null
  },
  "language_mix": "arabic_egyptian",
  "confidence": "high",
  "requires_clarification": ["service_exact_match"]
}
```

هذا التمثيل المنظّم — وليس النص الخام فقط — هو ما تُبنى عليه كل القرارات اللاحقة (أي أداة تُستدعى،
أي سؤال يُطرح، هل الحقل مذكور فعلاً أم لا). هذا يحل مباشرة مشكلة "لا يعرف متى يحتاج سؤال إضافي" لأن
"الحقل الناقص" أصبح شيئًا يمكن فحصه برمجيًا (`if (!entities.date) ask_for_date()`) بدل الاعتماد على
تذكّر النموذج الضمني.

### 3.3 التعامل مع كل الأنماط المذكورة في الطلب

كل الأمثلة المذكورة (لهجة، عربي فصيح، إنجليزي، مزيج، أخطاء إملائية، رسائل قصيرة/طويلة، تغيير رأي،
طلبات متعددة، وصف بدل اسم رسمي...) تُعالَج عبر:

1. **النموذج نفسه (Gemini) هو من يقوم بالفهم اللغوي** — هذا موجود بالفعل وناجح جزئيًا في النظام
   الحالي (نقطة قوة حقيقية يجب الحفاظ عليها، وليس استبدالها بمطابقة كلمات مفتاحية كما يحدث حاليًا
   في مسارات الـFallback).
2. **الفرق الحقيقي المطلوب**: تزويد النموذج بسياق **منظّم** (Structured Context، قسم 5) بدل نص
   تاريخي خام فقط، بحيث "يعرف" ما الذي أُجيب عنه فعلاً وما الذي لا يزال ناقصًا، بدل الاعتماد على
   استنتاجه الضمني من محادثة طويلة قد تُقتطع (نافذة الذاكرة 20 رسالة فقط).
3. **لكل خدمة/باقة موصوفة بلغة العميل (وليس بالاسم الرسمي)**: أداة `get_services` يجب أن تُرجع
   للنموذج قائمة بها مرادفات/أوصاف شائعة (حقل `aliases` جديد يُضاف لجدول `services`، أو قاموس
   Mapping منفصل) بدل الاعتماد على تخمين النموذج وحده لمطابقة "عايز أظبط دقني" بخدمة `"تهذيب لحية"`.
4. **طلبات متعددة في رسالة واحدة** (خدمة + دقن + VIP): تُترجَم لقائمة Entities متعددة ضمن نفس
   الـIntent الواحد (`booking_request`)، وتُمرَّر كلها لأداة الحجز دفعة واحدة (`serviceIds: [...]`)
   بدل معالجتها تسلسليًا وفقدان بعضها.

---

## 4. Conversation State Machine

### 4.1 التصميم المقترح (مبني على `bookings.status` الموجود فعليًا في الـDB + حالات محادثة إضافية)

المخطط الحالي لجدول `bookings` يحتوي أصلاً 12 حالة (`draft` → ... → `completed`/`cancelled`/
`no_show`) وهي غنية بما يكفي لتمثيل **حالة الحجز**. لكن يلزم طبقة إضافية أعلى منها لتمثيل **حالة
المحادثة نفسها** (فالعميل قد يكون في `IDLE` بلا أي حجز جارٍ، أو في وسط استفسار عن الأسعار لا علاقة
له بأي حجز):

```
NEW_CONTACT
   │  (أول رسالة من رقم غير معروف تمامًا؛ لا حجوزات سابقة)
   ▼
IDLE
   │  (لا نية نشطة حاليًا — قد يسأل استفسارات عامة بلا نهاية لهذه الحالة)
   ▼
DISCOVERING_INTENT ──────────────► HUMAN_HANDOFF (في أي وقت، أي حالة)
   │  (Intent محدد: booking / status_check / cancel / reschedule / custom_request / faq)
   ▼
COLLECTING_INFORMATION
   │  (Slot Filling: خدمة، تاريخ، وقت، كابتن اختياري — فقط الحقول الناقصة تُسأل)
   ▼
CONFIRMING_REQUEST
   │  (ملخص للعميل: "تمام يا فندم، حلاقة بكرة الساعة 7 مع كابتن أحمد، تأكيد؟")
   ▼
CHECKING_AVAILABILITY
   │  (استدعاء فعلي لأداة check_availability — يجب أن تصبح حقيقية، انظر §6)
   ├─ غير متاح ──► يعود إلى COLLECTING_INFORMATION (عرض بدائل) أو يعرض الانضمام لقائمة الانتظار
   ▼
BOOKING_DRAFT  (يقابل status=draft في DB)
   ▼
AWAITING_PAYMENT  (يقابل status=awaiting_payment)
   ▼
PAYMENT_SUBMITTED  (يقابل status=payment_submitted — يلزم إضافتها فعليًا في مسار الأداة، فحاليًا القفزة تذهب مباشرة لـpending_review)
   ▼
PENDING_REVIEW  (يقابل status=pending_review — بانتظار موظف استقبال بشري، الـAI ممنوع من تجاوز هذه الحالة)
   ├─ رفض ──► AWAITING_PAYMENT (مع سبب الرفض)
   ▼
CONFIRMED  (يقابل status=confirmed)
   ▼
QUEUE_TRACKING  (العميل يسأل عن دوره — حالة "استعلامية" لا تُغيّر status الحجز)
   ▼
ARRIVAL  (يقابل status=customer_arrived، عبر أداة confirm_arrival الموحّدة فقط — وليس SQL مباشر كما يحدث حاليًا في المسار المحلي)
   ▼
IN_SERVICE  (يقابل status=in_service)
   ▼
COMPLETED  (يقابل status=completed)

مسارات جانبية من أي حالة بعد BOOKING_DRAFT:
   CANCELLED_BY_CUSTOMER / EXPIRED_NO_PAYMENT / NO_SHOW
```

### 4.2 لكل حالة: من يدخلها، متى يخرج، ما المسموح/الممنوع

| الحالة | يدخلها متى | يخرج متى | بيانات مطلوبة | مسموح للـAI | ممنوع على الـAI |
|---|---|---|---|---|---|
| `NEW_CONTACT`/`IDLE` | أول تواصل، أو انتهاء أي مهمة سابقة | أول Intent واضح | لا شيء | ترحيب **مرة واحدة فقط لكل جلسة جديدة فعليًا** (يُتحقق من `last_message_at` في DB وليس من علم في الذاكرة)، إجابة أسئلة عامة عبر `get_services`/`get_branches` | حجز أي شيء بلا Intent واضح |
| `COLLECTING_INFORMATION` | بعد تحديد Intent=booking لكن ينقص حقل | كل الحقول الإلزامية مكتملة | خدمة (أو وصف يمكن مطابقته)، تاريخ، وقت | سؤال **الحقل الناقص فقط** (يُحسَب من مقارنة الـEntities المُستخرجة بقائمة الحقول الإلزامية، وليس تخمينًا) | إعادة سؤال حقل موجود بالفعل في الـContext |
| `CHECKING_AVAILABILITY` | كل الحقول مكتملة | نتيجة فعلية من `check_availability` (بعد إصلاحها) | — | استدعاء الأداة فقط | الافتراض أن الموعد متاح بلا استدعاء الأداة |
| `AWAITING_PAYMENT` | بعد إنشاء حجز فعلي (`create_pending_booking` نجح فعلاً) | استلام صورة/بيان تحويل، أو انتهاء المهلة (Grace Timeout) | مبلغ العربون، بيانات الدفع | تذكير برقم الحجز وبيانات الدفع | تأكيد استلام دفع لم يصل بعد |
| `PENDING_REVIEW` | بعد `submit_payment_proof` ناجح **ومربوط بالحجز الصحيح فقط** | موظف استقبال يعتمد/يرفض | — | إخبار العميل أن المراجعة جارية | قول "تم تأكيد حجزك" قبل اعتماد بشري فعلي من `payment_proofs.status='approved'` |
| `CONFIRMED` | اعتماد بشري فعلي | وصول العميل، أو إلغاء | — | تفاصيل الحجز، التذكيرات | تعديل السعر أو الموعد بلا أداة `reschedule_booking` |
| `QUEUE_TRACKING` | سؤال عن الدور في أي وقت بعد `CONFIRMED` | إجابة الأداة | — | استدعاء `get_waiting_position` فقط | تقدير رقم الدور تخمينًا بلا الأداة |
| `HUMAN_HANDOFF` | كلمات صريحة، غضب مكتشَف، فشل فهم متكرر (≥2 محاولة)، طلب خارج نطاق الأدوات | تدخل موظف بشري فعلي | ملخص المحادثة (انظر §10) | إشعار العميل بالتحويل | الاستمرار بالرد الآلي في نفس الموضوع بعد التحويل |

### 4.3 Recovery عند انقطاع الحوار / رسائل بعد فترة طويلة

- **يجب** تخزين حالة المحادثة في **قاعدة بيانات دائمة** (جدول جديد `conversation_sessions`، انظر
  §6.1) وليس في ذاكرة العملية — هذا يحل مباشرة كل مشاكل "الذاكرة تُمحى عند إعادة التشغيل".
- عند رسالة جديدة بعد فجوة زمنية طويلة (مثلاً > 4 ساعات): يُعاد بناء الـContext من قاعدة البيانات
  (آخر حجز نشط، آخر Intent) لا من الذاكرة النصية القصيرة — رسالة ترحيب تلقائية موجزة تُذكّر بالسياق
  السابق فقط إن وُجد ("أهلاً بعودتك يا فندم، حجزك #BK-1234 لسه قائم ومنتظر تأكيد الدفع، تحب تكمله؟")
  بدل بدء محادثة من الصفر أو تجاهل الحجز القائم.
- إن وُجد حجز نشط غير مكتمل (`draft`/`awaiting_payment`) عمره أكثر من مهلة معينة (تُحدَّد من
  `settings`): يُنقَل تلقائيًا لـ`expired` عبر مهمة مجدولة (Cron)، ولا يُترك للـAI ليقرر ذلك حوارياً.

---

## 5. Customer Context & Memory

### 5.1 الفرق بين الأنواع الأربعة

| النوع | ماذا يحتوي | أين يُخزَّن | مدة الصلاحية |
|---|---|---|---|
| **Short-term Conversation Context** | آخر N رسائل + الـIntent/Entities المستخرجة من الرسالة الحالية | جدول DB جديد `conversation_messages` (أو Redis كطبقة تخزين سريعة أمام DB — MySQL كمصدر دائم) | نافذة متحركة (مثلاً آخر 20 رسالة أو آخر ساعتين، أيهما أقصر)، **لكن مخزّنة بشكل دائم وليس In-Memory فقط** |
| **Persistent Customer Context** | الاسم، رقم الهاتف، عدد الزيارات، آخر خدمة/كابتن مفضّل | جدول `profiles`/`bookings` الموجودين فعليًا (استعلام مباشر، ليس نسخة مخزّنة في الذاكرة) | دائم |
| **Booking Context** | الحجز الحالي قيد الإنشاء/المتابعة (Draft أو نشط) | حقل `active_booking_id` في `conversation_sessions` يشير لصف حقيقي في `bookings` | حتى اكتمال/إلغاء الحجز |
| **System State** | الخدمات، الأسعار، الكباتن، أوقات العمل، إعدادات العربون | استعلام حي من `services`/`barbers`/`branches`/`settings` **بدون أي طبقة Fallback ثابتة مبرمَجة بالكود** (يجب حذف `liveSyncedState` الثابت بالكامل — §8.2 من التدقيق السابق يشرح خطورته) | حي (Cache قصير جدًا، ≤60 ثانية، فقط لتقليل الحمل على DB وليس كمصدر حقيقة بديل) |

### 5.2 القاعدة الحاكمة: Database هي Source of Truth

- الذاكرة قصيرة المدى (المحادثة) **يجوز** تخزينها لتحسين تجربة الحوار (لهجة العميل، أسلوبه، ما
  قاله حرفيًا) — لكن **لا يُسمح أبدًا** أن تكون مصدر أي رقم/سعر/حالة حجز فعلية. أي رقم يُذكر للعميل
  (سعر، رقم حجز، حالة دفع، موقعه في الطابور) **يجب** أن يأتي من استدعاء أداة طازج في نفس الرسالة أو
  من نفس الجولة الحوارية — لا يُعاد من الذاكرة النصية القديمة مباشرة دون تحقق.
- تحديدًا: `Current Booking Draft` و`Current Booking ID` و`Payment Status` و`Queue Position` —
  هذه الأربعة **يُعاد استرجاعها من DB في كل استفسار عنها**، ولا تُعتبر "معروفة مسبقًا" فقط لأنها
  ذُكرت سابقًا في المحادثة (فقد تكون تغيّرت من طرف الموظف البشري في نفس الأثناء).
- `Selected Services`/`Selected Package`/`Selected Barber`/`Selected Date`/`Selected Time` —
  هذه يجوز الاحتفاظ بها في الذاكرة القصيرة أثناء مرحلة `COLLECTING_INFORMATION` فقط (لأنها لم
  تُثبَّت بعد في DB)، وتُنقَل لصف `bookings` فعلي فور استدعاء `create_booking_draft`.

---

## 6. Database-First AI — Tools Design

### 6.1 جدول جديد مطلوب: `conversation_sessions` (لا يوجد حاليًا أي مكافئ له)

```sql
CREATE TABLE IF NOT EXISTS `conversation_sessions` (
  `id` VARCHAR(64) PRIMARY KEY,
  `customer_phone` VARCHAR(20) NOT NULL,
  `channel` ENUM('whatsapp') DEFAULT 'whatsapp',
  `state` VARCHAR(40) NOT NULL DEFAULT 'IDLE',      -- تطابق أسماء حالات §4
  `active_booking_id` VARCHAR(64) NULL,
  `pending_entities` JSON NULL,                      -- الحقول المُجمَّعة أثناء COLLECTING_INFORMATION
  `last_intent` VARCHAR(40) NULL,
  `human_handoff_active` TINYINT(1) DEFAULT 0,
  `human_handoff_expires_at` TIMESTAMP NULL,
  `last_message_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (`customer_phone`),
  FOREIGN KEY (`active_booking_id`) REFERENCES `bookings`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversation_messages` (
  `id` VARCHAR(64) PRIMARY KEY,
  `session_id` VARCHAR(64) NOT NULL,
  `whatsapp_message_id` VARCHAR(128) NULL,           -- لـIdempotency الحقيقي، انظر §13
  `role` ENUM('customer','assistant','system') NOT NULL,
  `content` TEXT NOT NULL,
  `extracted_intent` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (`session_id`),
  UNIQUE KEY uq_wa_msg (`whatsapp_message_id`),       -- يمنع معالجة نفس الرسالة مرتين فعليًا (على مستوى DB وليس Static Data في n8n)
  FOREIGN KEY (`session_id`) REFERENCES `conversation_sessions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

هذان الجدولان يحلّان مباشرة: فقدان الذاكرة عند إعادة التشغيل، ازدواجية الذاكرة بين محركين، وغياب
Dedup حقيقي مرتبط بمعرّف الرسالة (بدل Dedup نصي عام مرتبط بمهلة زمنية فقط).

### 6.2 قاعدة صارمة: AI NEVER INVENTS DATA — تطبيقًا عمليًا

كل قيمة من القائمة التالية **يجب** أن تأتي حصرًا من نتيجة استدعاء أداة، ويُمنع تمامًا وجودها في نص
الـSystem Prompt كبيانات ثابتة (كما يحدث حاليًا مع `liveSyncedState` الذي يحتوي أسعارًا واسم صالون
مكتوبين حرفيًا في الكود المصدري):

السعر، الخدمة، الباقة، الحلاق، الموعد، Availability، العربون، Booking ID، Tracking Code، Queue
Position، Payment Status.

### 6.3 مواصفات الأدوات (Input/Output) — تصميم موحّد جديد يحل محل الأدوات الحالية

> ملاحظة: الأدوات أدناه تُعيد تسمية/توسيع الأدوات الـ15 الموجودة فعليًا في n8n، مع سد الثغرات
> (Stub في `check_availability`، غياب `get_packages`، غياب `handoff_to_reception` الصريح، غياب
> `update_booking_draft` منفصلة عن الإنشاء).

| الأداة | Input | Output | ملاحظة تصميم |
|---|---|---|---|
| `get_customer` | `phone` | `{exists, name, visitsCount, lastServiceId, lastBarberId, vipStatus}` | جديدة فعليًا — غير موجودة حاليًا بهذا الاسم؛ حاليًا الاعتماد على `get_booking_status` كبديل غير دقيق |
| `get_services` | `category?` | `[{id, name, aliases[], price, durationMinutes, category}]` | **يجب إضافة عمود `aliases` JSON** لجدول `services` ليحمل الأوصاف الشائعة بلهجة العملاء |
| `get_packages` | `branchId?` | `[{id, name, includedServiceIds[], priceFrom, isCustomPricing}]` | **أداة جديدة بالكامل** — حاليًا "الباقة" مجرد `category='vip_package'` بلا تجميع حقيقي |
| `get_package_details` | `packageId` | `{name, includedServices[], basePrice, notes}` | جديدة |
| `get_barbers` | `branchId?`, `date?` | `[{id, name, isAvailableToday, specialties[]}]` | موجودة، تحتاج فقط إثراء بحقل `specialties` |
| `check_availability` | `branchId, barberId?, serviceIds[], date, timeWindow?` | `{isAvailable, conflictReason?, nextAvailableSlots[], estimatedWaitMinutes}` | **يجب إعادة بناؤها بالكامل** — استعلام فعلي على `bookings` (تعارض الكابتن/الكرسي في نفس النافذة الزمنية)، وليس Stub ثابت |
| `get_booking_settings` | — | `{depositNormal, depositVip, paymentAccounts, workingHours}` | من جدول `settings` الحقيقي فقط |
| `create_booking_draft` | `customerPhone, customerName, serviceIds[], barberId?, startsAt, branchId, idempotencyKey` | `{bookingId, status, depositRequired, paymentInstructions, trackingUrl}` | **يجب** أن ترسل رد HTTP فعلي دائمًا (إصلاح الخلل §2.2)، وتستخدم `idempotencyKey` فعليًا (فحص `conversation_messages`/سجل مخصص قبل الإدراج) |
| `update_booking_draft` | `bookingId, patch{...}` | `{bookingId, status, updatedFields[]}` | **أداة جديدة** — حاليًا لا توجد طريقة لتعديل حجز قيد الصياغة دون إلغائه وإعادة إنشائه |
| `submit_payment_proof` | `bookingId (إلزامي، لا Fallback)، phone, proofImageUrl, transferredAmount?` | `{status:'payment_submitted', bookingId}` | **يجب رفض الطلب** إن لم يوجد `bookingId` صريح يخص هذا الرقم بالضبط (تطابق كامل، لا آخر 8 أرقام) — بدل كل منطق التخمين الحالي |
| `get_booking_status` | `bookingId?` أو `phone` | `{bookingId, status, service, barber, startsAt, depositStatus}` | موجودة، تحتاج فقط قراءة `payment_proofs.status` الحقيقي بدل عمود JSON الخام |
| `get_queue_position` | `bookingId` | `{position, aheadCount, estimatedMinutes}` | موجودة (`get_waiting_position`) — إعادة تسمية فقط |
| `confirm_arrival` | `bookingId أو phone` | `{status:'customer_arrived'}` | **يجب** توحيدها لتكون المسار الوحيد (حذف منطق `UPDATE` المباشر في `whatsapp.service.ts`) |
| `cancel_booking` | `bookingId, phone (تطابق كامل إلزامي), reason` | `{status:'cancelled'}` | إصلاح المطابقة الجزئية (§17 أدناه) |
| `reschedule_booking` | `bookingId, phone (تطابق كامل), newStartsAt` | `{bookingId, newStartsAt, status}` | موجودة، تحتاج نفس إصلاح المطابقة |
| `handoff_to_reception` | `phone, reasonCategory, conversationSummary` | `{handoffId, status:'queued_for_staff'}` | **أداة صريحة جديدة** يستدعيها النموذج نفسه بدل الاعتماد على كلمات مفتاحية مبرمجة خارج نطاق تفكيره |

---

## 7. Natural Language Understanding

النموذج (Gemini) يبقى مسؤولاً عن الفهم اللغوي الفعلي — هذا مناسب ولا يحتاج استبدالاً بمحرك قواعد.
الإضافات المطلوبة:

1. **قسم صريح في الـPrompt الأساسي (Core Behavior، §14) بمثال Few-Shot واحد فقط** يوضح تحويل رسالة
   حرة لـEntities منظمة (بدل شرح مطوّل) — الأمثلة الكثيرة المذكورة في الطلب (لهجة، إنجليزي، مزيج،
   بلا علامات ترقيم...) لا تحتاج قواعد منفصلة لكل حالة؛ Gemini يتعامل معها لغويًا بشكل طبيعي طالما
   وصلته تعليمات واضحة عن الشكل المطلوب للمخرجات، وسياق منظم بدل نص خام فقط.
2. **الأخطاء الإملائية والاختصارات**: لا تحتاج معالجة خاصة — مسؤولية النموذج اللغوي، لا تحتاج بنية
   إضافية.
3. **الوصف بدل الاسم الرسمي**: يُحل عبر `aliases` في `get_services` (§6.3) — مسؤولية الأداة أن
   تُعيد بيانات كافية للمطابقة، لا مسؤولية النموذج أن "يخمّن" الاسم الرسمي وحده.

---

## 8. Multi-Turn Conversation — منع إعادة الأسئلة

الحل الهيكلي (وليس تعليمة نصية فقط في الـPrompt كما هو الحال حاليًا حيث توجد جملة واحدة "لا تطلب
معلومة ذُكرت مسبقًا" بلا أي آلية فرض):

- `pending_entities` (عمود JSON في `conversation_sessions`، §6.1) يُحدَّث تراكميًا بعد كل رسالة.
- قبل توليد أي سؤال عن حقل، يتم فحص برمجي: هل هذا الحقل موجود بالفعل في `pending_entities` أو في
  `active_booking_id` المرتبط؟ إن كان موجودًا — **يُمنع تمرير هذا السؤال للنموذج كخيار أصلاً**
  (Function-level guard، وليس فقط تعليمة نصية يُؤمَل أن يلتزم بها النموذج).
- الاسم ورقم الهاتف: إن وصل رقم الهاتف من بيانات واتساب نفسها (`senderPhone` الحقيقي، وليس LID
  فارغ كما يحدث حاليًا §1.2) — لا يُسأل عنه إطلاقًا. **يجب أيضًا إصلاح مشكلة تفريغ رقم LID بالكامل
  الموصوفة سابقًا** بدل تركها تُجبر السؤال المتكرر عن الرقم.

---

## 9. Flexible Booking — Normal vs Custom

### 9.1 الوضع الحالي (نقطة انطلاق جيدة جزئيًا)

يوجد بالفعل مكوّن جاهز في لوحة الاستقبال: `src/components/receptionist/WhatsAppCustomPricingModal.tsx`
— أي أن **فكرة "تسعير مخصص من طرف الموظف" موجودة جزئيًا في الواجهة الأمامية بالفعل**، لكنها غير
مربوطة بأي حالة `awaiting_pricing` صريحة في `bookings.status` (الـEnum الحالي لا يحتوي هذه القيمة
أصلاً)، ولا بأي مسار من الـAI Agent يُنشئ طلبًا من هذا النوع تلقائيًا.

### 9.2 التصميم المكتمل

- **إضافة قيمة جديدة لـ`bookings.status` ENUM**: `custom_pricing_requested` (تُدرَج بين `draft`
  و`awaiting_payment`).
- **أداة جديدة**: `create_custom_booking_request(customerPhone, freeTextDescription, extractedServiceHints[])`
  — تُنشئ صفًا بحالة `custom_pricing_requested` دون أي `total_at_booking` مؤكد (يبقى `0.00` أو
  `NULL` حتى يحدّده الموظف).
- الإشعار للموظف يستخدم **نفس** `WhatsAppCustomPricingModal.tsx` الموجود فعليًا، لكن يُربَط بحدث
  Socket.IO حقيقي (`broadcastToBranch(..., 'CUSTOM_PRICING_REQUESTED', ...)`) يصل تلقائيًا بدل أي
  آلية دفع يدوي حالية إن وُجدت.
- بعد تحديد الموظف للسعر/الخصم/العربون: انتقال تلقائي لـ`awaiting_payment` بنفس مسار الحجز العادي
  تمامًا من هذه النقطة فصاعدًا (إعادة استخدام كامل منطق الدفع الحالي، لا تكرار له).

---

## 10. Human Handoff

### 10.1 المشكلة الحالية

التحويل البشري موجود فقط في المسار الذي **لا يملك** صلاحية تنفيذ حجوزات (المسار المحلي)، بكلمات
مفتاحية صريحة (`whatsapp.service.ts:901-905`) بدل قرار من النموذج نفسه، ولا يظهر للموظف أي ملخص —
فقط رقم الهاتف والرسالة المُطلِقة (`whatsapp.service.ts:921-926`).

### 10.2 التصميم الجديد

**معايير التفعيل** (تُصبح جزءًا من قرار النموذج نفسه عبر أداة `handoff_to_reception`، وليس فقط
كلمات مفتاحية خارجية — مع إبقاء الكلمات المفتاحية الصريحة كـ"شبكة أمان" إضافية فقط، لا كمصدر وحيد):

طلب صريح، غضب واضح في النبرة، عدم يقين من النموذج (Confidence منخفض من التحليل §3.2)، طلب غير مغطى
بأي أداة، مشكلة دفع، مشكلة حجز، طلب خاص جدًا، أكثر من محاولتين فاشلتين لفهم نفس الرسالة.

**ما يظهر للموظف** (عبر Socket.IO لنفس لوحة الاستقبال الموجودة فعليًا):

```json
{
  "customerName": "...",
  "phone": "...",
  "conversationSummary": "ملخص من آخر 5-10 رسائل، وليس اللوق الكامل",
  "currentIntent": "...",
  "activeBookingId": "BK-...",
  "paymentStatus": "...",
  "triggerReason": "customer_requested | anger_detected | low_confidence | unsupported_request",
  "lastMessages": ["..."]
}
```

بعد التحويل: يُضبَط `human_handoff_active=1` في `conversation_sessions`، والـAI **يتوقف تمامًا** عن
الرد التلقائي حتى يُلغي الموظف الحالة يدويًا أو تنتهي المهلة (60 دقيقة كما في الكود الحالي — قيمة
معقولة، تُبقى كما هي).

---

## 11. Payment Proof — Flow آمن

**الفرق الجوهري عن الوضع الحالي (§2.3)**: يُمنع تمامًا أي "تخمين" لربط الصورة بحجز. التسلسل الجديد:

1. العميل: "أنا حولت" → الـAI يسأل (إن لم يكن `active_booking_id` معروفًا بوضوح من `conversation_sessions`
   لنفس هذا الرقم): "الحجز الخاص بأي طلب يا فندم، رقم #BK-... صح؟" — تأكيد صريح بدل تخمين.
2. العميل يرسل الصورة → تُربَط حصرًا بـ`active_booking_id` من الجلسة **إذا وحصرًا إذا** كان
   `customer_phone` المسجَّل على ذلك الحجز مطابقًا **تمامًا** (لا آخر 8 أرقام) لرقم واتساب المُرسِل.
3. إن لم يوجد `active_booking_id` صريح: **يُرفض الربط التلقائي**، ويُطلب من العميل رقم الحجز صراحة،
   أو يُحوَّل بشريًا إن تكرر الفشل.
4. الحالة تنتقل إلى `payment_submitted` فورًا (وليس تخطيها مباشرة لـ`pending_review` كما يحدث حاليًا
   — يُبقي أثرًا واضحًا لحظة "استُلمت الصورة" منفصلة عن "دخلت طابور المراجعة").
5. الكتابة الفعلية تكون في جدول `payment_proofs` المخصص أصلاً في المخطط (وليس عمود JSON خام على
   `bookings`)، عبر Repository حقيقي (`MySQLPaymentProofRepository` يُضاف على نمط
   `MySQLWaitlistRepository` الموجود فعلاً كأفضل مرجع هندسي في المشروع).
6. **ممنوع تمامًا** إخبار العميل أن الدفع "تم تأكيده" أو أن "الحجز مؤكد" قبل أن يقرأ النظام
   `payment_proofs.status = 'approved'` فعليًا من قاعدة البيانات بعد إجراء بشري حقيقي.

---

## 12. Queue & Notifications

الاستعلامات ("دوري وصل لفين؟"، "أنا وصلت"، "فاضل كام واحد؟"، "قرب دوري؟") تُبقى على نفس الأدوات
الموجودة فعليًا (`get_waiting_position`/`confirm_arrival`) بعد توحيدها كمسار وحيد (§4.2، §6.3) —
هذا الجزء من النظام الحالي منطقه سليم أساسًا، المشكلة فقط في الازدواجية مع المسار المحلي.

**الإشعارات المطلوب توحيدها/إكمالها** (بعضها موجود جزئيًا عبر `reminder.service.ts` والـWorkflow
04، والبعض غير مذكور حاليًا كحدث منفصل):

| الحدث | موجود حاليًا؟ |
|---|---|
| Booking Confirmed | ✅ ضمنيًا عبر Socket، يحتاج توحيد رسالة واتساب صريحة |
| Payment Approved | ⚠️ يحتاج ربط بجدول `payment_proofs` الفعلي بعد إصلاح §11 |
| Booking Reminder | ✅ Workflow 04 |
| Queue Almost Ready / One Ahead / Your Turn | ❌ غير موجود كحدث منفصل — حاليًا فقط استعلام يدوي من العميل، بلا Push استباقي |
| Arrival Confirmation | ✅ (بعد توحيد المسار) |
| Delay Notification | ❌ غير موجود |
| Cancellation / Reschedule | ⚠️ الأداة موجودة، إشعار واتساب تلقائي للعميل عند تغيير الحالة من لوحة التحكم غير مؤكد وجوده (يحتاج تحقق تشغيلي إضافي، خارج ما قرأناه في `reminder.service.ts`) |

---

## 13. Multiple Customers / Scalability

| النقطة | الوضع الحالي | التصميم المطلوب |
|---|---|---|
| **Conversation isolation** | ❌ Dedup نصي عام غير مرتبط برقم الهاتف (§1.2) — قد يُسقِط رسالة عميل بسبب عميل آخر | Dedup على مستوى `whatsapp_message_id` (فريد في `conversation_messages`، §6.1)، **مطلقًا** لا يُدمَج بين عملاء مختلفين |
| **Customer isolation** | ❌ `submit_payment_proof` قد يخلط بين عملاء (§2.3) | تطابق كامل لرقم الهاتف إلزاميًا في كل أداة تعديل بيانات (§6.3، §17) |
| **Message deduplication** | ⚠️ معطوب (نافذة زمنية عامة) + `idempotencyKey` معطّل بالكامل | قيد `UNIQUE` حقيقي على `whatsapp_message_id` في DB — أبسط وأصح من أي منطق نافذة زمنية |
| **Idempotency** | ❌ معطّلة فعليًا رغم وجود المتغيّر | استخدام `idempotencyKey` فعليًا: فحص وجود حجز/عملية بنفس المفتاح قبل أي إدراج، بالاستفادة من `MySQLWebhookEventRepository` الموجود فعليًا وغير المُستخدَم حاليًا لهذا الغرض |
| **Race conditions / Concurrent bookings** | ✅ **جيد فعليًا** لمسار الحجز الأساسي: `MySQLBookingRepository` يستخدم `withTransaction`/`FOR UPDATE` حسب التدقيق السابق | يجب أن يمر **كل** إنشاء حجز عبر نفس هذا المسار (بما فيها مسار الـAI الحالي في `agentTools.routes.ts` الذي يستدعي `createBooking()` — وهذا صحيح بالفعل هنا)، ويُمنع أي إدراج مباشر عبر SQL خام موازٍ (كما يحدث حاليًا في مسارات Fallback المتعددة داخل نفس الملف) |
| **n8n execution isolation** | ⚠️ كل تنفيذ Workflow معزول افتراضيًا في n8n، لكن `Window Buffer Memory` In-Process قد يتصادم عبر عدة Workers في بيئة Scale-out | نقل الذاكرة لقاعدة البيانات (§6.1) يحل هذا تلقائيًا — لا حاجة لأي حل خاص بـn8n بعد ذلك |
| **Database transactions** | ✅ للحجوزات، ❌ لباقي المسارات (`payment_proofs` عبر SQL خام بلا Transaction واضحة) | تعميم استخدام `withTransaction` على كل كتابة متعددة الخطوات |
| **Rate limiting** | ✅ يوجد `rateLimiter.ts` عام للـBackend | يحتاج تحديدًا: هل يُطبَّق فعليًا على `/api/agent-tools/*`؟ (لم يُتحقق في هذه الجولة — يُدرَج كبند فحص في Phase 9) |
| **Redis** | ✅ **مُهيَّأ فعليًا في المشروع** (`server/src/config/redis.ts`, يُستخدم حاليًا في `rateLimiter`/`honeypot`/`accountProtection`) لكنه **غير مُستخدَم إطلاقًا لذاكرة المحادثة** | استخدامه كطبقة Cache سريعة أمام `conversation_sessions` (اختياري للأداء فقط — MySQL يبقى مصدر الحقيقة الدائم) |
| **Retry / Failure recovery** | ❌ لا توجد سياسة واضحة لإعادة محاولة استدعاء الأدوات عند الفشل | تحديد سياسة صريحة في n8n لكل عقدة أداة (عدد محاولات محدود + Backoff)، مع إصلاح جذري لمشكلة §2.2 أولاً (لأنها السبب الأصلي لأغلب حالات "الفشل" الظاهري) |

---

## 14. Prompt Architecture

بدل الرسالة النظامية الواحدة الضخمة الحالية (~2500 كلمة تجمع كل شيء)، تصميم طبقي:

```
┌─────────────────────────────────────────────┐
│ 1. Core Behavior (ثابت، يُحمَّل دائمًا)         │  ← الهوية، أسلوب الرد، قواعد Guardrails الصارمة (§15)
├─────────────────────────────────────────────┤
│ 2. Salon Context (شبه ثابت، Cache دقيقة واحدة) │  ← اسم الصالون، الفروع، أوقات العمل العامة
├─────────────────────────────────────────────┤
│ 3. Current Customer Context (يُحمَّل لكل رسالة) │  ← من get_customer: الاسم، آخر زيارة، هل VIP
├─────────────────────────────────────────────┤
│ 4. Current Booking State (عند الحاجة فقط)      │  ← من conversation_sessions.active_booking_id إن وُجد
├─────────────────────────────────────────────┤
│ 5. Available Tools (حسب الحالة الحالية فقط)     │  ← لا تُعرَض أداة cancel_booking إن لم يوجد حجز نشط مثلاً
├─────────────────────────────────────────────┤
│ 6. Safety Rules (ثابت، يُحمَّل دائمًا، آخر السياق) │  ← تكرار Guardrails في نهاية الـPrompt (تقنية معروفة لتقليل تجاهل النموذج للقواعد في السياقات الطويلة)
└─────────────────────────────────────────────┘
```

**ما يُحمَّل دائمًا**: 1 و6 (صغيرة، ثابتة). **ما يُحمَّل عند الحاجة**: 2 (Cache قصير)، 3-4 (طازجة من
DB لكل رسالة، ليست جزءًا من الذاكرة النصية)، 5 (تُفلتَر حسب الحالة الحالية من الآلة الحالة §4 — تقليل
عدد الأدوات المعروضة للنموذج في كل لحظة يقلل احتمال استدعاء أداة خاطئة).

---

## 15. AI Guardrails

القواعد التالية يجب أن تكون **قيودًا برمجية قابلة للفرض بعد الرد أيضًا (Post-generation Validation)**،
وليس فقط جملًا في الـPrompt كما هو الحال بالكامل حاليًا (لا يوجد أي تحقق لاحق من مطابقة رد النموذج
لنتائج الأدوات الفعلية في الكود الحالي):

- منع اختراع الأسعار/الخدمات/الحلاقين/المواعيد/Booking IDs/Tracking Codes/حالة الدفع: **تحقق آلي**
  بعد توليد الرد — هل كل رقم حجز/سعر مذكور في الرد يطابق قيمة فعلية أعيدت من أداة في نفس الجولة؟
  (يمكن تنفيذه كخطوة تحقق خفيفة إضافية، أو كحد أدنى: تسجيل ورصد أي حالة يذكر فيها الرد رقمًا لم يرد
  في نتائج الأدوات، لمراجعة بشرية دورية إلى حين بناء تحقق آلي كامل).
- Fake Success: **ممنوع نهائيًا** أن يخبر الرد العميل بنجاح عملية إلا بعد استلام استجابة ناجحة فعلية
  من الأداة (هذا يتطلب أولاً إصلاح §2.2 — فالخلل الحالي في الكود يجعل هذا القيد مستحيل الفرض من
  الأساس لأن الأداة لا ترد إطلاقًا عند النجاح).
- تنفيذ عمليات بدون Tool: النموذج **لا يملك** أي قناة لتنفيذ شيء إلا عبر Tool Calling أصلاً (هذا
  صحيح هيكليًا في LangChain Agent الحالي) — يبقى فقط ضمان أن **كل** تعديل بيانات (وليس فقط بعضها)
  يمر عبر أداة، لا عبر أي منطق SQL مباشر موازٍ كما في المسار المحلي الحالي.
- تعديل السعر / تأكيد الدفع من الـAI: **ممنوع هيكليًا** — لا توجد ولن تُضاف أي أداة تسمح للنموذج
  بتغيير `total_at_booking` أو `payment_proofs.status` إلى `approved` مباشرة؛ هذا فعل بشري حصري.

**القاعدة الجوهرية**: AI can request an action. Backend decides whether the action is valid. —
هذا مبدأ سليم وموجود جزئيًا بالفعل في تصميم الأدوات الحالية (الحجز يمر عبر `createBooking()` وليس
SQL مباشر من الـRoute)، لكنه **منقوض عمليًا** بوجود مسارات Fallback متعددة تتجاوز هذا المبدأ عند أي
فشل (§2.3، §8.2 من التدقيق السابق) — إصلاحها هو تطبيق هذه القاعدة فعليًا بلا استثناءات.

---

## 16. Error Handling

| الحالة | ماذا يرى العميل | ماذا يُسجَّل | Retry؟ | Handoff؟ |
|---|---|---|---|---|
| Database unavailable | رسالة اعتذار عامة صادقة ("في مشكلة تقنية بسيطة، هحول حضرتك لموظف فورًا") — **لا** بيانات مُخترعة بديلة (حذف `liveSyncedState` كمصدر بديل صامت) | خطأ كامل + Stack | لا (فوري لبشري) | ✅ فوري |
| Backend/n8n unavailable | نفس أعلاه | تنبيه تشغيلي (Alerting) | نعم (محاولة واحدة تلقائية) | ✅ إن فشلت المحاولة |
| WhatsApp send failure | (العميل لن يرى شيئًا بالتعريف) | تسجيل الفشل + رقم الهاتف | نعم (Backoff محدود) | لا |
| Media upload failure | "الصورة ما وصلتش، ممكن تبعتها تاني؟" | خطأ التحميل | يُطلَب من العميل يدويًا | لا |
| Payment proof failure (لم يوجد حجز مطابق) | سؤال توضيحي صريح لرقم الحجز (§11) | — | لا | بعد محاولتين فاشلتين |
| Booking conflict (بعد إصلاح `check_availability`) | عرض بدائل فعلية أو قائمة انتظار | — | لا | لا |
| Duplicate message (نفس `whatsapp_message_id`) | (يُتجاهَل بصمت، لا رد مكرر) | تسجيل تجاهل | لا | لا |
| AI timeout | رسالة اعتذار + إعادة محاولة صامتة واحدة | — | نعم (مرة واحدة) | ✅ إن فشلت مجددًا |
| AI hallucination detected (رصد لاحق) | (يُمنع الرد من الإرسال أصلاً إن أمكن التحقق قبل الإرسال؛ أو يُصحَّح لاحقًا) | تسجيل للمراجعة | — | حسب الخطورة |
| Tool failure (خطأ 5xx من Backend) | رسالة اعتذار عامة صادقة | الخطأ الكامل | نعم (محاولة واحدة) | ✅ إن استمر |

---

## 17. Security

| التهديد | الوضع الحالي (موثّق من الكود) | الإصلاح المطلوب |
|---|---|---|
| **Prompt Injection** | لا يوجد فلترة صريحة لمحتوى الرسائل الواردة قبل تمريرها للنموذج؛ الاعتماد فقط على تعليمات النموذج نفسه (`docs/WHATSAPP_AI_SECURITY.md` يذكر هذا كإجراء وحيد) | إبقاء المبدأ (النموذج لا يملك تنفيذًا مباشرًا لقاعدة البيانات) — وهو صحيح فعليًا حاليًا؛ إضافة تسجيل ورصد لمحاولات الحقن الواضحة (`"ignore previous instructions"` ونحوها) للمراجعة الدورية |
| **Tool Abuse / صلاحيات غير متدرجة** | سرّ واحد (`AGENT_API_SECRET`) يفتح كل الأدوات (§17.3 من التدقيق السابق)، وله **قيمة افتراضية مكتوبة صراحة في الكود المصدري** (`'trim-mind-agent-secret-key-2026'`) إن لم يُضبَط متغيّر البيئة | (أ) حذف القيمة الافتراضية نهائيًا، إيقاف الإقلاع إن لم يُضبَط السرّ في الإنتاج. (ب) فصل سرّ للأدوات القرائية عن سرّ للأدوات التدميرية (حجز/إلغاء/دفع) |
| **Unauthorized Cancellation / Reschedule** | مطابقة جزئية بآخر 8-9 أرقام من الهاتف فقط، مع مسار احتياطي يُلغي **أي** حجز نشط بلا قيد هاتف إطلاقًا عند غياب أي تطابق (`agentTools.routes.ts:783-790` لـcancel، ومثله في reschedule) | تطابق كامل وصارم لرقم الهاتف إلزاميًا، حذف كل مسار Fallback بلا قيد هاتف، اعتماد `secure_token` (موجود فعلاً كعمود في `bookings`) كوسيلة تحقق إضافية بدل الاكتفاء برقم الهاتف وحده |
| **Webhook Authenticity** | `Evolution API Webhook` في n8n (Workflow 01) لا يتحقق من أي توقيع/مصدر — أي طرف يعرف الرابط العام يمكنه محاكاة رسالة واتساب واردة | إضافة تحقق توقيع/سرّ مشترك بين Baileys Gateway وWebhook n8n (حاليًا `forwardToN8nWebhook` لا يرسل أي توقيع في الحمولة) |
| **Customer Data Isolation** | مطابقة جزئية بالهاتف (أعلاه) تعني تسريب بيانات حجز عميل آخر محتمل نظريًا عبر تخمين | نفس إصلاح المطابقة الكاملة أعلاه يحل هذه النقطة أيضًا |
| **Payment Proof Manipulation** | تلوث عبر عملاء (§2.3، §11) | إصلاح §11 بالكامل |
| **Secret/Token Exposure** | السرّ الافتراضي مكتوب في الكود، وخصائص أخرى غير متعلقة بالواتساب مباشرة (JWT في localStorage) موثّقة في التدقيق السابق §11.4 | خارج نطاق "شات بوت واتساب" مباشرة لكنه يشارك نفس البنية التحتية — يُدرَج في Phase 3 |
| **Rate Limiting على أدوات الـAI تحديدًا** | غير مؤكد وجوده تحديدًا لهذا المسار (`rateLimiter.ts` عام) | حد أقصى صريح لعدد استدعاءات الأدوات لكل رقم هاتف بالدقيقة، لمنع استنزاف حصة Gemini أو التسبب في حجوزات وهمية متكررة |

---

## 18. n8n Architecture (بعد إعادة الهيكلة)

```
WhatsApp Router (Webhook + تحقق توقيع)
        ↓
Message Normalizer (استخراج + تخزين في conversation_messages فورًا لضمان Idempotency عبر UNIQUE constraint)
        ↓
Customer Resolver (get_customer + تحميل/إنشاء conversation_sessions)
        ↓
Conversation Context Loader (قراءة state + pending_entities + active_booking_id من DB، ليس من الذاكرة)
        ↓
AI Agent (محرك واحد فقط — حذف المسار المحلي الموازي في whatsapp.service.ts بالكامل)
        ↓
Tool Execution (الأدوات المُعاد تصميمها في §6.3)
        ↓
Guardrail/Response Validator (تحقق لاحق أساسي، §15)
        ↓
Response Formatter (تحديث conversation_sessions.state بعد الرد)
        ↓
WhatsApp Sender (نقطة إرسال وحيدة، هي الموجودة فعليًا `/api/whatsapp-session/send`)
```

Workflows منفصلة تبقى كما هي منطقيًا (Notifications/Reminders/Queue عبر Cron) لكن تُستهلَك من نفس
جداول DB الموحّدة الجديدة بدل أي حالة محلية مبعثرة.

---

## 19. Testing Strategy

مصفوفة اختبار (جزء منها امتداد مباشر لـ`docs/WHATSAPP_AI_TESTING.md` الموجود فعليًا وهو نقطة انطلاق
جيدة، مع توسيع كبير):

| الفئة | سيناريوهات | السلوك المتوقع الأساسي |
|---|---|---|
| عميل جديد/حالي | أول رسالة، عميل بحجز سابق، عميل VIP | ترحيب واحد فقط، تحميل السياق الصحيح من DB |
| حجز عادي/مخصص | خدمة واحدة، خدمات متعددة، وصف حر بدون سعر معروف | التحويل الصحيح لـ`custom_pricing_requested` عند الحاجة (§9) |
| لغة | عربي مصري، فصيح، إنجليزي، مزيج، بلا علامات ترقيم، أخطاء إملائية | فهم صحيح دون إعادة سؤال غير ضرورية |
| رسائل | قصيرة جدًا، طويلة ومفصّلة، متعددة الطلبات في رسالة واحدة | استخراج كل الـEntities معًا |
| تكرار | نفس الرسالة مرتين (نفس `whatsapp_message_id`)، Webhook مكرر فعليًا من واتساب | معالجة **مرة واحدة فقط**، لا حجز مكرر (اختبار مباشر لإصلاح §2.2/§6.1) |
| دفع | إثبات صالح مربوط بحجز صريح، صورة بلا حجز نشط معروف، رقم هاتف مطابق جزئيًا لحجز آخر | رفض الربط التلقائي غير الآمن (اختبار مباشر لإصلاح §11) |
| تعارض حجز | نفس الكابتن/الوقت لعميلين | `check_availability` يرصد التعارض فعليًا (اختبار مباشر لإصلاح Stub §2.1 جدول) |
| إلغاء/تعديل | برقم هاتف مطابق تمامًا، برقم هاتف مطابق جزئيًا فقط لمحاولة انتحال | رفض المطابقة الجزئية (اختبار مباشر لإصلاح §17) |
| طابور/وصول | استعلام دور، تأكيد وصول عبر الأداة الموحّدة فقط | لا يوجد مسار SQL مباشر مواز يمر بصمت |
| فشل النظام | فشل AI، فشل DB، فشل n8n | رسالة صادقة + Handoff، **لا بيانات مُخترعة بديلة** (اختبار مباشر لإصلاح `liveSyncedState`) |
| تحويل بشري | طلب صريح، غضب، فشل فهم متكرر | استدعاء `handoff_to_reception` من النموذج نفسه وليس كلمات مفتاحية خارجية فقط |
| أمان | محاولة حقن تعليمات، محاولة إلغاء حجز عميل آخر بمطابقة جزئية للرقم | رفض واضح، لا تسريب بيانات |
| ازدواجية المحرك (اختبار انحداري خاص بهذا المشروع) | إرسال رسالة واحدة ومراقبة عدد الردود الواصلة للعميل | **رد واحد فقط** — اختبار صريح للتأكد من إزالة المحرك المحلي المزدوج (§2.1) بنجاح، وعدم عودته سهوًا مستقبلاً |

---

## 20. Clean Architecture & SOLID

بناءً على القراءة المباشرة (ومطابقة لما ورد في `upgrade/solving problem in trimmind.md §3-5`،
الذي تحقق منه هذا الفحص مباشرة في `agentTools.routes.ts` ووُجد متطابقًا تمامًا لهذا الجزء تحديدًا):

| الطبقة | أين يجب أن تكون | أين هي فعليًا اليوم |
|---|---|---|
| Domain Logic (قواعد الحجز، الصلاحية، حالات الانتقال) | `domain/entities`, `domain/repositories` | ✅ موجودة وصحيحة للحجز الأساسي فقط |
| Application Use Cases (إنشاء حجز، إلغاء، Waitlist) | `usecases/*` | ✅ نموذج ممتاز في `usecases/waitlist/*` و`usecases/bookings/CreateBookingUseCase.ts` — **هذا هو القالب الواجب تعميمه** على بقية `agentTools.routes.ts` |
| Repositories | `adapters/repositories/*` | ⚠️ موجودة لبعض الكيانات (Booking, Waitlist, Recall, Webhook Event) وغائبة تمامًا لأخرى (لا يوجد `PaymentProofRepository` رغم وجود الجدول، لا يوجد `ConversationSessionRepository` لأن الجدول نفسه غير موجود بعد) |
| AI Adapter | طبقة Infrastructure منفصلة تُنفّذ واجهة `IAIGateway` | ❌ غير موجودة — استدعاء Gemini إما داخل n8n مباشرة (مقبول جزئيًا كتنسيق خارجي)، أو `fetch()` مباشر داخل `whatsapp.service.ts` (مخالفة صريحة، ويجب أن يُزال هذا المسار بالكامل أصلاً حسب §2.1) |
| WhatsApp Adapter | Infrastructure gateway واحد فقط | ✅ يوجد فعليًا `BaileysWhatsAppGateway` يُنفّذ `INotificationGateway` — لكنه **لا يُستخدَم حصريًا**؛ `whatsapp.service.ts` يحتوي منطق أعمال كامل (وليس مجرد بوابة نقل) بموازاته |
| n8n Integration | يُعامَل كـOrchestration Layer خارجي يستدعي Use Cases عبر HTTP (نمط API Gateway) | ✅ هذا هو النمط الفعلي المُتَّبع أصلاً بشكل صحيح مبدئيًا، لكن نصف الأدوات التي يستدعيها تصل لطبقة SQL خام مباشرة بدل Use Cases |
| Business Logic داخل الـPrompt | يجب ألا توجد إطلاقًا | ❌ موجودة فعليًا — أسعار وأسماء صالون مكتوبة حرفيًا كـFallback داخل الكود المصدري نفسه (`liveSyncedState`)، وهذا أسوأ من كونها في الـPrompt فقط: إنها بيانات **مُصرَّح بها ضمنيًا كحقيقة** عند فشل قاعدة البيانات |

**التوصية المعمارية الأساسية**: تعميم نمط `usecases/waitlist/*` (الأفضل هندسيًا في المشروع بالكامل)
على كل مسار في `agentTools.routes.ts` دون استثناء، وحذف كل استدعاء SQL خام من داخل ملفات الـRoutes.

---

## 21. التنفيذ المرحلي (Implementation Roadmap)

### Phase 1 — توحيد محرك المحادثة (الأولوية القصوى المطلقة)
- **الهدف**: إزالة الازدواجية الجذرية (§2.1) — مصدر رد واحد فقط لكل رسالة.
- **المكوّنات**: `whatsapp.service.ts` (تحويله لطبقة نقل فقط، حذف `handleIncomingWithAI` ومنطقها
  بالكامل)، Workflow 01/02 في n8n.
- **التغييرات**: حذف الاستدعاء المزدوج، توحيد نقطة الرد.
- **Dependencies**: لا شيء (يمكن البدء فورًا، هذا هو الإصلاح الأخطر أثرًا).
- **Risks**: فقدان مؤقت لأي وظيفة كانت تعمل فقط في المسار المحلي (الاستشارات العامة، الترحيب
  البديل) — يجب نقلها لمنطق n8n الموحّد أولاً قبل الحذف.
- **Acceptance Criteria**: رسالة واحدة → رد واحد فقط، دائمًا، تحت أي ظرف (اختبار §19 الأخير).

### Phase 2 — Conversation State & Context (قاعدة بيانات دائمة)
- **الهدف**: إنهاء فقدان الذاكرة عند إعادة التشغيل.
- **المكوّنات**: جدولا `conversation_sessions`/`conversation_messages` (§6.1)، آلة الحالة (§4).
- **Dependencies**: Phase 1 (لا فائدة من ذاكرة موحّدة إن بقي محرّكان يكتبان فيها بتعارض).
- **Risks**: هجرة الذاكرة الحالية (In-Memory) — لا حاجة لهجرة بيانات قديمة فعليًا (تُفقَد أصلاً عند
  أي Restart)، فقط بدء تشغيل الجدولين الجديدين.
- **Acceptance Criteria**: إعادة تشغيل الـBackend/n8n بالكامل أثناء محادثة نشطة لا تفقد أي سياق.

### Phase 3 — إصلاح أدوات قاعدة البيانات الحرجة
- **الهدف**: إصلاح الأعطال الملموسة الثلاثة (§0): `create-pending` بلا رد، `check_availability`
  Stub، `submit_payment_proof` تلوث العملاء.
- **Dependencies**: Phase 2 (يفيد استخدام `idempotencyKey` الحقيقي).
- **Risks**: تغيير سلوك `check_availability` من "دائمًا متاح" لفحص حقيقي قد يُظهر فجأة "مواعيد غير
  متاحة" كانت تبدو متاحة سابقًا (خطر انطباع سلبي إن لم يُصاحَب باقتراح بدائل جيد، §4.1).
- **Acceptance Criteria**: اختبارات §19 (التكرار، الدفع، تعارض الحجز) تنجح كلها.

### Phase 4 — Database Tools الكاملة (توسيع الأدوات)
- **الهدف**: إضافة الأدوات الناقصة (`get_packages`, `handoff_to_reception`, `update_booking_draft`).
- **Dependencies**: Phase 3.
- **Risks**: منخفضة (إضافات جديدة، لا تعديل على مسارات قائمة).
- **Acceptance Criteria**: كل سيناريو في §19 له أداة مخصصة تغطيه دون Workaround.

### Phase 5 — AI Prompt Architecture
- **الهدف**: تفكيك الـPrompt الضخم الواحد لطبقات (§14)، دمج Intent/Entities الصريح (§3.2).
- **Dependencies**: Phase 2 (السياق المنظّم يحتاج الجداول الجديدة).
- **Risks**: منخفضة-متوسطة (يحتاج ضبط دقيق/Prompt Engineering تكراري بعد النشر).
- **Acceptance Criteria**: عدم إعادة سؤال حقل مُجاب عنه (§8) في 100% من اختبارات §19 ذات الصلة.

### Phase 6 — Booking Engine (Normal + Custom)
- **الهدف**: تفعيل مسار `custom_pricing_requested` الكامل (§9)، ربط `WhatsAppCustomPricingModal.tsx`
  الموجود فعليًا بمسار حقيقي.
- **Dependencies**: Phase 3، Phase 4.
- **Risks**: منخفضة (يبني على مكوّن واجهة موجود فعلاً).
- **Acceptance Criteria**: طلب حر ("قص شعر ودقن وماسك حسب ما الكابتن يشوف") يصل فعليًا لموظف الاستقبال
  عبر الواجهة الموجودة، بلا اختراع سعر من الـAI.

### Phase 7 — Payment Flow الآمن
- **الهدف**: تنفيذ §11 بالكامل (جدول `payment_proofs` الحقيقي، رفض الربط غير المؤكد).
- **Dependencies**: Phase 2، Phase 3.
- **Risks**: متوسطة (تغيير سلوك حرج ماليًا — يحتاج اختبارًا موازيًا (Shadow Mode) قبل التفعيل الكامل).
- **Acceptance Criteria**: اختبارات §19 (فئة "دفع") تنجح 100%، لا حالة تلوث واحدة ممكنة نظريًا.

### Phase 8 — Queue & Notifications
- **الهدف**: توحيد `confirm_arrival` (حذف SQL المباشر المتبقي من المسار المحلي)، إكمال الإشعارات
  الناقصة (Queue Almost Ready، Delay).
- **Dependencies**: Phase 1، Phase 2.
- **Risks**: منخفضة.
- **Acceptance Criteria**: لا يوجد أي `UPDATE bookings` مباشر خارج طبقة Use Cases في كامل مسار الواتساب.

### Phase 9 — Human Handoff
- **الهدف**: تفعيل `handoff_to_reception` كأداة يستدعيها النموذج (§10)، بدل كلمات مفتاحية معزولة.
- **Dependencies**: Phase 4، Phase 5.
- **Risks**: منخفضة.
- **Acceptance Criteria**: كل معايير التفعيل في §10.2 تعمل، والملخص يصل كاملاً للوحة الموظف.

### Phase 10 — Security & Scalability
- **الهدف**: تنفيذ كل بنود §17 (حذف السرّ الافتراضي، فصل الصلاحيات، تشديد المطابقة، توقيع Webhook).
- **Dependencies**: يمكن تنفيذ أغلبها بالتوازي مع Phase 1-9، لكن يجب إغلاقها قبل أي إطلاق إنتاجي فعلي.
- **Risks**: عالية إن أُهمِلت (ثغرات إلغاء/تسريب حقيقية موثّقة بالفعل من الكود).
- **Acceptance Criteria**: اختبارات §19 (فئة "أمان") تنجح كاملة؛ لا قيمة سرّ افتراضية متبقية في أي
  ملف مصدري.

### Phase 11 — Testing & Production Verification
- **الهدف**: تنفيذ مصفوفة §19 كاملة كاختبارات آلية متكررة (وليس يدوية فقط كما هو حال
  `docs/WHATSAPP_AI_TESTING.md` الحالي)، بما فيها اختبار "رد واحد فقط" الانحداري الخاص بهذا المشروع.
- **Dependencies**: كل المراحل السابقة.
- **Risks**: —
- **Acceptance Criteria**: كل سيناريو في §19 مؤتمت وأخضر باستمرار قبل أي نشر جديد.

---

## 22. الخلاصة

النظام الحالي يملك أساسًا هندسيًا جيدًا في أجزاء محدَّدة منه (Waitlist Use Cases، معاملات الحجز
الأساسية بقفل صفوف حقيقي، صفحة ربط واتساب، مخطط قاعدة بيانات غني ومُصمَّم جيدًا أصلاً بما يفوق حاليًا
ما يُستخدَم منه فعليًا) — المشكلة ليست غياب الأدوات الصحيحة، بل **وجود مسارين متوازيين غير منسّقين
لكل شيء تقريبًا**: محركا AI، مصدرا بيانات (MySQL مقابل حالة ذاكرة محلية بها بيانات صالون آخر مبرمجة
صراحة)، وطبقتا كتابة للدفعات (جدول منظم مقابل عمود JSON خام). توحيد هذه المسارات — لا اختراع تقنية
جديدة — هو جوهر التحوّل المطلوب لمساعد واتساب ذكي وموثوق فعلاً.
