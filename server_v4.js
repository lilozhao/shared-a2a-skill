#!/usr/bin/env node
/**
 * A2A Server v4 — 标准协议完整版
 *
 * 🆚 v3 → v4 升级清单:
 *   ✅ 标准 JSON-RPC: SendMessage/GetTask/ListTasks/CancelTask
 *   ✅ REST 端点: /tasks, /tasks/:id, POST /tasks/:id/cancel
 *   ✅ SSE 流式: /a2a/stream/:id, /message:stream
 *   ✅ A2A-018 API 版本管理 (A2A-Version 请求头)
 *   ✅ A2A-019 流量控制 (RateLimiter 60rpm)
 *   ✅ A2A-020 可观测性 (Prometheus + 审计日志 + 追踪)
 *   ✅ A2A-021 端到端加密 (AES-256-GCM + HKDF)
 *   ✅ A2A-026 DHT 冷启动降级
 *
 * 版本: 4.1.0 | 2026-05-10
 */

const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ===== 模块加载 =====
const { logConversation }         = require('./log_conversation');
const { TaskStore }               = require('./a2a-task-store.js');
const { A2AStandardAPI }          = require('./a2a-standard-api.js');
const { RateLimiter }             = require('./a2a-standard-api.js');
const { E2EEncryption, createEncryptionMiddleware } = require('./a2a-e2e-encryption.js');
const { MetricsCollector, AuditLogger, traceMiddleware, collectSystemMetrics } = require('./a2a-observability.js');
const { DHTColdStartManager, DEGRADATION_LEVEL } = require('./a2a-dht-coldstart.js');

// v3 模块加载
const loadedV3 = {};
try { const { ContextManager } = require('./context-manager.js'); loadedV3.contextManager = new ContextManager(); console.log('[A2A] ✅ context (A2A-004)'); } catch(e) { console.warn('context-manager:', e.message); }
try { loadedV3.envelopeManager = new (require('./envelope.js').EnvelopeManager)({}); console.log('[A2A] ✅ envelope (A2A-007/017)'); } catch(e) { console.warn('envelope:', e.message); }
try { const { SemanticValidator } = require('./semantic-validator.js'); loadedV3.semanticValidator = new SemanticValidator({ vocabPath: path.join(__dirname, 'vocab.json'), maxWildcardDepth: 3, enableFallback: true }); console.log('[A2A] ✅ semantic (A2A-013)'); } catch(e) { console.warn('semantic-validator:', e.message); }
try { loadedV3.negotiationEngine = new (require('./version-negotiator.js').NegotiationEngine)({ costThreshold: 0.5, gracePeriodDays: 7 }); console.log('[A2A] ✅ version-negotiation (A2A-011)'); } catch(e) { console.warn('version-negotiator:', e.message); }
try { loadedV3.trustManager = new (require('./trust-manager.js').TrustLevelManager)({ maxHops: 3, witnessThreshold: 3 }); console.log('[A2A] ✅ trust (A2A-010)'); } catch(e) { console.warn('trust-manager:', e.message); }

// 加载已知 Agent 静态清单 (DHT 冷启动)
let knownAgents = [];
try { knownAgents = JSON.parse(fs.readFileSync(path.join(__dirname, 'known-agents.json'), 'utf8')); } catch {}

// ===== 配置 =====
const identityPath = process.env.A2A_IDENTITY_PATH || path.join(__dirname, 'identity.json');
const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
const port = process.env.A2A_PORT || identity.port || 3100;
const A2A_VERSION = '4.1.0';

// ===== 核心组件初始化 =====
const taskStore = new TaskStore({
  persistencePath: path.join(__dirname, 'data', 'a2a-tasks.json'),
  maxTasks: 10000,
  taskTTL: 7 * 24 * 60 * 60 * 1000,
  debounceMs: 1000,
});

const rateLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.A2A_RATE_LIMIT || '60'),
  windowMs: 60000,
});

const metrics = new MetricsCollector();
const auditLogger = new AuditLogger({ logPath: '/tmp/a2a-audit.log' });

const e2eManager = new E2EEncryption({
  masterKey: process.env.A2A_ENCRYPTION_KEY || null,
  keyVersion: parseInt(process.env.A2A_KEY_VERSION || '1'),
});

