# dsh-session-intent-title

English | [中文文档](README.zh-CN.md)

An independent, zero-UI-overhead DeepSeek Harness (DSH) plugin that automatically classifies new conversation intents and names sessions with clean prefixes (e.g., `⚡ 优化｜...`, `🐛 修复｜...`, `✨ 功能｜...`).

## ✨ Features

- **🎯 Automatic Intent Classification**: Evaluates the first user message using lightweight LLM prompts to detect task intent and extract concise subjects.
- **🛡️ Zero UI Invasion**: Pure backend logic provider. Does not inject any frontend CSS, sidebar overrides, or custom themes. Perfectly compatible with `dsh-better-sidebar` and native DSH Web UI.
- **🔒 Safe & Non-Intrusive**: Only triggers once on the first turn. Any manual renaming by the user immediately locks and will never be overwritten.

## 📋 Intent Categories

| Type | Prefix & Emoji | Example Generated Title |
| :--- | :--- | :--- |
| **`optimize`** | `⚡ 优化｜...` | `⚡ 优化｜提升循环性能与内存占用` |
| **`fix`** | `🐛 修复｜...` | `🐛 修复｜排查登录接口401问题` |
| **`feature`** | `✨ 功能｜...` | `✨ 功能｜实现OAuth2鉴权模块` |
| **`explore`** | `🔍 探索｜...` | `🔍 探索｜调研WebAssembly在前端的应用` |
| **`design`** | `🎨 设计｜...` | `🎨 设计｜深模块架构重构方案` |
| **`research`** | `🔬 研究｜...` | `🔬 研究｜多智能体协作框架评测` |
| **`docs`** | `📝 文档｜...` | `📝 文档｜编写API使用说明与规范` |
| **`release`** | `🚀 发布｜...` | `🚀 发布｜打包Docker镜像与部署上线` |

## 🚀 Installation

### 1. Install via DSH CLI

```bash
dsh plugin --profile web add git+https://github.com/WiseXin/dsh-session-intent-title.git
```

### 2. Disable default unclassified title provider

In `~/.dsh/profiles/web/cordis.patch.yml`, disable the official unclassified provider:

```yaml
- id: session-title-llm
  disabled: true
```

### 3. Restart DSH

```bash
sudo systemctl restart dsh
```

## 📄 License

MIT License © 2026 WiseXin
