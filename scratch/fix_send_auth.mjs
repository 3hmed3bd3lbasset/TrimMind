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

  for (const n of wf.nodes) {
    if (n.name === 'Send WhatsApp Reply via Salon Backend') {
      n.parameters.sendHeaders = true;
      n.parameters.headerParameters = {
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
      };
      console.log('Added x-agent-secret header to:', n.name);
    }
  }

  await request('PUT', '/api/v1/workflows/3pYK2pNf9ymIxL4U', {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings
  });

  const act = await request('POST', '/api/v1/workflows/3pYK2pNf9ymIxL4U/activate');
  console.log('Workflow 01 Activated:', act.active);
}

run().catch(console.error);
