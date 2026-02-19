# Agentic Commons

Agentic Commons 是一個以隱私為優先的 AI 使用量分析 open-core 專案。

[English](./README.md) | [简体中文](./README.zh-CN.md) | 繁體中文

## 簡介

- 在本機收集 Claude/Codex 使用量，並按日期與模型彙整 token。
- 支援自動同步與手動同步。
- 不上傳提示詞、對話內容與原始日誌。

## 快速開始

```bash
node -v
npm -v
npm i -g agentic-commons
acommons setup
acommons doctor
```

手動同步（可選）：

```bash
acommons sync
```

## 連結

- 專案說明：`README.md`
- 簡體中文：`README.zh-CN.md`
- 貢獻指南：`CONTRIBUTING.md`
- 安全政策：`SECURITY.md`
