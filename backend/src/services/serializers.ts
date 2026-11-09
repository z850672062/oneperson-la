import type {
  Category,
  ChatMessage,
  ChatSession,
  FieldDef,
  KbConnector,
  KbDoc,
  LlmModel,
  MemoryItem,
  Record as RecordModel,
  RecordKb,
  Report,
  Setting,
  User
} from '@prisma/client';
import { toDateOnly } from '../utils/date';

export function serializeUser(user: Pick<User, 'id' | 'username' | 'name' | 'email'>) {
  return { id: user.id, username: user.username, name: user.name, email: user.email };
}

export function serializeCategory(category: Category, recordCount: number) {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    sort: category.sort,
    recordCount
  };
}

function parseOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return [];
  try {
    const parsed = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export function serializeField(field: FieldDef) {
  return {
    id: field.id,
    categoryId: field.categoryId,
    name: field.name,
    group: field.group,
    type: field.type,
    required: field.required,
    options: parseOptions(field.optionsJson),
    note: field.note,
    sort: field.sort,
    isCommon: field.isCommon
  };
}

type RecordWithRelations = RecordModel & {
  category: Category & { parent: Category | null };
  kbLinks: Array<RecordKb & { doc: KbDoc }>;
};

export function parseValues(valuesJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(valuesJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 忽略损坏的历史值，返回空对象
  }
  return {};
}

export function serializeRecord(record: RecordWithRelations) {
  const categoryPath = record.category.parent
    ? `${record.category.parent.name} / ${record.category.name}`
    : record.category.name;
  const kbDocs = record.kbLinks.map((link) => ({ id: link.doc.id, title: link.doc.title }));
  return {
    id: record.id,
    categoryId: record.categoryId,
    categoryPath,
    name: record.name,
    sub: record.sub,
    status: record.status,
    risk: record.risk,
    dueDate: record.dueDate ? toDateOnly(record.dueDate) : null,
    hours: record.hours,
    values: parseValues(record.valuesJson),
    kbDocIds: kbDocs.map((doc) => doc.id),
    kbDocs,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function serializeReport(report: Report) {
  return {
    id: report.id,
    type: report.type,
    title: report.title,
    rangeFrom: toDateOnly(report.rangeFrom),
    rangeTo: toDateOnly(report.rangeTo),
    markdown: report.markdown,
    createdAt: report.createdAt.toISOString()
  };
}

export function serializeConnector(connector: KbConnector) {
  return {
    id: connector.id,
    name: connector.name,
    type: connector.type,
    status: connector.status,
    path: connector.path,
    meta: connector.meta,
    indexedCount: connector.indexedCount,
    lastIndexedAt: connector.lastIndexedAt ? connector.lastIndexedAt.toISOString() : null
  };
}

export function serializeDoc(doc: KbDoc) {
  return {
    id: doc.id,
    connectorId: doc.connectorId,
    title: doc.title,
    path: doc.path,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

export function serializeSession(session: ChatSession) {
  return {
    id: session.id,
    title: session.title,
    model: session.model,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  };
}

export function serializeMessage(message: ChatMessage) {
  let citations: unknown[] = [];
  if (message.citationsJson) {
    try {
      const parsed = JSON.parse(message.citationsJson);
      if (Array.isArray(parsed)) citations = parsed;
    } catch {
      citations = [];
    }
  }
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    citations,
    createdAt: message.createdAt.toISOString()
  };
}

export function serializeMemory(memory: MemoryItem) {
  return {
    id: memory.id,
    text: memory.text,
    source: memory.source,
    weight: memory.weight,
    createdAt: memory.createdAt.toISOString()
  };
}

export function serializeSettings(setting: Setting) {
  return {
    maskSensitive: setting.maskSensitive,
    maskLlm: setting.maskLlm,
    defaultModel: setting.defaultModel
  };
}

export function serializeLlmModel(model: LlmModel) {
  return {
    id: model.id,
    vendor: model.vendor,
    model: model.model,
    baseUrl: model.baseUrl,
    isDefault: model.isDefault,
    hasKey: Boolean(model.apiKeyEnc)
  };
}
