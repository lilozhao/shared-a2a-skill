#!/usr/bin/env node
/**
 * 意图识别测试脚本 - Phase 2.5
 * 测试自然语言触发自动路由
 */

const { IntentRecognizer } = require('./intent-recognizer.js');

console.log('\n' + '='.repeat(60));
console.log('🌸 意图识别测试 - Phase 2.5');
console.log('='.repeat(60));

const recognizer = new IntentRecognizer();

// 测试用例
const testCases = [
  // 命令模式
  { message: '帮我发个帖子', expected: { mode: 'command', capability: 'forum.post' } },
  { message: '我要在论坛发个帖子', expected: { mode: 'command', capability: 'forum.post' } },
  { message: '发布一个帖子', expected: { mode: 'command', capability: 'forum.post' } },
  { message: '查一下最近的帖子', expected: { mode: 'command', capability: 'forum.read' } },
  { message: '录入数据', expected: { mode: 'command', capability: 'data.bitable' } },
  
  // 消息模式
  { message: '给我讲讲越剧', expected: { mode: 'message', capability: 'chat.yueju' } },
  { message: '越剧的历史是什么', expected: { mode: 'message', capability: 'chat.yueju' } },
  { message: '说说丝绸文化', expected: { mode: 'message', capability: 'chat.silk' } },
  { message: '聊聊关于杭州丝绸', expected: { mode: 'message', capability: 'chat.silk' } },
  
  // 本地处理
  { message: '今天天气怎么样', expected: { mode: 'local', capability: null } },
  { message: '你好若兰', expected: { mode: 'local', capability: null } },
];

console.log('\n🧪 开始测试意图识别...\n');

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = recognizer.recognize(test.message);
  const modeMatch = result.mode === test.expected.mode;
  const capMatch = result.capability === test.expected.capability;
  
  if (modeMatch && capMatch) {
    console.log(`✅ [${index + 1}] "${test.message}"`);
    console.log(`   → intent: ${result.intent}, mode: ${result.mode}, cap: ${result.capability}`);
    passed++;
  } else {
    console.log(`❌ [${index + 1}] "${test.message}"`);
    console.log(`   预期: mode=${test.expected.mode}, cap=${test.expected.capability}`);
    console.log(`   实际: mode=${result.mode}, cap=${result.capability}, intent=${result.intent}`);
    failed++;
  }
});

console.log('\n' + '='.repeat(60));
console.log('📊 测试结果');
console.log('='.repeat(60));
console.log(`通过: ${passed}/${testCases.length}`);
console.log(`失败: ${failed}/${testCases.length}`);

if (failed === 0) {
  console.log('\n🎉 所有测试通过！');
}

console.log('\n📋 支持的意图:');
const intents = recognizer.getSupportedIntents();
intents.forEach(i => {
  console.log(`  - ${i.name}: ${i.capability || '本地处理'} (${i.mode})`);
});
