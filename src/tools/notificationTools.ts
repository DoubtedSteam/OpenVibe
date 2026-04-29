import * as vscode from 'vscode';

// ─── show_notification ────────────────────────────────────────────────────────

export interface ShowNotificationParams {
  message: string;
  severity?: 'info' | 'warning' | 'error';
}

export function showNotificationTool(params: ShowNotificationParams): string {
  try {
    const msg = params.message;
    const sev = params.severity ?? 'info';
    if (sev === 'error') {
      void vscode.window.showErrorMessage(msg);
    } else if (sev === 'warning') {
      void vscode.window.showWarningMessage(msg);
    } else {
      void vscode.window.showInformationMessage(msg);
    }
    return JSON.stringify({ success: true, message: 'Notification shown.' });
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
}

// ─── ask_human ─────────────────────────────────────────────────────────────────

export interface AskHumanParams {
  question: string;
}

export async function askHumanTool(
  params: AskHumanParams,
  userConfirmFn: (question: string) => Promise<{ approved: boolean; userMessage?: string }>
): Promise<string> {
  try {
    const question = (params.question ?? '').trim();
    if (!question) {
      return JSON.stringify({ error: 'ask_human requires a non-empty question.' });
    }
    const result = await userConfirmFn(question);
    if (result.approved) {
      return JSON.stringify({
        success: true,
        requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        question,
        completedAt: Date.now(),
        message: result.userMessage || 'User confirmed completion of the requested task.',
      });
    } else {
      return JSON.stringify({
        success: false,
        error: 'cancelled',
        message: 'User cancelled the assistance request.',
      });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
}
