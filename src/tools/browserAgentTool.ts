
import { runBrowserTask } from '../utils/browserAgent';
import type { ApiConfig, BrowserTaskResult } from '../types';

export interface BrowserSubAgentParams {
  task: string;
  url?: string;
  timeoutMs?: number;
  maxSteps?: number;
}

export async function browserSubAgentTool(
  params: BrowserSubAgentParams,
  apiConfig: ApiConfig,
  signal?: AbortSignal
): Promise<string> {
  try {
    const result = await runBrowserTask(
      {
        task: params.task,
        url: params.url,
        timeoutMs: params.timeoutMs ?? 600000,
        maxSteps: params.maxSteps ?? 50,
      },
      apiConfig,
      signal
    );

    const response: Record<string, unknown> = {
      success: result.success,
      summary: result.summary,
      steps: result.actionLog.length,
    };

    if (result.pageState) {
      response.finalPage = {
        url: result.pageState.url,
        title: result.pageState.title,
      };
    }

    if (result.actionLog.length > 0) {
      response.actionLog = result.actionLog.map((entry) => {
        const log: Record<string, unknown> = {
          action: entry.action,
          result: entry.result,
        };
        if (entry.error) {
          log.error = entry.error;
        }
        return log;
      });
    }

    if (result.error) {
      response.error = result.error;
    }

    return JSON.stringify(response);
  } catch (e: any) {
    return JSON.stringify({
      success: false,
      summary: 'Browser sub-agent encountered an error',
      error: e.message || String(e),
      steps: 0,
    });
  }
}
