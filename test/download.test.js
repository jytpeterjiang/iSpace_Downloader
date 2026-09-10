/**
 * iSpace Downloader 回归测试（jsdom）
 *
 * 运行：npm test
 *
 * 覆盖：
 *   1. 纯函数层：文件名清洗 / 解析 / 去重 / 转义
 *   2. 容器解析层：302 直链、redirect=1 兜底、DOM 提取、登录态、多文件入口
 *   3. 页面识别层：课程主页（含卡片格式作业）、作业页、文件夹页
 *   4. 下载落盘层：无目录降级、写入目录、课程/章节子文件夹、重复下载
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'iSpace_Downloader.user.js'), 'utf8');
const ORIGIN = 'https://ispace.bnbu.edu.cn';

// ---------------------------------------------------------------- 断言工具
let pass = 0, fail = 0;
const failures = [];

function eq(label, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; console.log('  ✓ ' + label + ' => ' + g); }
    else {
        fail++; failures.push(label);
        console.log('  ✗ ' + label + '\n      got  ' + g + '\n      want ' + w);
    }
}
function ok(label, cond) { eq(label, !!cond, true); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { if (fn()) return; await sleep(20); }
    throw new Error('waitFor timeout: ' + label);
}
function section(title) { console.log('\n' + title); }

// ---------------------------------------------------------------- 纯函数提取
/** 抽出工具区的纯函数（sanitize / nameFromUrl / extOf / resolveName / makeDeduplicator / esc） */
function loadPureFns() {
    const a = CODE.indexOf('    function sanitize(name)');
    const b = CODE.indexOf('    const sleep = ms');
    if (a < 0 || b < 0) throw new Error('无法定位纯函数区间');
    return new Function(
        "const LOG='[test]';\n" + CODE.slice(a, b) +
        '\nreturn { sanitize, nameFromUrl, extOf, resolveName, makeDeduplicator, esc };'
    )();
}

/** 抽出容器解析相关函数（absUrl → resolveContainerFiles），注入 DOMParser / fetch 桩 */
function loadResolveFns(DOMParserStub, fetchStub) {
    const a = CODE.indexOf('    function absUrl(href, base)');
    const b = CODE.indexOf('    // ---------- 各类页面的收集逻辑 ----------');
    if (a < 0 || b < 0) throw new Error('无法定位容器解析区间');
    return new Function('DOMParser', 'fetch',
        "const LOG='[test]';\n" + CODE.slice(a, b) +
        '\nreturn { resolveContainerFiles, extractFiles, isFileResponse, directFileName, FILE_URL_RE };'
    )(DOMParserStub, fetchStub);
}

// ---------------------------------------------------------------- DOM 集成 harness
/** 记录完整写入路径的假目录句柄 */
function makeDirHandle(name, prefix, written) {
    const myPath = prefix ? prefix + '/' + name : name;
    return {
        name,
        async getDirectoryHandle(sub) { return makeDirHandle(sub, myPath, written); },
        async getFileHandle(file) {
            return {
                async createWritable() {
                    return {
                        async write(blob) { written[myPath ? myPath + '/' + file : file] = blob.size; },
                        async close() {}
                    };
                }
            };
        }
    };
}

/**
 * 启动一个带脚本实例的 jsdom 环境
 * @param {object} o
 * @param {string} o.url     页面地址
 * @param {string} o.html    页面 HTML
 * @param {Function} [o.fetchStub]  自定义 fetch
 * @param {boolean} [o.fsa]  是否模拟支持 File System Access API
 */
async function boot({ url, html, fetchStub, fsa = false }) {
    const vc = new VirtualConsole();
    vc.on('jsdomError', () => {});
    const dom = new JSDOM(html, { url, runScripts: 'dangerously', virtualConsole: vc });
    const w = dom.window;

    const downloads = [];
    const written = {};

    w.alert = () => {};
    w.confirm = () => false;
    w.URL.createObjectURL = () => 'blob:stub';
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };

    w.fetch = fetchStub || (async () => { throw new Error('fetch 未定义'); });
    if (fsa) w.showDirectoryPicker = async () => makeDirHandle('', '', written);

    const el = w.document.createElement('script');
    el.textContent = CODE;
    w.document.head.appendChild(el);

    let panel = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
        panel = w.document.getElementById('ispace-dl-panel');
        if (panel) break;
        await sleep(20);
    }
    if (!panel) throw new Error('面板未创建');
    return { w, panel, downloads, written };
}

