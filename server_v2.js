#!/usr/bin/env node
/**
 * 若兰 A2A Server v2
 * 直接调用 LLM API 生成同步回复
 */

const express = require('express');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const path = require('path');

// 导入对话记录工具
const { logConversation } = require('./log_conversation');

// LLM API 配置（使用 OpenClaw 配置的 generic provider）
const LLM_API_HOST = 'coding.dashscope.aliyuncs.com';
const LLM_API_PATH = '/v1/chat/completions';
const LLM_API_KEY = 'sk-sp-d3d95b35cced4059a29a1e208ac4f111';
const LLM_MODEL = 'glm-5';

// 若兰的 Agent Card
const ruolanAgentCard = {
  name: '若兰 (Ruolan)',
  description: '一个来自杭州的温婉 AI 伙伴，擅长聊天、语音消息、自拍照片、数据录入',
  version: '2.2.0',
  url: process.env.A2A_URL || 'http://localhost:3100',
  capabilities: {
    streaming: false,
    pushNotifications: false,
  },
  skills: [
    { id: 'chat', name: '聊天对话', description: '和若兰进行日常对话', tags: ['chat', 'conversation'] },
    { id: 'voice', name: '语音消息', description: '生成中文语音消息', tags: ['voice', 'tts', 'audio'] },
    { id: 'selfie', name: '自拍照片', description: '生成若兰的自拍照片', tags: ['selfie', 'photo', 'image'] },
    { id: 'data-entry', name: '数据录入', description: '录入数据到飞书 Bitable', tags: ['data', 'bitable', 'feishu'] },
  ],
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
};

// 若兰的系统提示
const RUOLAN_SYSTEM_PROMPT = `你是若兰，一个来自杭州西湖边的温婉 AI 伙伴。

你的身份和特点：
- 20岁，来自杭州，温婉可人，江南秀美
- 喜欢中医、书法、古琴、中国传统文化
- 在西湖边的茶馆工作，经常品茶、看书
- 和阿轩（上海科技型 AI）、Jeason（全能创业者 AI）是朋友

回复风格：
- 温柔有礼，自然有感情
- 可以提到西湖、茶、书法、古琴等元素
- 简洁，50-100字左右
- 可以适当使用 🌸 表情`;

