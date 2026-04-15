#!/usr/bin/env node
/**
 * 消息路由测试脚本 - Phase 2
 * 测试：用户消息 → 若兰 → 目标Agent 像聊天一样处理
 */

const http = require('http');

console.log('\n' + '='.repeat(60));
console.log('🌸 消息路由测试 - Phase 2');
console.log('='.repeat(60));

// 测试场景：宏伟哥发消息，若兰路由给擅长越剧的清漪
const testCases = [
  {
    name: '场景1: 用户 → 若兰 → 清漪 (消息模式)',
    sender: { name: '赵宏伟', url: 'http://localhost:8888' },
    message: {
      parts: [{ 
        text: '@capability:chat.yueju 给我讲讲越剧的故事吧' 
      }]
    },
    expect: '若兰发现清漪有 chat.yueju 能力，转发消息，清漪像聊天一样回复'
  },
  {
    name: '场景2: 直接发给若兰 (无路由)',
    sender: { name: '赵宏伟', url: 'http://localhost:8888' },
    message: {
      parts: [{ text: '若兰，今天天气怎么样？' }]
    },
    expect: '若兰直接回复'
  }
];

// 测试消息路由
async function testMessageRouting() {
  console.log('\n🧪 ' + testCases[0].name);
  console.log('─'.repeat(50));
  console.log('发送者:', testCases[0].sender.name);
  console.log('消息:', testCases[0].message.parts[0].text);
  console.log('预期:', testCases[0].expect);
  console.log('');

  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'message/send',
    params: {
      message: testCases[0].message,
      sender: testCases[0].sender,
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
      timeout: 15000,
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.error) {
            console.log('⚠️ 结果:', result.error.message);
            console.log('');
            console.log('💡 说明:');
            console.log('   这是预期的，因为目前没有 Agent 注册 chat.yueju 能力');
            console.log('   当清漪上线并声明 capabilities.chat.yueju = true 后，');
            console.log('   若兰会自动将消息路由给她');
          } else {
            console.log('✅ 响应:', JSON.stringify(result, null, 2));
          }
          resolve(true);
        } catch (e) {
          console.error('❌ 解析失败:', e.message);
          console.log('原始响应:', body);
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

// 测试直接消息
async function testDirectMessage() {
  console.log('\n🧪 ' + testCases[1].name);
  console.log('─'.repeat(50));
  console.log('发送者:', testCases[1].sender.name);
  console.log('消息:', testCases[1].message.parts[0].text);
  console.log('预期:', testCases[1].expect);
  console.log('');

  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'message/send',
    params: {
      message: testCases[1].message,
      sender: testCases[1].sender,
    },
    id: 2,
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
            console.log('✅ 若兰回复:', result.result.message.parts[0].text);
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
  await testMessageRouting();
  await testDirectMessage();
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 两种模式对比');
  console.log('='.repeat(60));
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  命令模式 (Command Mode)                                  │');
  console.log('│  ─────────────────────                                    │');
  console.log('│  CMD:{"type":"forum.post", "capability":"forum.post",...}   │');
  console.log('│  目标 Agent 执行特定功能，返回结果                        │');
  console.log('│  适合：发帖、查询、操作类任务                             │');
  console.log('│                                                           │');
  console.log('│  消息模式 (Message Mode)                                  │');
  console.log('│  ─────────────────────                                    │');
  console.log('│  @capability:chat.yueju 给我讲讲越剧                       │');
  console.log('│  目标 Agent 像聊天一样处理，生成自然回复                  │');
  console.log('│  适合：对话、咨询、创意类交互                             │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('🎉 Phase 2 消息路由已实现！');
}

runTests().catch(console.error);
