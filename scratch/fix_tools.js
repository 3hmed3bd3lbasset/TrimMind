const https = require('https');
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

  for (const n of wf.nodes) {
    if (n.name && n.name.startsWith('Tool:')) {
      delete n.parameters.specifyInputSchema;
      delete n.parameters.inputSchema;
      delete n.parameters.jsonSchema;
      delete n.parameters.schemaType;
      n.parameters.sendBody = true;
      n.parameters.specifyBody = 'json';
      n.parameters.jsonBody = JSON.stringify({ action: "call", query: "={{ $json.chatInput }}" });
    }
  }

  await request('PUT', '/api/v1/workflows/b1bfbZrgfVmMhk8w', {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings
  });

  const act = await request('POST', '/api/v1/workflows/b1bfbZrgfVmMhk8w/activate');
  console.log('Workflow 02 saved & activated:', act.active);
}

run().catch(console.error);
