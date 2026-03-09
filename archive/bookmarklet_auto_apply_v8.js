// v8 - Boss 直聘自动投递 Bookmarklet
// 修复：用 MouseEvent 模拟真实点击，尝试多个点击目标（job-card-box, job-info）
// 使用方法：新建书签，将下面 javascript: 开头的一整行粘贴到 URL 栏
//
// javascript:void(function(){var MAX=5,count=0,idx=0,running=false;var panel=document.createElement('div');panel.id='aa-panel';if(document.getElementById('aa-panel'))document.getElementById('aa-panel').remove();panel.innerHTML='<div style="position:fixed;top:80px;right:20px;z-index:99999;background:linear-gradient(135deg,%2300bebd,%2300a8a7);color:white;padding:16px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:220px"><div style="font-size:16px;font-weight:bold;margin-bottom:12px">Boss 自动投递 v8</div><div style="font-size:13px;margin-bottom:8px">投递目标: <b id="aa-max">5</b> 个</div><div style="font-size:13px;margin-bottom:12px">已投递: <b id="aa-count">0</b> 个</div><div id="aa-status" style="font-size:12px;margin-bottom:12px;opacity:0.9">点击开始按钮启动</div><div style="display:flex;gap:8px"><button id="aa-start" style="flex:1;padding:8px;border:none;border-radius:6px;background:white;color:%2300bebd;font-weight:bold;cursor:pointer;font-size:14px">开始投递</button><button id="aa-stop" style="flex:1;padding:8px;border:none;border-radius:6px;background:rgba(255,255,255,0.3);color:white;font-weight:bold;cursor:pointer;font-size:14px">停止</button></div></div>';document.body.appendChild(panel);function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}function status(t){var e=document.getElementById('aa-status');if(e)e.textContent=t;console.log('[自动投递] '+t)}function realClick(el){var rect=el.getBoundingClientRect();var x=rect.left+rect.width/2;var y=rect.top+rect.height/2;el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:x,clientY:y}));el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:x,clientY:y}));el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y}))}function findBtn(text){var els=document.querySelectorAll('a,button');for(var i=0;i<els.length;i++){if(els[i].textContent.trim()===text&&els[i].offsetParent!==null)return els[i]}return null}function closeDialog(){var stay=document.querySelector('.greet-boss-dialog .cancel-btn');if(stay){realClick(stay);return true}var closeBtn=document.querySelector('.greet-boss-dialog .close');if(closeBtn){realClick(closeBtn);return true}return false}function getCards(){return document.querySelectorAll('.job-card-wrap')}function clickCard(card){var target=card.querySelector('.job-card-box')||card.querySelector('.job-info')||card;realClick(target)}async function run(){if(running)return;running=true;count=0;idx=0;document.getElementById('aa-count').textContent='0';status('正在启动...');await wait(1000);var initCards=getCards();if(!initCards||initCards.length===0){status('未找到职位卡片');running=false;return}status('找到 '+initCards.length+' 个职位');while(running&&count<MAX){var cards=getCards();if(!cards||cards.length===0){status('未找到职位卡片');break}if(idx>=cards.length){status('当前页已遍历完毕');break}var card=cards[idx];var container=document.querySelector('.job-list-container');if(container){container.scrollTop=card.offsetTop-200}else{card.scrollIntoView({behavior:'smooth',block:'center'})}await wait(500);var name=card.querySelector('.job-name');status('['+(idx+1)+'/'+cards.length+'] '+(name?name.textContent:'未知'));clickCard(card);await wait(2000);var btn=findBtn('立即沟通');if(btn){status('点击立即沟通...');realClick(btn);await wait(2000);status('关闭弹窗...');closeDialog();await wait(1000);count++;document.getElementById('aa-count').textContent=count;status('已投递 '+count+'/'+MAX+' - '+(name?name.textContent:''))}else{status('第'+(idx+1)+'个无沟通按钮，跳过')}idx++;await wait(1500)}running=false;if(count>=MAX)status('完成！共投递'+count+'个')}document.getElementById('aa-start').onclick=run;document.getElementById('aa-stop').onclick=function(){running=false;status('已停止，共投递'+count+'个')}}())

