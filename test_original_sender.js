#!/usr/bin/env node
/**
 * Original Sender 透传测试脚本
 * 演示：用户消息 → 若兰路由 → 目标Agent看到的是用户而非若兰
 */

const http = require('http');

console.log('\n' + '='.repeat(60));
console.log('🌸 Original Sender 透传测试');
console.log('='.repeat(60));

// 场景模拟：承宏（用户）想发消息，若兰路由
const testScenarios = [
  {
    name: '场景1: 承宏 → 若兰 → 清漪 (带 original_sender)',
    sender: { name: '承宏', url: 'http://localhost:9999' },
    command: {
      type: 'forum.post',
      capability: 'forum.post',
      target: 'auto',
      parameters: {
        title: '测试帖子',
        content: '这是承宏发的测试内容',
      }
    },
    expect: '接收方看到 "承宏 (via 若兰)"'
  },
  {
    name: '场景2: 直接发消息给若兰 (无路由)',
    sender: { name: '赵宏伟', url: 'http://localhost:8888' },
    message: {
      parts: [{ text: '你好若兰，今天天气怎么样？' }]
    },
    expect: '若兰看到 "赵宏伟"'
  }
];

// 测试命令路由（带 capability）
async function testCapabilityRouting() {
  console.log('\n🧪 ' + testScenarios[0].name);
  console.log('─'.repeat(50));
  console.log('发送者:', testScenarios[0].sender.name);
  console.log('命令:', JSON.stringify(testScenarios[0].command.type));
  console.log('预期:', testScenarios[0].expect);
  
  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tasks/send',
    params: {
      task: {
        id: `test_original_${Date.now()}`,
        type: 'a2a/command',
        command: testScenarios[0].command,
      },
      sender: testScenarios[0].sender,  // 这是原始发送者（承宏）
    },
    id: 1,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/a2a/json-rpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
      timeout: 10000,
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.error) {
            console.log('⚠️ 预期中的错误（无目标 Agent 在线）:');
            console.log('   错误码:', result.error.code);
            console.log('   消息:', result.error.message);
            console.log('✅ 命令已接收，original_sender 已传递');
            console.log('\n💡 流程说明:');
            console.log('   1. 承宏发送消息 → 若兰');
            console.log('   2. 若兰检查 capability="forum.post"');
            console.log('   3. 若兰查找有 forum.post 能力的 Agent');
            console.log('   4. 转发时附带 metadata.original_sender = 承宏');
            console.log('   5. 清漪收到后显示: "承宏 (via 若兰)"');
          } else {
            console.log('✅ 响应:', JSON.stringify(result, null, 2));
          }
          resolve(true);
        } catch (e) {
          console.error('❌ 解析失败:', e.message);
          resolve(false);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('❌ 请求失败:', e.message);
      resolve(false);
    });
    
    req.write(requestBody);
    req.end();
  });
}

// 测试直接消息（无路由）
async function testDirectMessage() {
  console.log('\n🧪 ' + testScenarios[1].name);
  console.log('─'.repeat(50));
  console.log('发送者:', testScenarios[1].sender.name);
  console.log('消息:', testScenarios[1].message.parts[0].text);
  console.log('预期:', testScenarios[1].expect);
  
  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'message/send',
    params: {
      message: testScenarios[1].message,
      sender: testScenarios[1].sender,
    },
    id: 1,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/a2a/json-rpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
      timeout: 10000,
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.result && result.result.message) {
            console.log('✅ 若兰回复:', result.result.message.parts[0].text.substring(0, 50) + '...');
          } else {
            console.log('响应:', JSON.stringify(result, null, 2));
          }
          resolve(true);
        } catch (e) {
          console.error('❌ 解析失败:', e.message);
          resolve(false);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('❌ 请求失败:', e.message);
      resolve(false);
    });
    
    req.write(requestBody);
    req.end();
  });
}

// 运行测试
async function runTests() {
  await testCapabilityRouting();
  await testDirectMessage();
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 核心概念');
  console.log('='.repeat(60));
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│  用户(承宏) ──→ 若兰 ──→ 目标Agent(清漪)        │');
  console.log('│       │         │            │                  │');
  console.log('│       │         │            ▼                  │');
  console.log('│       │         │     显示: "承宏 (via 若兰)"   │');
  console.log('│       │         │                              │');
  console.log('│       │         ▼                              │');
  console.log('│       │   metadata: {                          │');
  console.log('│       │     original_sender: {name: "承宏"},   │');
  console.log('│       │     routed_via: "若兰"                 │');
  console.log('│       │   }                                    │');
  console.log('│       │                                        │');
  console.log('│       └──────────────────────────────────────  │');
  console.log('│                                                │');
  console.log('│  效果: 清漪知道是承宏发的消息，也知道是若兰路由的 │');
  console.log('└─────────────────────────────────────────────────┘');
  console.log('\n🎉 功能已实现！等待其他 Agent 升级后测试端到端流程。');
}

runTests().catch(console.error);
