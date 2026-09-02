// ==UserScript==
// @name         iSpace 课件批量查看/下载 (BNBU)
// @namespace    https://ispace.bnbu.edu.cn/
// @version      2.0.0
// @description  在 iSpace (BNBU Moodle) 课程页 / 文件夹(page-folder) / 页面(page) / 资源(resource) 页面统一查看并批量下载课件。支持在课程主页内联展开文件夹与页面，无需跳转。
// @author       Peter Jiang
// @match        https://ispace.bnbu.edu.cn/course/view.php*
// @match        https://ispace.bnbu.edu.cn/mod/folder/view.php*
// @match        https://ispace.bnbu.edu.cn/mod/page/view.php*
// @match        https://ispace.bnbu.edu.cn/mod/resource/view.php*
// @grant        GM_download
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
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
        return 'other';
    }

    function absUrl(href, base) {
        try { return new URL(href, base).href; } catch (e) { return null; }
    }

    function sanitize(name) {
        return (name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'file';
    }

    function nameFromUrl(url) {
        try {
            const seg = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
            return sanitize(seg || 'file');
        } catch (e) { return 'file'; }
    }

    async function fetchDoc(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        return { doc: new DOMParser().parseFromString(html, 'text/html'), base: url };
    }

    /**
     * 从文档中提取所有真实文件链接（pluginfile.php）。
     * 覆盖 folder 文件列表、page 内嵌附件/图片、resource 的下载链接。
     */
    function extractFiles(doc, base) {
        const out = [];
        const seen = new Set();
        const push = (rawHref, rawName) => {
            const url = absUrl(rawHref, base);
            if (!url || !/\/pluginfile\.php\//.test(url)) return;
            if (seen.has(url)) return;
            seen.add(url);
            out.push({ name: sanitize(rawName) || nameFromUrl(url), url });
        };

        // 1) 超链接（folder 文件树、page 附件、resource 下载链接）
        doc.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (!href || !/pluginfile\.php/.test(href)) return;
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
            if (src && /pluginfile\.php/.test(src)) {
                push(src, img.getAttribute('alt'));
            }
        });

        return out;
    }

    // ---------- 各类页面的收集逻辑 ----------
    function pageTitle(fallback) {
        const h1 = document.querySelector('#page-header h1, #region-main h2');
        return (h1 ? h1.textContent.trim() : fallback);
    }

    /** 课程主页：按 section 分组，收集 resource / folder / page / url 活动 */
    function collectCourse() {
        const regionMain = document.getElementById('region-main');
        if (!regionMain) return [];
        const groups = [];

        regionMain.querySelectorAll('li.section.course-section').forEach(sec => {
            const items = [];
            sec.querySelectorAll('li.activity').forEach(li => {
                const a = li.querySelector('div.activityname > a');
                if (!a) return;
                const href = a.getAttribute('href');
                if (!href) return;

                let kind;
                if (/\/mod\/resource\//.test(href)) kind = 'resource';
                else if (/\/mod\/folder\//.test(href)) kind = 'folder';
                else if (/\/mod\/page\//.test(href)) kind = 'page';
                else if (/\/mod\/url\//.test(href)) kind = 'url';
                else return; // 忽略论坛 / 作业 / 测验等

                const inst = a.querySelector('.instancename');
                const name = sanitize(inst
                    ? inst.cloneNode(true).textContent.replace(/\s*(File|Folder|Page|URL)\s*$/i, '').trim()
                    : a.textContent.trim());
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
        const title = { folder: '文件夹内容', page: '页面内文件', resource: '资源文件' }[type] || '文件';
        return [{
            title: pageTitle(title),
            items: files.map(f => ({ name: f.name, url: f.url, kind: 'file' }))
        }];
    }

    // ---------- UI ----------
    const BADGE = { folder: '文件夹', page: '页面', resource: '文件', url: '链接' };
    // 需要点进去才能拿到真实文件的类型
    const CONTAINER = { folder: 1, page: 1, resource: 1 };

    function buildPanel(groups, type) {
        const panel = document.createElement('div');
        panel.id = 'ispace-dl-panel';
        panel.dataset.type = type;

        const total = groups.reduce((s, g) => s + g.items.length, 0);
        const isCourse = type === 'course';
        const typeLabel = { course: '课程主页', folder: '文件夹页面', page: '页面', resource: '资源页面' }[type] || '';

        panel.innerHTML = `
            <header>
                <h3>iSpace 课件 (<span id="ispace-count">${total}</span>)</h3>
                <div class="actions">
                    <button data-act="all">全选</button>
                    <button data-act="none">取消</button>
                    <button data-act="expand">收起</button>
                </div>
            </header>
            <div class="pagetype">当前：${typeLabel}${isCourse ? ' · 点 ▸ 可展开文件夹/页面内容' : ''}</div>
            <div class="body"></div>
            <div class="hint">下载时会自动解析出真实文件链接后再触发浏览器下载。</div>
            <footer>
                <div class="progress"><div></div></div>
                <button class="primary" data-act="download">批量下载</button>
            </footer>
        `;

        const body = panel.querySelector('.body');
        groups.forEach(g => {
            const sec = document.createElement('div');
            sec.className = 'section';
            sec.innerHTML = `<div class="section-title"><span>${g.title}</span><span>(${g.items.length})</span></div>`;

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
                        <a href="${it.url}" target="_blank" rel="noopener">${it.name}</a>
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
            } else if (act === 'download') {
                await startDownload(panel);
            }
        });

        document.body.appendChild(panel);
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
                const { doc, base } = await fetchDoc(row.dataset.url);
                const files = extractFiles(doc, base);
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
                                <a href="${f.url}" target="_blank" rel="noopener">${f.name}</a>
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
                holder.innerHTML = `<div class="item child" style="color:#cf222e">解析失败，请直接点击打开页面</div>`;
            }
        }

        holder.style.display = '';
        btn.innerHTML = '&#9662;';
    }

    // ---------- 下载 ----------
    function triggerDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || '';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 1500);
    }

    async function startDownload(panel) {
        const btn = panel.querySelector('button[data-act=download]');
        const bar = panel.querySelector('footer .progress > div');
        const tasks = [];

        // 1) 已解析出来的真实文件（叶子节点）
        panel.querySelectorAll('.item[data-kind="file"]').forEach(row => {
            const cb = row.querySelector('input[type=checkbox]');
            if (cb && cb.checked) {
                tasks.push({ name: row.dataset.name, url: row.dataset.url, row });
            }
        });

        // 2) 未展开的容器：现场解析
        const containers = [...panel.querySelectorAll('.item[data-container="1"]')].filter(row => {
            const cb = row.querySelector('input[type=checkbox]');
            return cb && cb.checked;
        });

        if (!tasks.length && !containers.length) {
            alert('请先勾选要下载的课件');
            return;
        }

        btn.disabled = true;
        btn.textContent = '下载中…';

        for (const row of containers) {
            const status = row.querySelector('.status');
            status.textContent = '解析中…';
            status.className = 'status';
            try {
                const { doc, base } = await fetchDoc(row.dataset.url);
                const files = extractFiles(doc, base);
                files.forEach(f => tasks.push({ name: f.name, url: f.url, row }));
                status.textContent = '✓ ' + files.length + ' 个';
                status.className = 'status done';
            } catch (e) {
                status.textContent = '✗ 失败';
                status.className = 'status fail';
            }
        }

        let done = 0;
        for (const t of tasks) {
            const status = t.row.querySelector('.status');
            try {
                if (typeof GM_download === 'function') {
                    GM_download({
                        url: t.url,
                        name: t.name,
                        onload() { if (status) { status.textContent = '✓ 已开始'; status.className = 'status done'; } },
                        onerror(e) {
                            console.error(LOG, '下载失败', t.name, e);
                            if (status) { status.textContent = '✗ 失败'; status.className = 'status fail'; }
                        }
                    });
                } else {
                    triggerDownload(t.url, t.name);
                }
                if (status && status.textContent.indexOf('✓') !== 0) {
                    status.textContent = '✓ 已开始';
                    status.className = 'status done';
                }
            } catch (e) {
                console.error(LOG, e);
                if (status) { status.textContent = '✗ 失败'; status.className = 'status fail'; }
            }
            done++;
            bar.style.width = (done / tasks.length * 100) + '%';
            await new Promise(r => setTimeout(r, 350)); // 节流，避免被浏览器识别为多文件下载
        }

        btn.disabled = false;
        btn.textContent = '批量下载';
        console.log(LOG, `下载任务下发完毕，共 ${tasks.length} 个文件`);
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

    waitAndInit();
})();
