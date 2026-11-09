import path from 'node:path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { validationError } from '../utils/errors';

/** 单个附件大小上限（字节） */
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
/** 单个附件提取文本上限（字符），避免超出模型上下文 */
export const MAX_ATTACHMENT_TEXT = 12000;
/** 单条消息可携带的附件数量上限 */
export const MAX_ATTACHMENT_COUNT = 5;
/** 单条消息附件文本合计上限（字符） */
export const MAX_ATTACHMENT_TOTAL_TEXT = 60000;

const SUPPORTED_EXTENSIONS = new Set(['docx', 'xlsx', 'xls', 'pdf', 'md', 'txt', 'csv']);
const MAX_EXCEL_SHEETS = 20;
const MAX_EXCEL_ROWS = 3000;

export interface ParsedAttachment {
  name: string;
  kind: string;
  size: number;
  text: string;
  truncated: boolean;
}

/** multer 默认按 latin1 解析文件名，这里还原为 UTF-8 */
function decodeFileName(raw: string): string {
  if (!/[^\x00-\x7f]/.test(raw)) return raw;
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    return decoded.includes('\ufffd') ? raw : decoded;
  } catch {
    return raw;
  }
}

export function attachmentExtension(fileName: string): string {
  return path.extname(fileName).replace(/^\./, '').toLowerCase();
}

/** 校验附件类型，返回小写扩展名 */
export function assertSupportedAttachment(fileName: string): string {
  const ext = attachmentExtension(fileName);
  if (ext === 'doc') {
    throw validationError('暂不支持旧版 .doc 文件，请另存为 .docx 后上传');
  }
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw validationError('仅支持 docx、xlsx、xls、pdf、md、txt、csv 格式的附件');
  }
  return ext;
}

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractExcelText(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames.slice(0, MAX_EXCEL_SHEETS)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: ''
    });
    const body = rows
      .slice(0, MAX_EXCEL_ROWS)
      .map((row) => row.map((cell) => String(cell ?? '')).join('\t').trimEnd())
      .join('\n')
      .trim();
    if (body) parts.push(`【工作表：${sheetName}】\n${body}`);
    if (parts.join('\n\n').length > MAX_ATTACHMENT_TEXT * 2) break;
  }
  return parts.join('\n\n');
}

async function extractText(ext: string, buffer: Buffer): Promise<string> {
  switch (ext) {
    case 'txt':
    case 'md':
    case 'csv':
      return buffer.toString('utf8').replace(/^\ufeff/, '');
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case 'xlsx':
    case 'xls':
      return extractExcelText(buffer);
    case 'pdf': {
      const result = await pdfParse(buffer);
      return result.text;
    }
    default:
      throw validationError('仅支持 docx、xlsx、xls、pdf、md、txt、csv 格式的附件');
  }
}

/** 解析上传文件为纯文本，供对话上下文使用 */
export async function parseAttachment(file: Express.Multer.File): Promise<ParsedAttachment> {
  const name = decodeFileName(file.originalname || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 200);
  const safeName = name || '未命名附件';
  const ext = assertSupportedAttachment(safeName);

  let rawText = '';
  try {
    rawText = await extractText(ext, file.buffer);
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.message)) {
      throw validationError('该 PDF 已加密，请解除密码后重新上传');
    }
    throw validationError(`附件「${safeName}」解析失败，请确认文件未损坏`);
  }

  const text = normalizeText(rawText);
  if (!text) {
    throw validationError(
      ext === 'pdf'
        ? '未能从 PDF 中提取到文本，文件可能是扫描件，建议转成可复制文字的版本'
        : '附件中没有可提取的文本内容'
    );
  }

  const truncated = text.length > MAX_ATTACHMENT_TEXT;
  return {
    name: safeName,
    kind: ext,
    size: file.size,
    text: truncated ? text.slice(0, MAX_ATTACHMENT_TEXT) : text,
    truncated
  };
}

export interface ChatAttachmentInput {
  name: string;
  text: string;
}

/** 将附件文本拼接进提示词，附带引用约束 */
export function buildAttachmentPrompt(attachments: ChatAttachmentInput[]): string {
  if (!attachments.length) return '';
  const blocks = attachments.map(
    (attachment, index) => `--- 附件 ${index + 1}：${attachment.name} ---\n${attachment.text}`
  );
  return [
    `【用户上传的附件，共 ${attachments.length} 个】`,
    blocks.join('\n\n'),
    '【附件结束】请优先依据上述附件内容作答；引用附件时请注明附件名称。若附件内容与问题无关，请说明后正常作答。'
  ].join('\n\n');
}
