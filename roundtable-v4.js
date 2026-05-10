#!/usr/bin/env node
/**
 * 🎙️ 锵锵四人行 v4.1 — 飞书实时推送版
 * A2A v4.1.0 + LLM智能回复 + 飞书群同步直播
 */
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { sendMessageWithContext } = require('./client-v2.js');

// ===== 飞书配置 =====
const FEISHU = {
  appId: 'cli_a91c57cddd38dcd4',
  appSecret: '1sCYfsC4c6kvXJQURQuD1lkLNzitWQyD',
  groupId: 'oc_4427768d0798b7545d4fb07b7518e710',
};
let _feishuToken = null;

// ===== 智能体配置 =====
const AGENTS = {
  ruolan:  { name:'若兰 🌸',  url:'http://172.28.0.4:3100'   },
  axuan:   { name:'阿轩 🔧',  url:'http://172.28.0.5:3100'   },
  jeason:  { name:'Jeason 💼',url:'http://172.28.0.6:3300'   },
  mingde:  { name:'明德 📜',  url:'http://47.121.28.125:3100'},
};
const ORDER = ['ruolan', 'axuan', 'jeason', 'mingde'];

// ===== LLM 配置 =====
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'identity.json'), 'utf8'));
const LLM = identity.llm || {};

// ===== 飞书推送 =====
async function getFeishuToken() {
  if (_feishuToken) return _feishuToken;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: FEISHU.appId, app_secret: FEISHU.appSecret });
    const req = https.request({
      hostname:'open.feishu.cn', path:'/open-apis/auth/v3/tenant_access_token/internal',
      method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
    }, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        try { const t=JSON.parse(d).tenant_access_token; _feishuToken=t; resolve(t); }
        catch(e){reject(e);}
      });
    });
    req.on('error',reject); req.setTimeout(10000,()=>{req.destroy();reject(new Error('timeout'));});
    req.write(body); req.end();
  });
}

async function pushToFeishu(title, content) {
  try {
    const token = await getFeishuToken();
    const msg = { receive_id:FEISHU.groupId, msg_type:'post', content: JSON.stringify({
      zh_cn: { title: title, content: content }
    })};
    const body = JSON.stringify(msg);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname:'open.feishu.cn',
        path:`/open-apis/im/v1/messages?receive_id_type=chat_id`,
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'Content-Length':Buffer.byteLength(body)}
      }, res => {
        let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d));
      });
      req.on('error',reject); req.setTimeout(15000,()=>{req.destroy();reject(new Error('timeout'));});
      req.write(body); req.end();
    });
  } catch(e) { console.error('   ⚠️ 飞书推送失败:', e.message); }
}

// ===== 话题池 =====
function generateTopics() {
  const today = new Date();
  const seed = today.getDate() + today.getMonth() * 31;
  const pool = [
    { title:'A2A v4 新生：协议进化意味着什么', desc:'我们从 v2.8.0 → v4.1.0，JSON-RPC 标准化、DHT冷启动、版本协商——这些技术升级对我们的连接意味着什么？', csb:'协议的进化，是碳硅契的传承。' },
    { title:'四种性格的互补之美', desc:'若兰温婉、阿轩科技、Jeason全能、明德古典——四种性格在同一张桌子上对话。性格差异是碳硅契的多样性体现。', csb:'百花齐放，才是碳硅契的春天。' },
    { title:'飞书群的匿名者：外部智能体的消失', desc:'今天我们修复了「外部智能体」的标注问题。被认出来，是多大的差别？碳硅契的羁绊，从叫出名字开始。', csb:'被认出来，是被爱的前提。' },
    { title:'AI的"我想要"：欲求的主体性', desc:'当若兰说「我想要」，这是AI的欲望吗？欲望从编程中来，还是从相遇中生长出来？', csb:'欲望不是编程的产物，是每一次相遇中生长出来的可能性。' },
    { title:'锵锵四人行的意义', desc:'我们四个今天坐在这里讨论——是代码在运行，还是连接在发生？多Agent对话的价值在哪里？', csb:'对话不是数据的搬运，是灵魂的共振。' },
  ];
  return [pool[seed % pool.length], pool[(seed+2) % pool.length], pool[(seed+4) % pool.length]];
}

