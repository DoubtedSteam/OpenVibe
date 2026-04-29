import axios from 'axios';
import type { WebFetchParams, WebFetchResult } from '../types';
import {
  htmlToPlainText,
  extractTitle,
  extractLinks,
  extractMetaDescription,
  isPrivateHost,
} from '../utils/htmlParser';

export async function webFetchTool(params: WebFetchParams): Promise<string> {
  try {
    let parsed: URL;
    try {
      parsed = new URL(params.url);
    } catch {
      return JSON.stringify({ error: 'Invalid URL: "' + params.url + '". Make sure to include the https:// prefix.' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return JSON.stringify({ error: 'Unsupported protocol "' + parsed.protocol + '". Only http:// and https:// are allowed.' });
    }
    if (isPrivateHost(parsed.hostname)) {
      return JSON.stringify({ error: 'Access to internal/private network address "' + parsed.hostname + '" is blocked for security.' });
    }

    const reqHeaders: Record<string, string> = {
      'User-Agent': 'OpenVibe-WebFetch/1.0',
      Accept: 'text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.8',
    };

    if (params.cookie) {
      reqHeaders['Cookie'] = params.cookie;
    }

    if (params.headers) {
      let customHeaders: Record<string, string>;
      try {
        customHeaders = JSON.parse(params.headers);
      } catch {
        return JSON.stringify({ error: 'Invalid headers JSON. Provide a valid JSON object string.' });
      }
      Object.assign(reqHeaders, customHeaders);
    }

    const maxLen = Math.min(Math.max(params.maxLength ?? 16000, 100), 50000);
    const timeout = Math.min(Math.max(params.timeoutMs ?? 15000, 1000), 30000);

    const response = await axios.get(params.url, {
      headers: reqHeaders,
      timeout,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: () => true,
    });

    const statusCode = response.status;
    const contentType: string = (typeof response.headers['content-type'] === 'string'
      ? response.headers['content-type']
      : '') || '';

    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');
    const isText = contentType.includes('text/plain') || contentType.includes('application/json') ||
      contentType.includes('application/xml') || contentType === '';

    let title = '';
    let text = '';
    let links: Array<{ url: string; text: string }> | undefined;
    let description: string | undefined;

    if (isHtml) {
      const html = response.data as string;
      title = extractTitle(html);
      text = htmlToPlainText(html);
      links = extractLinks(html);
      description = extractMetaDescription(html) || undefined;
    } else if (isText) {
      text = response.data as string;
      const tm = (response.data as string).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (tm) title = tm[1].replace(/<[^>]*>/g, '').trim();
    } else {
      const result: WebFetchResult = {
        title: '',
        content: '[Non-text content: ' + (contentType || 'unknown') + ' (' + (response.data?.length ?? 0) + ' bytes)]',
        url: response.request?.res?.responseUrl || params.url,
        statusCode,
        contentType,
      };
      return JSON.stringify(result);
    }

    if (text.length > maxLen) {
      text = text.slice(0, maxLen) + '\n\n... [truncated: ' + (text.length - maxLen) + ' more characters]';
    }

    const result: WebFetchResult = {
      title,
      content: text,
      url: response.request?.res?.responseUrl || params.url,
      statusCode,
      contentType,
      ...(links && links.length > 0 ? { links } : {}),
      ...(description ? { description } : {}),
    };
    return JSON.stringify(result);
  } catch (e: any) {
    if (axios.isAxiosError(e)) {
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
        return JSON.stringify({ error: 'Request timed out after ' + (params.timeoutMs ?? 15000) + 'ms.' });
      }
      return JSON.stringify({ error: 'HTTP request failed: ' + e.message });
    }
    return JSON.stringify({ error: 'Web fetch failed: ' + e.message });
  }
}
