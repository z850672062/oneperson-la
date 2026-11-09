import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { addDays, startOfDay } from '../src/utils/date';

const prisma = new PrismaClient();

function dayAt(offsetDays: number, hour = 10): Date {
  const date = startOfDay(addDays(new Date(), offsetDays));
  date.setHours(hour, 0, 0, 0);
  return date;
}

function dueAt(offsetDays: number): Date {
  return startOfDay(addDays(new Date(), offsetDays));
}

const categories = [
  { id: 'cat-contract', name: '合同审查', parentId: null, sort: 0 },
  { id: 'cat-sales', name: '销售合同', parentId: 'cat-contract', sort: 0 },
  { id: 'cat-purchase', name: '采购合同', parentId: 'cat-contract', sort: 1 },
  { id: 'cat-litigation', name: '诉讼仲裁', parentId: null, sort: 1 },
  { id: 'cat-labor', name: '劳动争议', parentId: 'cat-litigation', sort: 0 },
  { id: 'cat-arbitration', name: '商事仲裁', parentId: 'cat-litigation', sort: 1 },
  { id: 'cat-compliance', name: '合规咨询', parentId: null, sort: 2 },
  { id: 'cat-governance', name: '公司治理', parentId: null, sort: 3 }
];

type FieldSeed = {
  id: string;
  categoryId: string;
  name: string;
  group: string;
  type: string;
  required: boolean;
  options?: string[];
  note?: string;
};

const fields: FieldSeed[] = [
  { id: 'field-contract-name', categoryId: 'cat-contract', name: '事项名称', group: '基础信息', type: 'text', required: true, note: '一句话概括' },
  { id: 'field-contract-project', categoryId: 'cat-contract', name: '关联项目', group: '基础信息', type: 'select', required: true, options: ['框架协议', '采购', '销售', '其他'], note: '关联项目类型' },
  { id: 'field-contract-risk', categoryId: 'cat-contract', name: '风险等级', group: '基础信息', type: 'select', required: true, options: ['高', '中', '低'], note: '审查风险判断' },
  { id: 'field-contract-hours', categoryId: 'cat-contract', name: '耗时（小时）', group: '过程信息', type: 'number', required: true, note: '0.5 小时步进' },
  { id: 'field-contract-background', categoryId: 'cat-contract', name: '相对方与背景', group: '过程信息', type: 'textarea', required: false, note: '交易背景、谈判地位' },
  { id: 'field-contract-conclusion', categoryId: 'cat-contract', name: '审查意见与结论', group: '结果信息', type: 'textarea', required: true, note: '修改要点与最终口径' },
  { id: 'field-contract-attachment', categoryId: 'cat-contract', name: '附件', group: '结果信息', type: 'file', required: false, note: '合同稿、批注版' },

  { id: 'field-lit-name', categoryId: 'cat-litigation', name: '事项名称', group: '基础信息', type: 'text', required: true, note: '一句话概括' },
  { id: 'field-lit-case', categoryId: 'cat-litigation', name: '案号', group: '基础信息', type: 'text', required: true, note: '立案编号' },
  { id: 'field-lit-opponent', categoryId: 'cat-litigation', name: '对方代理人', group: '过程信息', type: 'text', required: false, note: '代理机构与律师' },
  { id: 'field-lit-hearing', categoryId: 'cat-litigation', name: '开庭时间', group: '过程信息', type: 'date', required: false, note: '最近一次开庭' },
  { id: 'field-lit-strategy', categoryId: 'cat-litigation', name: '争议焦点与策略', group: '结果信息', type: 'textarea', required: true, note: '焦点归纳与应对策略' },

  { id: 'field-comp-topic', categoryId: 'cat-compliance', name: '咨询事项', group: '基础信息', type: 'text', required: true, note: '' },
  { id: 'field-comp-dept', categoryId: 'cat-compliance', name: '提问部门', group: '基础信息', type: 'select', required: false, options: ['业务', 'HR', '财务'], note: '' },
  { id: 'field-comp-conclusion', categoryId: 'cat-compliance', name: '结论与依据', group: '结果信息', type: 'textarea', required: true, note: '' },

  { id: 'field-gov-topic', categoryId: 'cat-governance', name: '治理事项', group: '基础信息', type: 'text', required: true, note: '' },
  { id: 'field-gov-entity', categoryId: 'cat-governance', name: '涉及主体', group: '基础信息', type: 'text', required: false, note: '' },
  { id: 'field-gov-resolution', categoryId: 'cat-governance', name: '决议/意见', group: '结果信息', type: 'textarea', required: true, note: '' }
];

