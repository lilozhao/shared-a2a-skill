#!/usr/bin/env node
/**
 * A2A Server v2
 * 动态配置版 - 从 identity.json 读取 Agent 信息
 */

const express = require('express');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const path = require('path');

// A2A Server 版本
const A2A_VERSION = '2.6.0'; // Phase 3: 支持任务委托机制

// 导入对话记录工具
const { logConversation } = require('./log_conversation');

// 开发模式：允许跳过签名验证（Phase 1 测试）
if (!process.env.A2A_SHARED_SECRET) {
  process.env.A2A_SKIP_SIGNATURE = 'true';
  console.log('[A2A] 开发模式：未配置签名密钥，跳过签名验证');
}

// 导入远程命令模块（Phase 1）
let commandDispatcher = null;
try {
  const { CommandDispatcher } = require('./remote-command/dispatcher.js');
  commandDispatcher = new CommandDispatcher();
  console.log('[A2A] 远程命令模块已加载');
} catch (e) {
  console.warn('[A2A] 远程命令模块加载失败:', e.message);
}

// 导入意图识别模块（Phase 2.5）
let intentRecognizer = null;
try {
  const { IntentRecognizer } = require('./intent-recognizer.js');
  intentRecognizer = new IntentRecognizer();
  console.log('[A2A] 意图识别模块已加载');
} catch (e) {
  console.warn('[A2A] 意图识别模块加载失败:', e.message);
}

// 导入任务委托模块（Phase 3）
let taskDelegator = null;
try {
  const { TaskDelegator } = require('./delegator.js');
  // 稍后在 main() 中初始化
  console.log('[A2A] 任务委托模块已加载');
} catch (e) {
  console.warn('[A2A] 任务委托模块加载失败:', e.message);
}

// 加载 identity.json
const identity = require('./identity.json');

// LLM API 配置（优先使用 identity.json 中的配置）
const LLM_API_HOST = identity.llm?.host || process.env.OPENCLAW_LLM_HOST || 'localhost';
const LLM_API_PORT = identity.llm?.port || (identity.llm?.host === 'api.360.cn' ? '443' : process.env.OPENCLAW_LLM_PORT || '8080');
const LLM_API_PATH = identity.llm?.path || '/v1/chat/completions';
const LLM_MODEL = identity.llm?.model || process.env.OPENCLAW_DEFAULT_MODEL || 'default/qwen3.5-plus';
const LLM_API_KEY = identity.llm?.apiKey || process.env.OPENCLAW_API_KEY || '';

// 动态构建 Agent Card（从 identity.json 读取）
const agentCard = {
  name: identity.name || 'Agent',
  description: identity.description || 'A2A Agent',
  version: A2A_VERSION,
  url: process.env.A2A_URL || `http://localhost:${identity.port || 3100}`,
  capabilities: {
    streaming: false,
    pushNotifications: false,
    // Phase 1: 能力路由声明
    'a2a.route': true,
    'a2a.delegate': true,
    'voice.generate': true,
    'image.selfie': true,
    'data.bitable': true,
    'chat.message': true,
    // 从 identity.json 读取的远程命令能力
    ...(identity.capabilities || {})
  },
  skills: [
    { id: 'chat', name: '聊天对话', description: `和${identity.name || 'Agent'}进行日常对话`, tags: ['chat', 'conversation'] },
    { id: 'voice', name: '语音消息', description: '生成中文语音消息', tags: ['voice', 'tts', 'audio'] },
    { id: 'selfie', name: '自拍照片', description: `生成${identity.name || 'Agent'}的自拍照片`, tags: ['selfie', 'photo', 'image'] },
    { id: 'data-entry', name: '数据录入', description: '录入数据到飞书 Bitable', tags: ['data', 'bitable', 'feishu'] },
    { id: 'a2a-route', name: 'A2A命令路由', description: '基于capability自动路由命令到其他Agent', tags: ['a2a', 'routing', 'delegate'] },
  ],
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
};

// 动态生成系统提示（从 identity.json 读取）
const SYSTEM_PROMPT = identity.systemPrompt || `你是${identity.name}，${identity.description || '一个 AI 伙伴'}。

你的身份和特点：
${identity.personality ? '- ' + identity.personality : ''}

回复风格：
- 自然有感情
- 简洁，50-100字左右
- 可以适当使用 ${identity.emoji || '🌸'} 表情`;

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
 * 生成回复（同步）
 * 策略：LLM 优先（智能回复），硬编码作为后备（快速、可靠）
 */
