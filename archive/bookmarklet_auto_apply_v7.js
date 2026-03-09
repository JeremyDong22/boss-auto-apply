// v7 - Boss 直聘自动投递 Bookmarklet（最新版）
// 修复：每次循环重新查询卡片列表（Vue 重新渲染后 DOM 节点会变）
// 修复：正确定位下一个职位卡片并点击
// 使用方法：新建书签，将下面 javascript: 开头的一整行粘贴到 URL 栏
//
// javascript:void(function(){var MAX=5,count=0,idx=0,running=false;var panel=document.createElement('div');panel.id='aa-panel';panel.innerHTML='<div style="position:fixed;top:80px;right:20px;z-index:99999;background:linear-gradient(135deg,%2300bebd,%2300a8a7);color:white;padding:16px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:220px"><div style="font-size:16px;font-weight:bold;margin-bottom:12px">Boss 自动投递 v7</div><div style="font-size:13px;margin-bottom:8px">投递目标: <b id="aa-max">5</b> 个</div><div style="font-size:13px;margin-bottom:12px">已投递: <b id="aa-count">0</b> 个</div><div id="aa-status" style="font-size:12px;margin-bottom:12px;opacity:0.9">点击开始按钮启动</div><div style="display:flex;gap:8px"><button id="aa-start" style="flex:1;padding:8px;border:none;border-radius:6px;background:white;color:%2300bebd;font-weight:bold;cursor:pointer;font-size:14px">开始投递</button><button id="aa-stop" style="flex:1;padding:8px;border:none;border-radius:6px;background:rgba(255,255,255,0.3);color:white;font-weight:bold;cursor:pointer;font-size:14px">停止</button></div></div>';document.body.appendChild(panel);function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}function status(t){var e=document.getElementById('aa-status');if(e)e.textContent=t;console.log('[自动投递] '+t)}function findBtn(text){var els=document.querySelectorAll('a,button');for(var i=0;i<els.length;i++){if(els[i].textContent.trim()===text&&els[i].offsetParent!==null)return els[i]}return null}function closeDialog(){var stay=document.querySelector('.greet-boss-dialog .cancel-btn');if(stay){stay.click();return true}var closeBtn=document.querySelector('.greet-boss-dialog .close');if(closeBtn){closeBtn.click();return true}var iconClose=document.querySelector('.greet-boss-dialog .icon-close');if(iconClose){iconClose.click();return true}return false}function getCards(){return document.querySelectorAll('.job-card-wrap')}async function run(){if(running)return;running=true;count=0;idx=0;document.getElementById('aa-count').textContent='0';status('正在启动...');await wait(1000);var initCards=getCards();if(!initCards||initCards.length===0){status('未找到职位卡片');running=false;return}status('找到 '+initCards.length+' 个职位');while(running&&count<MAX){var cards=getCards();if(!cards||cards.length===0){status('未找到职位卡片');break}if(idx>=cards.length){status('当前页已遍历完毕');break}var card=cards[idx];var container=document.querySelector('.job-list-container');if(container){container.scrollTop=card.offsetTop-200}else{card.scrollIntoView({behavior:'smooth',block:'center'})}await wait(500);var name=card.querySelector('.job-name');status('['+(idx+1)+'/'+cards.length+'] '+(name?name.textContent:'未知'));card.click();await wait(2000);var btn=findBtn('立即沟通');if(btn){status('点击立即沟通...');btn.click();await wait(2000);status('点击留在此页...');closeDialog();await wait(1000);count++;document.getElementById('aa-count').textContent=count;status('已投递 '+count+'/'+MAX+' - '+(name?name.textContent:''))}else{status('第'+(idx+1)+'个无沟通按钮，跳过')}idx++;await wait(1500)}running=false;if(count>=MAX)status('完成！共投递'+count+'个')}document.getElementById('aa-start').onclick=run;document.getElementById('aa-stop').onclick=function(){running=false;status('已停止，共投递'+count+'个')}}())

// ===== 可读版源码 =====

(function () {
    'use strict';

    var MAX = 5;
    var count = 0;
    var idx = 0;
    var running = false;

    // 创建控制面板
    var panel = document.createElement('div');
    panel.id = 'aa-panel';
    panel.innerHTML = `
        <div style="position:fixed;top:80px;right:20px;z-index:99999;
            background:linear-gradient(135deg,#00bebd,#00a8a7);color:white;
            padding:16px 20px;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui;min-width:220px">
            <div style="font-size:16px;font-weight:bold;margin-bottom:12px">Boss 自动投递 v7</div>
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

    // 查找可见的按钮/链接（按文本内容匹配）
    function findBtn(text) {
        var els = document.querySelectorAll('a, button');
        for (var i = 0; i < els.length; i++) {
            if (els[i].textContent.trim() === text && els[i].offsetParent !== null) return els[i];
        }
        return null;
    }

    // 关闭弹窗：点击"留在此页"(.cancel-btn)
    function closeDialog() {
        // 首选：点击"留在此页"按钮
        var stay = document.querySelector('.greet-boss-dialog .cancel-btn');
        if (stay) { stay.click(); return true; }

        // 备选：点击关闭按钮
        var closeBtn = document.querySelector('.greet-boss-dialog .close');
        if (closeBtn) { closeBtn.click(); return true; }

        // 再备选：点击关闭图标
        var iconClose = document.querySelector('.greet-boss-dialog .icon-close');
        if (iconClose) { iconClose.click(); return true; }

        return false;
    }

    // 重新查询卡片列表（关键修复：Vue 重新渲染后 DOM 节点会变）
    function getCards() {
        return document.querySelectorAll('.job-card-wrap');
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
            // 每次循环重新获取卡片（防止 Vue 重新渲染导致 DOM 失效）
            var cards = getCards();
            if (!cards || cards.length === 0) {
                status('未找到职位卡片');
                break;
            }
            if (idx >= cards.length) {
                status('当前页已遍历完毕');
                break;
            }

            var card = cards[idx];

            // 滚动到卡片位置
            var container = document.querySelector('.job-list-container');
            if (container) {
                container.scrollTop = card.offsetTop - 200;
            } else {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            await wait(500);

            var name = card.querySelector('.job-name');
            status('[' + (idx + 1) + '/' + cards.length + '] ' + (name ? name.textContent : '未知'));

            // 点击职位卡片
            card.click();
            await wait(2000);

            // 点击"立即沟通"
            var btn = findBtn('立即沟通');
            if (btn) {
                status('点击立即沟通...');
                btn.click();
                await wait(2000);

                // 关闭弹窗（点击"留在此页"）
                status('点击留在此页...');
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