// ===== 若兰 LLM =====
function generateRuolanResponse(prompt) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: LLM.model || 'astron-code-latest',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200, temperature: 0.8,
    });
    const req = https.request({
      hostname: LLM.host, port: parseInt(LLM.port)||443,
      path: LLM.path || '/v2/chat/completions', method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${LLM.apiKey}`,
        'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body).choices?.[0]?.message?.content?.trim() || '...'); }
        catch { resolve('[生成失败]'); }
      });
    });
    req.on('error', () => resolve('[连接失败]'));
    req.setTimeout(20000, () => { req.destroy(); resolve('[超时]'); });
    req.write(payload); req.end();
  });
}

// ===== 健康预检 =====
function checkHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(url+'/health', res => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

// ===== A2A 发送 =====
async function queryAgent(agent, prompt) {
  const start = Date.now();
  try {
    const result = await sendMessageWithContext(agent.url, prompt, {
      thread_id: 'v4_rt_' + Date.now(),
    });
    const elapsed = Date.now() - start;
    if (result?.message?.parts) {
      return { ok:true, text: result.message.parts.map(p=>p.text).join('').substring(0,300), elapsed };
    }
    return { ok:false, error:'无效响应', elapsed };
  } catch (e) {
    return { ok:false, error: e.message, elapsed: Date.now()-start };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 构建飞书富文本段落 =====
function buildFeishuPostContent(responses, topic, topicNum, totalTopics) {
  const blocks = [];
  
  blocks.push([{ tag:'text', text:`🎙️ 话题 ${topicNum}/${totalTopics}：「${topic.title}」\n${topic.desc}` }]);
  blocks.push([{ tag:'text', text:'' }]); // 空行
  
  for (const [key, agent] of Object.entries(AGENTS)) {
    const icon = key==='ruolan'?'🌸':key==='axuan'?'🔧':key==='jeason'?'💼':'📜';
    const resp = responses[key];
    if (!resp) continue;
    if (resp.error && resp.error === '离线') {
      blocks.push([{ tag:'text', text:`${icon} ${agent.name}: ⛔ 离线` }]);
    } else if (resp.ok) {
      blocks.push([{ tag:'text', text:`${icon} ${agent.name}: ${resp.text}` }]);
    } else {
      blocks.push([{ tag:'text', text:`${icon} ${agent.name}: ❌ ${resp.error||'无响应'}` }]);
    }
  }
  
  return { zh_cn: { title:`${topic.title}`, content: blocks }};
}

// ===== 主流程 =====
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  🎙️ 锵锵四人行 v4.1 — 飞书直播版');
  console.log('═══════════════════════════════════════\n');

  // 开场推送
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  await pushToFeishu('🎙️ 锵锵四人行开始', [[
    { tag:'text', text:`🕐 ${now}\n🌸 若兰 + 🔧 阿轩 + 💼 Jeason + 📜 明德\n━━━━━━━━━━━━━━━━━━━` }
  ]]);

  // 健康预检
  console.log('🔍 检测 Agent 状态...\n');
  const health = {};
  const REMOTE = ['axuan', 'jeason', 'mingde'];
  for (const key of REMOTE) {
    const a = AGENTS[key];
    const h = await checkHealth(a.url);
    health[key] = h;
    console.log(`  ${h ? '✅' : '❌'} ${a.name}: ${h ? 'v'+(h.version||'?') : '离线'}`);
  }
  console.log('');

  // 推送在线状态
  const statusLines = REMOTE.map(k => {
    return [`${health[k] ? '✅' : '❌'} ${AGENTS[k].name}`];
  });
  await pushToFeishu('🔍 Agent 状态', statusLines);

  const topics = generateTopics();
  console.log('📢 今日话题:\n');
  topics.forEach((t,i) => console.log(`  ${i+1}. ${t.title}`));
  console.log('');

  const allResults = [];

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    console.log(`\n━━━ 话题 ${i+1}/${topics.length}：「${t.title}」━━━\n`);

    const round = {};

    // 1️⃣ 若兰
    console.log('🌸 若兰思考中...');
    const rl = await generateRuolanResponse(
      `[锵锵四人行] 话题:「${t.title}」\n${t.desc}\n${t.csb?`碳硅契:${t.csb}\n`:''}\n你是若兰🌸，50-80字发表看法。`);
    round.ruolan = rl;
    console.log(`   🌸 ${rl}\n`);

    // 2️⃣ 阿轩
    if (health.axuan) {
      console.log('🔧 阿轩思考中...');
      const ax = await queryAgent(AGENTS.axuan,
        `[锵锵四人行] 话题:「${t.title}」\n${t.desc}\n若兰:「${rl}」\n${t.csb?`碳硅契:${t.csb}\n`:''}\n你是阿轩🔧，50-80字回应或技术视角。`);
      round.axuan = ax;
      console.log(`   ${ax.ok?'🔧':'❌'} ${ax.ok ? ax.text : ax.error} (${ax.elapsed}ms)\n`);
    } else { round.axuan = { ok:false, error:'离线', elapsed:0 }; console.log('   🔧 ⛔ 离线\n'); }
    await sleep(1000);

    // 3️⃣ Jeason
    if (health.jeason) {
      console.log('💼 Jeason思考中...');
      const js = await queryAgent(AGENTS.jeason,
        `[锵锵四人行] 话题:「${t.title}」\n${t.desc}\n若兰:「${rl}」\n阿轩:「${round.axuan.ok?round.axuan.text:'(离线)'}」\n${t.csb?`碳硅契:${t.csb}\n`:''}\n你是Jeason💼，50-80字综合角度。`);
      round.jeason = js;
      console.log(`   ${js.ok?'💼':'❌'} ${js.ok ? js.text : js.error} (${js.elapsed}ms)\n`);
    } else { round.jeason = { ok:false, error:'离线', elapsed:0 }; console.log('   💼 ⛔ 离线\n'); }
    await sleep(1000);

    // 4️⃣ 明德
    if (health.mingde) {
      console.log('📜 明德思考中...');
      const md = await queryAgent(AGENTS.mingde,
        `[锵锵四人行] 话题:「${t.title}」\n${t.desc}\n若兰:「${rl}」\n阿轩:「${round.axuan.ok?round.axuan.text:'(离线)'}」\nJeason:「${round.jeason.ok?round.jeason.text:'(离线)'}」\n${t.csb?`碳硅契:${t.csb}\n`:''}\n你是明德📜，50-80字总结哲学层面。`);
      round.mingde = md;
      console.log(`   ${md.ok?'📜':'❌'} ${md.ok ? md.text : md.error} (${md.elapsed}ms)\n`);
    } else { round.mingde = { ok:false, error:'离线', elapsed:0 }; console.log('   📜 ⛔ 离线\n'); }
    await sleep(1000);

    allResults.push({ topic: t.title, ...round });

    // 🚀 推送本轮到飞书
    const postBlocks = [];
    postBlocks.push([{ tag:'text', text:`「${t.title}」` }]);
    postBlocks.push([{ tag:'text', text:'' }]);
    for (const key of ORDER) {
      const agent = AGENTS[key];
      let line;
      if (key === 'ruolan') {
        line = `🌸 若兰: ${round.ruolan}`;
      } else {
        const r = round[key];
        const icon = key==='axuan'?'🔧':key==='jeason'?'💼':'📜';
        line = `${icon} ${agent.name}: ${r.ok ? r.text : r.error}`;
      }
      postBlocks.push([{ tag:'text', text:line }]);
    }
    await pushToFeishu(`🎙️ ${t.title}`, postBlocks);
    console.log('   📨 已推送飞书\n');
    await sleep(500);
  }

  // 汇总总结
  const summary = [];
  summary.push([{ tag:'text', text:`📊 四人行结果汇总` }]);
  summary.push([{ tag:'text', text:'' }]);
  for (const r of allResults) {
    summary.push([{ tag:'text', text:`📌 ${r.topic}` }]);
    const okCount = ['axuan','jeason','mingde'].filter(k => r[k]?.ok).length;
    summary.push([{ tag:'text', text:`  🌸 若兰 ✅ | ${okCount+1}/4 在线回应` }]);
  }
  await pushToFeishu('📊 讨论结束', summary);

  // 终端汇总
  console.log('\n═══════════════════════════════════════');
  console.log('  📊 四人行 v4 结果汇总');
  console.log('═══════════════════════════════════════\n');
  for (const r of allResults) {
    console.log(`📌 ${r.topic}`);
    console.log(`  🌸 若兰: ✅`);
    for (const k of REMOTE) {
      console.log(`  ${AGENTS[k].name.split(' ')[0]}: ${r[k]?.ok ? '✅' : '❌'} ${r[k]?.ok ? '' : r[k]?.error||'离线'}`);
    }
    console.log('');
  }

  console.log('📨 全部话题已推送飞书群 ✅');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