const records = [
  {
    id: 'rec-1',
    categoryId: 'cat-purchase',
    name: '审查《供应链框架协议》修订稿',
    sub: '相对方：华东某物流集团 · 第三轮',
    status: 'done',
    risk: '中',
    dueDate: dueAt(-1),
    hours: 3.5,
    createdDaysAgo: 0,
    kbDocIds: ['doc-4'],
    values: {
      'field-contract-name': '审查《供应链框架协议》修订稿',
      'field-contract-project': '框架协议',
      'field-contract-risk': '中',
      'field-contract-hours': 3.5,
      'field-contract-background': '华东区域仓配一体，第三轮谈判聚焦价格调整与违约责任上限。',
      'field-contract-conclusion': '接受价格联动机制，违约责任上限调整为合同年度金额的 30%，并增加验收异议期限。'
    }
  },
  {
    id: 'rec-2',
    categoryId: 'cat-labor',
    name: '劳动争议仲裁庭前准备',
    sub: '沪劳人仲（2026）办字第 412 号',
    status: 'doing',
    risk: '高',
    dueDate: dueAt(-2),
    hours: 5,
    createdDaysAgo: 0,
    kbDocIds: ['doc-1', 'doc-2'],
    values: {
      'field-lit-name': '劳动争议仲裁庭前准备',
      'field-lit-case': '沪劳人仲（2026）办字第 412 号',
      'field-lit-opponent': '对方代理人：某律所王律师',
      'field-lit-hearing': '近期开庭',
      'field-lit-strategy': '围绕竞业限制补偿约定不明展开，主张已履行义务并按离职前十二个月平均工资 30% 补足。'
    }
  },
  {
    id: 'rec-3',
    categoryId: 'cat-compliance',
    name: '数据合规自查清单更新',
    sub: '个人信息出境自评待补',
    status: 'doing',
    risk: '低',
    dueDate: dueAt(5),
    hours: 2,
    createdDaysAgo: 0,
    kbDocIds: [],
    values: {
      'field-comp-topic': '数据合规自查清单更新',
      'field-comp-dept': '业务',
      'field-comp-conclusion': '补充出境场景清单与告知同意留痕，待业务确认数据接收方。'
    }
  },
  {
    id: 'rec-4',
    categoryId: 'cat-governance',
    name: '子公司章程修订意见',
    sub: '监事条款与新规衔接',
    status: 'done',
    risk: '中',
    dueDate: dueAt(-3),
    hours: 1.5,
    createdDaysAgo: 1,
    kbDocIds: [],
    values: {
      'field-gov-topic': '子公司章程修订意见',
      'field-gov-entity': '华东子公司',
      'field-gov-resolution': '建议删除监事条款并同步修订议事规则，提交股东会审议。'
    }
  },
  {
    id: 'rec-5',
    categoryId: 'cat-sales',
    name: '供应商违约函件回复',
    sub: '主张违约金并保留解除权',
    status: 'doing',
    risk: '高',
    dueDate: dueAt(-1),
    hours: 1,
    createdDaysAgo: 1,
    kbDocIds: ['doc-4', 'doc-3'],
    values: {
      'field-contract-name': '供应商违约函件回复',
      'field-contract-project': '销售',
      'field-contract-risk': '高',
      'field-contract-hours': 1,
      'field-contract-background': '供应商延迟交付导致终端客户索赔，需同步固定证据。',
      'field-contract-conclusion': '回函主张日万分之五违约金，并保留解除合同及追偿损失的权利。'
    }
  },
  {
    id: 'rec-6',
    categoryId: 'cat-sales',
    name: '经销商年度协议模板更新',
    sub: '返利条款待与销售确认',
    status: 'doing',
    risk: '低',
    dueDate: dueAt(2),
    hours: 2.5,
    createdDaysAgo: 2,
    kbDocIds: ['doc-3'],
    values: {
      'field-contract-name': '经销商年度协议模板更新',
      'field-contract-project': '销售',
      'field-contract-risk': '低',
      'field-contract-hours': 2.5,
      'field-contract-background': '返利计算口径与库存风险分担仍需业务确认。',
      'field-contract-conclusion': '先锁定年度目标与返利阶梯，库存风险改为按季度对账。'
    }
  },
  {
    id: 'rec-7',
    categoryId: 'cat-arbitration',
    name: '股权回购仲裁答辩要旨',
    sub: '回购条件是否成就',
    status: 'doing',
    risk: '高',
    dueDate: dueAt(-4),
    hours: 4,
    createdDaysAgo: 3,
    kbDocIds: [],
    values: {
      'field-lit-name': '股权回购仲裁答辩要旨',
      'field-lit-case': '贸仲（2026）第 1188 号',
      'field-lit-opponent': '对方代理人：某红圈所合伙人',
      'field-lit-hearing': '待排期',
      'field-lit-strategy': '主攻回购触发条件未成就，备位主张回购价格应扣减已分配收益。'
    }
  },
  {
    id: 'rec-8',
    categoryId: 'cat-purchase',
    name: '物流服务合同续签谈判',
    sub: '价格调整机制博弈',
    status: 'done',
    risk: '中',
    dueDate: dueAt(-5),
    hours: 2,
    createdDaysAgo: 4,
    kbDocIds: ['doc-4'],
    values: {
      'field-contract-name': '物流服务合同续签谈判',
      'field-contract-project': '采购',
      'field-contract-risk': '中',
      'field-contract-hours': 2,
      'field-contract-background': '油价联动条款与最低货量承诺是谈判焦点。',
      'field-contract-conclusion': '采用季度调价窗口，最低货量下调 10%，保留旺季优先承运权。'
    }
  },
  {
    id: 'rec-9',
    categoryId: 'cat-compliance',
    name: '经销商合规培训讲稿',
    sub: '反商业贿赂要点',
    status: 'done',
    risk: '低',
    dueDate: dueAt(-6),
    hours: 3,
    createdDaysAgo: 6,
    kbDocIds: [],
    values: {
      'field-comp-topic': '经销商合规培训讲稿',
      'field-comp-dept': '业务',
      'field-comp-conclusion': '围绕礼品招待、返利支付与第三方尽调形成 12 条红线清单。'
    }
  }
];

