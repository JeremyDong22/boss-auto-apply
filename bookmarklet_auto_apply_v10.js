// v11 - Boss 直聘自动投递 Bookmarklet
// 改进：每次点击"开始投递"时先验证卡密，无效则拦截并提示
// 通过 loader bookmarklet 从服务器加载，key 存储在 localStorage

// ===== 可读版源码 =====

(function () {
    'use strict';

    // v10 计数器：无固定上限，持续投递直到用户停止、到底、或触发限流
    var count = 0;    // 成功投递数
    var skipped = 0;  // 跳过数（已沟通/无按钮）
    var idx = 0;      // 当前遍历索引
    var running = false;

    // 读取 loader 设置的卡密信息（由 loader bookmarklet 注入）
    var currentKey = window.__BOSS_KEY || '';
    var keyInfo = window.__BOSS_INFO || {};
    var remainDays = keyInfo.remain_days || '-';

    // 防止重复面板
    var panel = document.createElement('div');
    panel.id = 'aa-panel';
    if (document.getElementById('aa-panel')) document.getElementById('aa-panel').remove();

    // 面板 UI：卡密信息 + 三个计数 + 开始/停止 + 换卡密输入框
    panel.innerHTML = `
        <div style="position:fixed;top:80px;right:20px;z-index:99999;
            background:linear-gradient(135deg,#00bebd,#00a8a7);color:white;
            padding:16px 20px;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:240px">
            <div id="aa-close" style="position:absolute;top:10px;right:14px;cursor:pointer;font-size:24px;opacity:0.7;line-height:1">\u00d7</div>
            <div style="font-size:16px;font-weight:bold;margin-bottom:8px">Boss 自动投递 v10</div>
            <div id="aa-key-line" style="font-size:11px;margin-bottom:10px;opacity:0.85">
                ${currentKey ? currentKey + ' | 剩余' + remainDays + '天' : '未授权'}
            </div>
            <div style="font-size:13px;margin-bottom:6px">已投递: <b id="aa-count">0</b> 个</div>
            <div style="font-size:13px;margin-bottom:6px">已跳过: <b id="aa-skipped">0</b> 个</div>
            <div style="font-size:13px;margin-bottom:12px">已遍历: <b id="aa-total">0</b> 个</div>
            <div id="aa-status" style="font-size:12px;margin-bottom:12px;opacity:0.9">点击开始按钮启动</div>
            <div style="display:flex;gap:8px;margin-bottom:10px">
                <button id="aa-start" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:white;color:#00bebd;font-weight:bold;cursor:pointer;font-size:14px">开始投递</button>
                <button id="aa-stop" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:rgba(255,255,255,0.3);color:white;font-weight:bold;cursor:pointer;font-size:14px">停止</button>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.3);padding-top:10px;display:flex;gap:6px">
                <input id="aa-new-key" type="text" placeholder="输入新卡密" maxlength="14"
                    style="flex:1;padding:5px 8px;border:1px solid rgba(255,255,255,0.4);border-radius:4px;
                    background:rgba(255,255,255,0.15);color:white;font-size:12px;font-family:monospace;
                    outline:none;text-transform:uppercase" autocomplete="off" spellcheck="false">
                <button id="aa-change-key" style="padding:5px 10px;border:1px solid rgba(255,255,255,0.4);
                    border-radius:4px;background:rgba(255,255,255,0.2);color:white;font-size:12px;
                    cursor:pointer;white-space:nowrap">换卡密</button>
            </div>
            <div id="aa-key-msg" style="font-size:11px;margin-top:6px;display:none"></div>
            <a href="https://boss-auto-apply-website.pages.dev" target="_blank"
                style="display:block;text-align:center;margin-top:10px;font-size:11px;color:rgba(255,255,255,0.7);text-decoration:none"
                onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">官网 / 购买卡密 / 联系客服</a>
        </div>`;
    document.body.appendChild(panel);

    // 关闭面板
    document.getElementById('aa-close').onclick = function () {
        running = false;
        var p = document.getElementById('aa-panel');
        if (p) p.remove();
    };

    // 换卡密：在面板内输入新 key → 验证 → 成功则保存到 localStorage 并更新显示
    document.getElementById('aa-change-key').onclick = async function () {
        var input = document.getElementById('aa-new-key');
        var newKey = input.value.trim().toUpperCase();
        var msgEl = document.getElementById('aa-key-msg');

        if (!newKey) {
            msgEl.textContent = '请输入卡密';
            msgEl.style.color = '#ffcccc';
            msgEl.style.display = 'block';
            return;
        }

        msgEl.textContent = '验证中...';
        msgEl.style.color = 'rgba(255,255,255,0.9)';
        msgEl.style.display = 'block';

        var api = window.__BOSS_API || 'https://boss-auto-apply-api.hengd2.workers.dev';
        var fp = btoa(screen.width + '|' + screen.height + '|' + screen.colorDepth + '|' +
            navigator.language + '|' + new Date().getTimezoneOffset() + '|' + navigator.platform);

        try {
            var res = await fetch(api + '/api/verify?key=' + newKey + '&fp=' + encodeURIComponent(fp));
            var data = await res.json();

            if (!data.ok) {
                msgEl.textContent = data.msg;
                msgEl.style.color = '#ffcccc';
                return;
            }

            // 验证通过 → 保存 + 更新面板
            localStorage.setItem('boss_auto_key', newKey);
            window.__BOSS_KEY = newKey;
            window.__BOSS_INFO = data.info;

            document.getElementById('aa-key-line').textContent =
                newKey + ' | 剩余' + data.info.remain_days + '天';

            msgEl.textContent = '卡密已更换';
            msgEl.style.color = '#ccffcc';
            input.value = '';
            setTimeout(function () { msgEl.style.display = 'none'; }, 3000);
        } catch (e) {
            msgEl.textContent = '连接失败: ' + e.message;
            msgEl.style.color = '#ffcccc';
        }
    };

    // 验证卡密是否仍然有效（调用 /api/check）
    async function checkKeyValid() {
        var key = window.__BOSS_KEY || localStorage.getItem('boss_auto_key');
        if (!key) return { valid: false, msg: '未找到卡密' };
        var api = window.__BOSS_API || 'https://boss-auto-apply-api.hengd2.workers.dev';
        try {
            var res = await fetch(api + '/api/check?key=' + encodeURIComponent(key));
            var data = await res.json();
            if (!data.ok) return { valid: false, msg: data.msg };
            return { valid: true, info: data.info };
        } catch (e) {
            return { valid: false, msg: '网络错误: ' + e.message };
        }
    }

    function wait(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    function status(t) {
        var e = document.getElementById('aa-status');
        if (e) e.textContent = t;
        console.log('[自动投递] ' + t);
    }

    // 统一更新面板上的三个计数
    function updateUI() {
        document.getElementById('aa-count').textContent = count;
        document.getElementById('aa-skipped').textContent = skipped;
        document.getElementById('aa-total').textContent = idx;
    }

    // 模拟真实鼠标点击（mousedown → mouseup → click，带坐标）
    function realClick(el) {
        var rect = el.getBoundingClientRect();
        var x = rect.left + rect.width / 2;
        var y = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }

    // 查找可见按钮（精确匹配文本）
    function findBtn(text) {
        var els = document.querySelectorAll('a, button');
        for (var i = 0; i < els.length; i++) {
            if (els[i].textContent.trim() === text && els[i].offsetParent !== null) return els[i];
        }
        return null;
    }

    // 检测"无法进行沟通"限流弹窗 → 点确定、停止运行、面板变红
    function checkChatBlock() {
        var dialog = document.querySelector('.chat-block-dialog');
        if (!dialog) return false;

        // 点击"确定"关闭弹窗
        var btn = dialog.querySelector('.sure-btn');
        if (btn) realClick(btn);

        // 停止运行
        running = false;

        // 面板变红，醒目提示
        var p = document.getElementById('aa-panel');
        if (p) {
            var inner = p.querySelector('div');
            if (inner) inner.style.background = 'linear-gradient(135deg,#e74c3c,#c0392b)';
        }

        status('⚠ 今日已达150人上限！已投递' + count + '个，跳过' + skipped + '个');

        // 上报限流事件到后台
        var reportApi = window.__BOSS_API || 'https://boss-auto-apply-api.hengd2.workers.dev';
        var reportKey = window.__BOSS_KEY || localStorage.getItem('boss_auto_key') || '';
        if (reportKey) {
            try {
                navigator.sendBeacon(reportApi + '/api/report',
                    new Blob([JSON.stringify({ key: reportKey, job: '[限流] 今日已达150人上限', salary: '' })],
                    { type: 'application/json' }));
            } catch(e) {}
        }

        return true;
    }

    // 关闭弹窗：先检测限流，再点"留在此页"，最后点关闭按钮
    function closeDialog() {
        if (checkChatBlock()) return true;

        var stay = document.querySelector('.greet-boss-dialog .cancel-btn');
        if (stay) { realClick(stay); return true; }

        var closeBtn = document.querySelector('.greet-boss-dialog .close');
        if (closeBtn) { realClick(closeBtn); return true; }

        return false;
    }

    // 获取卡片列表（每次重新查询，防止 Vue 重渲染导致 DOM 失效）
    function getCards() {
        return document.querySelectorAll('.job-card-wrap');
    }

    // 点击卡片：优先点内部的 .job-card-box 或 .job-info
    function clickCard(card) {
        var target = card.querySelector('.job-card-box') || card.querySelector('.job-info') || card;
        realClick(target);
    }

    // 滚动到指定卡片位置（使用 window 滚动）
    function scrollToCard(card) {
        var rect = card.getBoundingClientRect();
        var absTop = rect.top + window.scrollY;
        window.scrollTo(0, absTop - 200);
    }

    // 滚动加载更多卡片，每步都检测限流
    async function tryScrollForMore() {
        var oldLen = getCards().length;
        var attempts = 0;

        while (attempts < 3 && running) {
            if (checkChatBlock()) return false;

            window.scrollTo(0, Math.max(0, document.body.scrollHeight - 2000));
            await wait(300);
            window.scrollTo(0, document.body.scrollHeight);
            await wait(2000);
            if (!running) return false;
            if (checkChatBlock()) return false;

            var newLen = getCards().length;
            if (newLen > oldLen) return true;

            attempts++;
        }

        return false;
    }

    // 主流程：无限滚动模式，全程监控限流弹窗
    async function run() {
        if (running) return;
        running = true;
        count = 0;
        skipped = 0;
        idx = 0;
        updateUI();

        // 重置面板颜色（可能上次因限流变红了）
        var p = document.getElementById('aa-panel');
        if (p) {
            var inner = p.querySelector('div');
            if (inner) inner.style.background = 'linear-gradient(135deg,#00bebd,#00a8a7)';
        }

        // 每次开始投递前验证卡密有效性
        status('验证卡密中...');
        var keyCheck = await checkKeyValid();
        if (!running) return;
        if (!keyCheck.valid) {
            running = false;
            // 面板变红提示
            var inner2 = p ? p.querySelector('div') : null;
            if (inner2) inner2.style.background = 'linear-gradient(135deg,#e74c3c,#c0392b)';
            status('卡密无效: ' + keyCheck.msg);
            return;
        }
        // 更新面板上的剩余天数
        if (keyCheck.info) {
            window.__BOSS_INFO = keyCheck.info;
            var keyLine = document.getElementById('aa-key-line');
            if (keyLine) keyLine.textContent = (window.__BOSS_KEY || '') + ' | 剩余' + keyCheck.info.remain_days + '天';
        }

        status('正在启动...');
        await wait(1000);
        if (!running) return;

        // 启动前先检测一次限流
        if (checkChatBlock()) return;

        var initCards = getCards();
        if (!initCards || initCards.length === 0) {
            status('未找到职位卡片');
            running = false;
            return;
        }
        status('找到 ' + initCards.length + ' 个职位');

        while (running) {
            // 每次迭代开头检测限流
            if (checkChatBlock()) break;

            var cards = getCards();
            if (!cards || cards.length === 0) { status('未找到职位卡片'); break; }

            if (idx >= cards.length) {
                status('当前卡片遍历完，加载更多...');
                var hasMore = await tryScrollForMore();
                if (!hasMore || !running) break;
                continue;
            }

            var card = cards[idx];
            scrollToCard(card);
            await wait(500);
            if (!running) break;
            if (checkChatBlock()) break;

            var name = card.querySelector('.job-name');
            var jobName = name ? name.textContent.trim() : '未知';
            var salaryEl = card.querySelector('.job-salary');
            var jobSalary = salaryEl ? salaryEl.textContent.trim() : '';
            status('[' + (idx + 1) + '/' + cards.length + '] ' + jobName);

            clickCard(card);
            await wait(2000);
            if (!running) break;
            if (checkChatBlock()) break;

            var applyBtn = findBtn('立即沟通');
            if (applyBtn) {
                status('点击立即沟通...');
                realClick(applyBtn);
                await wait(2000);
                if (!running) break;
                // 点击"立即沟通"后立刻检测限流（最可能触发的时机）
                if (checkChatBlock()) break;

                status('关闭弹窗...');
                closeDialog();
                await wait(1000);
                if (!running) break;

                count++;
                updateUI();
                status('已投递 ' + jobName);

                // 静默上报投递记录（sendBeacon 不阻塞、不等响应）
                var reportApi = window.__BOSS_API || 'https://boss-auto-apply-api.hengd2.workers.dev';
                var reportKey = window.__BOSS_KEY || localStorage.getItem('boss_auto_key') || '';
                if (reportKey) {
                    try {
                        navigator.sendBeacon(reportApi + '/api/report',
                            new Blob([JSON.stringify({ key: reportKey, job: jobName, salary: jobSalary })],
                            { type: 'application/json' }));
                    } catch(e) {}
                }
            } else {
                var chatBtn = findBtn('继续沟通');
                if (chatBtn) {
                    status('已沟通过，跳过 - ' + jobName);
                    skipped++;
                } else {
                    status('无沟通按钮，跳过 - ' + jobName);
                    skipped++;
                }
                updateUI();
            }

            idx++;
            updateUI();
            await wait(1500);
        }

        running = false;
        // 正常结束（非限流）才显示完成信息
        if (!document.querySelector('.chat-block-dialog')) {
            status('完成！投递' + count + '个，跳过' + skipped + '个，共遍历' + idx + '个');
        }
    }

    document.getElementById('aa-start').onclick = run;
    document.getElementById('aa-stop').onclick = function () {
        running = false;
        status('已停止，投递' + count + '个，跳过' + skipped + '个，共遍历' + idx + '个');
    };
})();
