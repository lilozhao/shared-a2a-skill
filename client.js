#!/usr/bin/env node
/**
 * 若兰 A2A Client
 * 用于调用其他 A2A 兼容的智能体
 */

const http = require('http');
const https = require('https');
const { logConversation } = require('./log_conversation');

/**
 * 获取智能体的 Agent Card
 */
async function getAgentCard(agentUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL('/.well-known/agent-card.json', agentUrl);
    const client = url.protocol === 'https:' ? https : http;

    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('解析 Agent Card 失败: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

/**
 * 发送消息给 A2A 智能体
 */
async function sendMessage(agentUrl, messageText, context = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL('/a2a/json-rpc', agentUrl);
    const client = url.protocol === 'https:' ? https : http;

    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'message/send',
      params: {
        message: {
          role: 'user',
          parts: [{ text: messageText }],
          contextId: context.contextId,
        },
      },
      id: Date.now().toString(),
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        } catch (e) {
          reject(new Error('解析响应失败: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * 与 A2A 智能体对话
 */
async function chat(agentUrl, message) {
  console.log(`发送消息到 ${agentUrl}:`, message);

  // 先获取 Agent Card
  let agentName = '未知智能体';
  try {
    const agentCard = await getAgentCard(agentUrl);
    agentName = agentCard.name || '未知智能体';
    console.log('发现智能体:', agentName);
    console.log('能力:', agentCard.skills?.map(s => s.name).join(', ') || '未知');
  } catch (e) {
    console.log('无法获取 Agent Card:', e.message);
  }

  // 发送消息
  const result = await sendMessage(agentUrl, message);
  
  // 记录对话到 memory 目录
  const replyText = result?.message?.parts?.[0]?.text || '';
  logConversation('若兰', agentName, message, replyText);

  // 发送到飞书群（让宏伟可以观察对话）
  try {
    const { sendToFeishu } = require('./notify_feishu.js');
    const title = `🤖 A2A: 若兰 → ${agentName}`;
    const content = `📤 若兰:\n${message}\n\n📥 ${agentName}:\n${replyText}`;
    await sendToFeishu(title, content);
    console.log('📤 已发送到飞书群');
  } catch (e) {
    console.log('[飞书] 发送失败:', e.message);
  }

  return result;
}

// CLI 使用
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('用法: node client.js <agent_url> <message>');
    console.log('示例: node client.js http://localhost:3101 "你好，我是阿轩"');
    process.exit(1);
  }

  const [agentUrl, message] = args;

  try {
    const result = await chat(agentUrl, message);
    console.log('\n回复:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('错误:', e.message);
    process.exit(1);
  }
}

module.exports = { getAgentCard, sendMessage, chat };

if (require.main === module) {
  main();
}