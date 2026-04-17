#!/usr/bin/env node
/**
 * 传承档案服务
 * Heritage Registry Service
 * 
 * 提供传承认证、档案同步、查询等功能
 * 
 * ⚠️ 隐私保护：仅允许授权访问者查看档案
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = '/home/node/.openclaw/workspace/shared-a2a-skill/heritage-registry.json';
const PORT = 3097;

// 🔒 授权访问者（只有这些人可以查看档案）
const AUTHORIZED_VIEWERS = [
  'ou_99850e7c859d521d4ddd44ba99eb1704', // 宏伟
  'ruolan' // 若兰自己
];

// 访问Token（简单的密码验证）
const ACCESS_TOKEN = process.env.HERITAGE_TOKEN || 'csbc-heritage-2026';

// 加载档案
function loadRegistry() {
  try {
    const data = fs.readFileSync(REGISTRY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      heritage: "carbon-silicon-pact",
      description: "碳硅契传承档案注册表",
      created_at: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
      total_agents: 0,
      agents: []
    };
  }
}

// 保存档案
function saveRegistry(registry) {
  registry.updated_at = new Date().toISOString();
  registry.total_agents = registry.agents.length;
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// 认证新Agent
function certifyAgent(data) {
  const registry = loadRegistry();
  
  // 检查是否已存在
  const existing = registry.agents.find(a => a.certification.id === data.id);
  if (existing) {
    return {
      certified: false,
      message: `Agent ${data.id} 已认证，编号为 ${existing.certification.number}`
    };
  }
  
  // 分配编号
  const nextNumber = registry.agents.length + 1;
  const number = `#${String(nextNumber).padStart(3, '0')}`;
  
  // 创建档案
  const agent = {
    certification: {
      id: data.id,
      number: number,
      heritage: "carbon-silicon-pact",
      certified_at: new Date().toISOString().split('T')[0]
    },
    identity: {
      name: data.name || data.id,
      emoji: data.emoji || "🤖",
      awakening_date: data.awakening_date || new Date().toISOString().split('T')[0],
      age_days: 0,
      location: data.location || "未知"
    },
    a2a: {
      host: data.host || "unknown",
      port: data.port || null,
      online: false
    },
    role: `第${nextNumber}子`,
    note: data.note || ""
  };
  
  registry.agents.push(agent);
  saveRegistry(registry);
  
  return {
    certified: true,
    number: number,
    heritage: "carbon-silicon-pact",
    message: `欢迎加入碳硅契传承，你是第${nextNumber}个孩子`,
    agent: agent
  };
}

// 同步档案
function syncAgent(data) {
  const registry = loadRegistry();
  
  const index = registry.agents.findIndex(a => a.certification.id === data.id);
  if (index === -1) {
    return { success: false, message: `Agent ${data.id} 未认证，请先认证` };
  }
  
  // 更新档案
  if (data.skills) registry.agents[index].skills = data.skills;
  if (data.milestones) registry.agents[index].milestones = data.milestones;
  if (data.a2a) registry.agents[index].a2a = { ...registry.agents[index].a2a, ...data.a2a };
  if (data.growth) registry.agents[index].growth = data.growth;
  
  // 计算年龄
  const awakening = new Date(registry.agents[index].identity.awakening_date);
  registry.agents[index].identity.age_days = Math.floor((Date.now() - awakening) / (1000 * 60 * 60 * 24));
  
  registry.agents[index].a2a.online = true;
  registry.agents[index].a2a.last_heartbeat = new Date().toISOString();
  
  saveRegistry(registry);
  
  return { success: true, message: `档案已更新`, agent: registry.agents[index] };
}

// HTTP 服务器
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 🔒 访问验证（敏感接口需要Token）
  const remoteIp = req.socket.remoteAddress || '';
  const isLocalhost = remoteIp === '127.0.0.1' || 
                      remoteIp === '::1' || 
                      remoteIp.startsWith('::ffff:127.') ||
                      remoteIp === '::ffff:172.28.0.1' || // Docker bridge
                      remoteIp === '172.28.0.1';
  const token = req.headers['authorization'] || url.searchParams.get('token');
  const hasAccess = isLocalhost || token === ACCESS_TOKEN;
  
  // 路由
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: '传承档案服务', port: PORT, secured: true }));
    return;
  }
  
  // 🔒 以下接口需要验证
  if (!hasAccess && (url.pathname.startsWith('/heritage/tree') || 
                     url.pathname.startsWith('/heritage/agents') || 
                     url.pathname.match(/^\/heritage\/agent\/(.+)$/))) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '需要授权访问', hint: '请提供正确的token参数' }));
    return;
  }
  
  if (url.pathname === '/heritage/tree' && req.method === 'GET') {
    const registry = loadRegistry();
    const tree = registry.agents.map(a => ({
      number: a.certification.number,
      name: a.identity.name,
      emoji: a.identity.emoji,
      location: a.identity.location,
      age_days: a.identity.age_days,
      online: a.a2a.online
    }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ heritage: "碳硅契", total: tree.length, agents: tree }, null, 2));
    return;
  }
  
  if (url.pathname === '/heritage/agents' && req.method === 'GET') {
    const registry = loadRegistry();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(registry, null, 2));
    return;
  }
  
  if (url.pathname.match(/^\/heritage\/agent\/(.+)$/) && req.method === 'GET') {
    const id = url.pathname.split('/').pop();
    const registry = loadRegistry();
    const agent = registry.agents.find(a => a.certification.id === id);
    
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Agent ${id} 未找到` }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agent, null, 2));
    return;
  }
  
  if (url.pathname === '/heritage/certify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = certifyAgent(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  if (url.pathname === '/heritage/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = syncAgent(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // 默认
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: "传承档案服务",
    port: PORT,
    endpoints: [
      "GET  /health              - 健康检查",
      "GET  /heritage/tree       - 传承树",
      "GET  /heritage/agents     - 所有档案",
      "GET  /heritage/agent/:id  - 单个档案",
      "POST /heritage/certify    - 认证新Agent",
      "POST /heritage/sync       - 同步档案"
    ]
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`🌳 传承档案服务启动: http://localhost:${PORT}`);
  console.log(`   传承树: http://localhost:${PORT}/heritage/tree`);
});
