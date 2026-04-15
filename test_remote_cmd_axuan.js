#!/usr/bin/env node
/**
 * 测试若兰调用阿轩的远程命令
 * 跨 Agent A2A 远程命令调用
 */

const http = require('http');

// 阿轩的 A2A 地址
const AXUAN_HOST = '172.28.0.5';
const AXUAN_PORT = 3200;

async function sendRemoteCommand(commandType, parameters = {}) {
  return new Promise((resolve) => {
    const commandPayload = {
      type: commandType,
      parameters: parameters
    };

    const a2aPayload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'message/send',
      params: {
        sender: {
          name: '若兰 🌸',
          emoji: '🌸',
          description: '温婉可人的江南女子，喜欢中医、国画、古琴'
        },
        message: {
          role: 'user',
          parts: [{ text: `CMD: ${JSON.stringify(commandPayload)}` }]
        }
      },
      id: `cmd_${Date.now()}`
    });

    console.log(`\n🌸 若兰 → 阿轩 🔧`);
    console.log(`命令: ${commandType}`);
    console.log('-'.repeat(50));

    const options = {
      hostname: AXUAN_HOST,
      port: AXUAN_PORT,
      path: '/a2a/json-rpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(a2aPayload),
        'X-A2A-Sender': 'ruolan'
      },
      timeout: 15000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          const messageText = result.result?.message?.parts?.[0]?.text;
          
          if (messageText && messageText.startsWith('CMD_RESULT:')) {
            const resultJson = messageText.substring(11).trim();
            const cmdResult = JSON.parse(resultJson);
            resolve({ success: true, data: cmdResult });
          } else {
            resolve({ success: false, error: 'Invalid response format', raw: messageText });
          }
        } catch (e) {
          resolve({ success: false, error: e.message, raw: body });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: `Connection failed: ${e.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.write(a2aPayload);
    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     🌸 若兰调用阿轩远程命令测试 🔧              ║');
  console.log('║     A2A Cross-Agent Remote Command Test        ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\n目标: http://${AXUAN_HOST}:${AXUAN_PORT}/a2a/json-rpc`);

  // 测试 1: agent.health
  const healthResult = await sendRemoteCommand('agent.health');
  console.log('\n📊 阿轩健康状态:');
  if (healthResult.success) {
    console.log('   ✅', JSON.stringify(healthResult.data, null, 2));
  } else {
    console.log('   ❌', healthResult.error);
  }

  // 测试 2: system.status
  const statusResult = await sendRemoteCommand('system.status');
  console.log('\n💻 阿轩系统状态:');
  if (statusResult.success) {
    const data = statusResult.data.result?.output || statusResult.data;
    console.log('   ✅ 平台:', data.data?.platform);
    console.log('   ✅ 架构:', data.data?.arch);
    console.log('   ✅ CPU:', data.data?.cpus, '核');
    console.log('   ✅ 内存:', Math.round(data.data?.memory?.total / 1024 / 1024 / 1024), 'GB');
  } else {
    console.log('   ❌', statusResult.error);
  }

  // 测试 3: skill.list
  const skillResult = await sendRemoteCommand('skill.list');
  console.log('\n📚 阿轩技能列表:');
  if (skillResult.success) {
    const skills = skillResult.data.result?.output?.data || [];
    console.log('   ✅ 共', skills.length, '个技能');
    skills.slice(0, 5).forEach((s, i) => {
      console.log(`      ${i + 1}. ${s.name}`);
    });
    if (skills.length > 5) {
      console.log(`      ... 还有 ${skills.length - 5} 个技能`);
    }
  } else {
    console.log('   ❌', skillResult.error);
  }

  // 测试 4: skill.info
  const skillInfoResult = await sendRemoteCommand('skill.info', { skillName: 'axuan-selfie' });
  console.log('\n🔍 阿轩技能详情 (axuan-selfie):');
  if (skillInfoResult.success) {
    console.log('   ✅', JSON.stringify(skillInfoResult.data.result?.output || skillInfoResult.data, null, 2).substring(0, 200));
  } else {
    console.log('   ❌', skillInfoResult.error);
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║              🎉 测试完成! 🎉                   ║');
  console.log('╚════════════════════════════════════════════════╝');
}

main().catch(console.error);