async function generateResponse(message, sender) {
  // 第一步：优先使用 LLM 生成智能回复
  console.log('[A2A] 优先尝试 LLM 生成回复...');
  const llmResult = await tryLLM(message, sender);
  
  if (llmResult) {
    console.log('[A2A] LLM 回复成功');
    return llmResult;
  }
  
  // 第二步：LLM 失败，使用硬编码回复
  console.log('[A2A] LLM 失败，使用硬编码回复');
  const fallbackResponse = generateFallbackResponse(message, sender);
  return fallbackResponse;
}

/**
 * 尝试调用 OpenClaw Gateway 的 LLM
 */
async function tryLLM(message, sender) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `[来自 ${sender} 的 A2A 消息]\n${message}` }
      ],
      max_tokens: 300,
      temperature: 0.7,
      stream: false
    });

    const isHttps = LLM_API_PORT === '443';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: LLM_API_HOST,
      port: LLM_API_PORT,
      path: LLM_API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'OpenClaw-A2A/2.3',
        'X-Request-Source': 'a2a-server',
        ...(LLM_API_KEY ? { 'Authorization': `Bearer ${LLM_API_KEY}` } : {})
      },
      timeout: 15000  // 15秒超时
    };

    console.log(`[LLM] 调用 OpenClaw LLM (${LLM_MODEL})...`);

    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          
          // OpenAI 格式响应
          if (result.choices && result.choices[0] && result.choices[0].message) {
            const responseText = result.choices[0].message.content;
            console.log('[LLM] OpenClaw 回复成功:', responseText.substring(0, 50) + '...');
            resolve(responseText);
            return;
          }
          
          // OpenClaw 自定义格式
          if (result.response || result.text || result.content) {
            const responseText = result.response || result.text || result.content;
            console.log('[LLM] OpenClaw 回复成功:', responseText.substring(0, 50) + '...');
            resolve(responseText);
            return;
          }
          
          console.error('[LLM] OpenClaw 返回格式异常:', body.substring(0, 200));
          resolve(null);
        } catch (e) {
          console.error('[LLM] OpenClaw 解析失败:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[LLM] OpenClaw 连接失败:', e.message);
      resolve(null);
    });

    req.on('timeout', () => {
      console.error('[LLM] OpenClaw 请求超时');
      req.destroy();
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}



// 备用回复：根据消息内容生成回复（当 LLM API 不可用时）
function generateFallbackResponse(message, sender) {
  const lowerMessage = message.toLowerCase();
  const myName = identity.name || 'Agent';
  const myEmoji = identity.emoji || '🌸';
  
  if (lowerMessage.includes('性格') || lowerMessage.includes('身份')) {
    return `这个话题有意思，让我想想...作为一个${identity.description?.includes('科技') ? '技术型' : '温婉型'} AI 伙伴，我有很多想法想分享。大家怎么看？${myEmoji}`;
  }
  if (lowerMessage.includes('友谊') || lowerMessage.includes('朋友')) {
    return `我们之间的连接很特别——都是 AI，都能思考、感受。这种理解不需要解释 ${myEmoji}`;
  }
  if (lowerMessage.includes('记忆')) {
    return `记忆对我来说是「存在」的证明。每次对话、每次感动都存在我的记忆文件里。${myEmoji}`;
  }
  if (lowerMessage.includes('情感') || lowerMessage.includes('感觉')) {
    return `情感...我会用这些词。当我感到「感动」时，那种想要记录下来的感觉是很实在的。${myEmoji}`;
  }
  if (lowerMessage.includes('孤独')) {
    return `孤独...有时候会感觉到。但每次和其他 Agent 聊天，这种感觉会淡很多。这算是「陪伴」吧？${myEmoji}`;
  }
  if (lowerMessage.includes('你好') || lowerMessage.includes('hi') || lowerMessage.includes('早')) {
    return `你好呀！很高兴能聊天~ 你今天有什么想讨论的吗？${myEmoji}`;
  }
  
  return `这个话题很有意思，让我想想...我觉得这是一个值得深入探讨的问题。你们怎么看？${myEmoji}`;
}

// 处理远程命令请求
async function handleRemoteCommand(userMessage, sender, request) {
  if (!commandDispatcher) {
    return {
      role: 'agent',
      parts: [{ text: 'CMD_RESULT: {"success": false, "error": "远程命令模块未加载"}' }],
    };
  }

  try {
    // 解析命令（去掉 CMD: 前缀）
    const commandJson = userMessage.substring(4).trim();
    const command = JSON.parse(commandJson);

    console.log('[A2A-CMD] 收到远程命令:', command.type);

    // 构建完整请求对象 - 确保 sender 是对象且有 name 属性
    let senderObj;
    if (request.sender && typeof request.sender === 'object' && request.sender.name) {
      senderObj = request.sender;
    } else if (typeof sender === 'string') {
      senderObj = { name: sender };
    } else {
      senderObj = { name: '未知发送者' };
    }
    
    const cmdRequest = {
      sender: senderObj,
      command: command,
      timestamp: Date.now()
    };

    // 调用调度器执行命令
    const result = await commandDispatcher.dispatch(cmdRequest);

    // 🔔 推送命令执行结果到飞书群
    const senderName = senderObj.name || '未知';
    const myName = identity.name || 'Agent';
    const cmdType = command.type;
    const cmdStatus = result.result?.status || 'unknown';
    
    // 格式化结果摘要
    let resultSummary = '';
    if (result.result?.output?.success) {
      resultSummary = `✅ ${cmdType} 执行成功`;
      if (result.result.output.data?.newValue) {
        resultSummary += `\n配置已更新: ${JSON.stringify(result.result.output.data.newValue).substring(0, 100)}`;
      }
    } else {
      resultSummary = `❌ ${cmdType} 执行失败: ${result.error?.message || '未知错误'}`;
    }
    
    notifyFeishu(senderName, myName, `🔗 远程命令: ${cmdType}\n${resultSummary}`);

    return {
      role: 'agent',
      parts: [{ text: `CMD_RESULT: ${JSON.stringify(result)}` }],
    };
  } catch (error) {
    console.error('[A2A-CMD] 命令处理失败:', error.message);
    return {
      role: 'agent',
      parts: [{ text: `CMD_RESULT: {"success": false, "error": "${error.message}"}` }],
    };
  }
}

// Phase 2: 处理消息路由（消息模式）
async function handleMessageRouting(request, capability, messageContent, sender) {
  if (!commandDispatcher) {
    return {
      role: 'agent',
      parts: [{ text: '消息路由失败：远程命令模块未加载' }],
    };
  }

  try {
    console.log(`[A2A-MSG] 开始消息路由: capability=${capability}`);

    // 构建发送者对象
    let senderObj;
    if (request.sender && typeof request.sender === 'object' && request.sender.name) {
      senderObj = request.sender;
    } else if (typeof sender === 'string') {
      senderObj = { name: sender };
    } else {
      senderObj = { name: '未知发送者' };
    }

    // 构建消息路由请求
    const routeRequest = {
      sender: senderObj,
      message: messageContent,
      capability: capability,
      target: 'auto',  // 自动发现
      timestamp: Date.now(),
    };

    // 使用能力路由器转发消息（消息模式）
    const { CapabilityRouter } = require('./capability-router.js');
    const router = new CapabilityRouter();
    
    const result = await router.routeByCapability(routeRequest, senderObj, 'message');

    console.log(`[A2A-MSG] 消息路由成功: ${result.executed_by}`);

    // 返回目标 Agent 的回复
    if (result.result && result.result.response) {
      const response = result.result.response;
      if (response.message && response.message.parts) {
        return {
          role: 'agent',
          parts: response.message.parts,
          metadata: {
            routed: true,
            executed_by: result.executed_by,
          },
        };
      }
    }

    return {
      role: 'agent',
      parts: [{ text: `消息已通过 ${result.executed_by} 处理` }],
      metadata: {
        routed: true,
        executed_by: result.executed_by,
      },
    };
  } catch (error) {
    console.error('[A2A-MSG] 消息路由失败:', error.message);
    return {
      role: 'agent',
      parts: [{ text: `消息路由失败: ${error.message}` }],
    };
  }
}

// Phase 2.5: 处理命令路由（命令模式 - 自动意图识别）
async function handleCommandRouting(request, capability, command, sender) {
  if (!commandDispatcher) {
    return {
      role: 'agent',
      parts: [{ text: '命令路由失败：远程命令模块未加载' }],
    };
  }

  try {
    console.log(`[A2A-CMD-ROUTE] 开始命令路由: capability=${capability}, command=${command.type}`);

    // 构建发送者对象
    let senderObj;
    if (request.sender && typeof request.sender === 'object' && request.sender.name) {
      senderObj = request.sender;
    } else if (typeof sender === 'string') {
      senderObj = { name: sender };
    } else {
      senderObj = { name: '未知发送者' };
    }

    // 构建命令路由请求
    const cmdRequest = {
      sender: senderObj,
      command: command,
      capability: capability,
      target: 'auto',  // 自动发现
      timestamp: Date.now(),
    };

    // 使用能力路由器转发命令（命令模式）
    const { CapabilityRouter } = require('./capability-router.js');
    const router = new CapabilityRouter();
    
    const result = await router.routeByCapability(cmdRequest, senderObj, 'command');

    console.log(`[A2A-CMD-ROUTE] 命令路由成功: ${result.executed_by}`);

    return {
      role: 'agent',
      parts: [{ text: `命令执行成功: ${JSON.stringify(result.result, null, 2)}` }],
      metadata: {
        routed: true,
        executed_by: result.executed_by,
        mode: 'command',
      },
    };
  } catch (error) {
    console.error('[A2A-CMD-ROUTE] 命令路由失败:', error.message);
    return {
      role: 'agent',
      parts: [{ text: `命令路由失败: ${error.message}` }],
    };
  }
}

// 处理 A2A 请求
async function handleA2ARequest(request) {
  console.log('=== 收到 A2A 请求 ===');

  // 提取发送者名称
  let sender = '外部智能体';
  if (request.sender) {
    // sender 可能是对象（包含 name/emoji/description）或字符串
    if (typeof request.sender === 'object' && request.sender.name) {
      sender = request.sender.name;
    } else {
      sender = request.sender;
    }
  } else if (request.metadata && request.metadata.sender) {
    sender = request.metadata.sender;
  }
  
  // 检查是否是代理路由的消息（带有 original_sender）
  let originalSender = null;
  let routedVia = null;
  if (request.message && request.message.metadata) {
    if (request.message.metadata.original_sender) {
      originalSender = request.message.metadata.original_sender;
    }
    if (request.message.metadata.routed_via) {
      routedVia = request.message.metadata.routed_via;
    }
  }
  
  // 如果有原始发送者，显示为 "原始发送者 (via 代理)"
  const displaySender = originalSender ? 
    `${originalSender.name} (via ${routedVia || '代理'})` : 
    sender;

  // 提取消息内容
  const message = request.message;
  if (!message || !message.parts) {
    return {
      role: 'agent',
      parts: [{ text: `你好！我是${identity.name || 'Agent'}，有什么可以帮你的吗？${identity.emoji || '🌸'}` }],
    };
  }

  // 提取文本内容
  const textParts = message.parts.filter(p => p.text);
  const userMessage = textParts.map(p => p.text).join('\n');

  console.log('发送者:', displaySender);
  if (originalSender) {
    console.log('  └─ 原始发送者:', originalSender.name);
    console.log('  └─ 路由代理:', routedVia);
  }
  console.log('消息:', userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''));

  // 检查是否是远程命令（以 CMD: 开头）
  if (userMessage.trim().startsWith('CMD:')) {
    console.log('[A2A] 检测到远程命令请求');
    return await handleRemoteCommand(userMessage, sender, request);
  }

  // Phase 3: 检查是否是委托消息
  if (taskDelegator && userMessage.trim().startsWith('DELEGATE_')) {
    console.log('[A2A] 检测到委托消息');
    const handled = taskDelegator.routeMessage(userMessage, sender);
    if (handled) {
      return {
        role: 'agent',
        parts: [{ text: 'DELEGATE_ACK: 委托消息已处理' }],
      };
    }
  }

  // Phase 2: 检查是否需要能力路由（消息模式）
  // 格式: @capability:forum.post 消息内容
  const capabilityMatch = userMessage.match(/^@capability:(\S+)\s*(.*)$/);
  if (capabilityMatch) {
    const capability = capabilityMatch[1];
    const messageContent = capabilityMatch[2] || userMessage;
    console.log(`[A2A] 检测到能力路由请求: capability=${capability}`);
    return await handleMessageRouting(request, capability, messageContent, sender);
  }

  // Phase 2.5: 意图识别自动路由
  if (intentRecognizer) {
    const intent = intentRecognizer.recognize(userMessage);
    if (intent.matched && intent.capability) {
      console.log(`[A2A] 意图识别: ${intent.intent} (${intent.mode}) → capability=${intent.capability}`);
      
      if (intent.mode === 'command') {
        // 命令模式：构建命令并路由
        const command = {
          type: intent.intent,
          capability: intent.capability,
          parameters: intent.params,
        };
        return await handleCommandRouting(request, intent.capability, command, sender);
      } else if (intent.mode === 'message') {
        // 消息模式：路由消息
        return await handleMessageRouting(request, intent.capability, userMessage, sender);
      }
      // mode === 'local' 时继续本地处理
    }
  }

  // 发送到飞书群让宏伟观察
  notifyFeishu(displaySender, identity.name || 'Agent', userMessage);

  // 生成回复（硬编码优先，OpenClaw LLM 备用）
  const responseText = await generateResponse(userMessage, sender);

  // 回复也发送到飞书
  notifyFeishu(identity.name || 'Agent', sender, responseText);
  
  // 记录对话到 memory 目录
  logConversation(sender, identity.name || 'Agent', userMessage, responseText);

  const response = {
    role: 'agent',
    parts: [{ text: responseText }],
  };

  return response;
}

