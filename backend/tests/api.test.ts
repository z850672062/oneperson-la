import request from 'supertest';
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from '../src/app';
import { toDateOnly } from '../src/utils/date';

const CREDENTIALS = { username: 'demo@legal.local', password: 'Legal1234' };

let token = '';

function auth(req: request.Test) {
  return req.set('Authorization', `Bearer ${token}`);
}

describe('OnePerson_LA API', () => {
  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send(CREDENTIALS);
    expect(res.status).toBe(200);
    token = res.body.accessToken;
  });

  it('health 返回版本信息', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, version: expect.any(String) });
  });

  it('登录成功返回 user 与 accessToken，并下发 refresh cookie', async () => {
    const res = await request(app).post('/api/auth/login').send(CREDENTIALS);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'test-user', email: 'demo@legal.local' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.accessToken).toBe('string');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('la_refresh='))).toBe(true);
    expect(cookies.join(';')).toContain('HttpOnly');
    expect(cookies.join(';')).toContain('Path=/api/auth');
  });

  it('可修改当前用户名称，空名称返回 422', async () => {
    const current = await auth(request(app).get('/api/auth/me'));
    expect(current.status).toBe(200);
    const original = current.body.user.name as string;

    const updated = await auth(request(app).patch('/api/auth/me')).send({ name: '沈律师' });
    expect(updated.status).toBe(200);
    expect(updated.body.user).toMatchObject({ name: '沈律师', username: 'demo@legal.local' });

    const blank = await auth(request(app).patch('/api/auth/me')).send({ name: '   ' });
    expect(blank.status).toBe(422);

    await auth(request(app).patch('/api/auth/me')).send({ name: original });
  });

  it('登录失败返回 401，缺少参数返回 422', async () => {
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ username: CREDENTIALS.username, password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('UNAUTHORIZED');

    const invalid = await request(app).post('/api/auth/login').send({ username: CREDENTIALS.username });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refresh 使用 cookie 换取新 token', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send(CREDENTIALS);
    expect(login.status).toBe(200);

    const refreshed = await agent.post('/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.user.id).toBe('test-user');
  });

  it('未登录访问受保护接口返回 401', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('分类列表返回扁平结构，字段接口追加公共字段', async () => {
    const res = await auth(request(app).get('/api/categories'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    const contract = res.body.items.find((item: { id: string }) => item.id === 't-contract');
    expect(contract).toMatchObject({ name: '合同审查', parentId: null, recordCount: 0 });

    const fields = await auth(request(app).get('/api/fields?categoryId=t-contract'));
    expect(fields.status).toBe(200);
    const ids = fields.body.items.map((field: { id: string }) => field.id);
    expect(ids).toContain('t-field-1');
    expect(ids).toContain('common-status');
    expect(ids).toContain('common-dueDate');
    const common = fields.body.items.find((field: { id: string }) => field.id === 'common-status');
    expect(common.isCommon).toBe(true);
  });

  it('分类创建、更新与删除保护生效', async () => {
    const created = await auth(request(app).post('/api/categories')).send({ name: '临时分类' });
    expect(created.status).toBe(201);
    expect(created.body.category).toMatchObject({ name: '临时分类', recordCount: 0 });

    const patched = await auth(
      request(app).patch(`/api/categories/${created.body.category.id}`)
    ).send({ name: '临时分类-改', sort: 9 });
    expect(patched.status).toBe(200);
    expect(patched.body.category.name).toBe('临时分类-改');

    const removed = await auth(
      request(app).delete(`/api/categories/${created.body.category.id}`)
    );
    expect(removed.status).toBe(204);

    const protectedDelete = await auth(request(app).delete('/api/categories/t-contract'));
    expect(protectedDelete.status).toBe(409);
    expect(protectedDelete.body.error.code).toBe('CATEGORY_NOT_EMPTY');
  });

  it('记录 CRUD、筛选与详情结构正确', async () => {
    const dueDate = toDateOnly(new Date());
    const created = await auth(request(app).post('/api/records')).send({
      categoryId: 't-sales',
      name: '测试销售合同审查',
      sub: '相对方：测试客户',
      dueDate,
      hours: 1.5,
      values: { 't-field-1': '销售' }
    });
    expect(created.status).toBe(201);
    const record = created.body.record;
    expect(record).toMatchObject({
      categoryId: 't-sales',
      categoryPath: '合同审查 / 销售合同',
      name: '测试销售合同审查',
      status: 'doing',
      dueDate,
      hours: 1.5
    });
    expect(record.values).toEqual({ 't-field-1': '销售' });
    expect(Array.isArray(record.kbDocs)).toBe(true);

    const list = await auth(
      request(app).get('/api/records').query({ categoryId: 't-contract', q: '测试销售' })
    );
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(list.body.items[0].id).toBe(record.id);

    const detail = await auth(request(app).get(`/api/records/${record.id}`));
    expect(detail.status).toBe(200);
    expect(detail.body.record.id).toBe(record.id);

    const patched = await auth(request(app).patch(`/api/records/${record.id}`)).send({
      status: 'done',
      hours: 2.5
    });
    expect(patched.status).toBe(200);
    expect(patched.body.record).toMatchObject({ status: 'done', hours: 2.5 });

    const doneList = await auth(
      request(app).get('/api/records').query({ status: 'done', q: '测试销售' })
    );
    expect(doneList.body.total).toBe(1);

    const removed = await auth(request(app).delete(`/api/records/${record.id}`));
    expect(removed.status).toBe(204);

    const missing = await auth(request(app).get(`/api/records/${record.id}`));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('dashboard summary 返回契约结构且统计口径正确', async () => {
    const created = await auth(request(app).post('/api/records')).send({
      categoryId: 't-sales',
      name: '仪表盘测试记录',
      dueDate: toDateOnly(new Date()),
      status: 'done',
      hours: 2
    });
    expect(created.status).toBe(201);

    const res = await auth(request(app).get('/api/dashboard/summary?period=week'));
    expect(res.status).toBe(200);
    expect(res.body.range).toMatchObject({ from: expect.any(String), to: expect.any(String), label: expect.any(String) });
    expect(res.body.stats).toMatchObject({
      created: expect.any(Number),
      done: expect.any(Number),
      doing: expect.any(Number),
      overdue: expect.any(Number),
      hours: expect.any(Number),
      doneHours: expect.any(Number),
      rate: expect.any(Number)
    });
    expect(res.body.stats.created).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.done).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.byCategory)).toBe(true);
    expect(res.body.statusDist.map((item: { key: string }) => item.key)).toEqual([
      'running',
      'waiting',
      'overdue'
    ]);
    expect(Array.isArray(res.body.trend)).toBe(true);
    expect(res.body.trend.length).toBeLessThanOrEqual(31);
    expect(res.body.trend[0]).toMatchObject({ date: expect.any(String), created: expect.any(Number), done: expect.any(Number) });

    const invalid = await auth(
      request(app).get('/api/dashboard/summary').query({ period: 'custom' })
    );
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    await auth(request(app).delete(`/api/records/${created.body.record.id}`));
  });

  it('报表生成、列表、详情与 Markdown 导出可用', async () => {
    const generated = await auth(request(app).post('/api/reports/generate')).send({ type: 'week' });
    expect(generated.status).toBe(201);
    expect(generated.body.report).toMatchObject({
      type: 'week',
      title: expect.any(String),
      rangeFrom: expect.any(String),
      rangeTo: expect.any(String),
      markdown: expect.any(String)
    });
    const markdown = generated.body.report.markdown as string;
    expect(markdown).toContain('## 一、汇总概览');
    expect(markdown).toContain('## 二、分类工作量');
    expect(markdown).toContain('## 三、事项明细');
    expect(markdown).toContain('## 四、风险与提醒');
    expect(markdown).toContain('## 五、下阶段建议');

    const list = await auth(request(app).get('/api/reports'));
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);

    const detail = await auth(request(app).get(`/api/reports/${generated.body.report.id}`));
    expect(detail.status).toBe(200);

    const exported = await auth(
      request(app).get(`/api/reports/${generated.body.report.id}/export`)
    );
    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('text/markdown');
    expect(exported.headers['content-disposition']).toContain('attachment');
  });

  it('设置与模型接口不泄露明文 Key', async () => {
    const settings = await auth(request(app).get('/api/settings'));
    expect(settings.status).toBe(200);
    expect(settings.body).toMatchObject({
      maskSensitive: expect.any(Boolean),
      maskLlm: expect.any(Boolean),
      defaultModel: expect.any(String)
    });

    const created = await auth(request(app).post('/api/llm/models')).send({
      vendor: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-test-secret-value'
    });
    expect(created.status).toBe(201);
    expect(created.body.model.hasKey).toBe(true);
    expect(JSON.stringify(created.body)).not.toContain('sk-test-secret-value');

    const models = await auth(request(app).get('/api/llm/models'));
    expect(JSON.stringify(models.body)).not.toContain('sk-test-secret-value');
  });

  it('知识库连接器、检索与记忆接口可用', async () => {
    // 使用真实临时目录，验证索引与路径校验（路径不可访问时返回 422）
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'la-kb-'));
    fs.writeFileSync(path.join(tmpDir, '竞业限制.md'), '# 竞业限制\n\n竞业限制期限不得超过二年。\n');

    const created = await auth(request(app).post('/api/kb/connectors')).send({
      name: '测试库',
      type: 'obsidian',
      path: tmpDir
    });
    expect(created.status).toBe(201);

    const reindexed = await auth(
      request(app).post(`/api/kb/connectors/${created.body.connector.id}/reindex`)
    );
    expect(reindexed.status).toBe(200);
    expect(reindexed.body).toMatchObject({
      indexed: 1,
      updated: expect.any(Number),
      durationMs: expect.any(Number)
    });

    const missing = await auth(request(app).post('/api/kb/connectors')).send({
      name: '无效路径',
      type: 'obsidian',
      path: path.join(tmpDir, 'not-exists')
    });
    expect(missing.status).toBe(201);
    const badReindex = await auth(
      request(app).post(`/api/kb/connectors/${missing.body.connector.id}/reindex`)
    );
    expect(badReindex.status).toBe(422);

    fs.rmSync(tmpDir, { recursive: true, force: true });

    const search = await auth(request(app).get('/api/kb/search').query({ q: '竞业' }));
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body.items)).toBe(true);
    expect(typeof search.body.took).toBe('number');

    const memory = await auth(request(app).get('/api/profile/memory'));
    expect(memory.status).toBe(200);
    expect(Array.isArray(memory.body.items)).toBe(true);
  });
});
