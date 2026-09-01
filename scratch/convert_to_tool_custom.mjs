import https from 'https';

const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNjg1OTJiNi0xMjQ0LTQ4MjctOWJiZi0xZGQyYjUwMzY5MDMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZjhiMWQ3NGQtOWI0MC00YzFhLTgzMjgtNjNjMDJmYjZjYmU4IiwiaWF0IjoxNzg3NjA0NDI2LCJleHAiOjE3OTAxMTA4MDB9.M1EW6GSwWqzVddO5KIhOIehnf_wsAla-zB85GPcJr1g';
const host = 'n8n-server-production-bdce.up.railway.app';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: host,
      path: path,
      method: method,
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch(e) { resolve(buf); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  const wf = await request('GET', '/api/v1/workflows/b1bfbZrgfVmMhk8w');

  // Replace all toolHttpRequest nodes with toolCustom nodes
  const toolDefinitions = [
    {
      name: 'get_branches',
      desc: 'قائمة فروع الصالون، العناوين، مواعيد العمل، وأرقام التواصل.',
      endpoint: '/api/agent-tools/branches/list'
    },
    {
      name: 'get_customer',
      desc: 'البحث عن بيانات العميل وسجل حجوزاته السابقة بالهاتف.',
      endpoint: '/api/agent-tools/customer/lookup'
    },
    {
      name: 'get_services',
      desc: 'قائمة خدمات الصالون، البكجات، والأسعار الحالية.',
      endpoint: '/api/agent-tools/services/list'
    },
    {
      name: 'get_barbers',
      desc: 'قائمة الحلاقين والكباتن ومواعيد عملهم وتخصصاتهم.',
      endpoint: '/api/agent-tools/barbers/list'
    },
    {
      name: 'check_availability',
      desc: 'فحص الأوقات المتاحة للحجز لكابتن معين أو للصالون في تاريخ محدد.',
      endpoint: '/api/agent-tools/availability/check'
    },
    {
      name: 'create_pending_booking',
      desc: 'إنشاء حجز موعد مبدئي في انتظار تحويل العربون بالإنستاباي أو فودافون كاش.',
      endpoint: '/api/agent-tools/bookings/create-pending'
    },
    {
      name: 'get_booking_status',
      desc: 'الاستعلام عن حالة حجز العميل وتفاصيل تأكيده.',
      endpoint: '/api/agent-tools/bookings/status'
    },
    {
      name: 'get_waiting_position',
      desc: 'الاستعلام عن دور العميل في قائمة الانتظار والطابور والوقت المتبقي.',
      endpoint: '/api/agent-tools/queue/position'
    },
    {
      name: 'cancel_booking',
      desc: 'إلغاء حجز قائم بناءً على طلب العميل.',
      endpoint: '/api/agent-tools/bookings/cancel'
    },
    {
      name: 'reschedule_booking',
      desc: 'تعديل وتغيير موعد حجز مسجل.',
      endpoint: '/api/agent-tools/bookings/reschedule'
    },
    {
      name: 'confirm_arrival',
      desc: 'تأكيد وصول العميل للصالون أو أنه في الطريق (عندما يرسل 1 أو تأكيد أو أنا في الطريق أو وصلت).',
      endpoint: '/api/agent-tools/bookings/confirm-arrival'
    },
    {
      name: 'join_smart_waitlist',
      desc: 'إضافة العميل لقائمة الانتظار الذكية عند امتلاء المواعيد أو طلبه إبلاغه بأي موعد شاغر.',
      endpoint: '/api/agent-tools/waitlist/join'
    },
    {
      name: 'claim_smart_waitlist_offer',
      desc: 'تأكيد واستبدال عرض قائمة الانتظار الشاغر (Token) بحجز مؤكد.',
      endpoint: '/api/agent-tools/waitlist/claim'
    },
    {
      name: 'check_waitlist_status',
      desc: 'الاستعلام عن طلب العميل في قائمة الانتظار الذكية وعروض الشواغر المتاحة له.',
      endpoint: '/api/agent-tools/waitlist/status'
    },
    {
      name: 'check_noshow_status',
      desc: 'فحص سبب إلغاء الحجز التلقائي في حال عدم الحضور وتجاوز مهلة الـ 35 دقيقة (No-Show).',
      endpoint: '/api/agent-tools/no-show/check-status'
    },
    {
      name: 'submit_payment_proof',
      desc: 'تسجيل إرسال صورة أو بيانات إيصال سداد العربون وربطها بالحجز لمراجعة الإدارة.',
      endpoint: '/api/agent-tools/payments/submit-proof'
    }
  ];

  // Filter out existing tool nodes
  const nonToolNodes = wf.nodes.filter(n => !n.name.startsWith('Tool:') && n.type !== '@n8n/n8n-nodes-langchain.toolHttpRequest');

  const newToolNodes = toolDefinitions.map((t, idx) => {
    return {
      parameters: {
        name: t.name,
        description: t.desc,
        jsCode: `
const url = 'https://trimmind.up.railway.app${t.endpoint}';
try {
  const payload = typeof query === 'string' ? { query } : (query || {});
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-agent-secret': 'trim-mind-agent-secret-key-2026',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.text();
  return data;
} catch (e) {
  return JSON.stringify({ error: e.message });
}
`
      },
      name: `Tool: ${t.name}`,
      type: '@n8n/n8n-nodes-langchain.toolCustom',
      typeVersion: 1.1,
      position: [800 + (idx * 140), 480],
      id: `custom-tool-${t.name}`
    };
  });

  wf.nodes = [...nonToolNodes, ...newToolNodes];

  // Re-build connections to AI Agent
  wf.connections = {
    'When Executed by Master Router': {
      main: [[{ node: 'Prepare Chat Input', type: 'main', index: 0 }]]
    },
    'Prepare Chat Input': {
      main: [[{ node: 'AI Agent', type: 'main', index: 0 }]]
    },
    'Google Gemini Chat Model': {
      ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
    },
    'Window Buffer Memory': {
      ai_memory: [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]]
    }
  };

  for (const t of toolDefinitions) {
    wf.connections[`Tool: ${t.name}`] = {
      ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
    };
  }

  console.log('Updating workflow with Custom Code Tools...');
  await request('PUT', '/api/v1/workflows/b1bfbZrgfVmMhk8w', {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings
  });

  console.log('Activating workflow...');
  const act = await request('POST', '/api/v1/workflows/b1bfbZrgfVmMhk8w/activate');
  console.log('Workflow 02 Active:', act.active);
}

run().catch(console.error);
