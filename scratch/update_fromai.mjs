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

  const toolParams = {
    'Tool: get_branches': [{ name: 'branchId', type: 'string', desc: 'معرف الفرع اختياري' }],
    'Tool: get_customer': [{ name: 'phone', type: 'string', desc: 'رقم هاتف العميل' }],
    'Tool: get_services': [{ name: 'category', type: 'string', desc: 'تصنيف الخدمات اختياري' }],
    'Tool: get_barbers': [{ name: 'branchId', type: 'string', desc: 'معرف الفرع اختياري' }],
    'Tool: check_availability': [
      { name: 'date', type: 'string', desc: 'التاريخ بصيغة YYYY-MM-DD' },
      { name: 'barberId', type: 'string', desc: 'معرف الحلاق اختياري' },
      { name: 'serviceId', type: 'string', desc: 'معرف الخدمة اختياري' }
    ],
    'Tool: create_pending_booking': [
      { name: 'customerName', type: 'string', desc: 'اسم العميل' },
      { name: 'phone', type: 'string', desc: 'رقم هاتف العميل' },
      { name: 'serviceId', type: 'string', desc: 'معرف الخدمة' },
      { name: 'startsAt', type: 'string', desc: 'تاريخ ووقت الموعد' },
      { name: 'barberId', type: 'string', desc: 'معرف الحلاق اختياري' }
    ],
    'Tool: get_booking_status': [{ name: 'bookingId', type: 'string', desc: 'رقم الحجز أو الهاتف' }],
    'Tool: get_waiting_position': [{ name: 'phone', type: 'string', desc: 'رقم هاتف العميل' }],
    'Tool: cancel_booking': [
      { name: 'bookingId', type: 'string', desc: 'رقم الحجز' },
      { name: 'phone', type: 'string', desc: 'رقم الهاتف' }
    ],
    'Tool: reschedule_booking': [
      { name: 'bookingId', type: 'string', desc: 'رقم الحجز' },
      { name: 'newStartsAt', type: 'string', desc: 'الموعد الجديد' },
      { name: 'phone', type: 'string', desc: 'رقم الهاتف' }
    ],
    'Tool: confirm_arrival': [
      { name: 'phone', type: 'string', desc: 'رقم الهاتف' },
      { name: 'bookingId', type: 'string', desc: 'رقم الحجز اختياري' }
    ],
    'Tool: join_smart_waitlist': [
      { name: 'phone', type: 'string', desc: 'رقم الهاتف' },
      { name: 'customerName', type: 'string', desc: 'اسم العميل' },
      { name: 'preferredDate', type: 'string', desc: 'التاريخ المفضل' }
    ],
    'Tool: claim_smart_waitlist_offer': [{ name: 'token', type: 'string', desc: 'كود العرض' }],
    'Tool: check_waitlist_status': [{ name: 'phone', type: 'string', desc: 'رقم الهاتف' }],
    'Tool: check_noshow_status': [
      { name: 'phone', type: 'string', desc: 'رقم الهاتف' },
      { name: 'bookingId', type: 'string', desc: 'رقم الحجز اختياري' }
    ],
    'Tool: submit_payment_proof': [
      { name: 'phone', type: 'string', desc: 'رقم الهاتف' },
      { name: 'bookingId', type: 'string', desc: 'رقم الحجز اختياري' },
      { name: 'transferredAmount', type: 'number', desc: 'المبلغ المحول' }
    ]
  };

  for (const n of wf.nodes) {
    if (toolParams[n.name]) {
      n.parameters.sendBody = true;
      n.parameters.specifyBody = 'keypair';
      delete n.parameters.specifyInputSchema;
      delete n.parameters.inputSchema;
      delete n.parameters.jsonSchema;
      delete n.parameters.schemaType;
      n.parameters.parametersBody = {
        values: toolParams[n.name].map(p => ({
          name: p.name,
          value: '={{ $fromAI("' + p.name + '", "' + p.desc + '", "' + p.type + '") }}'
        }))
      };
      console.log('Configured typed $fromAI for:', n.name);
    }
  }

  await request('PUT', '/api/v1/workflows/b1bfbZrgfVmMhk8w', {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings
  });

  const act = await request('POST', '/api/v1/workflows/b1bfbZrgfVmMhk8w/activate');
  console.log('Workflow 02 Active:', act.active);
}

run().catch(console.error);
