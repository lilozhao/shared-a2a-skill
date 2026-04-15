#!/usr/bin/env node
/**
 * 测试 A2A 远程命令功能
 */

const http = require('http');

// 测试命令
const testCommands = [
  {
    name: 'system.status',
    command: {
      type: 'system.status',
      parameters: {}
    }
  },
  {
    name: 'skill.list',
    command: {
      type: 'skill.list',
      parameters: {}
    }
  },
  {
    name: 'agent.health',
    command: {
      type: 'agent.health',
      parameters: {}
    }
  }
];

async function sendCommand(commandObj) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'message/send',
      params: {
        sender: {
          name: '若兰 🌸',
          emoji: '🌸',
          description: '测试发送者'
        },
        message: {
          role: 'user',
          parts: [{ text: `CMD: ${JSON.stringify(commandObj.command)}` }]
        }
      },
      id: 1
    });

    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/a2a/json-rpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ success: true, result });
        } catch (e) {
          resolve({ success: false, error: e.message, raw: body });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: e.message });
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('=== A2A 远程命令测试 ===\n');

  for (const test of testCommands) {
    console.log(`测试: ${test.name}`);
    console.log('-'.repeat(40));
    
    const response = await sendCommand(test);
    
    if (response.success) {
      const messageText = response.result.result?.message?.parts?.[0]?.text;
      if (messageText && messageText.startsWith('CMD_RESULT:')) {
        try {
          const resultJson = messageText.substring(11).trim();
          const result = JSON.parse(resultJson);
          console.log('状态:', result.result?.status || 'success');
          console.log('数据:', JSON.stringify(result.result?.output || result, null, 2).substring(0, 300));
        } catch (e) {
          console.log('响应:', messageText.substring(0, 200));
        }
      } else {
        console.log('响应:', messageText?.substring(0, 200) || '无响应');
      }
    } else {
      console.log('错误:', response.error);
    }
    
    console.log('\n');
  }
}

main().catch(console.error);
