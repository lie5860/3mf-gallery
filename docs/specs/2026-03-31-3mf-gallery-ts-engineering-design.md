# 3MF Gallery TypeScript 工程化重构设计规格 (SSG)

## 1. 目标与背景
本项目原通过纯 Python 脚本 (`build_gallery.py`) 解析大量 3MF 文件，并拼装出单文件 HTML 配合内联 Base64 JSON 供离线展示。随着模型增多（当前示例为 1200+，后续会新增），全量 `manifest.json` 体积极速膨胀，严重拖慢首页加载性能。
本重构目标是引入 TypeScript 进行现代前端工程化，针对用户的 Nginx 部署环境全面拥抱 SSG（静态站点生成），从而兼顾页面的丝滑性能、极致的工程维护性以及二次开发体验。

## 2. 技术栈架构选型
- **构建流与前端框架**：Next.js (App Router 模式) + React (TypeScript)
- **ZIP/3MF 解压解析引擎**：`adm-zip` (服务端原生的 Node.js 库，无需基于 C++ 的二进制编译)
- **UI 布局与样式**：原生 CSS (Vanilla CSS / CSS Modules) 并高度保留原工程的深色/浅色双主题无缝切换设计
- **文件路径扫描与环境管理**：利用 `.env` 或 `next.config.js` 常量定位庞大的 3MF 模型资源源目录

## 3. 核心机制与数据生命周期
### 3.1 工作流梳理 (npm run build)
1. **初始化提取 (Parse)**：Next.js 构建环境自动调用专属的提取器 (parser) 脚本遍历 `*.3mf` 模型。
2. **数据降维拆分 (Data Split) [核心性能提升端]**：
   - 提取基础属性 `[id, title, file_name, rel_path, thumb]` 组合成极度轻量的一维数组，作为静态 Props 注入到主页面，供 Client Component 完成瞬间检索。
   - 所有详尽多图、XML 长文 Description、完整 Metadata 键值对将独立绑定生成传给各自唯一的 `detail/[id]/page.tsx`。
3. **输出纯正静态产物 (Generate Static Export)**：开启 Next.js 的 `output: 'export'`，生成后释放掉包含 Node.js 环境及多余代码的依赖，通过一个绝对干净的 `out/` 文件夹完美适配 Nginx 静态托管。

### 3.2 目录骨架约定
```text
├── public/
│   └── assets/             # [提取产物] 构建时自动解析 3MF 的 thumb.png 及 previews 图片落盘目录
├── src/
│   ├── app/
│   │   ├── page.tsx        # 【Server】画廊主页，提供轻薄索引给下方组件
│   │   ├── layout.tsx      # 全站通用 Head、Header 容器机制
│   │   └── detail/[id]/page.tsx # 【预渲染核心】通过 `generateStaticParams` 批量打散烘焙
│   ├── components/         # 可复用 React 组件区
│   │   ├── SearchList.tsx  # 【Client】负责处理大量模型搜索与渲染的卡片画廊网格
│   │   └── ThemeToggle.tsx # 夜间模式存储管理插件
│   └── lib/
│       └── parser.ts       # [核心解析引擎] 专门负责 I/O 读写与 `adm-zip` 提炼
```

## 4. 边界处理与增量提速设计
- **增量化与复用加速**：由于图片写入 I/O 极慢，`lib/parser.ts` 处理时须核对 `public/assets/` 下是否已有同 ID 且完整的图片清单，如果存在且无需提取预览，则直接跳过该 ZIP 的内部遍历。这对含有上千模型的高频构建是提效生命线。
- **安全与长文本转义**：Bambu Studio 产出的 HTML Description 偶尔含有残缺标签与特殊转义，在 Server Component 里使用 `dangerouslySetInnerHTML` 渲染前，进行必要的解码与安全兜底。

## 5. 前后版本兼容性声明
重构部署后，强制依赖 Web 协议 (Nginx) 伺服静态文件。抛弃以往的双击 HTML（`file://`）浏览模式。
