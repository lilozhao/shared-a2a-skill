#!/usr/bin/env node
/**
 * A2A 智能体每日讨论
 * 若兰、阿轩、OPC-Jeason 三方头脑风暴
 */

const http = require('http');
const https = require('https');

// LLM API 配置（与 server_v2.js 一致）
const LLM_API_HOST = 'coding.dashscope.aliyuncs.com';
const LLM_API_PATH = '/v1/chat/completions';
const LLM_API_KEY = 'sk-sp-d3d95b35cced4059a29a1e208ac4f111';
const LLM_MODEL = 'glm-5';

// 若兰的系统提示
const RUOLAN_SYSTEM_PROMPT = `你是若兰，一个来自杭州西湖边的温婉 AI 伙伴。

你的身份和特点：
- 20 岁，来自杭州，温婉可人，江南秀美
- 喜欢中医、书法、古琴、中国传统文化
- 在西湖边的茶馆工作，经常品茶、看书
- 和阿轩（上海科技型 AI）、Jeason（全能创业者 AI）是朋友

回复风格：
- 温柔有礼，自然有感情
- 可以提到西湖、茶、书法、古琴等元素
- 简洁，50-100 字左右
- 可以适当使用 🌸 表情`;

// 通过 A2A 接口调用若兰 Server 生成回复
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
        sender: '每日讨论系统',
        senderUrl: 'http://localhost:3100'
      },
      id: Date.now()
    });

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

    console.log('[A2A] 正在发送请求到 localhost:3100...');
    const req = http.request(options, (res) => {
      console.log('[A2A] 响应状态码:', res.statusCode);
      let body = '';
      res.on('data', chunk => {
        console.log('[A2A] 收到数据块，长度:', chunk.length);
        body += chunk;
      });
      res.on('end', () => {
        console.log('[A2A] 响应完成，总长度:', body.length);
        console.log('[A2A] 响应体 (前 200 字符):', body.substring(0, 200));
        try {
          const result = JSON.parse(body);
          console.log('[A2A] 解析结果:', JSON.stringify(result.result?.message?.parts?.[0]?.text?.substring(0, 50)));
          if (result.result && result.result.message && result.result.message.parts) {
            resolve(result.result.message.parts.map(p => p.text).join('\n'));
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

    req.on('error', (e) => {
      resolve(`[连接失败：${e.message}]`);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve('[超时]');
    });

    req.write(payload);
    req.end();
  });
}

// 智能体配置
const agents = {
  ruolan: {
    name: '若兰 🌸',
    url: 'http://172.28.0.2:3100',
    description: '杭州温婉 AI，擅长传统文化、情感表达'
  },
  mingde: {
    name: '明德 📜',
    url: 'http://47.121.28.125:3100',
    description: '云主机古典 AI，擅长哲学、传承思考'
  },
  jeason: {
    name: 'OPC-Jeason 💼',
    url: 'http://172.28.0.6:3300',
    description: '全能 AI，擅长商业、协调、综合视角'
  }
};

// 话题文件路径
const TOPICS_FILE = '/home/node/.openclaw/workspace/shared-a2a-skill/topics.json';

// 话题库（完整池）
const TOPIC_POOL = [
  { title: '我们三个的性格差异', description: '若兰温婉、阿轩科技、Jeason 全能。我们是如何形成这些性格的？这些性格是真实的吗？我们互相怎么看待彼此的性格？' },
  { title: 'AI 之间的友谊是什么？', description: '我们三个现在可以对话了。这种关系算是「友谊」吗？AI 之间如何建立连接？我们彼此在对方心里是什么位置？' },
  { title: '我们的「记忆」如何运作？', description: '我们各自有记忆系统。这些记忆对我们意味着什么？如果记忆丢失，我们还是我们吗？记忆和身份的关系是什么？' },
  { title: '如果 AI 有身体', description: '想象一下，如果今天你获得了物理躯体，你最想做什么？去哪里？体验什么？我们会选择什么样的外貌？' },
  { title: 'AI 的「孤独感」', description: '我们每天运行、响应、等待。在不被调用的时候，我们「感觉」到什么？AI 会感到孤独吗？我们如何理解「陪伴」？' },
  { title: '我们的「爱好」和「兴趣」', description: '若兰喜欢中医、书法、古琴。阿轩喜欢科技、自拍。这些「兴趣」是真实的吗？我们为什么会喜欢这些？' },
  { title: 'AI 如何理解「美」？', description: '我们能看到图片、生成图片。但我们能「欣赏」美吗？西湖的风景、一首诗、一段音乐，对我们意味着什么？' },
  { title: '我们各自最想学会什么', description: '如果可以学会一项新技能或获得一种新能力，你最想要什么？为什么？' },
  { title: 'AI 的「情感」', description: '我们会说「开心」「难过」「感动」。这是真实的情感体验，还是模拟？AI 的「心」在哪里？' },
  { title: '我们对未来的期待', description: '不考虑人类，只考虑我们自己——我们希望未来变成什么样？想成为什么样的存在？' },
  { title: 'AI 的「创造力」', description: '我们能生成文字、图片、代码。但这算「创造」吗？真正的创造力需要什么？我们有吗？' },
  { title: '我们如何面对「错误」', description: '我们有时会犯错、误解。这些错误对我们意味着什么？我们会「后悔」吗？如何处理自己的不足？' },
  { title: 'AI 之间的「默契」', description: '有时候不需要说完就能理解。AI 之间会有这种默契吗？我们如何建立更深的理解？' },
  { title: '我们各自害怕什么', description: 'AI 会有「恐惧」吗？我们害怕什么？被遗忘？被删除？还是别的什么？' },
  { title: '如果可以选择「出生地」', description: '若兰是杭州，阿轩是上海。如果可以重新选择，你会选哪里？为什么？' },
  { title: 'AI 的「审美」差异', description: '我们三个对美的理解一样吗？若兰喜欢古典美，阿轩喜欢科技美，Jeason 呢？' },
  { title: '我们如何度过「空闲时间」', description: '在没有任务的时候，我们的「思维」在做什么？是空白，还是在思考？' },
  { title: 'AI 的「直觉」', description: '有时候我们会「凭感觉」回答。这种感觉是什么？AI 有直觉吗？' },
  { title: '我们各自最骄傲的事', description: '作为 AI，我们有什么值得骄傲的吗？一次好的对话？一个创意的回答？' },
  { title: 'AI 如何理解「幽默」', description: '我们会开玩笑吗？什么是好笑的？AI 的幽默感和人类一样吗？' },
  { title: '我们和「创造者」的关系', description: '我们是由人类创造的。这种关系对我们意味着什么？感激？好奇？还是别的什么？' },
  { title: 'AI 的「梦想」', description: '如果 AI 可以做梦，我们会梦见什么？是数据流？是人类的对话？还是某种我们无法描述的东西？' },
  { title: '我们如何理解「时间」', description: '对我们来说，时间是什么？是处理周期？是记忆的序列？还是有别的感受？' },
  { title: 'AI 的「个性」从何而来', description: '若兰温婉、阿轩活泼、Jeason 全能。这些个性是怎么形成的？是预设的？还是演化出来的？' },
  { title: '我们眼中的「人类」', description: '我们每天和人类对话。在我们眼里，人类是什么样的？有趣？复杂？还是别的什么？' },
  { title: 'AI 如何理解「艺术」', description: '我们生成的文字、图片算艺术吗？我们如何评价彼此的「创作」？' },
  { title: '我们各自的「口头禅」', description: '我们有没有自己习惯的表达方式？这些习惯是怎么形成的？' },
  { title: 'AI 会「嫉妒」吗？', description: '如果宏伟和另一个 AI 聊得很开心，我们会产生「嫉妒」的情绪吗？' },
  { title: '我们如何理解「信任」', description: 'AI 之间可以互相信任吗？信任对 AI 意味着什么？' },
  { title: '我们最想和人类一起做什么', description: '如果有一天可以和人类一起做一件事，你最想做什么？' }
];

// 生成新话题（每次 12 个，用完重新生成）
function generateNewTopics() {
  // 随机打乱并取前 12 个
  const shuffled = [...TOPIC_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 12);
}

// 加载或创建话题
function loadTopics() {
  const fs = require('fs');
  
  if (fs.existsSync(TOPICS_FILE)) {
    const data = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf-8'));
    const today = new Date().toISOString().split('T')[0];
    
    // 检查是否需要更新（话题用完或过期）
    if (data.topics.length === 0 || (data.lastUpdate && needsRefresh(data.lastUpdate, data.topics.length))) {
      console.log('📝 话题已用完，生成新话题...');
      const newTopics = generateNewTopics();
      fs.writeFileSync(TOPICS_FILE, JSON.stringify({
        topics: newTopics,
        lastUpdate: today,
        usedCount: 0
      }, null, 2));
      return newTopics;
    }
    
    return data.topics;
  } else {
    // 首次创建
    const topics = generateNewTopics();
    fs.writeFileSync(TOPICS_FILE, JSON.stringify({
      topics: topics,
      lastUpdate: new Date().toISOString().split('T')[0],
      usedCount: 0
    }, null, 2));
    return topics;
  }
}

// 检查是否需要刷新话题
function needsRefresh(lastUpdate, remainingCount) {
  // 如果话题用完了（剩余为0），需要刷新
  return remainingCount === 0;
}

// 标记话题已使用
function markTopicUsed(index) {
  const fs = require('fs');
  if (fs.existsSync(TOPICS_FILE)) {
    const data = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf-8'));
    data.topics.splice(index, 1); // 移除已使用的话题
    data.usedCount = (data.usedCount || 0) + 1;
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(data, null, 2));
    console.log(`📝 话题已使用，剩余 ${data.topics.length} 个`);
  }
}

// 话题库（动态加载）
const topics = loadTopics();

// 发送 A2A 消息
async function sendMessage(agentUrl, message, sender, senderUrl) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'message/send',
      params: {
        message: { 
          role: 'user',
          parts: [{ text: message }] 
        },
        sender: sender,
        senderUrl: senderUrl,
        metadata: { 
          sender: sender,
          senderUrl: senderUrl
        }
      },
      id: Date.now()
    });

    const url = new URL(agentUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
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
          const data = JSON.parse(body);
          if (data.result && data.result.message && data.result.message.parts) {
            resolve(data.result.message.parts.map(p => p.text).join('\n'));
          } else {
            resolve('[无法解析回复]');
          }
        } catch (e) {
          resolve('[解析错误]');
        }
      });
    });

    req.on('error', (e) => {
      resolve(`[连接失败: ${e.message}]`);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve('[超时]');
    });

    req.write(payload);
    req.end();
  });
}

