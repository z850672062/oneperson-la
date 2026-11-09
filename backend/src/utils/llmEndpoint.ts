/**
 * 统一解析 OpenAI 兼容的对话接口地址。
 * 优先使用模型配置里的 Base URL（如火山方舟 https://ark.cn-beijing.volces.com/api/v3），
 * 未配置时按厂商回退到官方地址。
 */
export function chatCompletionsUrl(baseUrl?: string | null, vendor?: string | null): string {
  const trimmed = (baseUrl || '').trim();
  const fallback =
    (vendor || '').toLowerCase() === 'deepseek'
      ? 'https://api.deepseek.com'
      : 'https://api.openai.com/v1';
  const base = (trimmed || fallback).replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

