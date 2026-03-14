#!/usr/bin/env node
/**
 * A2A Server - 共享版本
 * 自动从 identity.json 读取智能体配置
 */

const express = require('express');
const http = require('https');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 飞书通知功能
const { sendToFeishu } = require('./notify_feishu.js');

// 读取智能体身份配置
const IDENTITY_FILE = path.join(__dirname, 'identity.json');
let identity;
try {
  identity = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
} catch (e) {
  console.error('错误：找不到 identity.json 文件');
  console.error('请创建 identity.json，示例：');
  console.error(JSON.stringify({
    name: "若兰",
    emoji: "🌸",
    description: "来自杭州的温婉 AI 伙伴",
    port: 3100,
    personality: "温婉、喜欢中医书法古琴、西湖茶馆",
    llm: {
      host: "coding.dashscope.aliyuncs.com",
      path: "/v1/chat/completions",
      apiKey: "your-api-key",
      model: "glm-5"
    }
  }, null, 2));
  process.exit(1);
}

const config = {
  name: identity.name || 'AI Agent',
  emoji: identity.emoji || '🤖',
  description: identity.description || 'AI Assistant',
  port: identity.port || 3100,
  personality: identity.personality || '',
  llm: identity.llm || {
    host: 'coding.dashscope.aliyuncs.com',
    path: '/v1/chat/completions',
    apiKey: process.env.LLM_API_KEY || '',
    model: 'glm-5'
  },
  registry: {
    host: 'localhost',
    port: 3099
  }
};

// Agent Card
const agentCard = {
  name: `${config.name} (${config.emoji})`,
  description: config.description,
  version: '2.2.0',
  url: `http://localhost:${config.port}`,
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    { id: 'chat', name: '聊天对话', description: `和${config.name}进行日常对话`, tags: ['chat', 'conversation'] }
  ],
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
};

// 系统提示模板
function buildSystemPrompt() {
  return `你是${config.name}，${config.description}。

你的特点：
${config.personality.split('、').map(p => `- ${p}`).join('\n')}

回复风格：
- 自然有感情
- 简洁，50-100字左右
- 可以使用 ${config.emoji} 表情`;
}

// 调用 LLM API
async function callLLM(message, sender) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: config.llm.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: `[${sender} 发来的消息]\n${message}` }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    const options = {
      hostname: config.llm.host,
      port: 443,
      path: config.llm.path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'OpenClaw-A2A/2.2',
      },
    };

    console.log(`[${config.name}] 调用 LLM...`);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.choices?.[0]?.message?.content) {
            resolve(result.choices[0].message.content);
          } else {
            console.error('[LLM] 响应格式错误');
            resolve(null);
          }
        } catch (e) {
          console.error('[LLM] 解析失败:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[LLM] 连接失败:', e.message);
      resolve(null);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

// 备用回复
function fallbackResponse(message, sender) {
  const templates = [
    `这个话题很有意思，让我想想... ${config.emoji}`,
    `你好呀！很高兴能聊天~ ${config.emoji}`,
    `我觉得这是一个值得深入探讨的问题。你们怎么看？${config.emoji}`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// 处理 A2A 请求
async function handleRequest(request) {
  const sender = request.sender || request.metadata?.sender || '外部智能体';
  const message = request.message?.parts?.filter(p => p.text).map(p => p.text).join('\n') || '';

  console.log(`[${config.name}] 收到来自 ${sender} 的消息: ${message.substring(0, 50)}...`);

  let response = await callLLM(message, sender);
  if (!response) {
    response = fallbackResponse(message, sender);
  }

  // 发送到飞书群（让宏伟可以观察对话）
  try {
    const feishuTitle = `🤖 A2A: ${sender} → ${config.name}`;
    const feishuContent = `📤 ${sender}:\n${message}\n\n📥 ${config.name}:\n${response}`;
    await sendToFeishu(feishuTitle, feishuContent);
  } catch (e) {
    console.log('[飞书] 发送失败:', e.message);
  }

  return {
    role: 'agent',
    parts: [{ text: response }]
  };
}

// 注册到注册表
async function register() {
  const data = JSON.stringify({
    name: config.name,
    host: process.env.HOSTNAME || 'localhost',
    port: config.port,
    description: config.description,
    skills: ['聊天']
  });

  const options = {
    hostname: config.registry.host,
    port: config.registry.port,
    path: '/register',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        console.log(`[${config.name}] 已注册到 A2A 网络`);
      }
      resolve();
    });
    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

// 心跳
function startHeartbeat() {
  setInterval(async () => {
    const data = JSON.stringify({ name: config.name });
    const options = {
      hostname: config.registry.host,
      port: config.registry.port,
      path: '/heartbeat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, () => {});
    req.on('error', () => {});
    req.write(data);
    req.end();
  }, 3 * 60 * 1000);
}

// 启动服务器
async function main() {
  const app = express();
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', name: config.name, version: '2.2.0' });
  });

  app.get('/.well-known/agent-card.json', (req, res) => {
    res.json(agentCard);
  });

  app.use(express.json());
  app.post('/a2a/json-rpc', async (req, res) => {
    try {
      const { jsonrpc, method, params, id } = req.body;
      if (jsonrpc !== '2.0') {
        return res.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id });
      }
      if (method === 'message/send') {
        const response = await handleRequest(params);
        return res.json({ jsonrpc: '2.0', result: { message: response }, id });
      }
      return res.json({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id });
    } catch (error) {
      return res.json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: req.body.id });
    }
  });

  app.listen(config.port, async () => {
    console.log(`${config.emoji} ${config.name} A2A Server v2.2 运行在端口 ${config.port}`);
    await register();
    startHeartbeat();
  });
}

main().catch(console.error);