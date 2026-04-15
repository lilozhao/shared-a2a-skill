/**
 * A2A 远程命令执行 - Fallback 沙箱
 * 纯代码级限制，适用于所有平台
 */

const { spawn } = require('child_process');
const { SandboxProvider } = require('./index.js');

class FallbackSandbox extends SandboxProvider {
  constructor(config = {}) {
    super();
    this.config = {
      timeout: config.timeout || 30000,
      memoryLimit: config.memoryLimit || 128 * 1024 * 1024, // 128MB
      maxOutputSize: config.maxOutputSize || 1024 * 1024, // 1MB
      ...config
    };
  }

  /**
   * 执行命令
   * @param {string} commandType - 命令类型
   * @param {Object} params - 命令参数
   * @returns {Promise<Object>}
   */
  async execute(commandType, params) {
    console.log(`[A2A-CMD] Fallback sandbox executing: ${commandType}`);
    
    const script = this.buildCommandScript(commandType, params);
    
    return new Promise((resolve, reject) => {
      const child = spawn('node', ['-e', script], {
        timeout: this.config.timeout,
        detached: false,
        env: {
          ...process.env,
          // 限制内存
          NODE_OPTIONS: `--max-old-space-size=${Math.floor(this.config.memoryLimit / 1024 / 1024)}`
        }
      });

      let stdout = '';
      let stderr = '';
      let outputSize = 0;

      child.stdout.on('data', (data) => {
        outputSize += data.length;
        if (outputSize > this.config.maxOutputSize) {
          child.kill('SIGTERM');
          reject(new Error('Output size limit exceeded'));
          return;
        }
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Invalid output format: ${stdout}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Process error: ${err.message}`));
      });
    });
  }

  /**
   * 构建命令脚本
   */
  buildCommandScript(commandType, params) {
    const safeParams = JSON.stringify(params || {});
    
    const commandImplementations = {
      'system.status': `
        (() => {
          const os = require('os');
          return {
            success: true,
            data: {
              platform: os.platform(),
              arch: os.arch(),
              uptime: os.uptime(),
              loadavg: os.loadavg(),
              memory: {
                total: os.totalmem(),
                free: os.freemem()
              },
              cpus: os.cpus().length
            }
          };
        })()
      `,
      'skill.list': `
        (() => {
          const fs = require('fs');
          const path = '/home/node/.openclaw/workspace/skills';
          try {
            const items = fs.readdirSync(path, { withFileTypes: true });
            const skills = items
              .filter(item => item.isDirectory())
              .map(item => ({ name: item.name }));
            return { success: true, data: skills };
          } catch (e) {
            return { success: false, error: 'Cannot read skills directory: ' + e.message };
          }
        })()
      `,
      'skill.info': `
        (() => {
          const fs = require('fs');
          const path = '/home/node/.openclaw/workspace/skills/' + ${safeParams}.skill + '/SKILL.md';
          try {
            const content = fs.readFileSync(path, 'utf8');
            return { success: true, data: { name: ${safeParams}.skill, readme: content.substring(0, 500) } };
          } catch (e) {
            return { success: false, error: 'Skill not found: ' + e.message };
          }
        })()
      `,
      'agent.health': `
        ({
          success: true,
          data: {
            status: 'healthy',
            timestamp: Date.now()
          }
        })
      `
    };

    const implementation = commandImplementations[commandType];
    if (!implementation) {
      return `({ success: false, error: 'Unknown command: ${commandType}' })`;
    }

    return `console.log(JSON.stringify(${implementation}));`;
  }

  getPlatform() {
    return 'fallback';
  }

  async health() {
    return true; // Fallback 总是可用
  }
}

module.exports = { FallbackSandbox };