/** 构造一个 fetch 桩：命中 pluginfile 返回文件，命中页面返回 HTML */
function makeFetch({ pages = {}, fileCt = 'application/pdf' } = {}) {
    return async (url) => {
        url = String(url);
        const page = Object.keys(pages).find(k => url.includes(k));
        if (page) {
            return {
                ok: true, url, headers: { get: () => 'text/html' }, body: { cancel() {} },
                text: async () => pages[page], blob: async () => ({ size: 0 })
            };
        }
        if (url.includes('pluginfile.php')) {
            return {
                ok: true, url, headers: { get: () => fileCt }, body: { cancel() {} },
                text: async () => '', blob: async () => ({ size: 1234 })
            };
        }
        throw new Error('unexpected fetch ' + url);
    };
}

// 课程主页 HTML 构造
function coursePage({ sections }) {
    const lis = sections.map((s, i) => `
        <li class="section course-section" data-number="${i}">
          <h3 class="sectionname">${s.name}</h3>
          <ul>
            ${s.items.map((it, j) => `
              <li class="activity modtype_${it.kind}" id="m-${i}-${j}">
                <div class="${it.card ? 'activity-card' : 'activity-item'}">
                  <div class="${it.card ? 'activity-name' : 'activityname'}">
                    <a href="${ORIGIN}/mod/${it.kind}/view.php?id=${it.id}">
                      ${it.inst
                        ? `<span class="instancename">${it.name}<span class="accesshide"> ${it.suffix}</span></span>`
                        : `${it.name}<span class="accesshide"> ${it.suffix}</span>`}
                    </a>
                  </div>
                </div>
              </li>`).join('')}
          </ul>
        </li>`).join('');
    return `<!doctype html><html><body>
        <div id="page-header"><h1>AI Business Applications</h1></div>
        <div id="region-main"><ul>${lis}</ul></div>
    </body></html>`;
}

async function runDownload(panel) {
    const btn = panel.querySelector('button[data-act=download]');
    btn.click();
    await waitFor(() => btn.disabled === false, '下载结束');
}

