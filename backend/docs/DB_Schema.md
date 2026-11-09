# OnePerson_LA 数据库设计（Prisma + MySQL 8）

- 数据库：MySQL 8.0（InnoDB），字符集 `utf8mb4` / 排序规则 `utf8mb4_unicode_ci`
- 连接串：`DATABASE_URL="mysql://user:password@host:3306/oneperson_la"`
- ORM：Prisma 6，schema：`backend/prisma/schema.prisma`
- 迁移：`backend/prisma/migrations/`，`pnpm db:deploy`（生产）/ `pnpm db:migrate`（开发）应用
- 未使用原生 enum，所有枚举（状态、字段类型、连接器类型等）以 `VARCHAR(191)` 存储，由应用层 zod 约束（便于后续增删枚举值而不改表结构）

### 类型映射约定

| Prisma | MySQL | 说明 |
| --- | --- | --- |
| `String` | `VARCHAR(191)` | 默认长度；作为唯一键/索引列时 191×4 字节 < 3072 字节索引上限 |
| `String @db.VarChar(512)` | `VARCHAR(512)` | 路径、副标题等中长文本 |
| `String @db.Text` | `TEXT` | 记录值 JSON、文档全文、报表 Markdown（MySQL 的 TEXT 列不允许字面量默认值，故这些列不设 `@default`） |
| `DateTime` | `DATETIME(3)` | Prisma 映射为毫秒精度 |
| `Boolean` | `TINYINT(1)` | |
| `Float` | `DOUBLE` | 工时、权重 |

## 1. 表结构

> 下表的「类型」列为 Prisma 逻辑类型；物理映射见上表。`TEXT` 短文本（名称、枚举、显示文案等）落库为 `VARCHAR(191)`；仅标注 `VARCHAR(512)` 或 `TEXT` 的长文本列使用对应 MySQL 类型。

### 1.1 User（账号）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK, cuid | 用户 ID |
| username | TEXT | UNIQUE, NOT NULL | 登录名（种子为 `大力出奇迹`） |
| name | TEXT | NOT NULL | 显示名 |
| email | TEXT | UNIQUE, NOT NULL | 邮箱，也可作为登录名 |
| passwordHash | TEXT | NOT NULL | bcrypt(10) 哈希，绝不返回/记录 |
| createdAt | DATETIME | NOT NULL, default now | 创建时间 |
| updatedAt | DATETIME | NOT NULL, @updatedAt | 更新时间 |

索引：`username`、`email` 隐式唯一索引。

### 1.2 RefreshSession（刷新令牌）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | |
| userId | TEXT | FK → User.id, ON DELETE CASCADE | |
| tokenHash | TEXT | UNIQUE, NOT NULL | refresh token 的 sha256 十六进制，明文不落库 |
| expiresAt | DATETIME | NOT NULL | 7 天 |
| revokedAt | DATETIME | NULL | 非空表示已吊销 |
| createdAt | DATETIME | default now | |

索引：`(userId)`；`tokenHash` 唯一。刷新时轮换：旧记录写 `revokedAt`，新建一条。

### 1.3 Category（一级分类）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | VARCHAR(191) | PK | |
| name | VARCHAR(191) | NOT NULL, UNIQUE | 分类名全局唯一 |
| sort | INTEGER | default 0 | 升序 |
| createdAt / updatedAt | DATETIME | | |

约束与索引：
- `UNIQUE(name)`：分类名全局唯一，服务层在创建/改名时返回 409 `CATEGORY_CONFLICT`。
- 原两级结构已扁平化：二级分类名称迁移为 `Record.subType`（事项类型），侧边栏与分类管理均只展示一级分类。

### 1.4 FieldDef（字段模板）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | `valuesJson` 的键 |
| categoryId | TEXT | FK → Category.id, ON DELETE CASCADE | |
| name | TEXT | NOT NULL | 字段名称 |
| group | TEXT | NOT NULL | 分组：基础信息 / 过程信息 / 结果信息 |
| type | TEXT | NOT NULL | text / textarea / number / date / select / multi / file |
| required | BOOLEAN | default false | 前端必填标识 |
| optionsJson | TEXT | NULL | JSON 字符串数组，如 `["高","中","低"]` |
| note | TEXT | NULL | 帮助说明 |
| sort | INTEGER | default 0 | 组内排序 |
| isCommon | BOOLEAN | default false | 公共字段不入库，恒为 false |
| createdAt / updatedAt | DATETIME | | |

索引：`(categoryId)`。

> 公共字段「状态 status」「截止日期 dueDate」不存储于本表。`GET /api/fields?categoryId=` 时由接口追加：
> - `{id:"common-status", name:"状态", type:"select", isCommon:true, options:["在办","办结"], sort:9001}`
> - `{id:"common-dueDate", name:"截止日期", type:"date", isCommon:true, options:[], sort:9002}`
> 二者不可删除、不可 PATCH。