const standardAPI = new A2AStandardAPI({
  identity, taskStore,
  envelopeManager:   loadedV3.envelopeManager   || null,
  trustManager:      loadedV3.trustManager      || null,
  semanticValidator: loadedV3.semanticValidator || null,
  negotiationEngine: loadedV3.negotiationEngine || null,
  rateLimiter,
  supportedVersion: process.env.A2A_PROTOCOL_VERSION || '0.5',
});

const dhtManager = new DHTColdStartManager({
  registries: [
    process.env.A2A_REGISTRY_URL || 'http://csbc.lilozkzy.top:3099',
  ],
});

// ===== Express App =====
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (限制而非 *)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = ['http://localhost:19089', 'http://127.0.0.1:19089', 'http://localhost:3000'];
  if (allowed.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, A2A-Version, X-Trace-Id');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 追踪中间件 (A2A-020)
app.use(traceMiddleware({ metrics, auditLogger }));

// E2E 加密中间件 (A2A-021)
if (e2eManager.enabled) {
  app.use(createEncryptionMiddleware(e2eManager));
  console.log('[A2A] ✅ E2E 加密已启用 (A2A-021)');
} else {
  console.log('[A2A] ℹ️  E2E 加密未配置密钥');
}

// ===== 路由注册 =====
standardAPI.registerRoutes(app);

// 健康检查 (增强: 含 DHT + E2E + 指标)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: A2A_VERSION,
    protocol: 'A2A v0.5',
    identity: identity.name,
    uptime: Math.floor(process.uptime()),
    dht: dhtManager.getStatus(),
    e2e: e2eManager.getStats(),
    rateLimit: rateLimiter.getStats(),
    tasks: taskStore.getStats(),
  });
});

// Prometheus 指标端点 (A2A-020)
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics.exportPrometheus());
});

// Agent 列表 (A2A-026 支持)
app.get('/agents', async (req, res) => {
  const agents = await dhtManager.listAllAgents();
  res.json({ agents, dhtStatus: dhtManager.getStatus() });
});

// 能力声明
app.get('/capabilities', (req, res) => {
  const capabilities = standardAPI.getCapabilities();
  capabilities.e2e = e2eManager.enabled;
  capabilities.dht = dhtManager.getStatus().level.name;
  capabilities.observability = { metrics: true, tracing: true, audit: true };
  res.json({ agent: identity.name, version: A2A_VERSION, capabilities });
});

// Agent Card (A2A-001)
app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: identity.name,
    emoji: identity.emoji || '🤖',
    description: identity.description || '',
    version: A2A_VERSION,
    protocolVersion: '0.5',
    endpoints: {
      jsonrpc: `http://localhost:${port}/a2a/json-rpc`,
      rest: { sendMessage: `http://localhost:${port}/message:send`, getTask: `http://localhost:${port}/tasks/`, listTasks: `http://localhost:${port}/tasks`, cancel: `http://localhost:${port}/tasks/:id/cancel`, stream: `http://localhost:${port}/a2a/stream/:id` },
    },
    capabilities: standardAPI.getCapabilities(),
    skills: identity.skills || [],
    authentication: { schemes: ['bearer'] },
  });
});

app.get('/.well-known/agent-card.json', (req, res) => {
  res.redirect(301, '/.well-known/agent.json');
});

// ===== 启动 =====
console.log(`\n${'─'.repeat(55)}`);
console.log(`  ${identity.emoji || '🌸'} ${identity.name} A2A Server v${A2A_VERSION}`);
console.log(`  📡 端口:${port}  协议:A2A v0.5(26条)  DHT:待启动`);
console.log(`  📋 JSON-RPC  │ REST  │ SSE  │ E2E(${e2eManager.enabled ? '✅' : '⚠️ '})`);
console.log(`${'─'.repeat(55)}`);

// 启动 DHT 探测
dhtManager.startProbe();
console.log(`  📡 DHT: 已启动探测 (间隔 ${(dhtManager.probeInterval / 60000).toFixed(0)}min)`);

// 启动系统指标收集 (A2A-020)
collectSystemMetrics(metrics, taskStore);

// 优雅停机
const shutdown = async () => {
  console.log('\n  🛑 正在关闭...');
  dhtManager.stopProbe();
  taskStore.flushSync();
  auditLogger.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const server = app.listen(port, () => {
  console.log(`  ✅ 服务已启动: http://localhost:${port}/health`);
  console.log(`  ✅ 指标端点:   http://localhost:${port}/metrics\n`);
});

module.exports = { app, standardAPI, taskStore, dhtManager, e2eManager, metrics };
