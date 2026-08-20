# 🎨 我的收藏展览

记录生活中的美好瞬间 — 收藏管理小站 + 💬 收藏论坛。

## 功能

### 收藏展（index.html）
- 添加 / 编辑 / 删除收藏（名称、描述、照片、分类）
- **📷 上传照片**：点击或拖拽选择本地图片，自动压缩后保存在浏览器
- 分类筛选（艺术品 / 书籍 / 旅行 / 音乐 / 其他）
- 关键词搜索（名称、描述）
- 数据保存在浏览器 localStorage

### 收藏论坛（forum.html）
- 发帖 / 回复，分类筛选（闲聊 / 晒收藏 / 求鉴定 / 交流 / 其他）
- 昵称自动记忆（localStorage）
- 数据存储于 **Supabase**（PostgreSQL + RLS），全站可公开读写

## 技术栈

- 前端：纯 HTML + CSS + JavaScript（零构建步骤，GitHub Pages 直接可用）
- 后端：Supabase（PostgreSQL 表 + Row Level Security + PostgREST）
- 容器部署：Zeabur（Dockerfile 一键部署）

## 在线预览

https://Ilovewhlpromax.github.io/my-collections/

---

## 🚀 接入 Supabase

### 1. 创建 Supabase 项目

1. 打开 https://supabase.com → **New project**（免费额度即可）
2. 创建完成后进入 **SQL Editor** → **New query**
3. 粘贴 [supabase/schema.sql](supabase/schema.sql) 全部内容并 **Run**
   （会创建 `forum_topics` / `forum_replies` 两张表、索引与公开读写 RLS 策略）

### 2. 获取密钥

进入 **Project Settings → API**，复制：
- **Project URL**（形如 `https://xxxx.supabase.co`）
- **anon public key**（公开密钥，可安全放在前端）

### 3. 写入前端配置

编辑 [config.js](config.js)：

```js
window.SUPABASE_CONFIG = {
    url: 'https://你的项目.supabase.co',
    anonKey: '你的 anon public key'
};
```

> ⚠️ 切勿把 **service_role key** 写进前端代码 —— 它拥有全部权限。

### 4. 验证

部署后打开 `forum.html`，发一条帖子试试。若提示"尚未配置 Supabase"，说明 config.js 未生效（注意 GitHub Pages 缓存，可强制刷新）。

---

## 📦 用 Zeabur 部署（容器）

1. 在 [Zeabur](https://zeabur.com) 中 **New Project → 关联你的 GitHub 仓库**（`Ilovewhlpromax/my-collections`）
2. 选择仓库后，Zeabur 自动识别仓库根目录的 **Dockerfile** 并构建容器
3. 在服务 **Variables** 中添加环境变量（推荐，无需改 config.js）：

   | 变量 | 值 |
   |---|---|
   | `PORT` | `8080`（Zeabur 会自动注入，可不填） |
   | `SUPABASE_URL` | `https://你的项目.supabase.co` |
   | `SUPABASE_ANON_KEY` | `你的 anon public key` |

4. **Deploy** 后 Zeabur 会分配域名；如需自定义域名，在服务设置中绑定

> 服务器启动时会根据环境变量动态生成 `/config.js`（见 [server.js](server.js)），
> 容器内无需手动改配置文件。

### 本地预览

```bash
# 方式一：任意静态服务器
npx serve .

# 方式二：自带 Node 服务器（与 Zeabur 容器一致）
node server.js
# 打开 http://127.0.0.1:8080
```

---

## 目录结构

```
├── index.html        # 收藏展主页
├── forum.html        # 论坛页
├── forum.js          # 论坛逻辑（Supabase 客户端）
├── forum.css         # 论坛样式
├── style.css         # 主站样式
├── config.js         # Supabase 前端配置
├── server.js         # 静态文件服务器（容器入口，含配置注入）
├── Dockerfile        # Zeabur 容器构建
├── supabase/
│   └── schema.sql    # 数据库表 + RLS 策略（在 Supabase SQL Editor 执行）
└── README.md
```

## 安全说明

- 论坛 RLS 策略为公开读写（`select` / `insert` for anon），适合公开社区；
  若需删除/编辑权限，请在 Supabase Dashboard 中为对应表补充策略。
- 前端已做 HTML 转义，防止 XSS；请勿在前端使用 service_role 密钥。
