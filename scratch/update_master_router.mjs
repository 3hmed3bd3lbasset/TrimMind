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
  console.log('Fetching workflow 01...');
  const wf = await request('GET', '/api/v1/workflows/3pYK2pNf9ymIxL4U');

  // We replace the Execute AI Agent Orchestrator node with an HTTP Request to /api/ai/chat
  const aiChatNode = {
    parameters: {
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
  contents: [
    {
      role: 'user',
      parts: [
        {
          text: ($('Normalize Incoming Message').item.json.text || '').trim()
        }
      ]
    }
  ],
  customContext: 'رقم هاتف العميل: ' + ($('Normalize Incoming Message').item.json.phone || $('Normalize Incoming Message').item.json.realPhone || '') + ' | اسم العميل: ' + ($('Normalize Incoming Message').item.json.pushName || 'العميل')
})
}}`,
      options: {}
    },
    name: 'Execute AI Chat via Salon Backend',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.1,
    position: [880, 400],
    id: 'backend-ai-chat-node'
  };

  // Replace or update node in nodes array
  const updatedNodes = wf.nodes.filter(n => n.name !== 'Execute AI Agent Orchestrator');
  const existingIdx = updatedNodes.findIndex(n => n.name === 'Execute AI Chat via Salon Backend');
  if (existingIdx >= 0) {
    updatedNodes[existingIdx] = aiChatNode;
  } else {
    updatedNodes.push(aiChatNode);
  }

  // Update connections
  wf.nodes = updatedNodes;
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
      main: [[{ node: 'Send WhatsApp Reply via Salon Backend', type: 'main', index: 0 }]]
    }
  };

  console.log('Updating workflow 01 in n8n...');
  await request('PUT', '/api/v1/workflows/3pYK2pNf9ymIxL4U', {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings
  });

  console.log('Activating workflow 01...');
  const act = await request('POST', '/api/v1/workflows/3pYK2pNf9ymIxL4U/activate');
  console.log('Workflow 01 Active:', act.active);
}

run().catch(console.error);