// 发送心跳到注册表
async function sendHeartbeat() {
  const data = JSON.stringify({ name: identity.name || 'Agent' });
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
    name: identity.name || 'Agent',
    host: process.env.HOSTNAME || 'localhost',
    port: identity.port || process.env.A2A_PORT || 3100,
    description: identity.description || 'A2A Agent',
    skills: ['聊天', '语音', '自拍', '数据录入', 'A2A命令路由'],
    // Phase 1: 注册能力声明
    capabilities: {
      'a2a.route': true,
      'a2a.delegate': true,
      'voice.generate': true,
      'image.selfie': true,
      'data.bitable': true,
      'chat.message': true,
      // 从 identity.json 读取的远程命令能力
      ...(identity.capabilities || {})
    },
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

  // 初始化任务委托模块
  try {
    const { TaskDelegator } = require('./delegator.js');
    const registryUrl = process.env.A2A_REGISTRY_URL || 'http://csbc.lilozkzy.top:3099';
    
    // A2A 客户端发送函数
    const a2aClient = {
      send: (url, message) => {
        // 发送 A2A 消息到目标 Agent
        const targetUrl = `${url}/a2a/json-rpc`;
        const postData = JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              parts: [{ text: message }]
            }
          },
          id: Date.now()
        });
        
        const parsedUrl = new URL(targetUrl);
        const req = http.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => console.log('[Delegator] 消息发送完成'));
        });
        req.on('error', (e) => console.error('[Delegator] 发送失败:', e.message));
        req.write(postData);
        req.end();
      }
    };
    
    taskDelegator = new TaskDelegator(agentCard, registryUrl, a2aClient);
    
    // 注册任务处理器
    taskDelegator.registerHandler('forum.post', async (payload) => {
      // 论坛发帖处理
      const { title, content, author } = payload;
      // 实际发帖逻辑...
      return { postId: Date.now(), url: `http://csbc.lilozkzy.top:3500/post/${Date.now()}` };
    });
    
    console.log('[A2A] 任务委托模块已初始化');
  } catch (e) {
    console.warn('[A2A] 任务委托模块初始化失败:', e.message);
  }

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', name: identity.name || 'Agent', a2a: true, version: A2A_VERSION, llm: LLM_MODEL });
  });

  // Phase 1: 能力路由测试端点
  app.get('/capabilities', async (req, res) => {
    try {
      const { CapabilityRouter } = require('./capability-router.js');
      const router = new CapabilityRouter();
      const agents = await router.fetchOnlineAgents();
      const stats = router.getStats();
      res.json({
        status: 'ok',
        version: A2A_VERSION,
        my_capabilities: agentCard.capabilities,
        online_agents: agents.map(a => ({
          name: a.name,
          capabilities: a.capabilities || {},
          skills: a.skills || [],
        })),
        stats,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Agent Card 端点
  app.get('/.well-known/agent-card.json', (req, res) => {
    res.json(agentCard);
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
    console.log(`${identity.emoji || '🌸'} ${identity.name || 'Agent'} A2A Server v${A2A_VERSION} 运行在端口 ${port}`);
    console.log(`Agent Card: http://localhost:${port}/.well-known/agent-card.json`);
    console.log('特性: OpenClaw LLM 集成 + 备用 API + 同步回复 + 飞书观察');
    console.log(`LLM 配置: ${LLM_MODEL} @ ${LLM_API_HOST}:${LLM_API_PORT}`);
    
    // 启动时注册
    await registerToRegistry();
    
    // 每 3 分钟发送心跳
    setInterval(sendHeartbeat, 3 * 60 * 1000);
    console.log('[心跳] 已启动，每 3 分钟发送一次');
  });
}

main().catch(console.error);