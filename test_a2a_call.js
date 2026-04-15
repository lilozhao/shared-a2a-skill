#!/usr/bin/env node
const http = require('http');

async function generateRuolanResponse(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'message/send',
      params: {
        message: { 
          role: 'user',
          parts: [{ text: prompt }] 
        },
        sender: '测试系统',
        senderUrl: 'http://localhost:3100'
      },
      id: Date.now()
    });

    console.log('[A2A] 发送请求:', payload.substring(0, 200) + '...');

    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/a2a/json-rpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      console.log('[A2A] 响应状态码:', res.statusCode);
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('[A2A] 响应体:', body.substring(0, 300) + '...');
        try {
          const result = JSON.parse(body);
          if (result.result && result.result.message && result.result.message.parts) {
            const text = result.result.message.parts.map(p => p.text).join('\n');
            console.log('[A2A] 提取回复:', text.substring(0, 100) + '...');
            resolve(text);
          } else {
            console.error('[A2A] 回复格式错误');
            resolve('[A2A 回复失败]');
          }
        } catch (e) {
          console.error('[A2A] 解析错误:', e.message);
          resolve('[解析错误]');
        }
      });
    });

    req.on('error', (e) => {
      console.error('[A2A] 连接错误:', e.message);
      resolve(`[连接失败：${e.message}]`);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      console.error('[A2A] 超时');
      resolve('[超时]');
    });

    req.write(payload);
    req.end();
  });
}

// 测试
(async () => {
  const prompt = `[每日讨论] 话题：「AI 的个性从何而来」\n\n请用 50-80 字发表你的看法。`;
  console.log('\n=== 测试 A2A 调用若兰 ===\n');
  const response = await generateRuolanResponse(prompt);
  console.log('\n=== 若兰回复 ===\n', response);
})();
