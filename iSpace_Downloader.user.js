// ==UserScript==
// @name         iSpace 课件批量查看/下载 (BNBU)
// @namespace    https://ispace.bnbu.edu.cn/
// @version      2.5.0
// @description  在 iSpace (BNBU Moodle) 课程页 / 文件夹(page-folder) / 页面(page) / 资源(resource) 页面统一查看并批量下载课件。支持在课程主页内联展开文件夹与页面，无需跳转；下载不经油猴通道，文件名与扩展名完整保留。
// @author       Peter Jiang
// @match        https://ispace.bnbu.edu.cn/course/view.php*
// @match        https://ispace.bnbu.edu.cn/mod/folder/view.php*
// @match        https://ispace.bnbu.edu.cn/mod/page/view.php*
// @match        https://ispace.bnbu.edu.cn/mod/resource/view.php*
// @match        https://ispace.bnbu.edu.cn/mod/assign/view.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const LOG = '[iSpace-DL]';

    // ---------- 样式 ----------
    const STYLE = `
        #ispace-dl-panel {
            position: fixed; right: 20px; bottom: 20px;
            width: 380px; max-height: 72vh;
            background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
            font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 13px; color: #24292f; z-index: 99999;
            display: flex; flex-direction: column;
        }
        #ispace-dl-panel header {
            padding: 10px 12px; border-bottom: 1px solid #eaeef2;
            display: flex; align-items: center; justify-content: space-between;
            background: #f6f8fa; border-radius: 8px 8px 0 0;
        }
        #ispace-dl-panel header h3 { margin: 0; font-size: 14px; }
        #ispace-dl-panel header .actions { display: flex; gap: 6px; }
        #ispace-dl-panel button {
            cursor: pointer; border: 1px solid #d0d7de; background: #f6f8fa;
            border-radius: 4px; padding: 3px 8px; font-size: 12px; color: #24292f;
        }
        #ispace-dl-panel button:hover { background: #eaeef2; }
        #ispace-dl-panel button.primary { background: #2da44e; color: #fff; border-color: #2c974b; }
        #ispace-dl-panel button.primary:hover { background: #2c974b; }
        #ispace-dl-panel button:disabled { opacity: .5; cursor: not-allowed; }
        #ispace-dl-panel .body { overflow-y: auto; padding: 8px 12px; }
        #ispace-dl-panel .pagetype {
            font-size: 11px; color: #6e7781; margin-bottom: 6px;
            background: #f6f8fa; border-radius: 4px; padding: 4px 6px;
        }
        #ispace-dl-panel .section { margin-bottom: 10px; }
        #ispace-dl-panel .section-title {
            font-weight: 600; color: #57606a; margin: 6px 0 4px; font-size: 12px;
            border-bottom: 1px solid #eaeef2; padding-bottom: 4px;
            display: flex; justify-content: space-between;
        }
        #ispace-dl-panel .item {
            display: flex; align-items: center; gap: 6px; padding: 3px 0;
        }
        #ispace-dl-panel .item.child { padding-left: 26px; }
        #ispace-dl-panel .item label {
            flex: 1; display: flex; align-items: center; gap: 6px;
            cursor: pointer; word-break: break-all;
        }
        #ispace-dl-panel .item input[type=checkbox] { flex-shrink: 0; }
        #ispace-dl-panel .twisty {
            border: none; background: none; padding: 0 2px; width: 16px;
            font-size: 10px; line-height: 1; color: #57606a; flex-shrink: 0;
        }
        #ispace-dl-panel .twisty:hover { background: none; color: #0969da; }
        #ispace-dl-panel .badge {
            font-size: 10px; padding: 1px 5px; border-radius: 8px;
            background: #ddf4ff; color: #0969da; flex-shrink: 0;
        }
        #ispace-dl-panel .badge.folder { background: #fff8c5; color: #9a6700; }
        #ispace-dl-panel .badge.page { background: #dafbe1; color: #1a7f37; }
        #ispace-dl-panel .badge.resource { background: #ffdcd7; color: #cf222e; }
        #ispace-dl-panel .badge.assign { background: #ffe2cc; color: #b35900; }
        #ispace-dl-panel .item a { color: #0969da; text-decoration: none; }
        #ispace-dl-panel .item a:hover { text-decoration: underline; }
        #ispace-dl-panel .status { font-size: 11px; color: #6e7781; min-width: 52px; text-align: right; }
        #ispace-dl-panel .status.done { color: #2da44e; }
        #ispace-dl-panel .status.fail { color: #cf222e; }
        #ispace-dl-panel footer {
            padding: 8px 12px; border-top: 1px solid #eaeef2;
            display: flex; justify-content: space-between; align-items: center; gap: 8px;
            background: #f6f8fa; border-radius: 0 0 8px 8px;
        }
        #ispace-dl-panel footer .progress {
            flex: 1; height: 6px; background: #eaeef2; border-radius: 3px; overflow: hidden;
        }
        #ispace-dl-panel footer .progress > div {
            height: 100%; background: #2da44e; width: 0%; transition: width .2s ease;
        }
        #ispace-dl-panel .hint { font-size: 11px; color: #6e7781; padding: 0 12px 8px; }
        #ispace-dl-panel .hint .opt { display: flex; align-items: center; gap: 4px; cursor: pointer; margin-bottom: 2px; color: #57606a; }
        #ispace-dl-panel .hint .opt input[type=checkbox] { cursor: pointer; }
        #ispace-dl-panel.collapsed .body,
        #ispace-dl-panel.collapsed .hint,
        #ispace-dl-panel.collapsed footer { display: none; }
    `;

    // ---------- 工具 ----------
    function getPageType() {
        const p = location.pathname;
        if (/\/course\/view\.php/.test(p)) return 'course';
        if (/\/mod\/folder\/view\.php/.test(p)) return 'folder';
        if (/\/mod\/page\/view\.php/.test(p)) return 'page';
        if (/\/mod\/resource\/view\.php/.test(p)) return 'resource';
        if (/\/mod\/assign\/view\.php/.test(p)) return 'assign';
        return 'other';
    }

    function absUrl(href, base) {
        try { return new URL(href, base).href; } catch (e) { return null; }
    }

    /**
     * 清洗文件名。
     * 注意：这里刻意不兜底成 'file' —— 空值必须原样返回，上层才能回退到 URL 推导
     * （旧版本正是因为这里恒返回真值，导致 nameFromUrl 兜底成了死代码）。
     */
    function sanitize(name) {
        return (name || '')
            .split('').filter(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('')  // 控制字符
            .replace(/[\\/:*?"<>|]/g, '_')                                     // 文件系统非法字符
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/, '')                                             // 结尾的点/空格（Windows 会静默吃掉）
            .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i, '_$1$2');  // Windows 保留名
    }

    /** 从直链推导权威文件名：Moodle 的 pluginfile URL 末段就是真实文件名，含真实扩展名 */
    function nameFromUrl(url) {
        try {
            const seg = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
            return sanitize(seg);
        } catch (e) { return ''; }
    }

    /** 取小写扩展名，没有则返回空串 */
    function extOf(name) {
        const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || '');
        return m ? m[1].toLowerCase() : '';
    }

    /**
     * 综合最终文件名：URL 推导结果为权威（一定带真实扩展名），DOM 文本仅用于可读性。
     * - DOM 文本为空      -> 直接用 URL 名（旧版本这里会得到 "file"）
     * - DOM 文本缺扩展名  -> 用 URL 的扩展名补齐
     * - 两者扩展名一致    -> 用更好看的 DOM 名
     * - 两者扩展名冲突    -> 以 URL 名为准
     */
    function resolveName(rawName, url) {
        const urlName = nameFromUrl(url);
        const domName = sanitize(rawName);
        if (!domName) return urlName || 'file';
        if (!urlName) return domName;
        if (!extOf(domName)) return domName + (extOf(urlName) ? '.' + extOf(urlName) : '');
        if (extOf(domName) === extOf(urlName)) return domName;
        return urlName;
    }

    /** 重名去重：同名文件自动追加 " (2)"、" (3)"，避免被浏览器静默覆盖 */
    function makeDeduplicator() {
        const used = new Set();
        return function dedupe(name) {
            if (!used.has(name)) { used.add(name); return name; }
            const m = /^(.*?)\.([A-Za-z0-9]{1,8})$/.exec(name);
            const base = m ? m[1] : name;
            const ext = m ? '.' + m[2] : '';
            let i = 2;
            while (used.has(`${base} (${i})${ext}`)) i++;
            const final = `${base} (${i})${ext}`;
            used.add(final);
            return final;
        };
    }

    /** HTML 转义：课件名来自服务端，拼接进 innerHTML 前必须转义 */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /** 真实文件直链：Moodle 的文件入口不止 pluginfile.php 一种 */
    const FILE_URL_RE = /\/(?:webservice\/|token)?pluginfile\.php\/|\/draftfile\.php\//;
    /** 用于快速预筛 DOM 里的候选地址（比 FILE_URL_RE 宽松，真正判定交给 FILE_URL_RE） */
    const FILE_HINT_RE = /pluginfile\.php|draftfile\.php/;

    /** 常见 MIME -> 扩展名，只在 URL 里推导不出文件名时兜底用 */
    const MIME_EXT = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/zip': 'zip',
        'application/octet-stream': 'bin',
        'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
        'text/plain': 'txt', 'video/mp4': 'mp4'
    };

    function contentTypeOf(res) {
        return ((res.headers && res.headers.get('content-type')) || '')
            .split(';')[0].trim().toLowerCase();
    }

    /** 响应体本身就是文件，而不是网页？ */
    function isFileResponse(res, finalUrl) {
        if (FILE_URL_RE.test(finalUrl)) return true;
        const ct = contentTypeOf(res);
        // 明确声明了非 HTML（application/pdf、image/png…）→ 响应体就是文件本身
        return !!ct && !ct.includes('text/html') && !ct.includes('application/xhtml');
    }

    /**
     * 直链场景下的文件名。
     * 优先用 URL 末段；若末段是 view.php / pluginfile.php 之类无意义的脚本名
     * （服务端直接在原 URL 上吐文件时会出现），就退回活动名 + 按 MIME 推断的扩展名。
     */
    function directFileName(fileUrl, hintName, contentType) {
        const fromUrl = nameFromUrl(fileUrl);
        if (fromUrl && extOf(fromUrl) && !/^(view|pluginfile|draftfile)\.php$/i.test(fromUrl)) {
            return fromUrl;
        }
        let name = sanitize(hintName) || fromUrl || 'file';
        if (!extOf(name)) {
            const ext = (contentType && MIME_EXT[contentType]) || extOf(fromUrl);
            if (ext) name += '.' + ext;
        }
        return name;
    }

    /**
     * 抓取容器页面。
     *
     * 关键修正：Moodle 的 resource 若设置为「强制下载 / 下载」展示方式，
     * view.php 会直接 302 跳到 pluginfile 直链，此时响应体是**文件本身**而不是 HTML。
     * 旧版把它交给 DOMParser 解析 → 得到空文档 → 0 个文件，
     * 于是表现为「面板上有名字，但解析不出任何文件」。
     * 现在改为：识别出这种情况后直接返回最终直链（res.url）。
     */
    async function fetchDoc(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const finalUrl = res.url || url;

        const ct = contentTypeOf(res);

        if (isFileResponse(res, finalUrl)) {
            // 已经确定是文件，不必再读响应体，直接丢弃以免白白占用内存
            if (res.body && typeof res.body.cancel === 'function') {
                try { res.body.cancel(); } catch (e) { /* 忽略 */ }
            }
            return { doc: null, base: url, fileUrl: finalUrl, contentType: ct };
        }

        const html = await res.text();
        if (/login\/index\.php|You are not logged in/i.test(html)) {
            throw new Error('登录态失效，请刷新页面后重试');
        }
        return { doc: new DOMParser().parseFromString(html, 'text/html'), base: url, finalUrl };
    }

    /**
     * 从文档中提取所有真实文件链接。
     * 覆盖 folder 文件列表、page 内嵌附件/图片、resource 的下载链接。
     */
    function extractFiles(doc, base) {
        const out = [];
        const seen = new Set();
        const push = (rawHref, rawName) => {
            const url = absUrl(rawHref, base);
            if (!url || !FILE_URL_RE.test(url)) return;
            if (seen.has(url)) return;
            seen.add(url);
            out.push({ name: resolveName(rawName, url), url });
        };

        // 1) 超链接（folder 文件树、page 附件、resource 下载链接）
        doc.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (!href || !FILE_HINT_RE.test(href)) return;
            const fn = a.querySelector('.fp-filename');
            push(href, fn ? fn.textContent.trim() : a.textContent.trim());
        });

        // 2) 内嵌对象（resource 用 object/embed/iframe 预览的情况）
        ['object[data]', 'embed[src]', 'iframe[src]'].forEach(sel => {
            doc.querySelectorAll(sel).forEach(el => {
                push(el.getAttribute('data') || el.getAttribute('src'), null);
            });
        });

        // 3) 内嵌图片（page 正文里 @@PLUGINFILE@@ 引用的图片）
        doc.querySelectorAll('img[src]').forEach(img => {
            const src = img.getAttribute('src');
            if (src && FILE_HINT_RE.test(src)) {
                // 用 URL 里的原始文件名；alt 只是描述文字（且常为空），不适合当文件名
                push(src, null);
            }
        });

        return out;
    }

    /**
     * 解析一个容器（folder / page / resource），返回真实文件列表。
     *
     * 三条路径：
     * 1. view.php 直接 302 到文件（resource 的强制下载展示方式）→ 用最终直链
     * 2. 正常 HTML 页面 → 用 extractFiles 从 DOM 里提取
     * 3. 页面上没有文件，但活动本身"点一下就能下载"（部分主题用 JS 渲染、
     *    或用 Google Docs Viewer 之类外嵌预览）→ 补一次 &redirect=1，
     *    Moodle 的 mod/resource/view.php 支持该参数直接跳到真实文件
     */
    async function resolveContainerFiles(url, hintName) {
        const { doc, base, fileUrl, contentType } = await fetchDoc(url);
        if (fileUrl) {
            return [{ name: directFileName(fileUrl, hintName, contentType), url: fileUrl }];
        }

        const files = extractFiles(doc, base);
        if (files.length) return files;

        if (/\/mod\/resource\/view\.php/.test(url)) {
            const sep = url.includes('?') ? '&' : '?';
            try {
                const res = await fetch(url + sep + 'redirect=1', { credentials: 'include' });
                if (res.ok && FILE_URL_RE.test(res.url)) {
                    if (res.body && typeof res.body.cancel === 'function') {
                        try { res.body.cancel(); } catch (e) { /* 忽略 */ }
                    }
                    return [{
                        name: directFileName(res.url, hintName, contentTypeOf(res)),
                        url: res.url
                    }];
                }
            } catch (e) {
                console.warn(LOG, 'redirect=1 兜底失败', url, e);
            }
        }
        return files;
    }

    // ---------- 各类页面的收集逻辑 ----------
    function pageTitle(fallback) {
        const h1 = document.querySelector('#page-header h1, #region-main h2');
        return (h1 ? h1.textContent.trim() : fallback);
    }

    /** 取课程名：课程主页用 <h1>；其它页面从面包屑里找指向 /course/view.php 的链接；再兜底用 <title> */
    function getCourseName(type) {
        let name = (type === 'course') ? pageTitle('') : '';
        if (!name) {
            const a = document.querySelector('a[href*="/course/view.php?id="]');
            if (a) name = a.textContent.trim();
        }
        if (!name) {
            const parts = (document.title || '').split(/[|–—:·]/).map(s => s.trim()).filter(Boolean);
            name = parts[parts.length - 1] || '';
        }
        return sanitize(name) || '未命名课程';
    }

    /** 文件夹名清洗：复用文件名清洗，再兜底空值 */
    function safeFolderName(name, fallback) {
        return sanitize(name) || fallback;
    }

    /** 课程主页：按 section 分组，收集 resource / folder / page / url 活动 */
    function collectCourse() {
        const regionMain = document.getElementById('region-main');
        if (!regionMain) return [];
        const groups = [];

        regionMain.querySelectorAll('li.section.course-section').forEach(sec => {
            const items = [];
            sec.querySelectorAll('li.activity').forEach(li => {
                // 兼容标准列表 (div.activityname) 与卡片格式 (div.activity-name)
                const a = li.querySelector('div.activityname > a, div.activity-name > a');
                if (!a) return;
                const href = a.getAttribute('href');
                if (!href) return;

                let kind;
                if (/\/mod\/resource\//.test(href)) kind = 'resource';
                else if (/\/mod\/folder\//.test(href)) kind = 'folder';
                else if (/\/mod\/page\//.test(href)) kind = 'page';
                else if (/\/mod\/url\//.test(href)) kind = 'url';
                else if (/\/mod\/assign\//.test(href)) kind = 'assign';
                else return; // 忽略论坛 / 测验等

                // 名称：优先 .instancename；没有时用链接文本并剥掉 .accesshide 与模块类型后缀
                const inst = a.querySelector('.instancename');
                let nameText;
                if (inst) {
                    nameText = inst.cloneNode(true).textContent;
                } else {
                    const clone = a.cloneNode(true);
                    clone.querySelectorAll('.accesshide').forEach(s => s.remove());
                    nameText = clone.textContent;
                }
                const name = sanitize(
                    nameText.replace(/\s*(File|Folder|Page|URL|Assignment|作业|Quiz|Forum|测验|讨论)\s*$/i, '').trim()
                ) || '未命名活动';
                const url = absUrl(href, location.href);
                if (url) items.push({ name, url, kind });
            });

            if (items.length) {
                const t = sec.querySelector('.sectionname');
                groups.push({
                    title: t ? t.textContent.trim() : ('Section ' + (sec.dataset.number || '')),
                    items
                });
            }
        });
        return groups;
    }

    /** 文件夹页面 / 页面 / 资源页面：直接列出当前页面内的真实文件 */
    function collectCurrentPage(type) {
        const files = extractFiles(document, location.href);
        if (!files.length) return [];
        const title = {
            folder: '文件夹内容',
            page: '页面内文件',
            resource: '资源文件',
            assign: '作业附件'
        }[type] || '文件';
        return [{
            title: pageTitle(title),
            items: files.map(f => ({ name: f.name, url: f.url, kind: 'file' }))
        }];
    }

    // ---------- UI ----------
    const BADGE = { folder: '文件夹', page: '页面', resource: '文件', assign: '作业', url: '链接' };
    // 需要点进去才能拿到真实文件的类型
    const CONTAINER = { folder: 1, page: 1, resource: 1, assign: 1 };

    /** 根据当前 dirHandle 刷新「保存目录」按钮的文案与状态 */
    function updateDirButton(panel) {
        const btn = panel.querySelector('button[data-act="dir"]');
        if (!btn) return;
        if (!hasFSA()) {
            btn.textContent = '目录不可用';
            btn.disabled = true;
            btn.title = '当前浏览器不支持自定义保存目录（仅 Chrome / Edge）';
            return;
        }
        btn.disabled = false;
        btn.textContent = dirHandle ? dirHandle.name : '保存目录';
        btn.title = dirHandle
            ? ('保存到：' + dirHandle.name + '（点击更换或清除）')
            : '选择一个本地文件夹，文件将直接写入该目录（仅 Chrome / Edge）';
    }

    /** 处理「保存目录」按钮：未设置则选择，已设置则更换或清除 */
    async function handleDirButton(panel) {
        if (!hasFSA()) {
            alert('当前浏览器不支持自定义保存目录（仅 Chrome / Edge 支持）');
            return;
        }
        if (dirHandle) {
            const ok = confirm('当前保存目录：' + dirHandle.name + '\n\n点「确定」更换目录，点「取消」清除目录。');
            if (ok) {
                try { await pickDirectory(); }
                catch (e) { if (!e || e.name !== 'AbortError') throw e; }
            } else {
                await idbDel('dirHandle');
                dirHandle = null;
            }
        } else {
            try { await pickDirectory(); }
            catch (e) { if (!e || e.name !== 'AbortError') throw e; }
        }
        updateDirButton(panel);
    }

    function buildPanel(groups, type) {
        const panel = document.createElement('div');
        panel.id = 'ispace-dl-panel';
        panel.dataset.type = type;

        const total = groups.reduce((s, g) => s + g.items.length, 0);
        const isCourse = type === 'course';
        const typeLabel = { course: '课程主页', folder: '文件夹页面', page: '页面', resource: '资源页面', assign: '作业页面' }[type] || '';

        panel.innerHTML = `
            <header>
                <h3>iSpace 课件 (<span id="ispace-count">${total}</span>)</h3>
                <div class="actions">
                    <button data-act="all">全选</button>
                    <button data-act="none">取消</button>
                    <button data-act="dir" id="ispace-dir-btn">保存目录</button>
                    <button data-act="expand">收起</button>
                </div>
            </header>
            <div class="pagetype">当前：${typeLabel}${isCourse ? ' · 点 ▸ 可展开文件夹/页面内容' : ''}</div>
            <div class="body"></div>
            <div class="hint">
                <label class="opt" title="需要先设置「保存目录」；勾选后文件写入 目录/课程名/章节名/文件">
                    <input type="checkbox" id="ispace-subdirs"> 按「课程 / 章节」建子文件夹
                </label>
                <div>超过 ${SIZE_LIMIT_MB}MB 或未设置目录的文件走浏览器下载。</div>
            </div>
            <footer>
                <div class="progress"><div></div></div>
                <button class="primary" data-act="download">批量下载</button>
            </footer>
        `;

        const body = panel.querySelector('.body');

        const subdirsCb = panel.querySelector('#ispace-subdirs');
        if (subdirsCb) {
            subdirsCb.checked = getSubdirPref();
            subdirsCb.addEventListener('change', () => {
                try { localStorage.setItem(SUBDIR_KEY, subdirsCb.checked ? '1' : '0'); } catch (e) { /* 忽略 */ }
            });
        }

        groups.forEach(g => {
            const sec = document.createElement('div');
            sec.className = 'section';
            sec.dataset.title = g.title;
            sec.innerHTML = `<div class="section-title"><span>${esc(g.title)}</span><span>(${g.items.length})</span></div>`;

            g.items.forEach(it => {
                const row = document.createElement('div');
                row.className = 'item';
                row.dataset.kind = it.kind;
                row.dataset.name = it.name;
                row.dataset.url = it.url;
                if (CONTAINER[it.kind]) row.dataset.container = '1';

                const twisty = CONTAINER[it.kind]
                    ? `<button class="twisty" title="展开内容">&#9656;</button>`
                    : `<span class="twisty" style="visibility:hidden"></span>`;
                const badge = BADGE[it.kind]
                    ? `<span class="badge ${it.kind}">${BADGE[it.kind]}</span>` : '';

                row.innerHTML = `
                    ${twisty}
                    <label>
                        <input type="checkbox" checked>
                        ${badge}
                        <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>
                    </label>
                    <span class="status"></span>
                `;
                sec.appendChild(row);

                if (CONTAINER[it.kind]) {
                    const holder = document.createElement('div');
                    holder.className = 'children';
                    holder.style.display = 'none';
                    sec.appendChild(holder);
                    row._holder = holder;
                }
            });

            body.appendChild(sec);
        });

        // 勾选容器时同步其子项
        panel.addEventListener('change', ev => {
            const cb = ev.target;
            if (!cb.matches('input[type=checkbox]')) return;
            const row = cb.closest('.item');
            if (row && row._holder) {
                row._holder.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = cb.checked);
            }
        });

        panel.addEventListener('click', async ev => {
            const twisty = ev.target.closest('.twisty');
            if (twisty) { await toggleExpand(twisty.closest('.item')); return; }

            const btn = ev.target.closest('button[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'all' || act === 'none') {
                const v = act === 'all';
                panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
                    cb.checked = v;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                });
            } else if (act === 'expand') {
                panel.classList.toggle('collapsed');
                btn.textContent = panel.classList.contains('collapsed') ? '展开' : '收起';
            } else if (act === 'dir') {
                try { await handleDirButton(panel); }
                catch (e) {
                    if (!e || e.name !== 'AbortError') {
                        console.error(LOG, '设置保存目录失败', e);
                        alert('设置保存目录失败：' + (e.message || e));
                    }
                }
            } else if (act === 'download') {
                await startDownload(panel);
            }
        });

        document.body.appendChild(panel);
        updateDirButton(panel);
        return panel;
    }

    /** 展开容器，异步拉取内部真实文件列表 */
    async function toggleExpand(row) {
        if (!row || !row._holder) return;
        const holder = row._holder;
        const btn = row.querySelector('.twisty');
        const status = row.querySelector('.status');

        if (holder.style.display !== 'none') {
            holder.style.display = 'none';
            btn.innerHTML = '&#9656;';
            return;
        }

        if (row.dataset.loaded !== '1') {
            btn.innerHTML = '&#9662;';
            status.textContent = '解析中…';
            status.className = 'status';
            try {
                const files = await resolveContainerFiles(row.dataset.url, row.dataset.name);
                if (!files.length) {
                    holder.innerHTML = `<div class="item child" style="color:#6e7781">（未发现文件）</div>`;
                    status.textContent = '空';
                    status.className = 'status';
                } else {
                    const parentChecked = row.querySelector('input[type=checkbox]').checked;
                    files.forEach(f => {
                        const child = document.createElement('div');
                        child.className = 'item child';
                        child.dataset.kind = 'file';
                        child.dataset.name = f.name;
                        child.dataset.url = f.url;
                        child.innerHTML = `
                            <span class="twisty" style="visibility:hidden"></span>
                            <label>
                                <input type="checkbox" ${parentChecked ? 'checked' : ''}>
                                <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>
                            </label>
                            <span class="status"></span>
                        `;
                        holder.appendChild(child);
                    });
                    status.textContent = files.length + ' 个文件';
                    status.className = 'status done';
                }
                row.dataset.loaded = '1';
            } catch (e) {
                console.error(LOG, '展开失败', e);
                status.textContent = '解析失败';
                status.className = 'status fail';
                holder.innerHTML = `<div class="item child" style="color:#cf222e">${esc(e.message || '解析失败')}，请直接点击打开页面</div>`;
            }
        }

        holder.style.display = '';
        btn.innerHTML = '&#9662;';
    }

    // ---------- 下载 ----------
    // 关键：不使用 GM_download。GM_download 走的是油猴自己的下载通道，
    // 会受 Download Mode / 扩展名白名单影响，某些配置下每个文件都要弹一次油猴确认页。
    // 全程只在页面内完成：默认取回内容再保存，超过阈值的交给浏览器自己下。
    const SIZE_LIMIT = 150 * 1024 * 1024;          // 大文件阈值
    const SIZE_LIMIT_MB = SIZE_LIMIT / 1024 / 1024;

    // ---------- 自定义保存目录（File System Access API，仅 Chromium 内核） ----------
    const IDB_NAME = 'iSpaceDL';
    const IDB_STORE = 'kv';
    const SUBDIR_KEY = 'iSpaceDL_subdirs';

    let dirHandle = null;   // 用户选中的目录句柄；null = 未设置/不可用

    /** 是否按「课程 / 章节」自动建子文件夹（默认开启） */
    function getSubdirPref() {
        try { return localStorage.getItem(SUBDIR_KEY) !== '0'; } catch (e) { return true; }
    }

    function hasFSA() {
        return typeof window.showDirectoryPicker === 'function';
    }

    function openIdb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbGet(key) {
        try {
            const db = await openIdb();
            return await new Promise((resolve, reject) => {
                const rq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
                rq.onsuccess = () => resolve(rq.result);
                rq.onerror = () => reject(rq.error);
            });
        } catch (e) { return null; }
    }

    async function idbSet(key, val) {
        try {
            const db = await openIdb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(val, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { console.warn(LOG, '保存目录句柄失败', e); }
    }

    async function idbDel(key) {
        try {
            const db = await openIdb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { /* 忽略 */ }
    }

    /** 恢复上次选择的目录（句柄可结构化克隆，存 IndexedDB 跨会话保留） */
    async function loadDirHandle() {
        if (!hasFSA()) return;
        try {
            const h = await idbGet('dirHandle');
            if (h && h.name) dirHandle = h;
        } catch (e) { console.warn(LOG, '读取目录句柄失败', e); }
    }

    async function pickDirectory() {
        if (!hasFSA()) throw new Error('当前浏览器不支持自定义保存目录');
        const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
        dirHandle = handle;
        await idbSet('dirHandle', handle);
        return handle;
    }

    /** Chromium 在重新打开页面后需要重新申请一次写入权限 */
    async function ensureDirPermission() {
        if (!dirHandle) return false;
        if (typeof dirHandle.requestPermission === 'function') {
            const st = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (st !== 'granted') return false;
        }
        return true;
    }

    /** 逐级创建子目录并写入文件：folders 形如 ['课程名', '章节名'] */
    async function writeFileToDir(folders, name, blob) {
        let handle = dirHandle;
        for (const f of folders) {
            if (!f) continue;
            handle = await handle.getDirectoryHandle(f, { create: true });
        }
        const fileHandle = await handle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    }

    function clickAnchor(a) {
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        return a;
    }

    /** 交给浏览器保存（默认下载目录）：文件名完全由 a.download 决定 */
    function saveBlobToBrowser(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        clickAnchor(a);
        // 浏览器开始读取 blob 之后才释放，太早 revoke 会中断下载
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 30000);
    }

    /**
     * 保存 Blob：优先写入选中的目录，失败/未设置则退回浏览器默认下载。
     * @returns {'dir'|'blob'} 实际落盘方式
     */
    async function saveBlob(blob, filename, folders) {
        if (dirHandle) {
            try {
                if (await ensureDirPermission()) {
                    await writeFileToDir(folders || [], filename, blob);
                    return 'dir';
                }
            } catch (e) {
                console.warn(LOG, '写入目录失败，回退浏览器下载', filename, e);
            }
            dirHandle = null;   // 权限失效，本次不再尝试目录
        }
        saveBlobToBrowser(blob, filename);
        return 'blob';
    }

    /** 交给浏览器自己下载（大文件）：不占页面内存，可由下载管理器接管 */
    function downloadByLink(t) {
        const a = document.createElement('a');
        a.href = t.url;
        a.download = t.name;
        a.rel = 'noopener noreferrer';
        setTimeout(() => a.remove(), 1500);
        clickAnchor(a);
    }

    /**
     * 唯一下载入口：默认 fetch -> Blob -> 保存（优先选中目录，其次浏览器默认下载），
     * 超过 SIZE_LIMIT 的大文件自动改走直链（省内存）。
     *
     * 关键：fetch resolve 时响应头已可读、响应体尚未读取，
     * 所以能在这里零成本判断大小，超限就立刻取消这条响应，一点内存都不占。
     *
     * 必须校验响应是不是文件：登录态失效 / 无权限 / 防盗链跳转都会返回 HTML，
     * 直接存盘就会得到一个「看起来下载成功、实际打不开」的坏文件。
     *
     * @returns {'dir'|'blob'|'link'} 实际使用的落盘方式，供状态显示与统计用
     */
    async function downloadAuto(t, folders) {
        const res = await fetch(t.url, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/xhtml')) {
            throw new Error('服务器返回的是网页而非文件（多半是未登录 / 无权限）');
        }

        const len = parseInt(res.headers.get('content-length') || '', 10);
        if (Number.isFinite(len) && len > SIZE_LIMIT) {
            if (res.body && typeof res.body.cancel === 'function') {
                try { res.body.cancel(); } catch (e) { /* 忽略 */ }
            }
            downloadByLink(t);
            return 'link';
        }

        const blob = await res.blob();
        if (!blob.size) throw new Error('空文件');
        return saveBlob(blob, t.name, folders);
    }

    async function startDownload(panel) {
        const btn = panel.querySelector('button[data-act=download]');
        const bar = panel.querySelector('footer .progress > div');
        const dedupe = makeDeduplicator();
        const tasks = [];

        // 目录结构：保存目录 / 课程名 / 章节名 / 文件（可关闭）
        const subdirsCb = panel.querySelector('#ispace-subdirs');
        const subdirs = subdirsCb ? subdirsCb.checked : getSubdirPref();
        const courseName = subdirs ? safeFolderName(getCourseName(panel.dataset.type), '未命名课程') : '';

        // 同一个直链只排队一次：避免同一文件被两条路径重复收集。
        // 注意这里是按 URL 去重，同名不同 URL 的文件仍会各自下载（由 dedupe 负责改名）。
        let skipped = 0;
        const queued = new Set();
        const addTask = (name, url, row) => {
            if (!url) return false;
            if (queued.has(url)) { skipped++; return false; }
            queued.add(url);
            const folders = [];
            if (subdirs && courseName) {
                folders.push(courseName);
                const secName = safeFolderName(row.closest('.section')?.dataset.title, '');
                if (secName) folders.push(secName);
            }
            tasks.push({ name, url, row, folders });
            return true;
        };

        // 1) 已解析出来的真实文件（叶子节点，含点 ▸ 展开后生成的子项）
        panel.querySelectorAll('.item[data-kind="file"]').forEach(row => {
            const cb = row.querySelector('input[type=checkbox]');
            if (cb && cb.checked) addTask(row.dataset.name, row.dataset.url, row);
        });

        // 2) 未展开的容器：现场解析。
        //    已展开过的容器必须跳过——它的文件已经以子项形式存在于面板里，
        //    步骤 1 刚收集过一遍，这里再解析一次就会每个文件下载两份。
        //    （dataset.loaded 只在解析成功后才置 1，所以解析失败的容器仍会在这里重试。）
        const containers = [...panel.querySelectorAll('.item[data-container="1"]')].filter(row => {
            if (row.dataset.loaded === '1') return false;
            const cb = row.querySelector('input[type=checkbox]');
            return cb && cb.checked;
        });

        if (!tasks.length && !containers.length) {
            alert('当前没有勾选任何可下载的文件（已展开的容器请勾选里面的具体文件）');
            return;
        }

        btn.disabled = true;
        btn.textContent = '下载中…';

        for (const row of containers) {
            const status = row.querySelector('.status');
            status.textContent = '解析中…';
            status.className = 'status';
            try {
                const files = await resolveContainerFiles(row.dataset.url, row.dataset.name);
                files.forEach(f => addTask(f.name, f.url, row));
                if (files.length) {
                    status.textContent = '✓ ' + files.length + ' 个';
                    status.className = 'status done';
                } else {
                    status.textContent = '空';
                    status.className = 'status';
                }
            } catch (e) {
                console.error(LOG, '解析容器失败', e);
                status.textContent = '✗ ' + (e.message || '失败');
                status.className = 'status fail';
            }
        }

        let done = 0, failed = 0, viaLink = 0, viaDir = 0;
        const STATUS_TEXT = { dir: '✓ 已保存', blob: '✓ 已下载', link: '✓ 已开始' };
        for (const t of tasks) {
            const status = t.row.querySelector('.status');
            t.name = dedupe(t.name);   // 同名文件自动加 " (2)"，避免互相覆盖
            const mark = (mode) => {
                if (mode === 'link') viaLink++;
                else if (mode === 'dir') viaDir++;
                if (status) {
                    status.textContent = STATUS_TEXT[mode] || '✓ 已下载';
                    status.className = 'status done';
                }
            };
            try {
                mark(await downloadAuto(t, t.folders));
            } catch (e) {
                console.warn(LOG, '取回内容失败，回退直链', t.name, e);
                try {
                    downloadByLink(t);
                    mark('link');
                } catch (e2) {
                    failed++;
                    console.error(LOG, '下载失败', t.name, e2);
                    if (status) { status.textContent = '✗ 失败'; status.className = 'status fail'; }
                }
            }
            done++;
            if (bar && tasks.length) bar.style.width = (done / tasks.length * 100) + '%';
            await sleep(350); // 节流，避免被浏览器识别为多文件下载
        }

        btn.disabled = false;
        btn.textContent = '批量下载';
        console.log(LOG, `下载完毕：共 ${tasks.length} 个文件（${viaDir} 个写入目录、${viaLink} 个交给浏览器），` +
            `重复跳过 ${skipped} 个，失败 ${failed} 个`);
    }

    // ---------- 入口 ----------
    let styleInjected = false;

    function init() {
        const regionMain = document.getElementById('region-main');
        if (!regionMain) return;

        const type = getPageType();
        if (type === 'other') return;

        let groups = [];
        if (type === 'course') {
            if (!regionMain.querySelector('li.activity')) return;
            groups = collectCourse();
        } else {
            groups = collectCurrentPage(type);
        }

        const total = groups.reduce((s, g) => s + g.items.length, 0);
        if (total === 0) {
            console.warn(LOG, '未发现课件资源。课程主页统计：',
                'li.section.course-section =', regionMain.querySelectorAll('li.section.course-section').length,
                '| li.activity =', regionMain.querySelectorAll('li.activity').length,
                '| a[href*="pluginfile.php"] =', regionMain.querySelectorAll('a[href*="pluginfile.php"]').length);
            return;
        }

        if (!styleInjected) {
            const style = document.createElement('style');
            style.textContent = STYLE;
            document.head.appendChild(style);
            styleInjected = true;
        }

        document.getElementById('ispace-dl-panel')?.remove();
        buildPanel(groups, type);
        console.log(LOG, `已加载 ${total} 项，分布在 ${groups.length} 个分组（页面类型：${type}）`);
    }

    function waitAndInit() {
        const start = Date.now();
        (function loop() {
            const region = document.getElementById('region-main');
            const type = getPageType();
            // 课程主页要等活动列表渲染出来；其它页面等主内容区就位即可
            const ready = region && (type === 'course' ? region.querySelector('li.activity') : true);
            if (ready) {
                init();
                observeChanges(region);
            } else if (Date.now() - start < 15000) {
                setTimeout(loop, 200);
            } else {
                console.warn(LOG, '等待课件内容渲染超时（15 秒）。');
            }
        })();
    }

    function observeChanges(region) {
        let timer = null, lastSig = '';
        const mo = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const sig = region.querySelectorAll('li.activity, a[href*="pluginfile.php"]').length;
                if (sig !== lastSig) { lastSig = sig; init(); }
            }, 600);
        });
        mo.observe(region, { childList: true, subtree: true });
    }

    // 先恢复上次选的目录（若浏览器支持），再初始化面板，保证按钮文案正确
    loadDirHandle().then(() => waitAndInit());
})();
