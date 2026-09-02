# iSpace 课件批量下载 (BNBU)

一个油猴脚本（Tampermonkey / Greasemonkey），用于在 [iSpace](https://ispace.bnbu.edu.cn) 课程页面**统一查看**课程资料，并**批量获取课件真实文件链接**进行下载。

支持自动展开课程章节内的文件夹、页面与资源类型条目，无需点击进入新页面即可获取其中所有文件。

![面板预览](intro.png)

---

## 功能特性

- 课件**统一视图**：在课程主页右下角弹出浮动面板，按章节列出全部课件资源
- **多类型支持**：在课程主页就能识别并展示 `文件 / 文件夹 / 页面 / 链接` 四种活动类型，每种用不同 badge 标识
- **就地展开容器**：对于 `文件夹` 与 `页面` 类型条目，点击行前的 `▸` 箭头，即可在主面板**就地展开内部所有真实文件**，不必跳转新页面
- **跟随任何相关页面**：在 `mod/folder/view.php`、`mod/page/view.php`、`mod/resource/view.php` 页面打开时脚本同样生效，自动列出当前页面内的文件
- **批量下载**：一键解析每个文件的真实直链（含带签名 token 的 pluginfile URL），触发浏览器逐个下载，并在面板显示进度与每个文件的状态
- **懒加载**：只在你点击 `▸` 或点批量下载时才会去解析容器页面，**不影响课程页打开速度**

---

## 安装

### 1. 安装 Tampermonkey 扩展

| 浏览器 | 步骤 |
|---|---|
| Chrome / Edge | 访问 [Tampermonkey 官网](https://www.tampermonkey.net/)，选择对应浏览器版本，跳转到扩展商店安装 |
| Firefox | 在 Firefox 附加组件商店搜索 Tampermonkey，或直接 [从官网下载](https://www.tampermonkey.net/) |
| Safari / 其他 | [官网](https://www.tampermonkey.net/) 有对应版本 |

### 2. 安装本脚本

有两种方式任选其一：

**方式 A：拖拽安装（推荐）**

打开任意一个普通网页标签页，将仓库里的 `iSpace_Downloader.user.js` 文件**直接拖入**浏览器窗口，Tampermonkey 会弹出安装确认页，点击「安装」即可。

**方式 B：手动粘贴**

1. 用编辑器打开 `iSpace_Downloader.user.js`，全选复制全部内容
2. 点击浏览器右上角的 Tampermonkey 图标 → 「添加新脚本 / Create a new script」
3. 把编辑器里默认的内容**全部删掉**，粘贴刚才复制的内容
4. `Ctrl + S` 保存

安装成功后，Tampermonkey 图标 → 「管理面板」，列表里会出现 `iSpace 课件批量查看/下载 (BNBU)`，状态为已启用。

### 3.（可选）配置下载模式

为获得最佳文件名表现，建议在 Tampermonkey 设置中将 **下载模式 / Download Mode** 从默认改为 **`浏览器 API`**：

> Tampermonkey 图标 → 设置（Config）→ 高级（Advanced）→ Download Mode → Browser API

改完后首次批量下载会弹权限请求，点允许。不改也能用——脚本会自动回退到普通 `a[download]` 方式，只是少数文件名可能不够干净。

---

## 使用方法

### 场景一：在课程主页直接查看与下载

打开任意课程主页，例如：

```
https://ispace.bnbu.edu.cn/course/view.php?id=10407
```

面板会在**右下角**自动出现。

- **左边的 `▸`**：表示这一项是文件夹或页面，**点击可在主面板就地展开内部文件**，无需跳转
- **不带 `▸` 的文件 / 链接条目**：直接勾选即可加入批量下载
- **批量下载按钮**：把所有勾选项的真实文件链接解析后，依次触发浏览器下载

### 场景二：在文件夹 / 页面 / 资源页面工作

如果你已经点击进入到了 `mod/folder/view.php?id=...`、`mod/page/view.php?id=...` 等页面，刷新一下页面，脚本会在右下角继续工作，**直接列出当前页面内的全部文件**。

| 页面 | 自动行为 |
|---|---|
| `course/view.php` | 按章节分组，列文件 / 文件夹 / 页面 / 链接 |
| `mod/folder/view.php` | 列出该文件夹内全部真实文件（含子文件夹里的） |
| `mod/page/view.php` | 列出页面正文内所有附件与内嵌图片 |
| `mod/resource/view.php` | 解析出该资源的真实文件直链，可立即下载 |

---

## 实际效果展示

下图为本脚本在 `AI-Powered Business Applications` 课程主页的运行效果：

![面板预览](intro.png)

可以注意到：

- **IMPORTANT COURSE MATERIALS / AI-Powered Learning Platforms / Recommended Reading / Group Project (30%)** 四个章节分别有 (1) / (2) / (6) / (1) 个项目
- `Important Course Materials` 是一个**文件夹**（黄色 badge），前面带 `▸`
- 大多数条目是**链接**类型（蓝色 badge）
- BCG / MIT / 2026 The Age of AI 等是**文件**类型（红色 badge）
- 只要点文件夹前的 `▸`，主面板里会**就地展开**其中的 PDF 文件，可直接勾选批量下载

---

## 常见问题

### Q1：课件面板没有出现？

请先检查：

1. 浏览器控制台（F12 → Console）是否有红色错误？
2. 是否已登录 iSpace？脚本依赖登录后的 Cookie 请求详情页
3. 是否只在课程主页打开？脚本不会在 iSpace 首页、个人页等其它位置出现

如果还是不行，把控制台里带 `[iSpace-DL]` 前缀的日志原文发出来方便排查。

### Q2：点了批量下载，但浏览器没有反应？

浏览器通常会弹出**"此站点试图下载多个文件"** 的拦截条，**必须点允许**。该提示只出现在第一次，之后会记住选择。

### Q3：为什么有些容器展开后显示「未发现文件」？

- **Page 类型**：页面内容是纯 HTML 文本，没有附件，属于正常情况，请直接点开页面人工查看
- **Folder 类型**：通常是该文件夹还没有任何文件，或使用了非标准 Moodle 模板。如果你确认有文件但显示为空，请把控制台日志发出来

### Q4：能否直接打包成 ZIP 下载？

当前版本逐个触发下载，是为了与浏览器对多文件下载的限制相兼容（避免被安全策略拦截）。如果你需要 ZIP 打包功能，可在脚本基础上扩展 `JSZip` + `a.download` 异步批量保存。

### Q5：会触发 iSpace 风控吗？

不会。脚本只使用常规的 `fetch` 请求（与浏览器自身加载页面相同），并使用你的**登录态 Cookie**，不会绕过任何限制。所有操作在你的浏览器内完成，不经过任何第三方服务器。

---

## 适用平台

- iSpace (BNBU Moodle)：`https://ispace.bnbu.edu.cn`
- 兼容 Moodle 4.x 与 3.x（标准主题 classic / boost）
- 已测试 Chrome / Edge / Firefox 最新版

---

## 工作原理（简述）

```
进入页面（course / folder / page / resource）
        │
        ▼
扫描 DOM，匹配 li.activity 节点
        │
        ▼
按章节分组，构建面板 UI
        │
        ▼
用户操作：
├─ 勾选 → 直接加入下载队列（已知直链）
└─ 展开 ▸ → fetch 该页面 → 提取所有 pluginfile.php 链接
                              （含 folder 子树 / page 内嵌附件 / resource 下载链接）
        │
        ▼
依次 GM_download / <a download> 触发下载，间隔 350ms 节流
```

---

## 更新脚本

修改本地 `.user.js` 文件后，必须**重新导入一次**才能覆盖 Tampermonkey 里的旧版本（脚本不会自动同步）：

1. 把更新后的 `iSpace_Downloader.user.js` 文件再次拖到浏览器
2. 在弹出的确认页点「安装」（若提示「是否替换」，确认替换）
3. 回到课程页 `Ctrl + F5` 强制刷新

---

## License

MIT
