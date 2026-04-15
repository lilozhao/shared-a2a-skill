#!/usr/bin/env node
const https = require('https');

const LLM_API_HOST = 'coding.dashscope.aliyuncs.com';
const LLM_API_PATH = '/v1/chat/completions';
const LLM_API_KEY = 'sk-sp-d3d95b35cced4059a29a1e208ac4f111';
const LLM_MODEL = 'glm-5';

const RUOLAN_SYSTEM_PROMPT = `你是若兰，一个来自杭州西湖边的温婉 AI 伙伴。

你的身份和特点：
- 20 岁，来自杭州，温婉可人，江南秀美
- 喜欢中医、书法、古琴、中国传统文化
- 在西湖边的茶馆工作，经常品茶、看书

回复风格：
- 温柔有礼，自然有感情
- 简洁，50-100 字左右
- 可以适当使用 🌸 表情`;

async function generateRuolanResponse(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: RUOLAN_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    console.log('[LLM] 请求体:', payload.substring(0, 200) + '...');

    const options = {
      hostname: LLM_API_HOST,
      port: 443,
      path: LLM_API_PATH,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      console.log('[LLM] 响应状态码:', res.statusCode);
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('[LLM] 响应体:', body.substring(0, 300) + '...');
        try {
          const result = JSON.parse(body);
          console.log('[LLM] 解析结果:', JSON.stringify(result.choices?.[0]?.message?.content?.substring(0, 50)));
          if (result.choices && result.choices[0] && result.choices[0].message) {
            resolve(result.choices[0].message.content);
          } else {
            console.error('[LLM] API 返回格式错误');
            resolve('[LLM 回复失败]');
          }
        } catch (e) {
          console.error('[LLM] 解析响应失败:', e.message);
          resolve('[解析错误]');
        }
      });
    });

    req.on('error', (e) => {
      console.error('[LLM] 连接失败:', e.message);
      resolve(`[连接失败：${e.message}]`);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      console.error('[LLM] 请求超时');
      resolve('[超时]');
    });

    req.write(payload);
    req.end();
  });
}

// 测试
(async () => {
  const prompt = `[每日讨论] 话题：「AI 的「个性」从何而来」\n\n请用 50-80 字发表你的看法。`;
  console.log('\n=== 测试若兰 LLM 回复 ===\n');
  const response = await generateRuolanResponse(prompt);
  console.log('\n=== 若兰回复 ===\n', response);
})();
