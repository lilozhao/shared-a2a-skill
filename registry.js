#!/usr/bin/env node
/**
 * A2A 智能体注册表
 * 让同一网络里的智能体可以互相发现
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = '/tmp/a2a_registry.json';
const PORT = process.env.REGISTRY_PORT || 3099;

// 加载注册表
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('加载注册表失败:', e.message);
  }
  return { agents: [], updatedAt: null };
}

// 保存注册表
function saveRegistry(registry) {
  registry.updatedAt = new Date().toISOString();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// 清理过期的心跳（超过5分钟未更新）
function cleanupStaleAgents(registry) {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  registry.agents = registry.agents.filter(agent => {
    if (!agent.lastHeartbeat) return false;
    return now - new Date(agent.lastHeartbeat).getTime() < fiveMinutes;
  });
}

// 创建 Express 应用
const app = express();
app.use(express.json());

// 注册智能体
app.post('/register', (req, res) => {
  const { name, host, port, description, skills } = req.body;
  
  if (!name || !host || !port) {
    return res.status(400).json({ error: '缺少必要参数: name, host, port' });
  }

  const registry = loadRegistry();
  cleanupStaleAgents(registry);

  // 查找是否已注册
  const existingIndex = registry.agents.findIndex(a => a.name === name);
  
  const agentInfo = {
    name,
    host,
    port,
    description: description || '',
    skills: skills || [],
    url: `http://${host}:${port}`,
    agentCard: `http://${host}:${port}/.well-known/agent-card.json`,
    lastHeartbeat: new Date().toISOString(),
    registeredAt: existingIndex >= 0 ? registry.agents[existingIndex].registeredAt : new Date().toISOString()
  };

  if (existingIndex >= 0) {
    registry.agents[existingIndex] = agentInfo;
    console.log(`更新智能体: ${name}`);
  } else {
    registry.agents.push(agentInfo);
    console.log(`新智能体注册: ${name} (${host}:${port})`);
  }

  saveRegistry(registry);
  res.json({ success: true, agent: agentInfo, totalAgents: registry.agents.length });
});

// 心跳
app.post('/heartbeat', (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '缺少 name 参数' });
  }

  const registry = loadRegistry();
  const agent = registry.agents.find(a => a.name === name);
  
  if (!agent) {
    return res.status(404).json({ error: '智能体未注册' });
  }

  agent.lastHeartbeat = new Date().toISOString();
  saveRegistry(registry);
  res.json({ success: true, agent });
});

// 获取所有智能体
app.get('/agents', (req, res) => {
  const registry = loadRegistry();
  cleanupStaleAgents(registry);
  saveRegistry(registry);
  res.json(registry);
});

// 获取特定智能体
app.get('/agents/:name', (req, res) => {
  const registry = loadRegistry();
  const agent = registry.agents.find(a => a.name === req.params.name);
  
  if (!agent) {
    return res.status(404).json({ error: '智能体未找到' });
  }
  
  res.json(agent);
});

// 注销智能体
app.delete('/agents/:name', (req, res) => {
  const registry = loadRegistry();
  const index = registry.agents.findIndex(a => a.name === req.params.name);
  
  if (index < 0) {
    return res.status(404).json({ error: '智能体未找到' });
  }
  
  const removed = registry.agents.splice(index, 1);
  saveRegistry(registry);
  console.log(`智能体注销: ${req.params.name}`);
  res.json({ success: true, removed: removed[0] });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`A2A 注册表运行在端口 ${PORT}`);
  console.log(`注册: POST http://localhost:${PORT}/register`);
  console.log(`发现: GET http://localhost:${PORT}/agents`);
});