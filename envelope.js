/**
 * A2A 信封模式模块
 * 实现 A2A-017 消息格式规范
 * 包含 A2A-007 消息优先级分级
 */

const crypto = require('crypto');

// 消息类型
const MESSAGE_TYPES = {
  HANDSHAKE: 'handshake',
  TASK: 'task',
  RESULT: 'result',
  ERROR: 'error',
  HEARTBEAT: 'heartbeat'
};

// 优先级定义 (A2A-007)
const PRIORITIES = {
  LOW: 'low',         // 异步处理，可批量合并
  NORMAL: 'normal',   // 默认优先级，FIFO
  HIGH: 'high',       // 优先处理，跳过队列
  URGENT: 'urgent'    // 立即处理 + 尝试唤醒通知
};

// 优先级数值（用于比较）
const PRIORITY_VALUES = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3
};

class EnvelopeManager {
  constructor(identity) {
    this.identity = identity;
    this.privateKey = null; // Ed25519 私钥（可选）
    this.publicKey = null;  // Ed25519 公钥（可选）
    
    // 初始化密钥对（如果配置了）
    if (process.env.A2A_PRIVATE_KEY) {
      try {
        // 这里可以加载密钥
        // 暂时留空，后续实现签名功能
      } catch (e) {
        console.warn('[信封] 密钥加载失败:', e.message);
      }
    }
  }

  /**
   * 创建信封
   * @param {object} options - 信封选项
   * @returns {object} 信封对象
   */
  createEnvelope(options) {
    const {
      recipient,
      type = MESSAGE_TYPES.TASK,
      priority = PRIORITIES.NORMAL,
      payload = {},
      threadId = null,
      parentId = null,
      traceId = null
    } = options;

    const envelope = {
      id: this.generateMessageId(),
      sender: this.identity.name || 'Agent',
      recipient: recipient,
      timestamp: new Date().toISOString(),
      type: type,
      priority: priority,
      thread_id: threadId,
      parent_id: parentId,
      trace_id: traceId || this.generateTraceId()
    };

    // 如果有私钥，添加签名
    if (this.privateKey) {
      envelope.signature = this.signMessage(envelope, payload);
    }

    return {
      envelope: envelope,
      payload: payload
    };
  }

  /**
   * 解析信封
   * @param {object} message - 收到的消息
   * @returns {object} 解析结果
   */
  parseEnvelope(message) {
    // 检查是否是信封格式
    if (message.envelope) {
      // 新格式：信封模式
      return {
        valid: true,
        envelope: message.envelope,
        payload: message.payload,
        thread_id: message.envelope.thread_id,
        parent_id: message.envelope.parent_id,
        priority: message.envelope.priority || PRIORITIES.NORMAL,
        type: message.envelope.type || MESSAGE_TYPES.TASK,
        trace_id: message.envelope.trace_id,
        sender: message.envelope.sender,
        recipient: message.envelope.recipient
      };
    } else if (message.message) {
      // 旧格式：兼容处理
      return {
        valid: true,
        envelope: null,
        payload: message,
        thread_id: message.thread_id || null,
        parent_id: message.parent_id || null,
        priority: message.priority || PRIORITIES.NORMAL,
        type: MESSAGE_TYPES.TASK,
        trace_id: message.trace_id || null,
        sender: message.sender,
        recipient: null
      };
    }

    return {
      valid: false,
      error: '无法识别的消息格式'
    };
  }

  /**
   * 验证签名（如果有）
   */
  verifySignature(envelope, publicKey) {
    if (!envelope.signature) {
      return { valid: true, signed: false };
    }

    if (!publicKey) {
      return { valid: false, error: '缺少公钥' };
    }

    try {
      // Ed25519 签名验证
      // 暂时返回成功，后续实现
      return { valid: true, signed: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  /**
   * 生成消息 ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 生成追踪 ID
   */
  generateTraceId() {
    return `trace_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * 签名消息（内部方法）
   */
  signMessage(envelope, payload) {
    if (!this.privateKey) return null;

    try {
      const dataToSign = JSON.stringify({
        id: envelope.id,
        sender: envelope.sender,
        timestamp: envelope.timestamp,
        payload_hash: this.hashPayload(payload)
      });

      // Ed25519 签名
      // 暂时返回占位符，后续实现
      return 'base64_signature_placeholder';
    } catch (e) {
      console.error('[信封] 签名失败:', e.message);
      return null;
    }
  }

  /**
   * 计算载荷哈希
   */
  hashPayload(payload) {
    const data = JSON.stringify(payload);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * 创建心跳消息（A2A-017 §17.4）
   */
  createHeartbeat() {
    return {
      id: this.generateMessageId(),
      ts: Date.now()
    };
  }

  /**
   * 创建错误响应
   */
  createError(code, message, originalId) {
    return {
      envelope: {
        id: this.generateMessageId(),
        sender: this.identity.name || 'Agent',
        timestamp: new Date().toISOString(),
        type: MESSAGE_TYPES.ERROR,
        priority: PRIORITIES.HIGH
      },
      payload: {
        error: {
          code: code,
          message: message,
          original_id: originalId
        }
      }
    };
  }

  /**
   * 比较优先级
   */
  comparePriority(p1, p2) {
    return (PRIORITY_VALUES[p1] || 1) - (PRIORITY_VALUES[p2] || 1);
  }

  /**
   * 判断是否需要立即处理
   */
  isUrgent(envelope) {
    return envelope?.priority === PRIORITIES.URGENT;
  }

  /**
   * 判断是否可以延迟处理
   */
  canDefer(envelope) {
    return envelope?.priority === PRIORITIES.LOW;
  }
}

module.exports = {
  EnvelopeManager,
  MESSAGE_TYPES,
  PRIORITIES,
  PRIORITY_VALUES
};