const kbDocs = [
  {
    id: 'doc-1',
    title: '竞业限制纠纷裁审口径（2024–2026 汇总）',
    path: 'Obsidian / 劳动争议 / 竞业限制.md',
    content:
      '竞业限制纠纷的裁审口径近年趋于统一：用人单位与劳动者约定竞业限制但未约定经济补偿，劳动者履行竞业限制义务后，可以要求用人单位按劳动者离职前十二个月平均工资的百分之三十按月支付经济补偿；低于当地最低工资标准的，按最低工资标准支付。若协议仅约定“按法律规定执行”而未写明数额或计算方式，多地裁审实践倾向于认定约定不明，劳动者已履行义务的，可主张补足补偿。竞业限制的人员范围应限于高级管理人员、高级技术人员和其他负有保密义务的人员，期限不得超过二年。审查时应重点核对范围、地域、期限、补偿标准与违约金的对等性，避免仅约束劳动者而不支付补偿。'
  },
  {
    id: 'doc-2',
    title: '劳动合同法第二十三、二十四条要点批注',
    path: 'Obsidian / 法条批注 / 劳动合同法.md',
    content:
      '劳动合同法第二十三条规定，用人单位与劳动者可以在劳动合同中约定保守用人单位的商业秘密和与知识产权相关的保密事项；对负有保密义务的劳动者，用人单位可以在劳动合同或者保密协议中与劳动者约定竞业限制条款，并约定在解除或者终止劳动合同后，在竞业限制期限内按月给予劳动者经济补偿。劳动者违反竞业限制约定的，应当按照约定向用人单位支付违约金。第二十四条规定，竞业限制的人员限于用人单位的高级管理人员、高级技术人员和其他负有保密义务的人员，范围、地域、期限由用人单位与劳动者约定，但不得违反法律、法规的规定；解除或者终止劳动合同后，前款规定的人员到与本单位生产或者经营同类产品、从事同类业务的有竞争关系的其他用人单位，或者自己开业生产或者经营同类产品、从事同类业务的竞业限制期限，不得超过二年。批注：补偿与违约金应对称，避免显失公平。'
  },
  {
    id: 'doc-3',
    title: '员工协议模板审查清单 v3',
    path: 'Obsidian / 模板清单 / 员工协议审查清单.md',
    content:
      '员工协议模板审查清单 v3：第 1 项核对主体信息与签署权限；第 2 项确认劳动合同期限、试用期与岗位职责；第 3 项审查薪酬结构、绩效与调薪机制；第 4 项核对工作时间、加班与休假安排；第 5 项确认保密信息范围与保密期限；第 6 项审查知识产权归属与职务成果条款；第 7 项重点核对竞业限制条款的范围、地域、期限（不超过二年）、补偿标准与违约金对称性；第 8 项确认培训服务期与违约金；第 9 项审查解除与终止条件；第 10 项核对送达地址与争议解决条款；第 11 项检查附件与配套制度是否一致；第 12 项留存员工签收与告知记录。清单要求逐项标注“通过 / 修改 / 待确认”，并在归档前完成复核。'
  },
  {
    id: 'doc-4',
    title: '供应链框架协议审查要点',
    path: 'Obsidian / 合同 / 框架协议要点.md',
    content:
      '供应链框架协议审查要点：一是价格调整机制，应明确调价触发条件、计算口径、通知期限与争议处理，避免单方随意调价；二是最低采购量与预测机制，区分约束性承诺与滚动预测，设置偏差容忍区间；三是验收标准与异议期限，明确抽样规则、合格判定与整改时限；四是违约责任上限，通常不超过年度合同金额的一定比例，并排除间接损失；五是知识产权与保密，明确定制开发成果归属；六是合规与反腐败条款，要求供应商遵守反商业贿赂与贸易合规要求；七是终止与退出，约定重大违约、控制权变更、破产等情形的解除权与过渡安排；八是争议解决与送达，优先选择熟悉的仲裁机构并明确送达地址。审查时应结合业务实际，避免条款过度倾斜导致谈判僵局。'
  }
];

