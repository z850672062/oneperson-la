/* =========================================================
   法务工作台 · 原型交互 v0.4
   数据为演示用内存 Mock，刷新后重置（hash 路由保留当前模块）
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 工具 ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const cn = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const today = new Date(2026, 10, 9);

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------------- 状态 ---------------- */
  const state = {
    route: 'dash',
    period: 'week',
    customRange: null,
    filter: { status: 'all', q: '', catId: null },
    fieldCatId: 'c11',
    records: [],
    categories: [
      { id: 'c1', name: '合同审查', children: [
        { id: 'c11', name: '销售合同' }, { id: 'c12', name: '采购合同' }] },
      { id: 'c2', name: '诉讼仲裁', children: [
        { id: 'c21', name: '劳动争议' }, { id: 'c22', name: '商事仲裁' }] },
      { id: 'c3', name: '合规咨询', children: [] },
      { id: 'c4', name: '公司治理', children: [] }
    ],
    templates: {
      c1: [
        { id: 'f1', name: '事项名称', group: '基础信息', type: 'text', required: true, note: '一句话概括' },
        { id: 'f2', name: '关联项目', group: '基础信息', type: 'select', required: true, note: '框架/采购/销售/其他' },
        { id: 'f3', name: '风险等级', group: '基础信息', type: 'select', required: true, note: '高/中/低' },
        { id: 'f4', name: '耗时（小时）', group: '过程信息', type: 'number', required: true, note: '0.5 步进' },
        { id: 'f5', name: '相对方与背景', group: '过程信息', type: 'textarea', required: false, note: '交易背景、谈判地位' },
        { id: 'f6', name: '审查意见与结论', group: '结果信息', type: 'textarea', required: true, note: '修改要点与最终口径' },
        { id: 'f7', name: '附件', group: '结果信息', type: 'file', required: false, note: '合同稿、批注版' }
      ],
      c2: [
        { id: 'g1', name: '事项名称', group: '基础信息', type: 'text', required: true, note: '' },
        { id: 'g2', name: '案号', group: '基础信息', type: 'text', required: true, note: '立案编号' },
        { id: 'g3', name: '对方代理人', group: '过程信息', type: 'text', required: false, note: '' },
        { id: 'g4', name: '开庭时间', group: '过程信息', type: 'date', required: false, note: '' },
        { id: 'g5', name: '争议焦点与策略', group: '结果信息', type: 'textarea', required: true, note: '' }
      ],
      c3: [
        { id: 'h1', name: '咨询事项', group: '基础信息', type: 'text', required: true, note: '' },
        { id: 'h2', name: '提问部门', group: '基础信息', type: 'select', required: false, note: '业务/HR/财务' },
        { id: 'h3', name: '结论与依据', group: '结果信息', type: 'textarea', required: true, note: '' }
      ],
      c4: [
        { id: 'i1', name: '治理事项', group: '基础信息', type: 'text', required: true, note: '' },
        { id: 'i2', name: '涉及主体', group: '基础信息', type: 'text', required: false, note: '' },
        { id: 'i3', name: '决议/意见', group: '结果信息', type: 'textarea', required: true, note: '' }
      ]
    },
    connectors: [
      { id: 'k1', name: 'Obsidian 本地库', type: 'obsidian', status: 'on', meta: '1,284 条目 · 上次索引 今天 08:12 · 只读接入' },
      { id: 'k2', name: '腾讯 IMA', type: 'ima', status: 'off', meta: 'P1 · 依赖其开放接口；无接口时降级为导出导入' }
    ],
    kbDocs: [
      { id: 'd1', title: '竞业限制纠纷裁审口径（2024–2026 汇总）', path: 'Obsidian / 劳动争议 / 竞业限制.md', snip: '约定补偿标准“按法律规定执行”而未写明数额或计算方式的，多地裁审实践倾向于认定约定不明，劳动者已履行竞业义务的，可主张按离职前十二个月平均工资的 30% 补足补偿……' },
      { id: 'd2', title: '劳动合同法第二十三、二十四条要点批注', path: 'Obsidian / 法条批注 / 劳动合同法.md', snip: '竞业限制人员范围限于高管、高技及其他负有保密义务人员；补偿为离职后按月给付……' },
      { id: 'd3', title: '员工协议模板审查清单 v3', path: 'Obsidian / 模板清单 / 员工协议审查清单.md', snip: '第 7 项：竞业限制条款须核对范围、地域、期限（≤2 年）、补偿标准与违约金对称性……' },
      { id: 'd4', title: '供应链框架协议审查要点', path: 'Obsidian / 合同 / 框架协议要点.md', snip: '采购框架协议须关注价格调整机制、最低采购量、验收标准与违约责任上限……' }
    ],
    chat: [],
    memory: ['结论先行', '重视裁审口径', '风险偏好保守', '违约金对称', '条款写死'],
    pendingKb: []
  };

  /* 记录种子数据 */
  const seedRecords = [
    { catId: 'c12', name: '审查《供应链框架协议》修订稿', sub: '相对方：华东某物流集团 · 第三轮', status: 'done', risk: '中', due: '2026-11-08', hours: 3.5, kb: ['d4'], created: '2026-11-09' },
    { catId: 'c21', name: '劳动争议仲裁庭前准备', sub: '沪劳人仲（2026）办字第 412 号', status: 'doing', risk: '高', due: '2026-11-07', hours: 5, kb: ['d1', 'd2'], created: '2026-11-09' },
    { catId: 'c3', name: '数据合规自查清单更新', sub: '个人信息出境自评待补', status: 'doing', risk: '低', due: '2026-11-14', hours: 2, kb: [], created: '2026-11-09' },
    { catId: 'c4', name: '子公司章程修订意见', sub: '监事条款与新规衔接', status: 'done', risk: '中', due: '2026-11-06', hours: 1.5, kb: [], created: '2026-11-08' },
    { catId: 'c11', name: '供应商违约函件回复', sub: '主张违约金并保留解除权', status: 'doing', risk: '高', due: '2026-11-12', hours: 1, kb: ['d4', 'd3'], created: '2026-11-08' },
    { catId: 'c11', name: '经销商年度协议模板更新', sub: '返利条款与库存风险', status: 'done', risk: '低', due: '2026-11-05', hours: 2.5, kb: ['d3'], created: '2026-11-06' },
    { catId: 'c22', name: '股权回购仲裁答辩要旨', sub: '回购条件是否成就', status: 'doing', risk: '高', due: '2026-11-16', hours: 4, kb: [], created: '2026-11-07' },
    { catId: 'c12', name: '物流服务合同续签谈判', sub: '价格调整机制博弈', status: 'done', risk: '中', due: '2026-11-04', hours: 2, kb: ['d4'], created: '2026-11-05' },
    { catId: 'c3', name: '经销商合规培训讲稿', sub: '反商业贿赂要点', status: 'done', risk: '低', due: '2026-11-03', hours: 3, kb: [], created: '2026-11-04' }
  ];
  seedRecords.forEach((r, i) => {
    state.records.push(Object.assign({ id: 'r' + (i + 1), values: {}, groups: {} }, r));
  });

  /* ---------------- 分类辅助 ---------------- */
  const catById = (id) => {
    for (const c of state.categories) {
      if (c.id === id) return c;
      const sub = c.children.find((x) => x.id === id);
      if (sub) return Object.assign({ parent: c }, sub);
    }
    return null;
  };
  const catPath = (id) => {
    const c = catById(id);
    if (!c) return '未分类';
    return c.parent ? `${c.parent.name} / ${c.name}` : c.name;
  };
  const topOf = (id) => {
    const c = catById(id);
    return c && c.parent ? c.parent : c;
  };
  const catCount = (id) => state.records.filter((r) => topOf(r.catId) && topOf(r.catId).id === id).length;
  const catCountLeaf = (id) => state.records.filter((r) => r.catId === id).length;
  const tmplOf = (catId) => {
    const t = topOf(catId);
    return (t && state.templates[t.id]) || [];
  };
  const isOverdue = (r) => r.status !== 'done' && r.due && r.due < ymd(today);

  /* ---------------- 周期区间 ---------------- */
  function rangeOf(period, custom) {
    const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
    if (period === 'week') {
      const wd = (today.getDay() + 6) % 7;
      const s = new Date(y, m, d - wd), e = new Date(y, m, d - wd + 6);
      return { s, e, label: '本周' };
    }
    if (period === 'month') return { s: new Date(y, m, 1), e: new Date(y, m + 1, 0), label: '本月' };
    if (period === 'quarter') {
      const q = Math.floor(m / 3);
      return { s: new Date(y, q * 3, 1), e: new Date(y, q * 3 + 3, 0), label: '本季度' };
    }
    if (period === 'year') return { s: new Date(y, 0, 1), e: new Date(y, 11, 31), label: '今年' };
    const c = custom || { s: new Date(y, m, d - 6), e: today };
    return { s: c.s, e: c.e, label: '自定义' };
  }
  const inRange = (r, rg) => r.created >= ymd(rg.s) && r.created <= ymd(rg.e);
  const filteredByRange = (rg) => state.records.filter((r) => inRange(r, rg));

  /* ================= 仪表盘 ================= */
  function renderDash() {
    const rg = rangeOf(state.period, state.customRange);
    $('#dashRange').textContent = `${rg.label} ${cn(rg.s)} — ${cn(rg.e)}`;
    const rows = filteredByRange(rg);
    const done = rows.filter((r) => r.status === 'done');
    const doing = rows.filter((r) => r.status !== 'done');
    const overdue = rows.filter(isOverdue);
    const hours = rows.reduce((a, r) => a + (Number(r.hours) || 0), 0);
    const doneHours = done.reduce((a, r) => a + (Number(r.hours) || 0), 0);
    const rate = rows.length ? Math.round(done.length / rows.length * 100) : 0;

    $('#statsWrap').innerHTML = `
      <div class="stat"><div class="stat-label">新增工作</div><div class="stat-num num">${rows.length}<small>项</small></div><div class="stat-sub">期内受理的全部事项</div></div>
      <div class="stat g"><div class="stat-label">办结</div><div class="stat-num num">${done.length}<small>项</small></div><div class="stat-sub ok">结案率 ${rate}%</div></div>
      <div class="stat a"><div class="stat-label">在办</div><div class="stat-num num">${doing.length}<small>项</small></div><div class="stat-sub">含 ${overdue.length} 项已逾期</div></div>
      <div class="stat r"><div class="stat-label">逾期</div><div class="stat-num num">${overdue.length}<small>项</small></div><div class="stat-sub ${overdue.length ? 'bad' : ''}">${overdue.length ? esc(overdue[0].name.slice(0, 12)) : '无逾期，状态良好'}</div></div>
      <div class="stat i"><div class="stat-label">投入工时</div><div class="stat-num num">${hours.toFixed(1)}<small>h</small></div><div class="stat-sub num">办结 ${doneHours}h · 占比 ${hours ? Math.round(doneHours / hours * 100) : 0}%</div></div>`;

    const maxCat = Math.max(1, ...state.categories.map((c) => rows.filter((r) => topOf(r.catId) && topOf(r.catId).id === c.id).length));
    $('#catBars').innerHTML = state.categories.map((c) => {
      const n = rows.filter((r) => topOf(r.catId) && topOf(r.catId).id === c.id).length;
      return `<div class="bar-row"><span>${esc(c.name)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n / maxCat * 100)}%"></div></div>
        <span class="bar-num num">${n}</span></div>`;
    }).join('');
    $('#catFoot').textContent = `办结进度：${done.length} / ${rows.length} 项`;

    const activeRows = doing.filter((r) => !isOverdue(r));
    const waitingRows = activeRows.filter((r) => /反馈|谈判|待/.test(r.sub));
    const dist = [
      { name: '进行中', color: 'var(--blue)', n: activeRows.length - waitingRows.length },
      { name: '待对方反馈', color: 'var(--amber)', n: waitingRows.length },
      { name: '已逾期', color: 'var(--red)', n: overdue.length }
    ];
    $('#distList').innerHTML = rows.length ? dist.map((d) =>
      `<div class="dist-row"><span class="dist-dot" style="background:${d.color}"></span>${d.name}<span class="n num">${d.n} 项</span></div>`
    ).join('') : `<div class="empty" style="padding:24px 18px"><h4>当前没有在办事项</h4><p>期内记录已全部办结</p></div>`;

    $('#trendWrap').innerHTML = trendSvg(rg);
  }

  function trendSvg(rg) {
    const days = 7, lx = 30, step = 110;
    const labels = [], add = [], fin = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(rg.s.getTime() + i * 86400000);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      const ds = ymd(d);
      add.push(state.records.filter((r) => r.created === ds).length);
      fin.push(state.records.filter((r) => r.status === 'done' && r.due === ds).length);
    }
    const max = Math.max(1, ...add, ...fin);
    const pt = (arr, off) => arr.map((v, i) => `${lx + i * step},${120 - Math.round(v / max * 80)}`).join(' ');
    const dots = (arr, color) => arr.map((v, i) => `<circle cx="${lx + i * step}" cy="${120 - Math.round(v / max * 80)}" r="3" fill="${color}"/>`).join('');
    const texts = labels.map((l, i) => `<text x="${lx + i * step}" y="150" font-size="11" text-anchor="middle" fill="#8b8577">${l}</text>`).join('');
    return `<svg viewBox="0 0 720 165" width="100%" height="165" role="img" aria-label="工作量走势图">
      <polyline fill="none" stroke="#41719c" stroke-width="2" points="${pt(add)}"/>
      <polyline fill="none" stroke="#b98f45" stroke-width="2" stroke-dasharray="5 4" points="${pt(fin)}"/>
      ${dots(add, '#41719c')}${dots(fin, '#b98f45')}${texts}</svg>`;
  }

  /* ================= 工作记录 ================= */
  function currentRecords() {
    const f = state.filter;
    return state.records.filter((r) => {
      if (f.catId && topOf(r.catId) && topOf(r.catId).id !== f.catId) return false;
      if (f.status === 'doing' && r.status === 'done') return false;
      if (f.status === 'done' && r.status !== 'done') return false;
      if (f.status === 'overdue' && !isOverdue(r)) return false;
      if (f.q) {
        const hay = (r.name + ' ' + r.sub + ' ' + catPath(r.catId)).toLowerCase();
        if (!hay.includes(f.q.toLowerCase())) return false;
      }
      return true;
    });
  }

  function renderRecords() {
    const scope = state.filter.catId ? catPath(state.filter.catId) : '全部分类';
    $('#recordScope').textContent = scope;
    const rows = currentRecords();
    if (!rows.length) {
      $('#recordCard').innerHTML = `<div class="empty"><h4>没有匹配的工作记录</h4>
        <p>调整筛选条件，或立即记录一条新工作</p>
        <button class="btn btn-primary" data-action="new-record">新建记录</button></div>`;
      return;
    }
    $('#recordCard').innerHTML = `<table>
      <thead><tr><th>事项</th><th>分类</th><th>状态</th><th>风险</th><th>截止日期</th><th>工时</th><th>知识库</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><div class="cell-main">${esc(r.name)}</div><div class="cell-sub">${esc(r.sub || '—')}</div></td>
        <td>${esc(catPath(r.catId))}</td>
        <td>${r.status === 'done' ? '<span class="tag tag-green">办结</span>' : isOverdue(r) ? '<span class="tag tag-red">逾期</span>' : '<span class="tag tag-amber">在办</span>'}</td>
        <td>${esc(r.risk || '中')}</td>
        <td class="num">${esc((r.due || '').slice(5))}</td>
        <td class="num">${Number(r.hours || 0).toFixed(1)}</td>
        <td class="num">${(r.kb || []).length}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-quiet btn-sm" data-action="edit-record" data-id="${r.id}">编辑</button>
          <button class="btn btn-quiet btn-sm" data-action="del-record" data-id="${r.id}">删除</button>
        </td></tr>`).join('')}</tbody></table>`;
  }

  /* ================= 侧边分类树 ================= */
  function renderTree() {
    $('#recTree').innerHTML = state.categories.map((c) => `
      <button class="tree-item ${state.filter.catId === c.id ? 'on' : ''}" data-cat="${c.id}">
        ${esc(c.name)} <span class="cnt num">${catCount(c.id)}</span>
      </button>
      ${c.children.map((s) => `<button class="tree-item l2 ${state.filter.catId === s.id ? 'on' : ''}" data-cat="${s.id}">
        ${esc(s.name)} <span class="cnt num">${catCountLeaf(s.id)}</span></button>`).join('')}
    `).join('');
  }

  /* ================= 字段管理 ================= */
  function renderFields() {
    const topCats = state.categories.filter((c) => state.templates[c.id]);
    if (!topCats.find((c) => c.id === state.fieldCatId)) state.fieldCatId = topCats[0] ? topCats[0].id : null;
    $('#fieldCats').innerHTML = `<div class="list-head"><span>分类模板</span>
      <button class="btn btn-quiet btn-sm" data-action="manage-cat">管理</button></div>` +
      topCats.map((c) => `<button class="list-item ${c.id === state.fieldCatId ? 'on' : ''}" data-field-cat="${c.id}">
        ${esc(c.name)} <span class="cnt num">${(state.templates[c.id] || []).length} 字段</span></button>`).join('') +
      `<button class="list-item" data-action="new-field-cat" style="color:var(--muted)">＋ 新建分类模板</button>`;

    const cat = catById(state.fieldCatId);
    const list = state.templates[state.fieldCatId] || [];
    $('#fieldTable').innerHTML = `<div class="card-head"><span class="card-title">${esc(cat ? cat.name : '—')} · 字段模板</span>
      <span class="card-note">公共字段：状态、截止日期（自动注入，不可删除）</span></div>
      <table><thead><tr><th>字段名称</th><th>分组</th><th>类型</th><th>必填</th><th>说明</th><th></th></tr></thead>
      <tbody>${list.map((f) => `<tr>
        <td class="cell-main">${esc(f.name)}</td><td>${esc(f.group)}</td>
        <td><span class="tag tag-line">${typeName(f.type)}</span></td>
        <td>${f.required ? '是' : '否'}</td>
        <td class="cell-sub">${esc(f.note || '—')}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-quiet btn-sm" data-action="edit-field" data-id="${f.id}">编辑</button>
          <button class="btn btn-quiet btn-sm" data-action="del-field" data-id="${f.id}">删除</button>
        </td></tr>`).join('')}
        <tr><td class="cell-main">状态 <span class="tag tag-green">公共</span></td><td>结果信息</td>
          <td><span class="tag tag-line">单选</span></td><td>是</td><td class="cell-sub">在办/办结</td>
          <td><button class="btn btn-quiet btn-sm" disabled>锁定</button></td></tr>
        <tr><td class="cell-main">截止日期 <span class="tag tag-green">公共</span></td><td>过程信息</td>
          <td><span class="tag tag-line">日期</span></td><td>是</td><td class="cell-sub">逾期判定依据</td>
          <td><button class="btn btn-quiet btn-sm" disabled>锁定</button></td></tr>
      </tbody></table>`;
  }
  function typeName(t) {
    return ({ text: '文本', textarea: '多行文本', number: '数字', date: '日期', select: '单选', multi: '多选', file: '附件' })[t] || t;
  }

  /* ================= 知识接入 ================= */
  function renderKB() {
    $('#connGrid').innerHTML = state.connectors.map((c) => `
      <div class="conn">
        <div class="conn-top">
          <span class="conn-name"><span class="dot ${c.status === 'on' ? 'dot-on' : 'dot-off'}"></span>${esc(c.name)}</span>
          ${c.status === 'on' ? '<span class="tag tag-green">已连接</span>' : '<span class="tag tag-line">未连接</span>'}
        </div>
        <div class="conn-meta">${esc(c.meta)}</div>
        <div style="margin-top:10px;display:flex;gap:8px">
          ${c.status === 'on'
            ? `<button class="btn btn-ghost btn-sm" data-action="kb-reindex">索引</button>
               <button class="btn btn-quiet btn-sm" data-action="kb-config" data-id="${c.id}">配置</button>`
            : `<button class="btn btn-ghost btn-sm" data-action="kb-connect" data-id="${c.id}">尝试连接</button>`}
        </div>
      </div>`).join('');
  }

  function renderKbResults(q) {
    const rows = state.kbDocs.filter((d) => !q || (d.title + d.snip).toLowerCase().includes(q.toLowerCase()));
    $('#kbMeta').textContent = q ? `命中 ${rows.length} 条 · 0.24s` : `共 ${state.kbDocs.length} 条已索引`;
    if (!rows.length) {
      $('#kbResults').innerHTML = `<div class="empty"><h4>没有命中条目</h4><p>换个关键字，或在 Obsidian 库中补充文档后重新索引</p>
        <button class="btn btn-ghost" data-action="kb-reindex">重新索引</button></div>`;
      return;
    }
    const hi = (t) => q ? esc(t).replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g'), '<mark>$1</mark>') : esc(t);
    $('#kbResults').innerHTML = rows.map((d) => `<div class="kb-item">
      <div class="kb-title">${hi(d.title)}</div>
      <div class="kb-path">${esc(d.path)}</div>
      <p class="kb-snip">${hi(d.snip)}</p>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" data-action="kb-cite" data-id="${d.id}">引用到记录</button>
        <button class="btn btn-quiet btn-sm" data-action="kb-open" data-id="${d.id}">打开原文</button>
      </div></div>`).join('');
  }

  /* ================= 法务对话 ================= */
  function renderChat() {
    const body = $('#chatBody');
    if (!state.chat.length) {
      body.innerHTML = `<div class="empty" style="margin:auto"><h4>开始与「AI 版本的我」对话</h4>
        <p>已接入知识库与记忆画像，可询问条款、复盘工作、梳理能力体系</p></div>`;
    } else {
      body.innerHTML = state.chat.map((m) => m.role === 'user'
        ? `<div class="msg msg-u"><div class="bubble">${esc(m.text)}</div><span class="msg-meta">${esc(m.time)}</span></div>`
        : `<div class="msg msg-a"><div class="bubble">${m.html || esc(m.text)}</div><span class="msg-meta">${esc(m.meta || '')}</span></div>`
      ).join('');
      body.scrollTop = body.scrollHeight;
    }
    $('#chatCount').textContent = `本会话 ${Math.ceil(state.chat.filter((m) => m.role === 'user').length)} 轮`;
    $('#memoryTags').innerHTML = state.memory.length
      ? state.memory.map((t, i) => `<span class="tag ${i % 3 === 0 ? 'tag-amber' : 'tag-line'}">${esc(t)}</span>`).join('')
      : '<span class="card-note">暂无记忆，对话后将自动沉淀</span>';
    $('#suggestList').innerHTML = [
      '复盘我本周诉讼仲裁的时间分配？',
      '我的合同审查能力体系还缺哪块？',
      '把本周高风险事项整理成提示清单。'
    ].map((s) => `<li data-action="suggest" data-text="${esc(s)}">${esc(s)}</li>`).join('');
  }

  function sendChat(text) {
    if (!text.trim()) { toast('请输入内容'); return; }
    const now = new Date();
    state.chat.push({ role: 'user', text, time: `今天 ${pad(now.getHours())}:${pad(now.getMinutes())}` });
    renderChat();
    const body = $('#chatBody');
    const tip = document.createElement('div');
    tip.className = 'msg msg-a';
    tip.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
    body.appendChild(tip);
    body.scrollTop = body.scrollHeight;

    setTimeout(() => {
      tip.remove();
      const useKb = $('#kbToggle').classList.contains('on');
      const cites = useKb ? state.kbDocs.slice(0, 2).map((d) => `<span class="cite">${esc(d.title.slice(0, 8))}</span>`).join('') : '';
      const answer =
        `结论先行：建议按「条款写死 + 对称违约金」处理。\n` +
        `1）补偿标准明确为离职前十二个月平均工资的 30%，按月支付，不低于当地最低工资标准；\n` +
        `2）违约金与已付补偿保持对称，不超过补偿总额 3 倍；\n` +
        `3）保留举证材料，明确其接触客户名单与定价信息。${cites}\n` +
        `这与过去 4 份协议的最终口径一致。`;
      const html = esc(answer).replace(/\n/g, '<br>');
      state.chat.push({ role: 'assistant', text: answer, html, meta: `已检索知识库 ${useKb ? 3 : 0} 条 · 结合记忆画像` });
      if (state.memory.length < 9 && !state.memory.includes('偏好条款写死')) state.memory.push('偏好条款写死');
      renderChat();
    }, 700);
  }

  /* ================= 弹窗系统 ================= */
  const modal = $('#modal'), scrim = $('#scrim');

  function openModal(opt) {
    $('#modalTitle').textContent = opt.title || '';
    $('#modalBody').innerHTML = opt.body || '';
    $('#modalFoot').innerHTML = opt.foot || '';
    $('#modalBox').className = 'modal-box' + (opt.size === 'sm' ? ' sm' : '');
    modal.classList.add('show');
    scrim.classList.add('show');
    modal.dataset.kind = opt.kind || '';
    const first = $('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) setTimeout(() => first.focus(), 40);
  }
  function closeModal() {
    modal.classList.remove('show');
    scrim.classList.remove('show');
    modal.dataset.kind = '';
  }
  function confirmModal(title, text, onOk, okText) {
    openModal({
      title, size: 'sm',
      body: `<p style="font-size:13.5px;color:#4a473f;padding:6px 0">${esc(text)}</p>`,
      foot: `<button class="btn btn-ghost" data-close>取消</button>
             <button class="btn btn-primary" id="confirmOk">${esc(okText || '确定')}</button>`
    });
    $('#confirmOk').addEventListener('click', () => { closeModal(); onOk(); });
  }

  /* ---------- 记录弹窗（分组表单，严格按模板渲染） ---------- */
  /* 把记录实体还原成表单值，保证「编辑」时各字段回填 */
  function recordValues(rec) {
    return Object.assign({}, rec.values || {}, {
      __name: rec.name || '', __sub: rec.sub || '', __risk: rec.risk || '中',
      __status: rec.status || 'doing', __due: rec.due || '',
      __hours: rec.hours != null ? rec.hours : 1
    });
  }

  /* 在打开子弹窗前快照当前表单，避免选完知识库后已填内容丢失 */
  let recordDraft = null;
  function snapshotRecordForm() {
    const topSel = $('#f-cat-top'), leafSel = $('#f-cat-leaf');
    if (!topSel) return null;
    const values = {};
    $$('#modalBody [data-field]').forEach((el) => { values[el.dataset.field] = el.value; });
    return {
      id: recordDraft ? recordDraft.id : null,
      topId: topSel.value, leafId: leafSel ? leafSel.value : null, values
    };
  }
  function recordModalKeep() {
    const s = recordDraft || {};
    recordModal(s.id || null, s);
  }

  function recordModal(recordId, preset) {
    const rec = recordId ? state.records.find((r) => r.id === recordId) : null;
    const initCat = preset ? (preset.leafId || preset.topId) : rec ? rec.catId : (state.filter.catId || 'c11');
    const top = topOf(initCat) || state.categories[0];
    const leaf = catById(initCat);
    const leafId = preset && preset.leafId
      ? preset.leafId
      : leaf && leaf.parent ? leaf.id : (top.children[0] ? top.children[0].id : top.id);
    const values = preset && preset.values ? preset.values : rec ? recordValues(rec) : {};
    recordDraft = { id: recordId || null, topId: top.id, leafId, values };

    openModal({
      title: rec ? '编辑记录' : '新建记录', kind: 'record',
      body: buildRecordForm(top, leafId, values),
      foot: `<button class="btn btn-ghost" id="saveDraft">存为草稿</button>
             <button class="btn btn-ghost" data-close>取消</button>
             <button class="btn btn-primary" id="saveRecord">确定</button>`
    });

    function refreshForm(topId, leafId, values) {
      const t = state.categories.find((c) => c.id === topId);
      $('#modalBody').innerHTML = buildRecordForm(t, leafId, values);
      bindCatSelect();
    }
    function bindCatSelect() {
      const topSel = $('#f-cat-top'), leafSel = $('#f-cat-leaf');
      topSel.addEventListener('change', () => {
        const t = state.categories.find((c) => c.id === topSel.value);
        const keep = collectFields();
        $('#modalBody').innerHTML = buildRecordForm(t, t.children[0] ? t.children[0].id : t.id, keep);
        bindCatSelect();
      });
      if (leafSel) leafSel.addEventListener('change', () => {
        const keep = collectFields();
        const t = state.categories.find((c) => c.id === topSel.value);
        $('#modalBody').innerHTML = buildRecordForm(t, leafSel.value, keep);
        bindCatSelect();
      });
      $$('.stepper button', $('#modalBody')).forEach((b) => b.addEventListener('click', () => {
        const input = b.parentElement.querySelector('input');
        const v = Math.max(0, (parseFloat(input.value) || 0) + (b.dataset.step === '1' ? 0.5 : -0.5));
        input.value = v.toFixed(1);
      }));
      $$('[data-kb-pick]', $('#modalBody')).forEach((b) => b.addEventListener('click', pickKb));
    }
    function collectFields() {
      const vals = {};
      $$('[data-field]', $('#modalBody')).forEach((el) => { vals[el.dataset.field] = el.value; });
      return vals;
    }
    bindCatSelect();

    $('#saveDraft').addEventListener('click', () => save('draft'));
    $('#saveRecord').addEventListener('click', () => save('submitted'));

    function save(mode) {
      const topId = $('#f-cat-top').value;
      const leafEl = $('#f-cat-leaf');
      const catId = leafEl ? leafEl.value : topId;
      const t = state.categories.find((c) => c.id === topId);
      const tpl = state.templates[topId] || [];
      const vals = collectFields();
      let bad = null;
      tpl.forEach((f) => {
        if (f.required && !String(vals[f.id] || '').trim() && !bad) bad = f;
      });
      if (!vals.__name) { toast('请填写事项名称'); $('#f-name').classList.add('err'); return; }
      if (mode === 'submitted' && !vals.__due) { toast('请选择截止日期'); $('#f-due').classList.add('err'); return; }
      if (mode === 'submitted' && bad) { toast(`「${bad.name}」为必填项`); return; }

      const payload = {
        catId, name: vals.__name, sub: vals.__sub || '', status: vals.__status || 'doing',
        risk: vals.__risk || '中', due: vals.__due || '', hours: parseFloat(vals.__hours) || 0,
        kb: state.pendingKb.slice(), values: vals,
        created: rec ? rec.created : ymd(today)
      };
      if (rec) Object.assign(rec, payload);
      else state.records.unshift(Object.assign({ id: 'r' + Date.now() }, payload));
      state.pendingKb = [];
      recordDraft = null;
      closeModal();
      renderAll();
      toast(mode === 'draft' ? '已存为草稿' : (rec ? '记录已更新' : '记录已保存'));
    }
  }

  function buildRecordForm(top, leafId, values) {
    values = values || {};
    const tpl = state.templates[top.id] || [];
    const groups = [];
    tpl.forEach((f) => { if (!groups.includes(f.group)) groups.push(f.group); });

    const fieldHtml = (f) => {
      const v = values[f.id] != null ? values[f.id] : '';
      let ctrl = '';
      if (f.type === 'textarea') ctrl = `<textarea class="control" data-field="${f.id}" placeholder="${esc(f.note || '')}">${esc(v)}</textarea>`;
      else if (f.type === 'date') ctrl = `<input class="control num" type="date" data-field="${f.id}" value="${esc(v)}">`;
      else if (f.type === 'number') ctrl = `<input class="control num" type="number" step="0.5" data-field="${f.id}" value="${esc(v)}">`;
      else if (f.type === 'select') {
        const opts = f.id === 'f3' ? ['高', '中', '低'] : f.id === 'f2' ? ['框架协议', '采购', '销售', '其他'] : ['选项一', '选项二'];
        ctrl = `<select class="control" data-field="${f.id}">${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      } else if (f.type === 'file') ctrl = `<input class="control" type="file" data-field="${f.id}" style="padding:6px">`;
      else ctrl = `<input class="control" data-field="${f.id}" value="${esc(v)}" placeholder="${esc(f.note || '')}">`;
      const wide = f.type === 'textarea' || f.type === 'file';
      return `<div class="field ${wide ? 'wide' : ''}">
        <label>${f.required ? '<span class="req">*</span>' : ''}<b>${esc(f.name)}</b></label>${ctrl}
        ${f.note && f.type !== 'textarea' ? `<div class="cell-sub">${esc(f.note)}</div>` : ''}</div>`;
    };

    return `
      <div class="fgroup"><div class="fgroup-title">基础信息</div>
        <div class="fgrid">
          <div class="field"><label><b>记录编号</b></label><input class="control num" value="WR${ymd(today).replace(/-/g, '')}${pad(state.records.length + 1)}" readonly></div>
          <div class="field"><label><span class="req">*</span><b>工作分类</b></label>
            <select class="control" id="f-cat-top">${state.categories.map((c) => `<option value="${c.id}" ${c.id === top.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
            ${top.children.length ? `<select class="control" id="f-cat-leaf" style="margin-top:8px">${top.children.map((s) => `<option value="${s.id}" ${s.id === leafId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
          </div>
          <div class="field"><label><span class="req">*</span><b>事项名称</b></label><input class="control" id="f-name" data-field="__name" value="${esc(values.__name || '')}" placeholder="一句话概括本次工作"></div>
          <div class="field"><label><b>风险等级</b></label>
            <select class="control" data-field="__risk">${['高', '中', '低'].map((o) => `<option ${o === (values.__risk || '中') ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        </div>
      </div>
      ${groups.map((g) => `<div class="fgroup"><div class="fgroup-title">${esc(g)}</div>
        <div class="fgrid">${tpl.filter((f) => f.group === g).map(fieldHtml).join('')}</div></div>`).join('')}
      <div class="fgroup"><div class="fgroup-title">公共字段</div>
        <div class="fgrid">
          <div class="field"><label><span class="req">*</span><b>状态</b></label>
            <select class="control" data-field="__status">${['在办', '办结'].map((o) => `<option value="${o === '办结' ? 'done' : 'doing'}" ${(values.__status || 'doing') === (o === '办结' ? 'done' : 'doing') ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label><span class="req">*</span><b>截止日期</b></label>
            <input class="control num" type="date" id="f-due" data-field="__due" value="${esc(values.__due || ymd(new Date(today.getTime() + 5 * 86400000)))}"></div>
          <div class="field"><label><b>耗时（小时）</b></label>
            <div class="stepper"><button type="button" data-step="-1" aria-label="减少">−</button>
              <input class="num" data-field="__hours" value="${values.__hours != null ? Number(values.__hours).toFixed(1) : '1.0'}">
              <button type="button" data-step="1" aria-label="增加">＋</button></div></div>
          <div class="field"><label><b>相对方</b></label><input class="control" data-field="__sub" value="${esc(values.__sub || '')}" placeholder="请输入相对方名称"></div>
        </div>
      </div>
      <div class="fgroup"><div class="fgroup-title">知识库关联</div>
        <div class="fgrid"><div class="field wide">
          <div class="chips" id="kbChips">${(state.pendingKb || []).map((id) => {
            const d = state.kbDocs.find((x) => x.id === id);
            return `<button type="button" class="chip on" data-unpick="${id}">${esc(d ? d.title.slice(0, 12) : id)} ✕</button>`;
          }).join('')}<button type="button" class="chip" data-kb-pick>＋ 检索添加</button></div>
        </div></div>
      </div>`;
  }

  function pickKb() {
    recordDraft = snapshotRecordForm() || recordDraft;
    openModal({
      title: '从知识库选择条目', size: 'sm', kind: 'kb-pick',
      body: `<div class="search" style="margin:6px 0 12px"><input type="search" id="pickQ" placeholder="输入关键字过滤" aria-label="过滤知识库"></div>
        <div id="pickList">${state.kbDocs.map((d) => `<label class="list-item" style="cursor:pointer">
          <span><b style="font-weight:500">${esc(d.title)}</b><br><span class="cell-sub">${esc(d.path)}</span></span>
          <input type="checkbox" value="${d.id}" ${state.pendingKb.includes(d.id) ? 'checked' : ''} style="width:16px;height:16px">
        </label>`).join('')}</div>`,
      foot: `<button class="btn btn-ghost" id="pickCancel">返回</button><button class="btn btn-primary" id="pickOk">加入关联</button>`
    });
    $('#pickQ').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('#pickList label').forEach((l) => { l.style.display = !q || l.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
    $('#pickCancel').addEventListener('click', recordModalKeep);
    $('#pickOk').addEventListener('click', () => {
      state.pendingKb = $$('#pickList input:checked').map((i) => i.value);
      recordModalKeep();
    });
  }

  /* ---------- 分类管理 ---------- */
  function catManagerModal() {
    const rows = state.categories.map((c) => `
      <div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:center;gap:8px">
          <b style="flex:1">${esc(c.name)}</b>
          <span class="card-note num">${catCount(c.id)} 条</span>
          <button class="btn btn-quiet btn-sm" data-add-sub="${c.id}">＋ 子分类</button>
          <button class="btn btn-quiet btn-sm" data-rename-cat="${c.id}">改名</button>
          <button class="btn btn-quiet btn-sm" data-del-cat="${c.id}">删除</button>
        </div>
        ${c.children.map((s) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0 0 20px">
          <span style="flex:1;color:var(--muted)">└ ${esc(s.name)}</span>
          <span class="card-note num">${catCountLeaf(s.id)} 条</span>
          <button class="btn btn-quiet btn-sm" data-rename-cat="${s.id}">改名</button>
          <button class="btn btn-quiet btn-sm" data-del-cat="${s.id}">删除</button>
        </div>`).join('')}
      </div>`).join('');
    openModal({
      title: '分类管理', body: `<p class="card-note" style="padding:8px 0">固定两级分类；删除前需先迁移该分类下的记录。</p>${rows}
        <div style="padding-top:14px"><button class="btn btn-ghost btn-sm" id="addTopCat">＋ 新建一级分类</button></div>`,
      foot: `<button class="btn btn-primary" data-close>完成</button>`
    });
    $('#addTopCat').addEventListener('click', () => {
      const name = prompt('新建一级分类名称');
      if (!name) return;
      const id = 'c' + Date.now();
      state.categories.push({ id, name, children: [] });
      state.templates[id] = state.templates[id] || [];
      renderAll(); catManagerModal(); toast('分类已创建');
    });
    $$('[data-add-sub]').forEach((b) => b.addEventListener('click', () => {
      const name = prompt('新建二级分类名称');
      if (!name) return;
      const c = state.categories.find((x) => x.id === b.dataset.addSub);
      c.children.push({ id: 'c' + Date.now(), name });
      renderAll(); catManagerModal(); toast('子分类已创建');
    }));
    $$('[data-rename-cat]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.renameCat;
      const target = catById(id);
      const name = prompt('修改分类名称', target.name);
      if (!name) return;
      const top = state.categories.find((c) => c.id === id);
      if (top) top.name = name; else target.name = name;
      renderAll(); catManagerModal(); toast('已更新');
    }));
    $$('[data-del-cat]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.delCat;
      const n = state.categories.some((c) => c.id === id) ? catCount(id) : catCountLeaf(id);
      if (n > 0) { toast(`该分类下还有 ${n} 条记录，请先迁移`); return; }
      confirmModal('删除分类', '确认删除该分类？此操作不可恢复。', () => {
        state.categories = state.categories.filter((c) => c.id !== id)
          .map((c) => Object.assign(c, { children: c.children.filter((s) => s.id !== id) }));
        delete state.templates[id];
        renderAll(); catManagerModal(); toast('已删除');
      });
    }));
  }

  /* ---------- 字段表单 ---------- */
  function fieldModal(fieldId) {
    const list = state.templates[state.fieldCatId] || [];
    const f = list.find((x) => x.id === fieldId);
    const cur = f || { name: '', group: '基础信息', type: 'text', required: false, note: '' };
    const groups = ['基础信息', '过程信息', '结果信息'];
    openModal({
      title: f ? '编辑字段' : '新建字段', size: 'sm', kind: 'field',
      body: `<div class="fgrid" style="grid-template-columns:1fr">
        <div class="field"><label><span class="req">*</span><b>字段名称</b></label><input class="control" id="fd-name" value="${esc(cur.name)}" placeholder="如：审查意见与结论"></div>
        <div class="field"><label><b>所属分组</b></label><select class="control" id="fd-group">${groups.map((g) => `<option ${g === cur.group ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <div class="field"><label><b>字段类型</b></label><select class="control" id="fd-type" ${f ? 'disabled' : ''}>
          ${[['text', '文本'], ['textarea', '多行文本'], ['number', '数字'], ['date', '日期'], ['select', '单选'], ['multi', '多选'], ['file', '附件']]
            .map(([v, n]) => `<option value="${v}" ${v === cur.type ? 'selected' : ''}>${n}</option>`).join('')}
        </select>${f ? '<div class="cell-sub">已有数据的字段仅允许改名 / 追加选项，类型锁定</div>' : ''}</div>
        <div class="field"><label><b>是否必填</b></label>
          <select class="control" id="fd-req"><option value="0" ${!cur.required ? 'selected' : ''}>否</option><option value="1" ${cur.required ? 'selected' : ''}>是</option></select></div>
        <div class="field"><label><b>说明 / 提示</b></label><input class="control" id="fd-note" value="${esc(cur.note || '')}" placeholder="用于弹窗内的辅助提示"></div>
      </div>`,
      foot: `<button class="btn btn-ghost" data-close>取消</button>
             <button class="btn btn-primary" id="fdSave">${f ? '保存' : '创建'}</button>`
    });
    $('#fdSave').addEventListener('click', () => {
      const name = $('#fd-name').value.trim();
      if (!name) { toast('请填写字段名称'); return; }
      const data = {
        name, group: $('#fd-group').value, type: $('#fd-type').value,
        required: $('#fd-req').value === '1', note: $('#fd-note').value.trim()
      };
      if (f) Object.assign(f, data);
      else (state.templates[state.fieldCatId] = state.templates[state.fieldCatId] || []).push(Object.assign({ id: 'f' + Date.now() }, data));
      closeModal(); renderAll(); toast(f ? '字段已更新' : '字段已创建');
    });
  }

  /* ---------- 报表 ---------- */
  function reportModal() {
    openModal({
      title: '生成报表', size: 'sm', kind: 'report',
      body: `<div class="fgrid" style="grid-template-columns:1fr">
        <div class="field"><label><b>报表类型</b></label><select class="control" id="rp-type">
          <option value="day">日报</option><option value="week" selected>周报</option>
          <option value="month">月报</option><option value="quarter">季报</option><option value="year">年报</option></select></div>
        <div class="field"><label><b>汇总周期</b></label>
          <select class="control" id="rp-period">
            <option value="week" ${state.period === 'week' ? 'selected' : ''}>跟随当前（${rangeOf(state.period, state.customRange).label}）</option>
            <option value="month">本月</option><option value="quarter">本季度</option><option value="year">今年</option>
          </select></div>
        <p class="card-note">汇总口径：记录数、状态分布、分类工作量、工时合计与字段聚合；生成后可保存历史版本并导出 Markdown。</p>
        <p class="card-note">定时自动输出（P1）：按周/月周期自动生成并站内通知，可在设置中开启。</p>
      </div>`,
      foot: `<button class="btn btn-ghost" data-close>取消</button>
             <button class="btn btn-primary" id="rpGo">生成预览</button>`
    });
    $('#rpGo').addEventListener('click', () => {
      const type = $('#rp-type').value;
      const period = $('#rp-period').value;
      closeModal();
      showReport(type, period);
    });
  }

  function showReport(type, period) {
    const rg = type === 'day' ? { s: today, e: today, label: '今日' } : rangeOf(period, state.customRange);
    const rows = filteredByRange(rg);
    const done = rows.filter((r) => r.status === 'done');
    const overdue = rows.filter(isOverdue);
    const hours = rows.reduce((a, r) => a + (Number(r.hours) || 0), 0);
    const typeNameMap = { day: '日报', week: '周报', month: '月报', quarter: '季报', year: '年报' };
    const byCat = state.categories.map((c) => ({
      name: c.name, n: rows.filter((r) => topOf(r.catId) && topOf(r.catId).id === c.id).length
    })).filter((x) => x.n > 0);

    openModal({
      title: `${typeNameMap[type]} · ${rg.label}`, kind: 'report-preview',
      body: `<div class="doc">
        <h3>一、汇总概览</h3>
        <p class="num">周期：${cn(rg.s)} — ${cn(rg.e)}｜新增 ${rows.length} 项，办结 ${done.length} 项，在办 ${rows.length - done.length} 项，逾期 ${overdue.length} 项，投入工时 ${hours.toFixed(1)} 小时。</p>
        <h3>二、分类工作量</h3>
        ${byCat.length ? `<ul>${byCat.map((x) => `<li>${esc(x.name)}：${x.n} 项</li>`).join('')}</ul>` : '<p>本周期暂无记录。</p>'}
        <h3>三、重点事项</h3>
        ${rows.length ? `<ul>${rows.slice(0, 6).map((r) => `<li>${esc(r.name)}（${esc(catPath(r.catId))}，${r.status === 'done' ? '已办结' : isOverdue(r) ? '已逾期' : '在办'}）</li>`).join('')}</ul>` : '<p>—</p>'}
        <h3>四、风险与提醒</h3>
        <p>${overdue.length ? `存在 ${overdue.length} 项逾期事项，建议优先处理：${esc(overdue.map((r) => r.name).join('、'))}。` : '本周期无逾期事项，节奏良好。'}</p>
        <h3>五、下阶段建议</h3>
        <p>结合知识库与历史口径，建议将高频事项沉淀为模板清单；对重复出现的合同条款建立标准表述库。</p>
      </div>`,
      foot: `<button class="btn btn-ghost" data-close>关闭</button>
             <button class="btn btn-ghost" id="rpCopy">复制 Markdown</button>
             <button class="btn btn-primary" id="rpExport">导出 Markdown</button>`
    });
    const md = buildMarkdown(typeNameMap[type], rg, rows, done, overdue, hours, byCat);
    $('#rpCopy').addEventListener('click', () => {
      navigator.clipboard && navigator.clipboard.writeText(md);
      toast('Markdown 已复制');
    });
    $('#rpExport').addEventListener('click', () => downloadMd(md, `法务${typeNameMap[type]}_${ymd(rg.s)}_${ymd(rg.e)}.md`));
  }

  function buildMarkdown(title, rg, rows, done, overdue, hours, byCat) {
    return `# 法务${title}（${cn(rg.s)} — ${cn(rg.e)}）\n\n## 一、汇总概览\n\n- 新增工作：${rows.length} 项\n- 办结：${done.length} 项\n- 在办：${rows.length - done.length} 项\n- 逾期：${overdue.length} 项\n- 投入工时：${hours.toFixed(1)} 小时\n\n## 二、分类工作量\n\n${byCat.length ? byCat.map((x) => `- ${x.name}：${x.n} 项`).join('\n') : '- 暂无记录'}\n\n## 三、事项明细\n\n| 事项 | 分类 | 状态 | 截止 | 工时 |\n| --- | --- | --- | --- | --- |\n${rows.map((r) => `| ${r.name.replace(/\|/g, '/')} | ${catPath(r.catId)} | ${r.status === 'done' ? '办结' : isOverdue(r) ? '逾期' : '在办'} | ${r.due || '—'} | ${Number(r.hours || 0).toFixed(1)} |`).join('\n')}\n\n## 四、风险与提醒\n\n${overdue.length ? `存在 ${overdue.length} 项逾期事项：${overdue.map((r) => r.name).join('、')}` : '本周期无逾期事项。'}\n`;
  }

  function downloadMd(text, filename) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 ' + filename);
  }

  /* ---------- 文档（隐私/协议/第三方） ---------- */
  function docModal(kind) {
    const docs = {
      privacy: ['隐私政策', [
        ['收集范围', '仅收集你主动录入的工作记录字段、知识库索引与对话内容。'],
        ['用途', '用于生成报表、复盘分析与 AI 对话；不外用于广告或第三方营销。'],
        ['存储', '本地 / 私有部署，数据存放于本机数据库；不公网暴露时无需备案。'],
        ['第三方', 'LLM 厂商 API（你自配 Key）、本地 Ollama、错误监控（可关闭）。'],
        ['脱敏', '敏感字段默认打码；外发大模型前可开启实体脱敏。'],
        ['你的权利', '可在设置中心导出、清除记忆画像或删除全部数据。']
      ]],
      terms: ['用户协议', [
        ['服务性质', '本工具为个人工作辅助软件，不构成法律意见，最终判断由你负责。'],
        ['使用规范', '不得用于违法用途；API Key 由你自行申请并承担费用。'],
        ['数据责任', '请自行做好数据备份；本地部署的数据安全由你自行维护。'],
        ['变更', '版本更新可能调整功能，重大变更会在设置中心提示。']
      ]],
      third: ['第三方清单', [
        ['LLM 厂商', 'DeepSeek / Qwen / OpenAI / Claude 等，按需配置，Key 加密存储。'],
        ['本地模型', 'Ollama（可选），数据不出本机。'],
        ['知识库', 'Obsidian 本地库（只读索引）、腾讯 IMA（P1，待开放接口）。'],
        ['错误监控', '轻量自托管方案，采样上报，可在配置中关闭。']
      ]]
    }[kind];
    openModal({
      title: docs[0],
      body: `<div class="doc">${docs[1].map(([h, p]) => `<h3>${esc(h)}</h3><p>${esc(p)}</p>`).join('')}</div>`,
      foot: `<button class="btn btn-primary" data-close>我已阅读</button>`
    });
  }

  /* ---------- 其他弹窗 ---------- */
  function modelsModal() {
    openModal({
      title: '模型配置', size: 'sm', kind: 'models',
      body: `<div class="fgrid" style="grid-template-columns:1fr">
        <div class="field"><label><b>厂商</b></label><select class="control" id="md-vendor"><option>DeepSeek</option><option>Qwen</option><option>OpenAI</option><option>Claude</option><option>Ollama（本地）</option></select></div>
        <div class="field"><label><b>API Key</b></label><input class="control" id="md-key" type="password" placeholder="sk-•••••••• 加密存储"><div class="cell-sub">仅本地加密保存，不写入日志</div></div>
        <div class="field"><label><b>默认模型</b></label><input class="control" id="md-model" value="deepseek-chat"></div>
        <div class="field"><label><b>连接测试</b></label><button class="btn btn-ghost btn-sm" id="mdTest">测试连通性</button><div class="cell-sub" id="mdTestMsg"></div></div>
      </div>`,
      foot: `<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="mdSave">保存</button>`
    });
    $('#mdTest').addEventListener('click', () => { $('#mdTestMsg').textContent = '原型演示：测试通过（模拟）'; });
    $('#mdSave').addEventListener('click', () => { closeModal(); toast('模型配置已保存'); });
  }

  function memoryModal() {
    openModal({
      title: '记忆画像管理', size: 'sm', kind: 'memory',
      body: `<p class="card-note" style="padding:6px 0 12px">由对话自动沉淀的偏好与习惯，可逐条删除。</p>
        <div class="chips" id="memList">${state.memory.map((t) => `<button class="chip on" data-mem="${esc(t)}">${esc(t)} ✕</button>`).join('') || '<span class="card-note">暂无记忆</span>'}</div>`,
      foot: `<button class="btn btn-ghost btn-danger" id="memClear">全部清除</button><button class="btn btn-primary" data-close>完成</button>`
    });
    $$('[data-mem]').forEach((b) => b.addEventListener('click', () => {
      state.memory = state.memory.filter((x) => x !== b.dataset.mem);
      renderChat(); memoryModal();
    }));
    $('#memClear').addEventListener('click', () => { state.memory = []; renderChat(); closeModal(); toast('记忆画像已清除'); });
  }

  function customRangeModal() {
    openModal({
      title: '自定义汇总区间', size: 'sm', kind: 'range',
      body: `<div class="fgrid" style="grid-template-columns:1fr 1fr">
        <div class="field"><label><b>开始日期</b></label><input class="control num" type="date" id="rg-s" value="${ymd(new Date(2026, 10, 1))}"></div>
        <div class="field"><label><b>结束日期</b></label><input class="control num" type="date" id="rg-e" value="${ymd(today)}"></div>
      </div>`,
      foot: `<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="rgOk">应用</button>`
    });
    $('#rgOk').addEventListener('click', () => {
      const s = new Date($('#rg-s').value), e = new Date($('#rg-e').value);
      if (isNaN(s) || isNaN(e) || s > e) { toast('请选择有效的日期区间'); return; }
      state.customRange = { s, e };
      state.period = 'custom';
      $$('#periodChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.period === 'custom'));
      closeModal(); renderDash(); toast('区间已应用');
    });
  }

  /* ================= 动作分发 ================= */
  const actions = {
    'assistant': () => { go('chat'); toast('已进入法务对话，可直接提问'); },
    'report': () => reportModal(),
    'export': () => {
      const rg = rangeOf(state.period, state.customRange);
      const rows = filteredByRange(rg);
      downloadMd(
        buildMarkdown('报表', rg, rows, rows.filter((r) => r.status === 'done'), rows.filter(isOverdue),
          rows.reduce((a, r) => a + (Number(r.hours) || 0), 0),
          state.categories.map((c) => ({ name: c.name, n: rows.filter((r) => topOf(r.catId) && topOf(r.catId).id === c.id).length })).filter((x) => x.n > 0)),
        `法务报表_${ymd(rg.s)}_${ymd(rg.e)}.md`);
    },
    'new-record': () => { state.pendingKb = []; recordModal(null); },
    'edit-record': (el) => {
      const r = state.records.find((x) => x.id === el.dataset.id);
      state.pendingKb = (r.kb || []).slice();
      recordModal(r.id);
    },
    'del-record': (el) => {
      const r = state.records.find((x) => x.id === el.dataset.id);
      confirmModal('删除记录', `确认删除「${r.name}」？删除后不可恢复。`, () => {
        state.records = state.records.filter((x) => x.id !== r.id);
        renderAll(); toast('已删除');
      }, '删除');
    },
    'manage-cat': () => catManagerModal(),
    'filter-reset': () => {
      state.filter = { status: 'all', q: '', catId: null };
      $('#recordSearch').value = '';
      $$('#statusChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.status === 'all'));
      renderTree(); renderRecords();
    },
    'new-field': () => fieldModal(null),
    'new-field-cat': () => catManagerModal(),
    'edit-field': (el) => fieldModal(el.dataset.id),
    'del-field': (el) => {
      const list = state.templates[state.fieldCatId] || [];
      const f = list.find((x) => x.id === el.dataset.id);
      confirmModal('删除字段', `确认删除字段「${f.name}」？历史记录中的值将保留。`, () => {
        state.templates[state.fieldCatId] = list.filter((x) => x.id !== f.id);
        renderAll(); toast('字段已删除');
      }, '删除');
    },
    'kb-reindex': () => toast('已触发增量索引（模拟）：1,284 条目 · 12 条更新'),
    'kb-add': () => {
      openModal({
        title: '添加连接器', size: 'sm', kind: 'kb-add',
        body: `<div class="fgrid" style="grid-template-columns:1fr">
          <div class="field"><label><b>连接器类型</b></label><select class="control" id="newConnType">
            <option value="obsidian">Obsidian 本地库</option><option value="ima">腾讯 IMA（P1）</option>
            <option value="folder">本地文件夹（Markdown）</option></select></div>
          <div class="field"><label><b>显示名称</b></label><input class="control" id="newConnName" placeholder="如：工作笔记库"></div>
          <div class="field"><label><b>路径 / 接口地址</b></label><input class="control" id="newConnPath" placeholder="D:\\Notes\\Legal"></div>
          <p class="card-note">只读接入不修改原库；索引保存在本地数据库。腾讯 IMA 依赖其开放接口，P1 提供导出导入降级。</p>
        </div>`,
        foot: `<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="newConnSave">添加</button>`
      });
      $('#newConnSave').addEventListener('click', () => {
        const name = $('#newConnName').value.trim();
        if (!name) { toast('请填写显示名称'); return; }
        const type = $('#newConnType').value;
        state.connectors.push({
          id: 'k' + Date.now(), name, type, status: 'off',
          meta: `${$('#newConnPath').value.trim() || '待配置路径'} · 尚未索引`
        });
        closeModal(); renderKB(); toast('连接器已添加，请完成配置与索引');
      });
    },
    'kb-connect': (el) => {
      const c = state.connectors.find((x) => x.id === el.dataset.id);
      c.status = 'on';
      c.meta = '已连接 · 待完成首次索引（演示）';
      renderKB(); toast('连接成功（模拟）');
    },
    'kb-config': () => {
      openModal({
        title: '连接器配置', size: 'sm', kind: 'kb-config',
        body: `<div class="fgrid" style="grid-template-columns:1fr">
          <div class="field"><label><b>知识库路径</b></label><input class="control" id="kbCfgPath" value="D:\\Obsidian\\LegalVault" aria-label="知识库路径"></div>
          <div class="field"><label><b>接入模式</b></label><select class="control" id="kbCfgMode"><option>只读索引（推荐）</option><option>只读 + 反向链接</option></select></div>
          <p class="card-note">只读接入不会修改原库文件；索引保存在本地数据库。</p></div>`,
        foot: `<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="kbCfgSave">保存</button>`
      });
      $('#kbCfgSave').addEventListener('click', () => {
        if (!$('#kbCfgPath').value.trim()) { toast('请填写知识库路径'); return; }
        closeModal(); toast('连接器配置已保存');
      });
    },
    'kb-cite': (el) => {
      const d = state.kbDocs.find((x) => x.id === el.dataset.id);
      if (!state.pendingKb.includes(d.id)) state.pendingKb.push(d.id);
      recordModal(null);
      toast('已加入「知识库关联」，填写后保存即可');
    },
    'kb-open': (el) => {
      const d = state.kbDocs.find((x) => x.id === el.dataset.id);
      openModal({
        title: d.title, size: 'sm',
        body: `<div class="doc"><p class="card-note" style="margin-bottom:8px">${esc(d.path)}</p><p>${esc(d.snip)}</p>
          <p class="card-note" style="margin-top:12px">原型演示：实际将跳转 Obsidian 或内置只读预览。</p></div>`,
        foot: `<button class="btn btn-primary" data-close>关闭</button>`
      });
    },
    'chat-send': () => { const v = $('#chatInput').value; if (v.trim()) { $('#chatInput').value = ''; sendChat(v); } },
    'chat-clear': () => { state.chat = []; renderChat(); toast('已新建会话'); },
    'suggest': (el) => sendChat(el.dataset.text),
    'manage-memory': () => memoryModal(),
    'doc': (el) => docModal(el.dataset.doc),
    'open-models': () => modelsModal(),
    'change-pwd': () => {
      openModal({
        title: '修改密码', size: 'sm', kind: 'pwd',
        body: `<div class="fgrid" style="grid-template-columns:1fr">
          <div class="field"><label><b>当前密码</b></label><input class="control" type="password" id="pwd0" aria-label="当前密码"></div>
          <div class="field"><label><b>新密码</b></label><input class="control" type="password" id="pwd1" aria-label="新密码"><div class="cell-sub">至少 8 位，建议含大小写与数字</div></div>
          <div class="field"><label><b>确认新密码</b></label><input class="control" type="password" id="pwd2" aria-label="确认新密码"></div></div>`,
        foot: `<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="pwdSave">保存</button>`
      });
      $('#pwdSave').addEventListener('click', () => {
        const a = $('#pwd1').value, b = $('#pwd2').value;
        if (!$('#pwd0').value) { toast('请输入当前密码'); return; }
        if (a.length < 8) { toast('新密码至少 8 位'); return; }
        if (a !== b) { toast('两次输入的新密码不一致'); return; }
        closeModal(); toast('密码已更新（演示）');
      });
    },
    'devices': () => openModal({
      title: '登录设备', size: 'sm',
      body: `<div class="list-panel"><div class="list-item"><span><b>本机 · Microsoft Edge</b><br><span class="cell-sub">192.168.1.12 · 当前设备</span></span><span class="tag tag-green">在线</span></div>
        <div class="list-item"><span><b>书房台式机 · Chrome</b><br><span class="cell-sub">192.168.1.20 · 3 天前</span></span><button class="btn btn-quiet btn-sm" data-action="toast" data-msg="已下线该设备（模拟）">下线</button></div></div>`,
      foot: `<button class="btn btn-primary" data-close>关闭</button>`
    }),
    'logout': () => confirmModal('退出登录', '将清理本地会话与缓存，确认退出？', () => toast('已退出登录（原型演示）'), '退出'),
    'export-all': () => {
      downloadMd(buildMarkdown('全量记录', { s: new Date(2026, 0, 1), e: today }, state.records,
        state.records.filter((r) => r.status === 'done'), state.records.filter(isOverdue),
        state.records.reduce((a, r) => a + (Number(r.hours) || 0), 0),
        state.categories.map((c) => ({ name: c.name, n: catCount(c.id) })).filter((x) => x.n > 0)), '法务数据导出.md');
    },
    'clear-memory': () => confirmModal('清除记忆画像', '将删除全部习惯与偏好数据，确认继续？', () => {
      state.memory = []; renderChat(); toast('记忆画像已清除');
    }, '清除'),
    'wipe': () => confirmModal('删除全部数据', '此操作不可恢复，将清空记录、报表与画像。确认删除？', () => {
      state.records = []; state.chat = []; state.memory = []; renderAll(); toast('全部数据已删除（演示）');
    }, '确认删除'),
    'toast': (el) => toast(el.dataset.msg || '演示操作')
  };

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) { closeModal(); return; }
    const act = e.target.closest('[data-action]');
    if (act && actions[act.dataset.action]) { actions[act.dataset.action](act); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      state.filter.catId = state.filter.catId === cat.dataset.cat ? null : cat.dataset.cat;
      go('records'); renderTree(); renderRecords(); return;
    }
    const fcat = e.target.closest('[data-field-cat]');
    if (fcat) { state.fieldCatId = fcat.dataset.fieldCat; renderFields(); return; }
    const chip = e.target.closest('.chip[data-period]');
    if (chip) {
      state.period = chip.dataset.period;
      $$('#periodChips .chip').forEach((c) => c.classList.toggle('on', c === chip));
      if (chip.dataset.period === 'custom') customRangeModal(); else renderDash();
      return;
    }
    const schip = e.target.closest('.chip[data-status]');
    if (schip) {
      state.filter.status = schip.dataset.status;
      $$('#statusChips .chip').forEach((c) => c.classList.toggle('on', c === schip));
      renderRecords(); return;
    }
    const unpick = e.target.closest('[data-unpick]');
    if (unpick) {
      state.pendingKb = state.pendingKb.filter((x) => x !== unpick.dataset.unpick);
      if (modal.dataset.kind === 'record') {
        recordDraft = snapshotRecordForm() || recordDraft;
        recordModalKeep();
      }
      return;
    }
  });

  scrim.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSide(); } });

  /* ================= 路由 ================= */
  const routes = ['dash', 'records', 'fields', 'kb', 'chat', 'settings'];
  function go(route) {
    if (!routes.includes(route)) route = 'dash';
    state.route = route;
    routes.forEach((r) => { const v = $('#view-' + r); if (v) v.hidden = r !== route; });
    $$('.nav-item').forEach((n) => {
      const active = n.dataset.nav === route;
      if (active) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    if (location.hash !== '#/' + route) history.replaceState(null, '', '#/' + route);
    closeSide();
    window.scrollTo(0, 0);
  }

  /* 侧边栏交互 */
  const side = $('#side'), scrimSide = $('#scrimSide');
  function closeSide() { side.classList.remove('open'); scrimSide.classList.remove('show'); }
  $('#menuBtn').addEventListener('click', () => { side.classList.add('open'); scrimSide.classList.add('show'); });
  scrimSide.addEventListener('click', closeSide);

  const recNav = $('#recNav'), recTree = $('#recTree');
  recNav.addEventListener('click', (e) => {
    e.preventDefault();
    recTree.classList.toggle('open');
    recNav.classList.toggle('open');
    if (recTree.classList.contains('open')) go('records');
  });

  /* 筛选与搜索 */
  $('#recordSearch').addEventListener('input', (e) => { state.filter.q = e.target.value; renderRecords(); });
  $('#kbSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderKbResults(e.target.value.trim()); });
  $('#kbSearch').addEventListener('input', (e) => { if (!e.target.value.trim()) renderKbResults(''); });

  /* 对话 */
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); actions['chat-send'](); }
  });
  ['kbToggle', 'memToggle'].forEach((id) => {
    $('#' + id).addEventListener('click', (e) => {
      const b = e.currentTarget;
      b.classList.toggle('on');
      const base = b.textContent.replace(/ · (开|关)$/, '');
      b.textContent = base + ' · ' + (b.classList.contains('on') ? '开' : '关');
    });
  });
  $$('input[data-toggle-msg]').forEach((i) => i.addEventListener('change', () => {
    toast(`${i.dataset.toggleMsg}已${i.checked ? '开启' : '关闭'}`);
  }));

  /* ================= 渲染与初始化 ================= */
  function renderAll() {
    renderTree();
    renderDash();
    renderRecords();
    renderFields();
    renderKB();
    renderChat();
  }
  renderKbResults('');
  renderAll();
  go((location.hash || '#/dash').replace('#/', ''));
  window.addEventListener('hashchange', () => go(location.hash.replace('#/', '')));
})();
