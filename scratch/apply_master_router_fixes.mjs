import https from 'https';
import fs from 'fs';

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

const normalizeJsCode = `
const body = $json.body || $json;
const data = body.data || {};
const key = data.key || body.key || {};
const messageId = key.id || data.id || body.id || ('msg-' + Date.now());
const fromMe = key.fromMe || body.fromMe;
const remoteJid = key.remoteJid || data.remoteJid || body.remoteJid || '';
const pushName = data.pushName || body.pushName || '';

if (fromMe) {
  return [];
}

const candidate = key.remoteJidAlt || key.participant || data.participant || remoteJid;
let rawPhone = candidate.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '').replace(/[^0-9]/g, '');
let cleanPhone = rawPhone;

if (cleanPhone.startsWith('20') && cleanPhone.length === 12) {
  cleanPhone = '0' + cleanPhone.substring(2);
}

const isStandardEgyptianPhone = cleanPhone.startsWith('01') && cleanPhone.length === 11;
const realPhone = isStandardEgyptianPhone ? cleanPhone : '';

const message = data.message || body.message || {};
const isImage = Boolean(message.imageMessage || body.isImage || body.imageUrl || data.imageUrl);
const imageUrl = body.imageUrl || data.imageUrl || data.mediaUrl || body.mediaUrl || null;

const textMessage = message.conversation || 
                    message.extendedTextMessage?.text || 
                    message.imageMessage?.caption || 
                    message.documentMessage?.caption || 
                    body.text || '';

if (!textMessage.trim() && !isImage) {
  return [];
}

return [{
  json: {
    messageId,
    remoteJid,
    phone: realPhone || rawPhone || remoteJid.replace('@s.whatsapp.net', '').replace('@lid', ''),
    realPhone,
    rawPhone,
    pushName,
    chatInput: textMessage.trim(),
    text: textMessage.trim(),
    input: textMessage.trim(),
    isImage,
    imageUrl,
    mediaUrl: imageUrl,
    rawMessage: message,
    instance: body.instance || 'trimmind_salon',
    timestamp: new Date().toISOString()
  }
}];
`;

async function run() {
  console.log('Fetching workflow 01 from n8n...');
  const wf = await request('GET', '/api/v1/workflows/3pYK2pNf9ymIxL4U');

  // 1. Update Normalize Incoming Message node
  const normNode = wf.nodes.find(n => n.name === 'Normalize Incoming Message');
  if (normNode) {
    normNode.parameters.jsCode = normalizeJsCode.trim();
  }

  // 2. Update Execute AI Chat via Salon Backend node
  let aiChatNode = wf.nodes.find(n => n.name === 'Execute AI Chat via Salon Backend');
  if (!aiChatNode) {
    aiChatNode = {
      name: 'Execute AI Chat via Salon Backend',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.1,
      position: [880, 400],
      id: 'backend-ai-chat-node',
      parameters: {}
    };
    wf.nodes.push(aiChatNode);
  }

  aiChatNode.parameters = {
    method: 'POST',
    url: 'https://trimmind.up.railway.app/api/ai/chat',
    authentication: 'none',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: 'Content-Type',
          value: 'application/json'
        },
        {
          name: 'x-agent-secret',
          value: 'trim-mind-agent-secret-key-2026'
        }
      ]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{
JSON.stringify({
  messageId: $json.messageId,
  remoteJid: $json.remoteJid,
  phone: $json.realPhone || $json.phone,
  rawPhone: $json.rawPhone,
  pushName: $json.pushName,
  text: $json.text
})
}}`,
    options: {}
  };

  // 3. Add Filter / Check Duplicate before sending
  const shouldSendNode = {
    name: 'Check If Response Is Valid & Not Duplicate',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [1060, 400],
    id: 'check-not-duplicate-node',
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict'
        },
        conditions: [
          {
            id: 'cond-not-dup',
            leftValue: '={{ $json.isDuplicate }}',
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'notEquals'
            }
          },
          {
            id: 'cond-has-text',
            leftValue: '={{ ($json.text || "").trim().length }}',
            rightValue: 0,
            operator: {
              type: 'number',
              operation: 'gt'
            }
          }
        ],
        combinator: 'and'
      }
    }
  };

  // Replace or add node
  const filteredNodes = wf.nodes.filter(n => n.name !== 'Check If Response Is Valid & Not Duplicate');
  filteredNodes.push(shouldSendNode);
  wf.nodes = filteredNodes;

  // 4. Update Send WhatsApp Reply node
  const sendNode = wf.nodes.find(n => n.name === 'Send WhatsApp Reply via Salon Backend');
  if (sendNode) {
    sendNode.position = [1300, 300];
    sendNode.parameters = {
      method: 'POST',
      url: 'https://trimmind.up.railway.app/api/whatsapp-session/send',
      authentication: 'none',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'x-agent-secret',
            value: 'trim-mind-agent-secret-key-2026'
          },
          {
            name: 'Content-Type',
            value: 'application/json'
          }
        ]
      },
      sendBody: true,
      specifyBody: 'keypair',
      bodyParameters: {
        parameters: [
          {
            name: 'to',
            value: "={{ $('Normalize Incoming Message').item.json.remoteJid || $('Normalize Incoming Message').item.json.phone }}"
          },
          {
            name: 'text',
            value: '={{ $json.output || $json.replyText || $json.text }}'
          }
        ]
      },
      options: {}
    };
  }

  // 5. Update connections
  wf.connections = {
    'Evolution API Webhook': {
      main: [[{ node: 'Normalize Incoming Message', type: 'main', index: 0 }]]
    },
    'Normalize Incoming Message': {
      main: [[{ node: 'Is Payment Proof Image?', type: 'main', index: 0 }]]
    },
    'Is Payment Proof Image?': {
      main: [
        [{ node: 'Execute Payment Proof Handler', type: 'main', index: 0 }],
        [{ node: 'Execute AI Chat via Salon Backend', type: 'main', index: 0 }]
      ]
    },
    'Execute Payment Proof Handler': {
      main: [[{ node: 'Send WhatsApp Reply via Salon Backend', type: 'main', index: 0 }]]
    },
    'Execute AI Chat via Salon Backend': {
      main: [[{ node: 'Check If Response Is Valid & Not Duplicate', type: 'main', index: 0 }]]
    },
    'Check If Response Is Valid & Not Duplicate': {
      main: [
        [{ node: 'Send WhatsApp Reply via Salon Backend', type: 'main', index: 0 }],
        []
      ]
    }
  };

  console.log('Saving workflow 01 to local JSON...');
  fs.writeFileSync('d:\\حلاقه\\n8n\\workflows\\01_WhatsApp_Master_Router.json', JSON.stringify(wf, null, 2));

  console.log('Pushing updated workflow 01 to n8n server...');
  await request('PUT', '/api/v1/workflows/3pYK2pNf9ymIxL4U', {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings
  });

  const act = await request('POST', '/api/v1/workflows/3pYK2pNf9ymIxL4U/activate');
  console.log('Workflow 01 Activated on n8n:', act.active);
}

run().catch(console.error);