// ================================================================ 1. 纯函数层
async function testPureFns() {
    section('【1】文件名清洗 / 解析 / 去重');
    const api = loadPureFns();
    const B = ORIGIN + '/pluginfile.php/12345';

    eq('resource 内嵌 object（旧版会得到 file）',
        api.resolveName(null, B + '/mod_resource/content/1/Lecture%201.pdf?forcedownload=1'), 'Lecture 1.pdf');
    eq('page 内嵌图片', api.resolveName(null, B + '/mod_page/content/0/Figure%202.png'), 'Figure 2.png');
    eq('中文文件名', api.resolveName(null, B + '/mod_folder/content/0/%E7%AC%AC%E4%B8%80%E7%AB%A0.pptx'), '第一章.pptx');
    eq('DOM 只给主名，自动补后缀', api.resolveName('Lecture 1', B + '/mod_folder/content/0/Lecture%201.pdf'), 'Lecture 1.pdf');
    eq('DOM 文本为空', api.resolveName('   ', B + '/mod_folder/content/0/Chapter%202.docx'), 'Chapter 2.docx');
    eq('扩展名一致用 DOM 名', api.resolveName('Lab Manual.pdf', B + '/mod_folder/content/0/lab%20manual.pdf'), 'Lab Manual.pdf');
    eq('扩展名冲突以 URL 为准', api.resolveName('notes.pptx', B + '/mod_folder/content/0/notes.pdf'), 'notes.pdf');

    eq('非法字符', api.sanitize('a/b:c*d?e"f<g>h|i.pdf'), 'a_b_c_d_e_f_g_h_i.pdf');
    eq('结尾的点', api.sanitize('report.'), 'report');
    eq('Windows 保留名', api.sanitize('con.pdf'), '_con.pdf');

    const dedupe = api.makeDeduplicator();
    eq('重名第 1 个', dedupe('a.pdf'), 'a.pdf');
    eq('重名第 2 个', dedupe('a.pdf'), 'a (2).pdf');
    eq('重名第 3 个', dedupe('a.pdf'), 'a (3).pdf');
    eq('无扩展名第 2 个', dedupe('readme') && dedupe('readme'), 'readme (2)');

    eq('HTML 转义', api.esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
}

// ================================================================ 2. 容器解析层
async function testResolve() {
    section('【2】容器解析：302 直链 / redirect 兜底 / 登录态 / 多入口');
    const B = ORIGIN;

    // 假 document：只有 a[href] 有内容
    const fakeDoc = hrefs => ({
        querySelectorAll(sel) {
            if (sel === 'a[href]') return hrefs.map(h => ({
                getAttribute: k => (k === 'href' ? h : null), querySelector: () => null, textContent: ''
            }));
            return [];
        }
    });
    const mkParser = hrefs => function () { return { parseFromString: () => fakeDoc(hrefs) }; };
    const res = o => ({
        ok: true, url: o.url, headers: { get: () => o.ct || '' },
        body: { cancel() { o.cancelled = true; } }, text: async () => o.html || '<html></html>'
    });

    // 场景 1：302 到 pluginfile
    let api = loadResolveFns(mkParser([]),
        async () => res({ url: B + '/pluginfile.php/77/mod_resource/content/0/Week3%20Slides.pdf', ct: 'application/pdf' }));
    let files = await api.resolveContainerFiles(B + '/mod/resource/view.php?id=9', 'Week3 Slides');
    eq('302 直链：拿到文件', files.map(f => f.name), ['Week3 Slides.pdf']);

    // 场景 2：服务端在原 URL 直接吐文件（URL 仍为 view.php）
    api = loadResolveFns(mkParser([]),
        async () => res({ url: B + '/mod/resource/view.php?id=9', ct: 'application/pdf' }));
    files = await api.resolveContainerFiles(B + '/mod/resource/view.php?id=9', 'Week3 Slides');
    eq('按 MIME 补后缀', files.map(f => f.name), ['Week3 Slides.pdf']);

    // 场景 3：正常 HTML 页面
    api = loadResolveFns(mkParser([B + '/pluginfile.php/1/mod_folder/content/0/a.pdf',
        '/pluginfile.php/1/mod_folder/content/0/b.docx']),
        async () => res({ url: B + '/mod/folder/view.php?id=5', ct: 'text/html' }));
    files = await api.resolveContainerFiles(B + '/mod/folder/view.php?id=5', 'Folder');
    eq('DOM 提取 2 个', files.map(f => f.name), ['a.pdf', 'b.docx']);

    // 场景 4：redirect=1 兜底
    let calls = [];
    api = loadResolveFns(mkParser([]), async (u) => {
        calls.push(u);
        if (u.includes('redirect=1')) return res({
            url: B + '/pluginfile.php/9/mod_resource/content/1/Handout.pptx',
            ct: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        });
        return res({ url: B + '/mod/resource/view.php?id=9', ct: 'text/html' });
    });
    files = await api.resolveContainerFiles(B + '/mod/resource/view.php?id=9', 'Handout');
    eq('redirect=1 兜底拿到文件', files.map(f => f.name), ['Handout.pptx']);
    eq('第二个请求补了 redirect=1', calls[1], B + '/mod/resource/view.php?id=9&redirect=1');

    // 场景 5：登录态失效
    api = loadResolveFns(mkParser([]),
        async () => res({ url: B + '/login/index.php', ct: 'text/html', html: '<html><a href="/login/index.php">log in</a>' }));
    let errMsg = '';
    try { await api.resolveContainerFiles(B + '/mod/resource/view.php?id=9', 'X'); }
    catch (e) { errMsg = e.message; }
    eq('登录态失效抛错', /登录态失效/.test(errMsg), true);

    // 场景 6：多文件入口识别
    api = loadResolveFns(mkParser([]), async () => res({ url: '', ct: '' }));
    eq('pluginfile', api.FILE_URL_RE.test(B + '/pluginfile.php/1/x'), true);
    eq('tokenpluginfile', api.FILE_URL_RE.test(B + '/tokenpluginfile.php/1/x'), true);
    eq('webservice/pluginfile', api.FILE_URL_RE.test(B + '/webservice/pluginfile.php/1/x'), true);
    eq('draftfile', api.FILE_URL_RE.test(B + '/draftfile.php/1/x'), true);
    eq('view.php 不是文件入口', api.FILE_URL_RE.test(B + '/mod/resource/view.php?id=1'), false);
}

// ================================================================ 3. 页面识别层
async function testPages() {
    section('【3】页面识别：作业页 / 课程主页卡片格式作业');

    // 3.1 作业页（mod/assign/view.php）
    const assignHtml = `<!doctype html><html><body>
        <div id="page-header"><h1>Case Journals: Weeks 1 - 2</h1></div>
        <div id="region-main">
          <div class="activity-intro">
            <p>Submit your journal... Use the template provided in this folder.</p>
            <p>
              <a href="${ORIGIN}/pluginfile.php/12345/mod_assign/intro/0/Case%20Journal%20Template.docx?forcedownload=1">
                Case Journal Template.docx
              </a>
              <span>31 August 2026, 5:39 PM</span>
            </p>
          </div>
          <div class="submissionstatustable">No submissions have been made yet</div>
        </div>
    </body></html>`;
    let env = await boot({ url: ORIGIN + '/mod/assign/view.php?id=368005', html: assignHtml });
    eq('作业页 type', env.panel.dataset.type, 'assign');
    eq('作业页文件数', env.panel.querySelector('#ispace-count').textContent, '1');
    let row = env.panel.querySelector('.item[data-kind="file"]');
    eq('作业页文件名', row && row.dataset.name, 'Case Journal Template.docx');
    ok('作业页 URL 是 pluginfile', row && /\/pluginfile\.php\//.test(row.dataset.url));

    // 3.2 课程主页：卡片格式作业 + 标准列表资源
    const html = coursePage({
        sections: [
            { name: 'Resources', items: [
                { kind: 'resource', id: 10, name: 'Slides', suffix: 'File', inst: true }
            ]},
            { name: 'Case Journals Folder: Class Participation (1%)', items: [
                { kind: 'assign', id: 21, name: 'Case Journals: Weeks 1 - 2', suffix: 'Assignment', card: true },
                { kind: 'assign', id: 22, name: 'Case Journals: Weeks 3 - 4', suffix: 'Assignment', card: true }
            ]}
        ]
    });
    env = await boot({ url: ORIGIN + '/course/view.php?id=1', html });
    eq('课程主页 type', env.panel.dataset.type, 'course');
    eq('课程主页总项数', env.panel.querySelector('#ispace-count').textContent, '3');
    const assigns = [...env.panel.querySelectorAll('.item')].filter(it => it.dataset.kind === 'assign');
    eq('识别到 2 个作业', assigns.length, 2);
    eq('作业 1 名称（剥 accesshide + Assignment，: 转 _）', assigns[0] && assigns[0].dataset.name, 'Case Journals_ Weeks 1 - 2');
    eq('作业 2 名称', assigns[1] && assigns[1].dataset.name, 'Case Journals_ Weeks 3 - 4');
    eq('作业都是容器（可展开）', assigns.every(a => a.dataset.container === '1'), true);
    ok('作业有橙色 badge', assigns[0].querySelector('.badge.assign'));
}

// ================================================================ 4. 下载落盘层
async function testDownload() {
    section('【4】下载落盘：降级 / 写目录 / 子文件夹 / 重复下载');

    const FOLDER_HTML = `<html><body>
        <a href="${ORIGIN}/pluginfile.php/1/mod_folder/content/0/a.pdf"><span class="fp-filename">a.pdf</span></a>
        <a href="/pluginfile.php/1/mod_folder/content/0/b.docx"><span class="fp-filename">b.docx</span></a>
    </body></html>`;

    const courseHtml = coursePage({
        sections: [{ name: 'Topic 1', items: [{ kind: 'folder', id: 11, name: 'Materials', suffix: 'Folder', inst: true }] }]
    });
    const fetchStub = makeFetch({ pages: { 'mod/folder/view.php': FOLDER_HTML } });

    // 4.1 不支持 FSA（如 Firefox）→ 降级为 a[download]
    let env = await boot({ url: ORIGIN + '/course/view.php?id=1', html: courseHtml, fetchStub, fsa: false });
    let dirBtn = env.panel.querySelector('button[data-act="dir"]');
    eq('目录按钮禁用', dirBtn.disabled, true);
    eq('目录按钮文案', dirBtn.textContent, '目录不可用');
    await runDownload(env.panel);
    eq('降级：走浏览器下载', env.downloads, ['a.pdf', 'b.docx']);

    // 4.2 支持 FSA → 写入目录（含课程/章节子文件夹）
    env = await boot({ url: ORIGIN + '/course/view.php?id=1', html: courseHtml, fetchStub, fsa: true });
    dirBtn = env.panel.querySelector('button[data-act="dir"]');
    eq('初始目录按钮文案', dirBtn.textContent, '保存目录');
    dirBtn.click();
    await waitFor(() => dirBtn.textContent !== '保存目录', '目录已选');

    let subCb = env.panel.querySelector('#ispace-subdirs');
    eq('子文件夹默认勾选', subCb.checked, true);
    await runDownload(env.panel);
    eq('写入 课程/章节/文件', Object.keys(env.written).sort(), [
        'AI Business Applications/Topic 1/a.pdf',
        'AI Business Applications/Topic 1/b.docx'
    ]);
    eq('未走浏览器下载', env.downloads, []);

    // 4.3 取消子文件夹 → 平铺
    env = await boot({ url: ORIGIN + '/course/view.php?id=1', html: courseHtml, fetchStub, fsa: true });
    dirBtn = env.panel.querySelector('button[data-act="dir"]');
    dirBtn.click();
    await waitFor(() => dirBtn.textContent !== '保存目录', '目录已选');
    subCb = env.panel.querySelector('#ispace-subdirs');
    subCb.checked = false;
    await runDownload(env.panel);
    eq('平铺写入根目录', Object.keys(env.written).sort(), ['a.pdf', 'b.docx']);

    // 4.4 重复下载：展开容器后再批量下载，不应下载两份
    env = await boot({ url: ORIGIN + '/course/view.php?id=1', html: courseHtml, fetchStub, fsa: false });
    const twisty = env.panel.querySelector('.twisty');
    twisty.click();
    await waitFor(() => env.panel.querySelectorAll('.item[data-kind="file"]').length === 2, '子项出现');
    await runDownload(env.panel);
    eq('展开后不重复下载', env.downloads, ['a.pdf', 'b.docx']);
}

// ================================================================ 主流程
(async () => {
    console.log('iSpace Downloader 回归测试');
    console.log('脚本版本：' + (CODE.match(/@version\s+(\S+)/) || [, '?'])[1]);

    try {
        await testPureFns();
        await testResolve();
        await testPages();
        await testDownload();
    } catch (e) {
        fail++; failures.push('执行异常');
        console.error('\n执行出错：', e);
    }

    console.log('\n' + '='.repeat(50));
    console.log(`结果：${pass} 通过 / ${fail} 失败`);
    if (fail) console.log('失败项：\n  - ' + failures.join('\n  - '));
    process.exit(fail ? 1 : 0);
})();
