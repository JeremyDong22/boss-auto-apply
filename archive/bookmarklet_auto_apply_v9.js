// v9 - Boss 直聘自动投递 Bookmarklet
// 改进：检测"继续沟通"跳过已沟通职位 | 无限滚动(window.scrollTo到底触发加载) | 面板三计数
// 使用方法：新建书签，将下面 javascript: 开头的一整行粘贴到 URL 栏
//
// javascript:void(function(){var count=0,skipped=0,idx=0,running=false;var panel=document.createElement('div');panel.id='aa-panel';if(document.getElementById('aa-panel'))document.getElementById('aa-panel').remove();panel.innerHTML='<div style="position:fixed;top:80px;right:20px;z-index:99999;background:linear-gradient(135deg,%2300bebd,%2300a8a7);color:white;padding:16px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:240px"><div style="font-size:16px;font-weight:bold;margin-bottom:12px">Boss 自动投递 v9</div><div style="font-size:13px;margin-bottom:6px">已投递: <b id="aa-count">0</b> 个</div><div style="font-size:13px;margin-bottom:6px">已跳过: <b id="aa-skipped">0</b> 个</div><div style="font-size:13px;margin-bottom:12px">已遍历: <b id="aa-total">0</b> 个</div><div id="aa-status" style="font-size:12px;margin-bottom:12px;opacity:0.9">点击开始按钮启动</div><div style="display:flex;gap:8px"><button id="aa-start" style="flex:1;padding:8px;border:none;border-radius:6px;background:white;color:%2300bebd;font-weight:bold;cursor:pointer;font-size:14px">开始投递</button><button id="aa-stop" style="flex:1;padding:8px;border:none;border-radius:6px;background:rgba(255,255,255,0.3);color:white;font-weight:bold;cursor:pointer;font-size:14px">停止</button></div></div>';document.body.appendChild(panel);function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}function status(t){var e=document.getElementById('aa-status');if(e)e.textContent=t;console.log('[自动投递] '+t)}function updateUI(){document.getElementById('aa-count').textContent=count;document.getElementById('aa-skipped').textContent=skipped;document.getElementById('aa-total').textContent=idx}function realClick(el){var rect=el.getBoundingClientRect();var x=rect.left+rect.width/2;var y=rect.top+rect.height/2;el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:x,clientY:y}));el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:x,clientY:y}));el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y}))}function findBtn(text){var els=document.querySelectorAll('a,button');for(var i=0;i<els.length;i++){if(els[i].textContent.trim()===text&&els[i].offsetParent!==null)return els[i]}return null}function checkChatBlock(){var d=document.querySelector('.chat-block-dialog');if(!d)return false;var b=d.querySelector('.sure-btn');if(b)realClick(b);running=false;status('已达今日沟通上限，自动停止。投递'+count+'个，跳过'+skipped+'个');return true}function closeDialog(){if(checkChatBlock())return true;var stay=document.querySelector('.greet-boss-dialog .cancel-btn');if(stay){realClick(stay);return true}var closeBtn=document.querySelector('.greet-boss-dialog .close');if(closeBtn){realClick(closeBtn);return true}return false}function getCards(){return document.querySelectorAll('.job-card-wrap')}function clickCard(card){var target=card.querySelector('.job-card-box')||card.querySelector('.job-info')||card;realClick(target)}function scrollToCard(card){var rect=card.getBoundingClientRect();var absTop=rect.top+window.scrollY;window.scrollTo(0,absTop-200)}async function tryScrollForMore(){var oldLen=getCards().length;var attempts=0;while(attempts<3&&running){window.scrollTo(0,Math.max(0,document.body.scrollHeight-2000));await wait(300);window.scrollTo(0,document.body.scrollHeight);await wait(2000);if(!running)return false;var newLen=getCards().length;if(newLen>oldLen)return true;attempts++}return false}async function run(){if(running)return;running=true;count=0;skipped=0;idx=0;updateUI();status('正在启动...');await wait(1000);if(!running)return;var initCards=getCards();if(!initCards||initCards.length===0){status('未找到职位卡片');running=false;return}status('找到 '+initCards.length+' 个职位');while(running){var cards=getCards();if(!cards||cards.length===0){status('未找到职位卡片');break}if(idx>=cards.length){status('当前卡片遍历完，加载更多...');var hasMore=await tryScrollForMore();if(!hasMore||!running)break;continue}var card=cards[idx];scrollToCard(card);await wait(500);if(!running)break;var name=card.querySelector('.job-name');var jobName=name?name.textContent:'未知';status('['+(idx+1)+'/'+cards.length+'] '+jobName);clickCard(card);await wait(2000);if(!running)break;var applyBtn=findBtn('立即沟通');if(applyBtn){status('点击立即沟通...');realClick(applyBtn);await wait(2000);if(!running)break;status('关闭弹窗...');closeDialog();await wait(1000);if(!running)break;count++;updateUI();status('已投递 '+jobName)}else{var chatBtn=findBtn('继续沟通');if(chatBtn){status('已沟通过，跳过 - '+jobName);skipped++}else{status('无沟通按钮，跳过 - '+jobName);skipped++}updateUI()}idx++;updateUI();await wait(1500)}running=false;status('完成！投递'+count+'个，跳过'+skipped+'个，共遍历'+idx+'个')}document.getElementById('aa-start').onclick=run;document.getElementById('aa-stop').onclick=function(){running=false;status('已停止，投递'+count+'个，跳过'+skipped+'个，共遍历'+idx+'个')}}())