// ===== 可读版源码 =====

(function () {
    'use strict';

    var MAX = 5;
    var count = 0;
    var idx = 0;
    var running = false;

    // 防止重复面板
    var panel = document.createElement('div');
    panel.id = 'aa-panel';
    if (document.getElementById('aa-panel')) document.getElementById('aa-panel').remove();

    panel.innerHTML = `
        <div style="position:fixed;top:80px;right:20px;z-index:99999;
            background:linear-gradient(135deg,#00bebd,#00a8a7);color:white;
            padding:16px 20px;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:220px">
            <div style="font-size:16px;font-weight:bold;margin-bottom:12px">Boss 自动投递 v8</div>
            <div style="font-size:13px;margin-bottom:8px">投递目标: <b id="aa-max">${MAX}</b> 个</div>
            <div style="font-size:13px;margin-bottom:12px">已投递: <b id="aa-count">0</b> 个</div>
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

    // 模拟真实鼠标点击（mousedown → mouseup → click，带坐标）
    function realClick(el) {
        var rect = el.getBoundingClientRect();
        var x = rect.left + rect.width / 2;
        var y = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }

    // 查找可见按钮
    function findBtn(text) {
        var els = document.querySelectorAll('a, button');
        for (var i = 0; i < els.length; i++) {
            if (els[i].textContent.trim() === text && els[i].offsetParent !== null) return els[i];
        }
        return null;
    }

    // 关闭弹窗
    function closeDialog() {
        var stay = document.querySelector('.greet-boss-dialog .cancel-btn');
        if (stay) { realClick(stay); return true; }

        var closeBtn = document.querySelector('.greet-boss-dialog .close');
        if (closeBtn) { realClick(closeBtn); return true; }

        return false;
    }

    // 获取卡片列表（每次重新查询）
    function getCards() {
        return document.querySelectorAll('.job-card-wrap');
    }

    // 点击卡片：优先点内部的 .job-card-box 或 .job-info
    function clickCard(card) {
        var target = card.querySelector('.job-card-box') || card.querySelector('.job-info') || card;
        realClick(target);
    }

    // 主流程
    async function run() {
        if (running) return;
        running = true;
        count = 0;
        idx = 0;
        document.getElementById('aa-count').textContent = '0';
        status('正在启动...');
        await wait(1000);

        var initCards = getCards();
        if (!initCards || initCards.length === 0) {
            status('未找到职位卡片');
            running = false;
            return;
        }
        status('找到 ' + initCards.length + ' 个职位');

        while (running && count < MAX) {
            // 每次重新查询卡片
            var cards = getCards();
            if (!cards || cards.length === 0) { status('未找到职位卡片'); break; }
            if (idx >= cards.length) { status('当前页已遍历完毕'); break; }

            var card = cards[idx];

            // 滚动到卡片
            var container = document.querySelector('.job-list-container');
            if (container) {
                container.scrollTop = card.offsetTop - 200;
            } else {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            await wait(500);

            var name = card.querySelector('.job-name');
            status('[' + (idx + 1) + '/' + cards.length + '] ' + (name ? name.textContent : '未知'));

            // 用 realClick 点击卡片内部元素
            clickCard(card);
            await wait(2000);

            // 点击"立即沟通"
            var btn = findBtn('立即沟通');
            if (btn) {
                status('点击立即沟通...');
                realClick(btn);
                await wait(2000);

                // 关闭弹窗
                status('关闭弹窗...');
                closeDialog();
                await wait(1000);

                count++;
                document.getElementById('aa-count').textContent = count;
                status('已投递 ' + count + '/' + MAX + ' - ' + (name ? name.textContent : ''));
            } else {
                status('第' + (idx + 1) + '个无沟通按钮，跳过');
            }

            idx++;
            await wait(1500);
        }

        running = false;
        if (count >= MAX) status('完成！共投递' + count + '个');
    }

    document.getElementById('aa-start').onclick = run;
    document.getElementById('aa-stop').onclick = function () {
        running = false;
        status('已停止，共投递' + count + '个');
    };
})();
