// ─── modules/settingsDashboardHtml.ts ────────────────────────────────────────
// HTML/CSS template for the OpenVibe settings dashboard webview.
// Script is loaded from a bundled external file (media/settings-webview.js),
// so the CSP stays strict (script-src limited to the webview resource scheme).

import * as vscode from 'vscode';

export function getSettingsDashboardHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'settings-webview.js'));
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenVibe 设置中心</title>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource};">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* ── Top bar ─────────────────────────────────────────── */
    .topbar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 18px; flex-shrink: 0;
      border-bottom: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.08));
    }
    .brand { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
    .brand .logo { font-size: 20px; }
    .brand .sub { font-size: 11px; font-weight: 400; color: var(--vscode-descriptionForeground); }
    .topbar-actions { display: flex; gap: 8px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; font-size: 12px; font-family: inherit;
      background: var(--vscode-button-secondaryBackground, #3a3a3a);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 5px; cursor: pointer; white-space: nowrap;
    }
    .btn:hover { background: var(--vscode-button-secondaryHoverBackground, #4a4a4a); }
    .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
    .btn.primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn.danger { background: transparent; color: var(--vscode-errorForeground, #f14c4c); border-color: var(--vscode-errorForeground, #f14c4c); }
    .btn.danger:hover { background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1)); }

    /* ── Layout ──────────────────────────────────────────── */
    .layout { flex: 1; display: flex; min-height: 0; }
    .sidebar {
      width: 208px; flex-shrink: 0; overflow-y: auto;
      border-right: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      padding: 10px 8px;
    }
    .nav-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 8px 10px; margin-bottom: 2px; text-align: left;
      background: transparent; border: none; border-radius: 5px;
      color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
      font-family: inherit; font-size: 13px; cursor: pointer;
    }
    .nav-item:hover { background: var(--vscode-list-hoverBackground); }
    .nav-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .nav-item .nav-badge {
      margin-left: auto; font-size: 10px; padding: 1px 7px; border-radius: 8px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    }

    .content { flex: 1; overflow-y: auto; padding: 18px 22px 40px; min-width: 0; }
    .content::-webkit-scrollbar { width: 10px; }
    .content::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 5px; }
    .section { display: none; max-width: 960px; }
    .section.active { display: block; }
    .section-title { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
    .section-desc { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; line-height: 1.5; }

    .card {
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 8px; margin-bottom: 14px; overflow: hidden;
      background: var(--vscode-editorWidget-background, transparent);
    }
    .card-header {
      display: flex; align-items: center; gap: 8px;
      padding: 9px 14px; font-size: 13px; font-weight: 600;
      background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.08));
      border-bottom: 1px solid var(--vscode-input-border, transparent);
    }
    .card-header .hint { font-weight: 400; font-size: 11px; color: var(--vscode-descriptionForeground); margin-left: auto; }
    .card-body { padding: 6px 14px 12px; }

    /* ── Form controls ───────────────────────────────────── */
    .field { display: flex; flex-direction: column; gap: 5px; padding: 9px 0; border-bottom: 1px dashed var(--vscode-input-border, rgba(128,128,128,0.2)); }
    .field:last-child { border-bottom: none; }
    .field-label { font-size: 12px; font-weight: 600; }
    .field-desc { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    .field input[type="text"], .field input[type="password"], .field input[type="number"], .field select, .field textarea {
      padding: 6px 10px; font-family: inherit; font-size: 12.5px;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555); border-radius: 5px;
      outline: none; width: 100%;
    }
    .field input:focus, .field select:focus, .field textarea:focus { outline: 1px solid var(--vscode-focusBorder); border-color: transparent; }
    .field input[type="text"], .field input[type="password"], .field input[type="number"], .field select { height: 30px; }
    .switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px dashed var(--vscode-input-border, rgba(128,128,128,0.2)); }
    .switch-row:last-child { border-bottom: none; }
    .switch-row .lbl { font-size: 12px; font-weight: 600; }
    .switch-row .sub { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
    .switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .switch .slider {
      position: absolute; inset: 0; cursor: pointer; border-radius: 10px;
      background: var(--vscode-input-border, #555); transition: background 0.15s;
    }
    .switch .slider::before {
      content: ''; position: absolute; height: 14px; width: 14px; left: 3px; top: 3px;
      background: #fff; border-radius: 50%; transition: transform 0.15s;
    }
    .switch input:checked + .slider { background: var(--vscode-testing-iconPassed, #388a34); }
    .switch input:checked + .slider::before { transform: translateX(16px); }

    .inline-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
    .inline-row .field { flex: 1; min-width: 140px; }

    /* ── Mode (tool profile) cards ───────────────────────── */
    .mode-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .mode-card {
      border: 1px solid var(--vscode-input-border, transparent); border-radius: 8px;
      padding: 12px 14px; cursor: pointer; user-select: none; position: relative;
      background: var(--vscode-editorWidget-background, transparent);
      transition: border-color 0.12s, background 0.12s;
    }
    .mode-card:hover { border-color: var(--vscode-focusBorder, #007acc); }
    .mode-card.selected { border-color: var(--vscode-focusBorder, #007acc); background: var(--vscode-list-activeSelectionBackground, rgba(0,122,204,0.12)); }
    .mode-card .mode-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .mode-card .mode-id { font-size: 10.5px; color: var(--vscode-descriptionForeground); font-family: monospace; margin: 3px 0 6px; }
    .mode-card .mode-desc { font-size: 11.5px; color: var(--vscode-descriptionForeground); line-height: 1.4; min-height: 30px; }
    .mode-card .mode-stats { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .stat-pill {
      font-size: 10.5px; padding: 2px 8px; border-radius: 9px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    }
    .stat-pill.warn { background: var(--vscode-inputValidation-warningBackground, rgba(255,255,0,0.15)); color: var(--vscode-inputValidation-warningForeground, #cca700); }
    .mode-card .badge-current {
      position: absolute; top: 10px; right: 10px; font-size: 10px; padding: 2px 8px; border-radius: 8px;
      background: var(--vscode-testing-iconPassed, #388a34); color: #fff;
    }
    .mode-card.add-mode {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      border-style: dashed; color: var(--vscode-descriptionForeground); min-height: 110px;
    }
    .mode-card.add-mode:hover { color: var(--vscode-foreground); }

    /* ── Mode detail: plugin matrix ──────────────────────── */
    .plugin-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
    .plugin-group { border: 1px solid var(--vscode-input-border, transparent); border-radius: 8px; overflow: hidden; }
    .plugin-group-title {
      padding: 6px 12px; font-size: 11.5px; font-weight: 600;
      background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.08));
      display: flex; align-items: center; justify-content: space-between;
    }
    .plugin-chip {
      display: flex; align-items: center; gap: 8px; padding: 7px 12px;
      border-top: 1px solid var(--vscode-input-border, rgba(128,128,128,0.15));
      cursor: pointer; user-select: none; transition: background 0.1s;
    }
    .plugin-chip:hover { background: var(--vscode-list-hoverBackground); }
    .plugin-chip .icon { font-size: 14px; flex-shrink: 0; }
    .plugin-chip .info { flex: 1; min-width: 0; }
    .plugin-chip .pname { font-size: 12px; font-family: var(--vscode-editor-font-family, monospace); }
    .plugin-chip .pdesc {
      font-size: 10.5px; color: var(--vscode-descriptionForeground);
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
    }
    .plugin-chip .state { font-size: 11px; flex-shrink: 0; font-weight: 600; }
    .plugin-chip.on .state { color: var(--vscode-testing-iconPassed, #89d185); }
    .plugin-chip.off .state { color: var(--vscode-errorForeground, #f48771); }
    .plugin-chip.off { opacity: 0.55; }
    .plugin-chip.off .pname { text-decoration: line-through; }
    .plugin-chip.protected { cursor: default; }
    .plugin-chip.protected .state { color: var(--vscode-textLink-foreground, #3794ff); }

    /* ── Models editor ───────────────────────────────────── */
    .model-card { border: 1px solid var(--vscode-input-border, transparent); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; background: var(--vscode-editorWidget-background, transparent); }
    .model-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .model-card-head .mname { font-size: 13px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .model-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
    .empty-hint { padding: 18px; text-align: center; font-size: 12px; color: var(--vscode-descriptionForeground); border: 1px dashed var(--vscode-input-border, #555); border-radius: 8px; }

    /* ── Workspace override indicators ───────────────────── */
    .override-banner {
      display: none; padding: 6px 18px; font-size: 11.5px; line-height: 1.5;
      background: var(--vscode-inputValidation-warningBackground, rgba(255,255,0,0.12));
      color: var(--vscode-inputValidation-warningForeground, #cca700);
      border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, rgba(204,167,0,0.5));
    }
    .override-banner.show { display: block; }
    .override-badge {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 10.5px; font-weight: 400; padding: 1px 8px; margin-left: 8px;
      border-radius: 8px; cursor: pointer; user-select: none; vertical-align: 1px;
      background: var(--vscode-inputValidation-warningBackground, rgba(255,255,0,0.15));
      color: var(--vscode-inputValidation-warningForeground, #cca700);
      border: 1px solid var(--vscode-inputValidation-warningBorder, rgba(204,167,0,0.6));
    }
    .override-badge:hover { filter: brightness(1.2); }

    /* ── Toast ───────────────────────────────────────────── */
    #toast {
      position: fixed; bottom: 18px; right: 18px; z-index: 999;
      display: flex; align-items: center; gap: 8px; max-width: 420px;
      padding: 9px 16px; border-radius: 8px; font-size: 12.5px;
      background: var(--vscode-editorWidget-background, #252526);
      color: var(--vscode-editorWidget-foreground, #ddd);
      border: 1px solid var(--vscode-input-border, #555);
      box-shadow: 0 6px 20px rgba(0,0,0,0.35);
      opacity: 0; transform: translateY(8px); pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }
    #toast.show { opacity: 1; transform: translateY(0); }
    #toast.ok { border-left: 4px solid var(--vscode-testing-iconPassed, #388a34); }
    #toast.err { border-left: 4px solid var(--vscode-errorForeground, #f14c4c); }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <span class="logo">⚙️</span>
      <span>OpenVibe 设置中心<span class="sub">&nbsp;·&nbsp;可视化后台</span></span>
    </div>
    <div class="topbar-actions">
      <button id="btn-profiles-folder" class="btn" title="在资源管理器中打开模式配置文件目录">📁 模式目录</button>
      <button id="btn-settings-json" class="btn" title="打开 VS Code settings.json">📄 settings.json</button>
      <button id="btn-close" class="btn" title="关闭面板">✕ 关闭</button>
    </div>
  </div>
  <div id="override-banner" class="override-banner">⚠ 当前工作区在 .vscode/settings.json 中覆盖了部分全局设置（见带「⚠ 工作区覆盖」标记的字段）。此处编辑的是全局设置；点击标记可清除覆盖、恢复全局值生效。</div>
  <div class="layout">
    <nav class="sidebar" id="sidebar">
      <button class="nav-item active" data-section="modes"><span>🧭</span><span>模式与插件</span><span class="nav-badge" id="badge-modes">0</span></button>
      <button class="nav-item" data-section="connection"><span>🔌</span><span>API 连接</span></button>
      <button class="nav-item" data-section="models"><span>🤖</span><span>模型列表</span></button>
      <button class="nav-item" data-section="behavior"><span>⚙️</span><span>交互行为</span></button>
      <button class="nav-item" data-section="language"><span>🌐</span><span>语言与思考</span></button>
      <button class="nav-item" data-section="review"><span>🛡️</span><span>审查与记忆</span></button>
    </nav>
    <main class="content">
      <section id="sec-modes" class="section active">
        <div class="section-title">🧭 模式与插件</div>
        <div class="section-desc">每个模式（mode）对应一组插件（工具）可见性配置。点击模式卡片可查看并切换该模式下的插件。被隐藏的插件不会发送给 AI，且执行层会拒绝调用。绿色 = 可用，红色划线 = 隐藏。</div>
        <div class="card">
          <div class="card-header">全局默认模式 <span class="hint" id="mode-default-hint"></span></div>
          <div class="card-body">
            <div class="field">
              <div class="field-label">默认模式（新会话的初始 mode）</div>
              <div class="field-desc">会话内可在聊天底部栏临时切换，不影响此全局默认值。</div>
              <select id="set-toolProfile"></select>
            </div>
          </div>
        </div>
        <div id="mode-grid" class="mode-grid"></div>
        <div id="mode-detail"></div>
      </section>

      <section id="sec-connection" class="section">
        <div class="section-title">🔌 API 连接</div>
        <div class="section-desc">OpenAI 兼容 API 的连接参数。修改后立即写入 VS Code 设置并即时生效。</div>
        <div class="card">
          <div class="card-header">连接参数</div>
          <div class="card-body">
            <div class="field">
              <div class="field-label">API Base URL</div>
              <input type="text" id="set-apiBaseUrl" data-key="apiBaseUrl" spellcheck="false">
              <div class="field-desc">OpenAI 兼容接口地址，例如 https://api.deepseek.com</div>
            </div>
            <div class="field">
              <div class="field-label">API Key</div>
              <input type="password" id="set-apiKey" data-key="apiKey" spellcheck="false" autocomplete="off">
              <div class="field-desc">模型服务商的 API 密钥（仅保存在本机 VS Code 设置中）。</div>
            </div>
            <div class="field">
              <div class="field-label">默认模型名</div>
              <input type="text" id="set-model" data-key="model" spellcheck="false">
              <div class="field-desc">未配置「模型列表」或未选择具体模型时使用的默认模型。</div>
            </div>
          </div>
        </div>
      </section>

      <section id="sec-models" class="section">
        <div class="section-title">🤖 模型列表</div>
        <div class="section-desc">多模型配置。每项可覆盖 baseUrl、apiKey、最大交互次数与上下文长度；聊天底部栏可按名称切换。留空的字段回落到全局设置。</div>
        <div id="models-list"></div>
        <button id="btn-add-model" class="btn primary">＋ 添加模型</button>
      </section>

      <section id="sec-behavior" class="section">
        <div class="section-title">⚙️ 交互行为</div>
        <div class="section-desc">控制编辑确认、终端命令确认与请求长度限制。</div>
        <div class="card">
          <div class="card-header">确认与限制</div>
          <div class="card-body">
            <div class="switch-row">
              <div><div class="lbl">应用文件修改前询问确认</div><div class="sub">edit 工具写入文件前弹出确认栏（confirmChanges）</div></div>
              <label class="switch"><input type="checkbox" data-key="confirmChanges"><span class="slider"></span></label>
            </div>
            <div class="switch-row">
              <div><div class="lbl">执行终端命令前询问确认</div><div class="sub">run_shell_command 在安全审查后弹窗确认（confirmShellCommand）</div></div>
              <label class="switch"><input type="checkbox" data-key="confirmShellCommand"><span class="slider"></span></label>
            </div>
            <div class="inline-row">
              <div class="field">
                <div class="field-label">最大工具调用轮次</div>
                <input type="number" data-key="maxInteractions" id="set-maxInteractions">
                <div class="field-desc">-1 表示不限</div>
              </div>
              <div class="field">
                <div class="field-label">最大输出序列长度</div>
                <input type="number" data-key="maxSequenceLength" id="set-maxSequenceLength">
                <div class="field-desc">生成文本的最大长度（字符）</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="sec-language" class="section">
        <div class="section-title">🌐 语言与思考</div>
        <div class="section-desc">AI 交互语言与 DeepSeek 思考模式强度。</div>
        <div class="card">
          <div class="card-header">语言与思考</div>
          <div class="card-body">
            <div class="field">
              <div class="field-label">交互语言</div>
              <select data-key="language" id="set-language">
                <option value="auto">自动（跟随 VS Code 界面语言）</option>
                <option value="en">English</option>
                <option value="zh-CN">简体中文</option>
              </select>
            </div>
            <div class="field">
              <div class="field-label">思考模式强度（reasoning_effort）</div>
              <select data-key="reasoningEffort" id="set-reasoningEffort">
                <option value="off">关闭思考</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="max">最大</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section id="sec-review" class="section">
        <div class="section-title">🛡️ 审查与记忆</div>
        <div class="section-desc">独立 LLM 审查代理与记忆同步的开关和超时参数。</div>
        <div class="card">
          <div class="card-header">代码编辑审查</div>
          <div class="card-body">
            <div class="switch-row">
              <div><div class="lbl">启用编辑审查</div><div class="sub">edit 工具写入前由独立 LLM 复核（editReview.enabled）</div></div>
              <label class="switch"><input type="checkbox" data-key="editReview.enabled"><span class="slider"></span></label>
            </div>
            <div class="field">
              <div class="field-label">审查超时（毫秒）</div>
              <input type="number" data-key="editReview.timeoutMs">
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">终端命令审查</div>
          <div class="card-body">
            <div class="switch-row">
              <div><div class="lbl">启用终端安全审查</div><div class="sub">run_shell_command 执行前的独立安全审查（shellCommandReview.enabled）</div></div>
              <label class="switch"><input type="checkbox" data-key="shellCommandReview.enabled"><span class="slider"></span></label>
            </div>
            <div class="field">
              <div class="field-label">审查超时（毫秒）</div>
              <input type="number" data-key="shellCommandReview.reviewTimeoutMs">
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">任务清单审查</div>
          <div class="card-body">
            <div class="switch-row">
              <div><div class="lbl">启用任务清单审查</div><div class="sub">create_todo_list 的独立 LLM 审查（todolistReview.enabled）</div></div>
              <label class="switch"><input type="checkbox" data-key="todolistReview.enabled"><span class="slider"></span></label>
            </div>
            <div class="inline-row">
              <div class="field">
                <div class="field-label">最大重试次数</div>
                <input type="number" data-key="todolistReview.maxAttempts">
              </div>
              <div class="field">
                <div class="field-label">审查超时（毫秒）</div>
                <input type="number" data-key="todolistReview.reviewTimeoutMs">
              </div>
              <div class="field">
                <div class="field-label">编辑代理超时（毫秒）</div>
                <input type="number" data-key="todolistReview.editorTimeoutMs">
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">记忆同步</div>
          <div class="card-body">
            <div class="switch-row">
              <div><div class="lbl">启用记忆同步追踪</div><div class="sub">检测子代理修改的文件并同步到 .OpenVibe/memory/（memorySync.enabled）</div></div>
              <label class="switch"><input type="checkbox" data-key="memorySync.enabled"><span class="slider"></span></label>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
  <div id="toast"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}