### 1.5 Record（工作记录）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | |
| categoryId | VARCHAR(191) | FK → Category.id, ON DELETE RESTRICT | 一级分类 |
| subType | VARCHAR(40) | default "" | 事项类型（如商标注册、模板合同），用于列表筛选 |
| name | TEXT | NOT NULL | 事项名称 |
| sub | VARCHAR(512) | default "" | 副标题（相对方/案号/背景） |
| status | VARCHAR(191) | default "doing" | doing / done |
| risk | VARCHAR(191) | default "中" | 高 / 中 / 低 |
| dueDate | DATETIME | NULL | 截止日期（按本地日零点存储，接口输出 `YYYY-MM-DD`） |
| hours | DOUBLE | default 0 | 投入工时 |
| valuesJson | TEXT | NOT NULL（无 DB 默认值，写入时显式提供） | 动态字段值 JSON，键为 FieldDef.id |
| createdAt | DATETIME | default now | 复盘统计口径基准 |
| updatedAt | DATETIME | @updatedAt | |

索引：`(categoryId)`、`(status)`、`(dueDate)`、`(createdAt)`。

`valuesJson` 方案：
- 存储形如 `{"field-xxx":"文本","field-yyy":3.5,"field-zzz":["A","B"]}` 的扁平对象，键为字段模板 ID。
- 读取时解析为 `values` 对象原样返回；模板删除不清理历史值，保证“模板变更不影响历史数据”。
- 模板 `type` 校验仅作用于新增字段与前端渲染，服务端不做强制类型转换。

### 1.6 RecordKb（记录 ↔ 知识库）

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| id | TEXT | PK |
| recordId | TEXT | FK → Record.id, ON DELETE CASCADE |
| docId | TEXT | FK → KbDoc.id, ON DELETE CASCADE |

约束：`UNIQUE(recordId, docId)`；索引 `(docId)`。

### 1.7 KbConnector（知识库连接器）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | |
| name | TEXT | NOT NULL | |
| type | VARCHAR(191) | NOT NULL | obsidian / ima |
| status | VARCHAR(191) | default "off" | on / off |
| path | VARCHAR(512) | default "" | 本地目录或文件路径 |
| meta | VARCHAR(512) | default "" | 展示文案 |
| indexedCount | INTEGER | default 0 | 已索引条目数 |
| lastIndexedAt | DATETIME | NULL | 最近索引时间 |
| createdAt / updatedAt | DATETIME | | |

### 1.8 KbDoc（知识库文档）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | |
| connectorId | TEXT | NULL, FK → KbConnector.id, ON DELETE SET NULL | |
| title | VARCHAR(191) | NOT NULL | 文件名（去 .md）或条目标题 |
| path | VARCHAR(512) | default "" | 文件绝对路径或虚拟路径 |
| content | TEXT | NOT NULL（无 DB 默认值） | 全文（用于包含匹配检索） |
| createdAt / updatedAt | DATETIME | | |

约束：`UNIQUE(connectorId, path)`；索引 `(title)`。
检索使用 Prisma `contains`（MySQL 在 `utf8mb4_unicode_ci` 下对 ASCII 不区分大小写；中文按字面匹配），片段截取命中位置前后共 160 字。

### 1.9 ChatSession / ChatMessage（对话）

ChatSession：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | |
| title | TEXT default "新会话" | 首条消息前 20 字自动命名 |
| model | TEXT | 创建时快照模型名 |
| createdAt / updatedAt | DATETIME | 排序依据 updatedAt |

ChatMessage：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | SSE `done` 事件返回 |
| sessionId | TEXT FK → ChatSession.id CASCADE | |
| role | TEXT | user / assistant |
| content | TEXT | 消息全文 |
| citationsJson | TEXT NULL | 引用数组 JSON `[{id,title,path,snippet}]` |
| createdAt | DATETIME | |

索引：`(sessionId, createdAt)`。

### 1.10 MemoryItem（记忆画像）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | |
| text | TEXT UNIQUE NOT NULL | 记忆文本；唯一约束用于“每次回复沉淀 1 条并去重” |
| source | TEXT default "chat" | 来源 |
| weight | REAL default 1 | 权重 |
| createdAt | DATETIME | |

### 1.11 Report（报表快照）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | |
| type | TEXT | day / week / month / quarter / year |
| title | TEXT | |
| rangeFrom / rangeTo | DATETIME | 区间（本地日零点），接口输出 `YYYY-MM-DD` |
| markdown | TEXT | 生成时的完整 Markdown 快照（无 DB 默认值） |
| createdAt | DATETIME | |

索引：`(createdAt)`。

