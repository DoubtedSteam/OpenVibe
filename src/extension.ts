import * as vscode from 'vscode';
import { ChatViewProvider } from './modules/ChatViewProvider';
import { openSettingsDashboard } from './modules/settingsDashboard';
import { ConfigService } from './modules/ConfigService';
import { BrowserManager } from './utils/browserManager';
import { clearTerminalBuffers } from './tools/terminalTool';
import * as path from 'path';
import * as os from 'os';
import { initToolProfilesDir } from './tools/toolProfiles';



export function activate(context: vscode.ExtensionContext) {
  // 创建输出通道
  const outputChannel = vscode.window.createOutputChannel('Vibe Coding Assistant');
  context.subscriptions.push(outputChannel);
  
  console.log('Vibe Coding Assistant is now active');
  outputChannel.appendLine('Vibe Coding Assistant扩展已激活 - ' + new Date().toLocaleString());
  // ── Tool profiles: cross-workspace visibility config ────────────────────
  // 只负责 seed 内置 profile 文件；实际的 profile 应用是会话级的（ChatViewProvider
  // 在 ready / switchSession / switchMode 时按当前会话 applyToolProfile），
  // 因此这里不再从全局 vibe-coding.toolProfile 即时应用，避免跨窗口串扰。
  const toolProfilesDir = path.join(os.homedir(), '.openvibe', 'tool-profiles');
  initToolProfilesDir(toolProfilesDir);

  // ── Shared config service: single source of truth for vibe-coding.* reads ─
  const config = new ConfigService(context);
  // Preload SecretStorage apiKey (fire-and-forget; getApiKey() stays sync).
  void config.initialize();

  // 注册聊天视图提供者
  const provider = new ChatViewProvider(context.extensionUri, context, config);

  provider.setOutputChannel(outputChannel);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  // 注册命令：打开聊天视图（如果视图被关闭，可以通过命令重新打开）
  context.subscriptions.push(
    vscode.commands.registerCommand('vibe-coding.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.vibe-coding');
    })
  );
  // 注册命令：打开可视化设置后台（设置中心）
  context.subscriptions.push(
    vscode.commands.registerCommand('vibe-coding.openSettings', () => {
      openSettingsDashboard(context, config);

    })
  );
  // 注册内部命令：设置后台修改 mode/profile 后刷新聊天视图的模式选择器
  context.subscriptions.push(
    vscode.commands.registerCommand('vibe-coding.refreshModes', () => {
      provider.refreshPreferences();
    })
  );

  // 注册命令：把 settings 中的明文 vibe-coding.apiKey 迁移到 SecretStorage。
  // 迁移成功后询问是否清除 settings 明文（默认推荐清除，由用户确认）。
  context.subscriptions.push(
    vscode.commands.registerCommand('vibe-coding.migrateApiKeyToSecretStorage', async () => {
      const cfg = config.getConfiguration();
      const legacyKey = cfg.get<string>('apiKey', '');
      if (!legacyKey) {
        vscode.window.showInformationMessage('OpenVibe: vibe-coding.apiKey 未设置，无需迁移。');
        return;
      }
      const ok = await config.setApiKey(legacyKey);
      if (!ok) {
        vscode.window.showErrorMessage('OpenVibe: 写入 SecretStorage 失败，迁移未完成。');
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'OpenVibe: API Key 已迁移到 SecretStorage。是否清除 Settings 中的明文 apiKey？（推荐清除）',
        '清除',
        '保留'
      );
      if (choice === '清除') {
        await cfg.update('apiKey', '', vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('OpenVibe: 已清除 Settings 中的 vibe-coding.apiKey，今后请通过 SecretStorage 使用密钥。');
      } else {
        vscode.window.showInformationMessage('OpenVibe: 明文 vibe-coding.apiKey 已保留（建议尽快清除）。');
      }
    })
  );


  // 注册命令：清除聊天历史
  context.subscriptions.push(
    vscode.commands.registerCommand('vibe-coding.clearHistory', () => {
      provider.clearHistory();
      vscode.window.showInformationMessage('Chat history cleared');
    })
  );
}

export function deactivate() {
  // 关闭 Playwright 浏览器实例，释放内存和进程
  BrowserManager.forceClose();
  clearTerminalBuffers();
}