// ===== 可读版源码 =====

(function () {
    'use strict';

    // v9 计数器：无固定上限，持续投递直到用户停止或到底
    var count = 0;    // 成功投递数
    var skipped = 0;  // 跳过数（已沟通/无按钮）
    var idx = 0;      // 当前遍历索引
    var running = false;

    // 防止重复面板
    var panel = document.createElement('div');
    panel.id = 'aa-panel';
    if (document.getElementById('aa-panel')) document.getElementById('aa-panel').remove();

    // 面板 UI：显示三个计数（已投递/已跳过/已遍历）
    panel.innerHTML = `
        <div style="position:fixed;top:80px;right:20px;z-index:99999;
            background:linear-gradient(135deg,#00bebd,#00a8a7);color:white;
            padding:16px 20px;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:240px">
            <div style="font-size:16px;font-weight:bold;margin-bottom:12px">Boss 自动投递 v9</div>
            <div style="font-size:13px;margin-bottom:6px">已投递: <b id="aa-count">0</b> 个</div>
            <div style="font-size:13px;margin-bottom:6px">已跳过: <b id="aa-skipped">0</b> 个</div>
            <div style="font-size:13px;margin-bottom:12px">已遍历: <b id="aa-total">0</b> 个</div>
            <div id="aa-status" style="font-size:12px;margin-bottom:12px;opacity:0.9">点击开始按钮启动</div>
            <div style="display:flex;gap:8px">
                <button id="aa-start" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:white;color:#00bebd;font-weight:bold;cursor:pointer;font-size:14px">开始投递</button>
                <button id="aa-stop" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:rgba(255,255,255,0.3);color:white;font-weight:bold;cursor:pointer;font-size:14px">停止</button>
            </div>
        </div>`;
    document.body.appendChild(panel);

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

    // 检测"无法进行沟通"限流弹窗，点确定并停止
    function checkChatBlock() {
        var dialog = document.querySelector('.chat-block-dialog');
        if (!dialog) return false;
        var btn = dialog.querySelector('.sure-btn');
        if (btn) realClick(btn);
        running = false;
        status('已达今日沟通上限，自动停止。投递' + count + '个，跳过' + skipped + '个');
        return true;
    }

    // 关闭弹窗：优先点"留在此页"，其次点关闭按钮
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

    // 滚动加载更多卡片：先回滚再冲到底部，确保有足够位移触发懒加载
    // 最多尝试 3 次，每次先滚上去再滚到底后等 2s
    // 如果卡片数量增加则返回 true，否则返回 false（到底了）
    async function tryScrollForMore() {
        var oldLen = getCards().length;
        var attempts = 0;

        while (attempts < 3 && running) {
            // 先滚到中间位置，确保后续滚到底有足够位移触发 scroll 事件
            window.scrollTo(0, Math.max(0, document.body.scrollHeight - 2000));
            await wait(300);
            // 再冲到底部
            window.scrollTo(0, document.body.scrollHeight);
            await wait(2000);
            if (!running) return false;

            var newLen = getCards().length;
            if (newLen > oldLen) return true;

            attempts++;
        }

        return false;
    }

    // 主流程：无限滚动模式
    async function run() {
        if (running) return;
        running = true;
        count = 0;
        skipped = 0;
        idx = 0;
        updateUI();
        status('正在启动...');
        await wait(1000);

        var initCards = getCards();
        if (!initCards || initCards.length === 0) {
            status('未找到职位卡片');
            running = false;
            return;
        }
        status('找到 ' + initCards.length + ' 个职位');

        // 无限循环，直到用户手动停止或到底
        while (running) {
            // 每次重新查询卡片
            var cards = getCards();
            if (!cards || cards.length === 0) { status('未找到职位卡片'); break; }

            // 当前卡片遍历完了，尝试滚动加载更多
            if (idx >= cards.length) {
                status('当前卡片遍历完，加载更多...');
                var hasMore = await tryScrollForMore();
                if (!hasMore) {
                    status('已到底，无更多职位');
                    break;
                }
                continue; // 有新卡片，回到循环顶部重新获取
            }

            var card = cards[idx];

            // 用 window 滚动到卡片位置
            scrollToCard(card);
            await wait(500);
            if (!running) break;

            var name = card.querySelector('.job-name');
            var jobName = name ? name.textContent : '未知';
            status('[' + (idx + 1) + '/' + cards.length + '] ' + jobName);

            // 用 realClick 点击卡片内部元素
            clickCard(card);
            await wait(2000);
            if (!running) break;

            // 优先找"立即沟通"按钮
            var applyBtn = findBtn('立即沟通');
            if (applyBtn) {
                status('点击立即沟通...');
                realClick(applyBtn);
                await wait(2000);
                if (!running) break;

                // 关闭弹窗
                status('关闭弹窗...');
                closeDialog();
                await wait(1000);
                if (!running) break;

                count++;
                updateUI();
                status('已投递 ' + jobName);
            } else {
                // 没有"立即沟通"，检查是否有"继续沟通"
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
        status('完成！投递' + count + '个，跳过' + skipped + '个，共遍历' + idx + '个');
    }

    document.getElementById('aa-start').onclick = run;
    document.getElementById('aa-stop').onclick = function () {
        running = false;
        status('已停止，投递' + count + '个，跳过' + skipped + '个，共遍历' + idx + '个');
    };
})();