### 1.12 Setting（单例设置）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| id | TEXT PK default "default" | "default" | 单例 |
| maskSensitive | BOOLEAN | true | 敏感字段脱敏 |
| maskLlm | BOOLEAN | true | 外发大模型前脱敏 |
| defaultModel | TEXT | "deepseek-chat" | 新会话默认模型 |
| createdAt / updatedAt | DATETIME | | |

### 1.13 LlmModel（模型配置）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | |
| vendor | TEXT | deepseek 等 |
| model | TEXT | 如 deepseek-chat |
| apiKeyEnc | TEXT NULL | AES-256-GCM 密文，格式 `v1:<iv_b64>:<tag_b64>:<cipher_b64>` |
| isDefault | BOOLEAN default false | 首个模型自动设为默认 |
| createdAt / updatedAt | DATETIME | |

约束：`UNIQUE(vendor, model)`。接口仅返回 `hasKey` 布尔值，绝不返回密文或明文。
加密密钥来自 `ENCRYPTION_KEY`，经 SHA-256 派生 32 字节；更换密钥将导致旧密文不可解密。

### 1.14 Consent（同意记录）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | |
| userId | TEXT FK → User.id CASCADE | |
| kind | TEXT | 如 privacy / terms |
| version | TEXT | 条款版本 |
| acceptedAt | DATETIME | |

索引：`(userId)`。

## 2. 关系概览

```
User 1─n RefreshSession
User 1─n Consent
Category 1─n FieldDef        (级联删除)
Category 1─n Record          (删除受保护：RESTRICT)
Record n─n KbDoc             (通过 RecordKb，级联删除)
KbConnector 1─n KbDoc        (删除连接器时 SetNull)
ChatSession 1─n ChatMessage  (级联删除)
```

## 3. 关键业务口径

- **分类 recordCount**：分类自身的记录数（两级结构已扁平化）。
- **事项类型筛选**：`GET /api/records?subType=商标注册` 精确匹配 `Record.subType`；类型选项按一级分类配置。
- **仪表盘汇总**：记录 `createdAt ∈ [from 00:00, to 23:59:59.999]`（服务端本地时区）。
- **逾期**：`status != 'done' && dueDate < 今天零点`。
- **状态分布**（仅未办结、互斥）：`overdue` 优先；否则 `sub` 命中 `/反馈|谈判|待/` 为 `waiting`；其余 `running`。
- **趋势**：区间 ≤31 天按日；>31 天按 ISO 周（周一起始）。`created` 按 `createdAt`，`done` 按“创建于该桶且当前 status=done”。

## 4. 迁移与演进策略

1. 开发：修改 `schema.prisma` → `pnpm db:migrate`（即 `prisma migrate dev`，按提示命名）。
2. 迁移已入库：`prisma/migrations/20261109140000_init_mysql/migration.sql`（MySQL DDL）。早期 `20261109051544_init` 为 SQLite 时代的历史占位，不含 DDL，仅维持迁移历史连续性，禁止手工删除目录（否则 Prisma 报 P3015）。
3. 部署：`pnpm db:deploy`（`prisma migrate deploy`），只应用未执行迁移，不重置数据。
4. 种子：`pnpm db:seed`（幂等 upsert，可重复执行）。
5. 回滚：先 `mysqldump` 备份；代码回滚后若迁移不可逆，用备份库恢复；`_prisma_migrations` 随备份一并回滚。详见 `backend/DEPLOY.md`。
6. 禁止在生产执行 `prisma migrate dev`、`prisma db push --force-reset` 等会重置数据的命令。

## 5. 从 SQLite 迁移到 MySQL 的注意点

- 迁移 SQL 不兼容：SQLite 的 `PRAGMA` / `AUTOINCREMENT` 语法无法在 MySQL 执行，已按 MySQL 方言重新生成初始化迁移；不要在 MySQL 上应用旧 SQLite 迁移。
- 连接串差异：`file:./dev.db` → `mysql://user:pass@host:3306/oneperson_la`，并新增 `TEST_DATABASE_URL` 供测试使用。
- 字符集：库、表、连接统一 `utf8mb4` / `utf8mb4_unicode_ci`，避免中文与 emoji 写入异常。
- 索引长度：`utf8mb4` 下每字符 4 字节，唯一索引列保持 `VARCHAR(191)`（191×4=764 字节），复合唯一索引 `UNIQUE(connectorId, path)` 约 2812 字节，低于 InnoDB 3072 字节上限。
- 默认值：MySQL 的 `TEXT` 列不支持字面量默认值，`valuesJson`、KbDoc.content、Report.markdown 等列由应用层写入，不设 DB 默认值。
- 大小写：Windows 下 MySQL 默认 `lower_case_table_names=1`（表名不敏感），Linux 下敏感；Prisma 迁移与查询均使用统一小写表名，跨平台可移植。
- 排序规则：`utf8mb4_unicode_ci` 下 ASCII 比较不区分大小写，原有 `contains` 检索逻辑行为一致。