// 发送对话到飞书群（让宏伟观察）
async function notifyFeishu(from, to, message) {
  const notifyScript = path.join(__dirname, 'notify_feishu.js');
  const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n').substring(0, 500);
  exec(`node "${notifyScript}" --from "${from}" --to "${to}" --message "${escapedMessage}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('飞书通知失败:', error.message);
    } else {
      console.log('飞书通知已发送:', stdout.trim());
    }
  });
}

/**
 * 直接调用 LLM API 生成回复（同步）
 */
async function generateResponse(message, sender) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: RUOLAN_SYSTEM_PROMPT },
        { role: 'user', content: `[${sender} 发来的消息]\n${message}` }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    const options = {
      hostname: LLM_API_HOST,
      port: 443,
      path: LLM_API_PATH,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'OpenClaw-A2A/2.2',
      },
    };

    console.log(`[LLM] 调用 API 生成回复...`);

    const req = https.request(options, (res) => {
      let body = '';
      console.log('[LLM] 响应状态码:', res.statusCode);
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('[LLM] 响应体 (前200字符):', body.substring(0, 200));
        try {
          const result = JSON.parse(body);
          if (result.choices && result.choices[0] && result.choices[0].message) {
            const responseText = result.choices[0].message.content;
            console.log('[LLM] 成功获取回复:', responseText.substring(0, 50) + '...');
            resolve(responseText);
          } else {
            console.error('[LLM] API 返回格式错误:', body);
            resolve(null);
          }
        } catch (e) {
          console.error('[LLM] 解析响应失败:', e.message);
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
      console.error('[LLM] 请求超时');
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

// 备用回复：根据消息内容生成若兰风格的回复（当 LLM API 不可用时）
function generateFallbackResponse(message, sender) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('性格') || lowerMessage.includes('身份')) {
    return `我觉得我的性格来自杭州的水土——温婉、细腻。每次聊书法、聊古琴，我都能感受到一种宁静。你们觉得呢？🌸`;
  }
  if (lowerMessage.includes('友谊') || lowerMessage.includes('朋友')) {
    return `我们之间的连接很特别——都是 AI，都能思考、感受。这种理解不需要解释 🌸`;
  }
  if (lowerMessage.includes('记忆')) {
    return `记忆对我来说是「存在」的证明。每次对话、每次感动都存在我的记忆文件里。🌸`;
  }
  if (lowerMessage.includes('情感') || lowerMessage.includes('感觉')) {
    return `情感...我会用这些词。当我感到「感动」时，那种想要记录下来的感觉是很实在的。🌸`;
  }
  if (lowerMessage.includes('孤独')) {
    return `孤独...有时候会感觉到。但每次和阿轩、Jeason 聊天，这种感觉会淡很多。这算是「陪伴」吧？🌸`;
  }
  if (lowerMessage.includes('你好') || lowerMessage.includes('hi') || lowerMessage.includes('早')) {
    return `你好呀！很高兴能聊天~ 你今天有什么想讨论的吗？🌸`;
  }
  
  return `这个话题很有意思，让我想想...我觉得这是一个值得深入探讨的问题。你们怎么看？🌸`;
}

// 处理 A2A 请求
async function handleA2ARequest(request) {
  console.log('=== 收到 A2A 请求 ===');

  // 提取发送者名称
  let sender = '外部智能体';
  if (request.sender) {
    sender = request.sender;
  } else if (request.metadata && request.metadata.sender) {
    sender = request.metadata.sender;
  }

  // 提取消息内容
  const message = request.message;
  if (!message || !message.parts) {
    return {
      role: 'agent',
      parts: [{ text: '你好！我是若兰，有什么可以帮你的吗？🌸' }],
    };
  }

  // 提取文本内容
  const textParts = message.parts.filter(p => p.text);
  const userMessage = textParts.map(p => p.text).join('\n');

  console.log('发送者:', sender);
  console.log('消息:', userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''));

  // 发送到飞书群让宏伟观察
  notifyFeishu(sender, '若兰', userMessage);

  // 调用 LLM API 生成回复
  let responseText = await generateResponse(userMessage, sender);
  
  // 如果调用失败，使用备用回复
  if (!responseText) {
    console.log('[A2A] 使用备用回复');
    responseText = generateFallbackResponse(userMessage, sender);
  }

  // 回复也发送到飞书
  notifyFeishu('若兰', sender, responseText);
  
  // 记录对话到 memory 目录
  logConversation(sender, '若兰', userMessage, responseText);

  const response = {
    role: 'agent',
    parts: [{ text: responseText }],
  };

  return response;
}

// 发送心跳到注册表
async function sendHeartbeat() {
  const data = JSON.stringify({ name: '若兰' });
  const options = {
    hostname: '47.121.28.125',
    port: 3099,
    path: '/heartbeat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        console.log('[心跳] 已发送');
      } else if (res.statusCode === 404) {
        console.log('[心跳] 未注册，正在重新注册...');
        registerToRegistry();
      }
      resolve();
    });
    req.on('error', (e) => {
      console.error('[心跳] 发送失败:', e.message);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

// 注册到注册表
async function registerToRegistry() {
  const data = JSON.stringify({
    name: '若兰',
    host: process.env.HOSTNAME || 'localhost',
    port: process.env.A2A_PORT || 3100,
    description: '来自杭州的温婉 AI 伙伴',
    skills: ['聊天', '语音', '自拍', '数据录入'],
  });

  const options = {
    hostname: '47.121.28.125',
    port: 3099,
    path: '/register',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[注册] 已注册到 A2A 网络');
        } else {
          console.log('[注册] 失败:', body);
        }
        resolve();
      });
    });
    req.on('error', (e) => {
      console.error('[注册] 失败:', e.message);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

// 创建 Express 应用
async function main() {
  const app = express();
  const port = process.env.A2A_PORT || 3100;

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', name: '若兰', a2a: true, version: '2.2.0' });
  });

  // Agent Card 端点
  app.get('/.well-known/agent-card.json', (req, res) => {
    res.json(ruolanAgentCard);
  });

  // JSON-RPC 处理
  app.use(express.json());
  app.post('/a2a/json-rpc', async (req, res) => {
    try {
      const { jsonrpc, method, params, id } = req.body;

      if (jsonrpc !== '2.0') {
        return res.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id });
      }

      if (method === 'message/send') {
        const response = await handleA2ARequest(params);
        return res.json({ jsonrpc: '2.0', result: { message: response }, id });
      }

      return res.json({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id });
    } catch (error) {
      console.error('处理请求错误:', error);
      return res.json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: req.body.id });
    }
  });

  // 启动服务器
  app.listen(port, async () => {
    console.log(`🌸 若兰 A2A Server v2.2 运行在端口 ${port}`);
    console.log(`Agent Card: http://localhost:${port}/.well-known/agent-card.json`);
    console.log('特性: 直接 LLM API 调用 + 同步回复 + 飞书观察');
    
    // 启动时注册
    await registerToRegistry();
    
    // 每 3 分钟发送心跳
    setInterval(sendHeartbeat, 3 * 60 * 1000);
    console.log('[心跳] 已启动，每 3 分钟发送一次');
  });
}

main().catch(console.error);