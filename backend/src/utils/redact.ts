/**
 * 文本敏感信息脱敏工具
 *
 * 识别并替换常见 PII：手机号、身份证、邮箱、银行卡号、法院案号。
 * 仅做本地字符串替换，不引入外部服务。
 */

const PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID_CARD_RE = /(?<!\d)(\d{15}|\d{17}[\dXx])(?!\d)/g;
const EMAIL_RE = /(?<![\w.\-+])([A-Za-z0-9\u4e00-\u9fa5.\-+]{1,64})@([\w.\-]{1,255}\.[A-Za-z]{2,})(?![\w.\-])/g;
const BANK_CARD_RE = /(?<!\d)(\d{4})(\d{4})(\d{4})(\d{4,7})(?!\d)/g;
// 法院案号：(2024)浙01民终1234号、(2023)沪0101民初字第89号、(2024)粤0305执12345号
const CASE_NO_RE = /(?:\(\d{4}\))?\s?[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼]{0,3}\d{0,6}[民商刑事行赔特审再终初执监调]?\s?(?:字)?\s?(?:第\s*)?(\d{1,6})\s*号/g;
const CASE_NO_FALLBACK_RE = /(?<!\d)\(?\d{4}\)?\s?[A-Za-z\u4e00-\u9fa5\d]{0,10}[字号]?(?:第\s*)?\d{1,6}\s*号/g;

/** 手机号：138****5678 */
function maskPhone(text: string): string {
  return text.replace(PHONE_RE, (match) => `${match.slice(0, 3)}****${match.slice(7)}`);
}

/** 身份证：只保留前 4 + 后 4 位，中间全打码 */
function maskIdCard(text: string): string {
  return text.replace(ID_CARD_RE, (match: string) => {
    if (match.length <= 8) return match;
    const head = match.slice(0, 4);
    const tail = match.slice(-4);
    const masked = '*'.repeat(match.length - 8);
    return `${head}${masked}${tail}`;
  });
}

/** 邮箱：a****@example.com */
function maskEmail(text: string): string {
  return text.replace(EMAIL_RE, (match, local: string) => {
    if (local.length <= 1) return match.replace(local, '*');
    const first = local[0];
    const masked = '*'.repeat(Math.max(2, Math.min(local.length - 1, 5)));
    return match.replace(local, `${first}${masked}`);
  });
}

/** 银行卡：6222 **** **** 1234 */
function maskBankCard(text: string): string {
  return text.replace(BANK_CARD_RE, (_m, a: string, b: string, c: string, d: string) =>
    `${a} **** **** ${d}`
  );
}

/** 案号：(2024)浙01民终1234号 → (2024)浙01民终****号 */
function maskCaseNo(text: string): string {
  let out = text.replace(CASE_NO_RE, (match, num: string) => match.replace(num, '*'.repeat(num.length)));
  if (out === text) {
    out = out.replace(CASE_NO_FALLBACK_RE, (match) =>
      match.replace(/(\d{1,6})(\s*号)/, (_n, digits: string, suffix: string) => `${'*'.repeat(digits.length)}${suffix}`)
    );
  }
  return out;
}

/** 脱敏顺序：从最长/最具体的开始，避免部分匹配被后续规则误处理 */
export function redactSensitive(text: string): string {
  if (!text) return text;
  let result = text;
  result = maskCaseNo(result);
  result = maskIdCard(result); // 身份证包含大量数字，放前面避免被银行卡误处理
  result = maskBankCard(result);
  result = maskPhone(result);
  result = maskEmail(result);
  return result;
}

/** 批量脱敏多个字符串，返回与输入一一对应的结果 */
export function redactAll(texts: string[]): string[] {
  return texts.map(redactSensitive);
}