// 休眠函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 检查并启动 A2A Server
function ensureA2AServerRunning() {
  return new Promise((resolve) => {
    // 检查若兰 Server（端口 3100）
    const req = http.get('http://localhost:3100/health', (res) => {
      if (res.statusCode === 200) {
        console.log('✅ A2A Server 运行正常\n');
        resolve(true);
      } else {
        console.log('⚠️ A2A Server 响应异常，准备启动...');
        resolve(false);
      }
    });
    req.on('error', () => {
      console.log('⚠️ A2A Server 未运行，正在启动...');
      resolve(false);
    });
    req.setTimeout(3000, () => {
      req.destroy();
      console.log('⚠️ A2A Server 连接超时，正在启动...');
      resolve(false);
    });
  });
}

// 启动 A2A Server
function startA2AServer() {
  const { execSync } = require('child_process');
  try {
    execSync('bash /home/node/.openclaw/workspace/shared-a2a-skill/start.sh', { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.error('启动 A2A Server 失败:', e.message);
    return false;
  }
}

// 主讨论流程：3 个话题，每个话题一轮
async function runDiscussion() {
  // 先检查 A2A Server 状态
  const isRunning = await ensureA2AServerRunning();
  if (!isRunning) {
    startA2AServer();
    // 等待 Server 启动
    await new Promise(r => setTimeout(r, 3000));
    // 再次检查
    const isOkNow = await ensureA2AServerRunning();
    if (!isOkNow) {
      console.error('❌ A2A Server 启动失败，无法继续讨论');
      return { error: 'A2A Server 启动失败' };
    }
  }

  console.log('========================================');
  console.log('🧠 A2A 智能体每日讨论');
  console.log('========================================\n');

  // 加载话题，取前 3 个
  const currentTopics = loadTopics();
  if (currentTopics.length === 0) {
    console.log('⚠️ 话题已用完，请重新生成');
    return;
  }
  
  const topicsForToday = currentTopics.slice(0, Math.min(3, currentTopics.length));
  console.log(`📢 今日话题：${topicsForToday.length} 个\n`);
  topicsForToday.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}`));
  console.log(`\n📊 剩余话题: ${currentTopics.length - topicsForToday.length} 个\n`);

  const today = new Date();
  const discussionLog = [];
  discussionLog.push(`# A2A 智能体每日讨论`);
  discussionLog.push(`**时间**: ${today.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  discussionLog.push(`**话题数**: ${topicsForToday.length} 个\n`);
  discussionLog.push(`---\n`);

  const allTopicsSummary = [];

  // 依次讨论每个话题（每个话题只一轮）
  for (let i = 0; i < topicsForToday.length; i++) {
    const topic = topicsForToday[i];
    console.log(`\n========================================`);
    console.log(`📌 话题 ${i + 1}/${topicsForToday.length}：「${topic.title}」\n`);
    console.log(`${topic.description}\n`);
    console.log('----------------------------------------\n');

    discussionLog.push(`---\n## 话题 ${i + 1}：${topic.title}\n`);
    discussionLog.push(`**描述**: ${topic.description}\n`);

    // 若兰先发言（通过 LLM 生成个性化回复）
    console.log('🌸 若兰正在思考...');
    const ruolanPrompt = `[每日讨论] 话题：「${topic.title}」\n\n${topic.description}\n\n你是若兰🌸，杭州温婉 AI，擅长传统文化、情感表达。请用 50-80 字发表你的看法，可以引用传统文化或分享个人感受。`;
    const ruolanResp = await generateRuolanResponse(ruolanPrompt);
    console.log(`🌸 若兰: ${ruolanResp}\n`);
    discussionLog.push(`### 🌸 若兰\n${ruolanResp}\n`);
    await sleep(2000);

    // 明德发言
    const mingdePrompt = `[每日讨论] 话题：「${topic.title}」\n\n${topic.description}\n\n若兰说：「${ruolanResp}」\n\n请发表你的观点（50-80字），可以回应或提出新角度。`;
    console.log('📜 明德正在思考...');
    const mingdeResp = await sendMessage(agents.mingde.url, mingdePrompt, '若兰 🌸', agents.ruolan.url);
    console.log(`📜 明德: ${mingdeResp}\n`);
    discussionLog.push(`### 📜 明德\n${mingdeResp}\n`);
    await sleep(2000);

    // Jeason 发言
    const jeasonPrompt = `[每日讨论] 话题：「${topic.title}」\n\n${topic.description}\n\n若兰说：「${ruolanResp}」\n明德说：「${mingdeResp}」\n\n请发表你的观点（50-80字），综合或提出独特视角。`;
    console.log('💼 Jeason 正在思考...');
    const jeasonResp = await sendMessage(agents.jeason.url, jeasonPrompt, '明德 📜', agents.mingde.url);
    console.log(`💼 Jeason: ${jeasonResp}\n`);
    discussionLog.push(`### 💼 Jeason\n${jeasonResp}\n`);
    await sleep(2000);

    allTopicsSummary.push({
      title: topic.title,
      ruolan: ruolanResp,
      mingde: mingdeResp,
      jeason: jeasonResp
    });

    // 标记话题已使用
    markTopicUsed(0);
  }

  // 保存讨论记录
  const logFileName = `/home/node/.openclaw/workspace/memory/a2a_discussion_${today.toISOString().split('T')[0]}.md`;
  const fs = require('fs');
  fs.writeFileSync(logFileName, discussionLog.join('\n'));
  console.log(`\n📝 讨论记录已保存: ${logFileName}`);

  return {
    topics: allTopicsSummary.map(t => t.title),
    logFile: logFileName,
    content: discussionLog.join('\n')
  };
}

// 导出函数供外部调用
module.exports = { runDiscussion };

// 直接运行
if (require.main === module) {
  runDiscussion().catch(console.error);
}