// v13.2 - Boss 直聘自动投递 Bookmarklet
// v13.2 修复：礼花只在限流弹窗时触发，改为面板内持续喷射（不全屏），黄色暂停不再喷礼花
// v13.1 修复：暂停后继续会重复处理同一张卡片的 bug（idx 提前自增）
// v13 改进：停下后显示"继续"（接着投）和"重开"（清零重来），投递逻辑更完整
// v12 改进：面板添加 ClawBoss 吉祥物头像，版本号移至面板右下角极弱化显示
// v12 改进：解码 Boss PUA 字体加密薪资（U+E030~E039 → 0~9），修复薪资乱码
// v11 改进：每次点击"开始投递"时先验证卡密，无效则拦截并提示
// 通过 loader bookmarklet 从服务器加载，key 存储在 localStorage

// ===== 可读版源码 =====

(function () {
    'use strict';
    console.log('[ClawBoss] bookmarklet 开始执行');
    try {

    // 计数器：无固定上限，持续投递直到用户停止、到底、或触发限流
    var count = 0;    // 成功投递数
    var skipped = 0;  // 跳过数（已沟通/无按钮）
    var idx = 0;      // 当前遍历索引
    var running = false;
    var rateLimited = false;  // 是否因限流停止（区分正常暂停）
    var confettiTimer = null; // 持续礼花的定时器

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
        <div id="aa-inner" style="position:fixed;top:80px;right:20px;z-index:99999;
            background:linear-gradient(135deg,#00bebd,#00a8a7);color:white;
            padding:16px 20px;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:240px;
            transition:background 0.4s ease">
            <div id="aa-close" style="position:absolute;top:10px;right:14px;cursor:pointer;font-size:24px;opacity:0.7;line-height:1">\u00d7</div>
            <style>
                @keyframes aa-shake {
                    0%,100%{transform:translate(0,0) rotate(0)}
                    15%{transform:translate(-2px,1px) rotate(-1deg)}
                    30%{transform:translate(2px,-1px) rotate(1deg)}
                    45%{transform:translate(-1px,2px) rotate(-0.5deg)}
                    60%{transform:translate(1px,-2px) rotate(0.5deg)}
                    75%{transform:translate(-2px,-1px) rotate(-1deg)}
                    90%{transform:translate(2px,1px) rotate(0.5deg)}
                }
            </style>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <img id="aa-mascot" src="https://boss-frontend.preview.aliyun-zeabur.cn/images/mascot-typing.png" style="width:42px;height:auto;flex-shrink:0;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))" alt="">
                <div style="font-size:16px;font-weight:bold;line-height:1.2">ClawBoss</div>
            </div>
            <div id="aa-key-line" style="font-size:11px;margin-bottom:10px;opacity:0.85">
                ${currentKey ? currentKey + ' | 还能用' + remainDays + '天' : '还没给我看卡密'}
            </div>
            <div style="font-size:13px;margin-bottom:6px">帮你约了: <b id="aa-count">0</b> 个</div>
            <div style="font-size:13px;margin-bottom:6px">跳过了: <b id="aa-skipped">0</b> 个</div>
            <div style="font-size:13px;margin-bottom:12px">看过了: <b id="aa-total">0</b> 个</div>
            <div id="aa-status" style="font-size:12px;margin-bottom:12px;opacity:0.9">点下面按钮让我开始</div>
            <div style="display:flex;gap:8px;margin-bottom:10px">
                <button id="aa-start" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:white;color:#00bebd;font-weight:bold;cursor:pointer;font-size:14px">开投！</button>
                <button id="aa-stop" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:rgba(255,255,255,0.3);color:white;font-weight:bold;cursor:pointer;font-size:14px">停下</button>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.3);padding-top:10px;display:flex;gap:6px">
                <input id="aa-new-key" type="text" placeholder="新卡密" maxlength="14"
                    style="flex:1;padding:5px 8px;border:1px solid rgba(255,255,255,0.4);border-radius:4px;
                    background:rgba(255,255,255,0.15);color:white;font-size:12px;font-family:monospace;
                    outline:none;text-transform:uppercase" autocomplete="off" spellcheck="false">
                <button id="aa-change-key" style="padding:5px 10px;border:1px solid rgba(255,255,255,0.4);
                    border-radius:4px;background:rgba(255,255,255,0.2);color:white;font-size:12px;
                    cursor:pointer;white-space:nowrap">换卡密</button>
            </div>
            <div id="aa-key-msg" style="font-size:11px;margin-top:6px;display:none"></div>
            <a href="https://boss-frontend.preview.aliyun-zeabur.cn" target="_blank"
                style="display:block;text-align:center;margin-top:10px;font-size:11px;color:rgba(255,255,255,0.7);text-decoration:none"
                onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.7)'">买卡密 / 找客服</a>
            <div style="position:absolute;bottom:8px;right:12px;font-size:9px;opacity:0.35">v13.2</div>
        </div>`;
    document.body.appendChild(panel);

    // 检测是否在 Boss 直聘页面，不在则显示毛玻璃遮罩
    if (location.hostname.indexOf('zhipin.com') === -1) {
        var overlay = document.createElement('div');
        overlay.id = 'aa-not-boss';
        overlay.innerHTML = '<div style="position:absolute;top:0;left:0;width:100%;height:100%;' +
            'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
            'background:rgba(255,255,255,0.25);border-radius:12px;z-index:100000;' +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px">' +
            '<div style="font-size:14px;font-weight:600;color:#333;text-align:center;text-shadow:0 1px 2px rgba(255,255,255,0.6)">当前不在 Boss 直聘页面</div>' +
            '<a href="https://www.zhipin.com/web/geek/jobs?ka=header-jobs" style="' +
            'padding:8px 20px;background:linear-gradient(135deg,#00bebd,#00a8a7);color:#fff;' +
            'border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;' +
            'box-shadow:0 2px 8px rgba(0,190,189,0.4);transition:opacity 0.2s" ' +
            'onmouseover="this.style.opacity=\'0.85\'" onmouseout="this.style.opacity=\'1\'">前往 Boss 直聘</a>' +
            '</div>';
        var inner = document.getElementById('aa-inner');
        inner.appendChild(overlay);
    }

    // mascot 抖动控制：投递中抖，停下不抖
    function setMascotShake(on) {
        var m = document.getElementById('aa-mascot');
        if (m) m.style.animation = on ? 'aa-shake 0.4s linear infinite' : '';
    }

    // 面板颜色控制
    function setPanelColor(type) {
        var inner = document.getElementById('aa-inner');
        if (!inner) return;
        // 先清除闪烁动画
        inner.style.animation = '';
        var keyInput = document.getElementById('aa-new-key');
        if (keyInput) keyInput.style.animation = '';

        if (type === 'default') {
            inner.style.background = 'linear-gradient(135deg,#00bebd,#00a8a7)';
        } else if (type === 'yellow') {
            inner.style.background = 'linear-gradient(135deg,#f39c12,#e67e22)';
        } else if (type === 'gray') {
            inner.style.background = 'linear-gradient(135deg,#7f8c8d,#636e72)';
            // 换卡密输入框边框缓慢闪烁
            if (!document.getElementById('aa-blink-style')) {
                var st = document.createElement('style');
                st.id = 'aa-blink-style';
                st.textContent = '@keyframes aa-blink{0%,100%{border-color:rgba(255,255,255,0.3)}50%{border-color:#fff;box-shadow:0 0 8px rgba(255,255,255,0.8)}}';
                document.head.appendChild(st);
            }
            if (keyInput) keyInput.style.animation = 'aa-blink 1.5s ease-in-out infinite';
        }
    }

    // 礼花特效：面板内持续喷射（canvas-confetti 自定义 canvas）
    // 只在限流弹窗触发时调用，一直喷到用户重开或换卡密
    function startPanelConfetti() {
        stopPanelConfetti(); // 先清理旧的

        var inner = document.getElementById('aa-inner');
        if (!inner) return;

        // 在面板内创建 canvas 覆盖层
        var canvas = document.createElement('canvas');
        canvas.id = 'aa-confetti-canvas';
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100001;border-radius:12px';
        inner.appendChild(canvas);

        function launch() {
            // 用面板内的 canvas 创建 confetti 实例
            var panelConfetti = confetti.create(canvas, { resize: true });

            // 每隔 600ms 喷一波，一直喷
            confettiTimer = setInterval(function () {
                if (!document.getElementById('aa-confetti-canvas')) {
                    stopPanelConfetti();
                    return;
                }
                panelConfetti({ particleCount: 5, angle: 60, spread: 50, origin: { x: 0, y: 0.5 }, colors: ['#ff0', '#f0f', '#0ff', '#ff6600', '#00ff00'] });
                panelConfetti({ particleCount: 5, angle: 120, spread: 50, origin: { x: 1, y: 0.5 }, colors: ['#ff0', '#f0f', '#0ff', '#ff6600', '#00ff00'] });
            }, 600);
        }

        if (typeof confetti === 'function') {
            launch();
        } else {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
            s.onload = launch;
            document.head.appendChild(s);
        }
    }

    // 停止面板礼花
    function stopPanelConfetti() {
        if (confettiTimer) {
            clearInterval(confettiTimer);
            confettiTimer = null;
        }
        var canvas = document.getElementById('aa-confetti-canvas');
        if (canvas) canvas.remove();
    }

    // 关闭面板
    document.getElementById('aa-close').onclick = function () {
        running = false; setMascotShake(false);
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

        var api = window.__BOSS_API || 'https://boss.smartice.ai';
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

            // 换卡密成功 → 恢复默认颜色，停止闪烁
            setPanelColor('default');

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
        if (!key) return { valid: false, msg: '未找到卡密', expired: false };
        var api = window.__BOSS_API || 'https://boss.smartice.ai';
        try {
            var res = await fetch(api + '/api/check?key=' + encodeURIComponent(key));
            var data = await res.json();
            if (!data.ok) return { valid: false, msg: data.msg, expired: data.msg && data.msg.indexOf('过期') !== -1 };
            return { valid: true, info: data.info };
        } catch (e) {
            return { valid: false, msg: '网络错误: ' + e.message, expired: false };
        }
    }

    function wait(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    // 解码 Boss 直聘 PUA 字体加密的薪资数字（U+E030~U+E039 → 0~9）
    function decodeSalary(text) {
        return text.replace(/[\uE030-\uE039]/g, function(ch) {
            return String(ch.charCodeAt(0) - 0xE030);
        });
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

    // 检测"无法进行沟通"限流弹窗 → 点确定、停止运行、放礼花
    function checkChatBlock() {
        var dialog = document.querySelector('.chat-block-dialog');
        if (!dialog) return false;

        // 点击"确定"关闭弹窗
        var btn = dialog.querySelector('.sure-btn');
        if (btn) realClick(btn);

        // 停止运行
        running = false; setMascotShake(false);
        rateLimited = true;
        setBtnState('initial');

        // 面板内持续喷礼花庆祝投完了
        startPanelConfetti();

        status('🎉 今日已达150人上限！已投递' + count + '个，跳过' + skipped + '个');

        // 上报限流事件到后台
        var reportApi = window.__BOSS_API || 'https://boss.smartice.ai';
        var reportKey = window.__BOSS_KEY || localStorage.getItem('boss_auto_key') || '';
        if (reportKey) {
            try {
                fetch(reportApi + '/api/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: reportKey, job: '[限流] 今日已达150人上限', salary: '' })
                }).catch(function(){});
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

    // 按钮状态切换：运行中 / 已暂停 / 初始
    function setBtnState(state) {
        var startBtn = document.getElementById('aa-start');
        var stopBtn = document.getElementById('aa-stop');
        if (!startBtn || !stopBtn) return;

        if (state === 'running') {
            // 运行中：开投灰掉不可点，停下可点
            startBtn.textContent = '开投！';
            startBtn.style.opacity = '0.5';
            startBtn.style.cursor = 'not-allowed';
            startBtn.disabled = true;
            stopBtn.textContent = '停下';
            stopBtn.style.background = 'rgba(255,255,255,0.3)';
        } else if (state === 'paused') {
            // 已暂停：左边变"重开"，右边变"继续"
            startBtn.textContent = '重开';
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
            startBtn.disabled = false;
            stopBtn.textContent = '继续';
            stopBtn.style.background = 'rgba(255,255,255,0.3)';
        } else {
            // 初始状态
            startBtn.textContent = '开投！';
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
            startBtn.disabled = false;
            stopBtn.textContent = '停下';
            stopBtn.style.background = 'rgba(255,255,255,0.3)';
        }
    }

    // 主流程：无限滚动模式，全程监控限流弹窗
    // resetCounters: true=重新开始（清零），false=继续（保留计数和位置）
    async function run(resetCounters) {
        if (running) return;
        running = true;
        rateLimited = false;
        setMascotShake(true);
        stopPanelConfetti(); // 重新开始时停止礼花

        if (resetCounters !== false) {
            count = 0;
            skipped = 0;
            idx = 0;
            updateUI();
        }

        setBtnState('running');

        // 重置面板颜色
        setPanelColor('default');

        // 每次开始投递前验证卡密有效性
        status('验证卡密中...');
        var keyCheck = await checkKeyValid();
        if (!running) return;
        if (!keyCheck.valid) {
            running = false; setMascotShake(false);
            setBtnState('initial');
            if (keyCheck.expired) {
                // 卡密到期 → 灰色 + 输入框闪烁
                setPanelColor('gray');
                status('卡密已到期，请更换卡密');
            } else {
                setPanelColor('gray');
                status('卡密无效: ' + keyCheck.msg);
            }
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
            running = false; setMascotShake(false);
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
            var currentIdx = idx;  // 记录当前处理的索引
            idx++;                 // 立即自增，暂停后继续不会重复处理同一张卡
            scrollToCard(card);
            await wait(500);
            if (!running) break;
            if (checkChatBlock()) break;

            var name = card.querySelector('.job-name');
            var jobName = name ? name.textContent.trim() : '未知';
            var salaryEl = card.querySelector('.job-salary');
            var jobSalary = salaryEl ? decodeSalary(salaryEl.textContent.trim()) : '';
            status('[' + (currentIdx + 1) + '/' + cards.length + '] ' + jobName);

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

                // 静默上报投递记录
                var reportApi = window.__BOSS_API || 'https://boss.smartice.ai';
                var reportKey = window.__BOSS_KEY || localStorage.getItem('boss_auto_key') || '';
                if (reportKey) {
                    try {
                        fetch(reportApi + '/api/report', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: reportKey, job: jobName, salary: jobSalary })
                        }).catch(function(){});
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

            updateUI();
            await wait(1500);
        }

        running = false; setMascotShake(false);
        // 正常结束（非限流）→ 面板变黄，显示暂停态按钮（可继续或重开）
        // 限流结束时不覆盖（面板保持默认色 + 持续礼花）
        if (!rateLimited) {
            setPanelColor('yellow');
            setBtnState('paused');
            status('完成！投递' + count + '个，跳过' + skipped + '个，共遍历' + idx + '个');
        }
    }

    // "开投！" / "重开" 按钮：始终清零重来
    document.getElementById('aa-start').onclick = function () {
        run(true);
    };
    // "停下" / "继续" 按钮：根据当前文本切换行为
    document.getElementById('aa-stop').onclick = function () {
        var stopBtn = document.getElementById('aa-stop');
        if (stopBtn && stopBtn.textContent === '继续') {
            // 继续：从当前位置接着投，不清零
            run(false);
        } else {
            // 停下
            running = false; setMascotShake(false);
            setPanelColor('yellow');
            setBtnState('paused');
            status('已停止，投递' + count + '个，跳过' + skipped + '个，共遍历' + idx + '个');
        }
    };
    console.log('[ClawBoss] bookmarklet 面板已创建');
    } catch(e) { console.error('[ClawBoss] bookmarklet 执行出错:', e); alert('ClawBoss 出错: ' + e.message); }
})();
