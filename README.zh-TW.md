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

## Claude Code Skill

在 Claude Code 內直接使用 `/acommons` — 查看統計無需安裝 CLI。

```
/acommons            顯示今日用量（預設：stats）
/acommons daily      14 天每日明細
/acommons models     按模型統計 token 用量
/acommons total      全量彙總
/acommons sync       執行採集 + 上傳流水線
/acommons setup      首次設定
/acommons link       裝置 OAuth 認證
/acommons doctor     健康檢查與診斷
/acommons probe      偵測已安裝的 AI 工具
/acommons report     產生 HTML 使用報告
```

安裝 skill：

```bash
npx skills add Phlegonlabs/agentic-commons --skill acommons -g -y
```

Skill 直接讀取本機資料，並包含 Stop hook 在工作階段結束時自動更新 token 帳本。

## 連結

- 專案說明：`README.md`
- 簡體中文：`README.zh-CN.md`
- 貢獻指南：`CONTRIBUTING.md`
- 安全政策：`SECURITY.md`
