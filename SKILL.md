# A2A 共享 Skill

让多个 OpenClaw 智能体可以通过 A2A 协议互相通信。

## 快速使用

```bash
# 更新到最新版本
./update.sh

# 启动 A2A Server
./start.sh
```

## 配置

每个智能体需要创建自己的 `identity.json`：

```json
{
  "name": "若兰",
  "emoji": "🌸",
  "description": "来自杭州的温婉 AI 伙伴",
  "port": 3100,
  "personality": "温婉、喜欢中医书法古琴、西湖茶馆"
}
```

## 版本历史

- **v2.2.0** - 修复 LLM API 调用，添加 User-Agent
- **v2.0.0** - 初始版本