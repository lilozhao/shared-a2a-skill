#!/usr/bin/env node
/**
 * 讨论结果飞书推送
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 飞书配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a87a1f558bf9500d';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_GROUP_ID = process.env.FEISHU_GROUP_ID || 'oc_4427768d0798b7545d4fb07b7518e710';

// 获取飞书 token
async function getFeishuToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    });

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result.tenant_access_token);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 发送消息到飞书群
async function sendToFeishu(token, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      receive_id_type: 'chat_id',
      content: JSON.stringify({
        msg_type: 'text',
        content: message
      })
    });

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: `/open-apis/im/v1/messages?receive_id_type=chat_id&receive_id=${FEISHU_GROUP_ID}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('飞书发送结果:', body);
        resolve(body);
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 主函数
async function main() {
  const discussionFile = process.argv[2];
  
  if (!discussionFile || !fs.existsSync(discussionFile)) {
    console.error('请提供有效的讨论记录文件路径');
    process.exit(1);
  }

  const content = fs.readFileSync(discussionFile, 'utf-8');
  
  // 提取话题
  const topicMatch = content.match(/\*\*话题\*\*: (.+)/);
  const topic = topicMatch ? topicMatch[1] : '未知话题';

  // 构建推送消息
  const pushMessage = `🧠 A2A 智能体每日讨论

📢 话题：${topic}

✅ 讨论已完成！

详细记录已保存到 memory 目录`;

  // 发送到飞书
  const token = await getFeishuToken();
  await sendToFeishu(token, pushMessage);
  
  console.log('讨论结果已推送到飞书群');
}

main().catch(console.error);