async function main() {
  const passwordHash = await bcrypt.hash('Legal1234', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@legal.local' },
    update: { name: '林律师', passwordHash },
    create: {
      id: 'user-demo',
      username: 'demo@legal.local',
      name: '林律师',
      email: 'demo@legal.local',
      passwordHash
    }
  });

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, parentId: category.parentId, sort: category.sort },
      create: category
    });
  }

  for (const [index, field] of fields.entries()) {
    await prisma.fieldDef.upsert({
      where: { id: field.id },
      update: {
        categoryId: field.categoryId,
        name: field.name,
        group: field.group,
        type: field.type,
        required: field.required,
        optionsJson: field.options ? JSON.stringify(field.options) : null,
        note: field.note ?? null,
        sort: index
      },
      create: {
        id: field.id,
        categoryId: field.categoryId,
        name: field.name,
        group: field.group,
        type: field.type,
        required: field.required,
        optionsJson: field.options ? JSON.stringify(field.options) : null,
        note: field.note ?? null,
        sort: index
      }
    });
  }

  const connectorPath = path.join(os.homedir(), 'Documents', 'ObsidianVault');
  await prisma.kbConnector.upsert({
    where: { id: 'conn-obsidian' },
    update: {
      name: 'Obsidian 本地库',
      type: 'obsidian',
      status: 'on',
      path: connectorPath,
      meta: '4 条目 · 只读接入 · 已索引',
      indexedCount: kbDocs.length,
      lastIndexedAt: new Date()
    },
    create: {
      id: 'conn-obsidian',
      name: 'Obsidian 本地库',
      type: 'obsidian',
      status: 'on',
      path: connectorPath,
      meta: '4 条目 · 只读接入 · 已索引',
      indexedCount: kbDocs.length,
      lastIndexedAt: new Date()
    }
  });
  await prisma.kbConnector.upsert({
    where: { id: 'conn-ima' },
    update: { name: '腾讯 IMA', type: 'ima', status: 'off', path: '' },
    create: {
      id: 'conn-ima',
      name: '腾讯 IMA',
      type: 'ima',
      status: 'off',
      path: '',
      meta: 'P1 · 依赖其开放接口；无接口时降级为导出导入'
    }
  });

  for (const doc of kbDocs) {
    await prisma.kbDoc.upsert({
      where: { id: doc.id },
      update: {
        connectorId: 'conn-obsidian',
        title: doc.title,
        path: doc.path,
        content: doc.content
      },
      create: {
        id: doc.id,
        connectorId: 'conn-obsidian',
        title: doc.title,
        path: doc.path,
        content: doc.content
      }
    });
  }

  for (const record of records) {
    const data = {
      categoryId: record.categoryId,
      name: record.name,
      sub: record.sub,
      status: record.status,
      risk: record.risk,
      dueDate: record.dueDate,
      hours: record.hours,
      valuesJson: JSON.stringify(record.values)
    };
    await prisma.record.upsert({
      where: { id: record.id },
      update: { ...data, createdAt: dayAt(-record.createdDaysAgo) },
      create: { id: record.id, ...data, createdAt: dayAt(-record.createdDaysAgo) }
    });
    await prisma.recordKb.deleteMany({ where: { recordId: record.id } });
    if (record.kbDocIds.length) {
      await prisma.recordKb.createMany({
        data: record.kbDocIds.map((docId) => ({ recordId: record.id, docId }))
      });
    }
  }

  const memories = [
    { id: 'mem-1', text: '结论先行，再展开依据与行动项', source: 'seed', weight: 1 },
    { id: 'mem-2', text: '重视裁审口径与地方实践差异', source: 'seed', weight: 0.9 },
    { id: 'mem-3', text: '风险偏好保守，优先隔离风险', source: 'seed', weight: 0.8 },
    { id: 'mem-4', text: '违约金条款强调权利义务对称', source: 'seed', weight: 0.7 },
    { id: 'mem-5', text: '合同条款尽量写死，减少解释空间', source: 'seed', weight: 0.6 }
  ];
  for (const memory of memories) {
    await prisma.memoryItem.upsert({
      where: { id: memory.id },
      update: { text: memory.text, source: memory.source, weight: memory.weight },
      create: memory
    });
  }

  await prisma.setting.upsert({
    where: { id: 'default' },
    update: { maskSensitive: true, maskLlm: true, defaultModel: 'deepseek-chat' },
    create: { id: 'default', maskSensitive: true, maskLlm: true, defaultModel: 'deepseek-chat' }
  });

  await prisma.llmModel.upsert({
    where: { vendor_model: { vendor: 'deepseek', model: 'deepseek-chat' } },
    update: { isDefault: true },
    create: {
      id: 'llm-deepseek',
      vendor: 'deepseek',
      model: 'deepseek-chat',
      isDefault: true,
      apiKeyEnc: null
    }
  });

  await prisma.consent.upsert({
    where: { id: 'consent-privacy-v1' },
    update: { userId: user.id, kind: 'privacy', version: 'v1' },
    create: { id: 'consent-privacy-v1', userId: user.id, kind: 'privacy', version: 'v1' }
  });

  console.log('[seed] done: user, 8 categories, %d fields, 9 records, %d kb docs, 5 memories', fields.length, kbDocs.length);
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
