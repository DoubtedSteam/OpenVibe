import * as vscode from 'vscode';
import { ChatViewProvider } from './modules/ChatViewProvider';
import { openSettingsDashboard } from './modules/settingsDashboard';
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


  // 注册聊天视图提供者
  const provider = new ChatViewProvider(context.extensionUri, context);
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
      openSettingsDashboard(context);
    })
  );
  // 注册内部命令：设置后台修改 mode/profile 后刷新聊天视图的模式选择器
  context.subscriptions.push(
    vscode.commands.registerCommand('vibe-coding.refreshModes', () => {
      provider.refreshPreferences();
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