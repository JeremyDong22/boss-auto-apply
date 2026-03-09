// 滚动单元测试 v3 - 直接滚到底部触发加载，验证一步到位策略
// 使用方法：新建书签，将下面 javascript: 开头的一整行粘贴到 URL 栏
//
// javascript:void(function(){var panel=document.createElement('div');panel.id='scroll-test';if(document.getElementById('scroll-test'))document.getElementById('scroll-test').remove();panel.innerHTML='<div style="position:fixed;top:80px;right:20px;z-index:99999;background:%23333;color:%2300ff88;padding:16px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-family:monospace;min-width:360px;max-height:80vh;overflow-y:auto"><div style="font-size:15px;font-weight:bold;margin-bottom:12px;color:white">滚动测试 v3 - 滚到底</div><pre id="scroll-log" style="font-size:11px;line-height:1.5;margin:0;white-space:pre-wrap"></pre><div style="display:flex;gap:8px;margin-top:12px"><button id="scroll-test-run" style="flex:1;padding:8px;border:none;border-radius:6px;background:%2300ff88;color:%23333;font-weight:bold;cursor:pointer;font-size:13px">运行测试</button><button id="scroll-test-clear" style="flex:1;padding:8px;border:none;border-radius:6px;background:%23555;color:white;font-weight:bold;cursor:pointer;font-size:13px">清空</button></div></div>';document.body.appendChild(panel);var logEl=document.getElementById('scroll-log');function log(t){logEl.textContent+=t+'\n';logEl.scrollTop=logEl.scrollHeight;console.log('[滚动测试] '+t)}function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}function getCards(){return document.querySelectorAll('.job-card-wrap')}async function runTest(){log('===== 滚动测试 v3 (滚到底) =====');log('');log('策略: window.scrollTo(0, document.body.scrollHeight)');log('');for(var round=1;round<=5;round++){var beforeCards=getCards().length;var beforeH=document.body.scrollHeight;window.scrollTo(0,document.body.scrollHeight);await wait(2000);var afterCards=getCards().length;var afterH=document.body.scrollHeight;var newCards=afterCards-beforeCards;log('轮'+round+': 卡片 '+beforeCards+'->'+afterCards+(newCards>0?' [+'+newCards+'张!]':' [无新增]')+' pageH '+beforeH+'->'+afterH)}log('');log('===== 测试完成 =====')}document.getElementById('scroll-test-run').onclick=runTest;document.getElementById('scroll-test-clear').onclick=function(){logEl.textContent=''}}())

// ===== 可读版源码 =====

(function () {
    var panel = document.createElement('div');
    panel.id = 'scroll-test';
    if (document.getElementById('scroll-test')) document.getElementById('scroll-test').remove();

    panel.innerHTML = `
        <div style="position:fixed;top:80px;right:20px;z-index:99999;
            background:#333;color:#00ff88;padding:16px 20px;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,0.5);font-family:monospace;min-width:360px;max-height:80vh;overflow-y:auto">
            <div style="font-size:15px;font-weight:bold;margin-bottom:12px;color:white">滚动测试 v3 - 滚到底</div>
            <pre id="scroll-log" style="font-size:11px;line-height:1.5;margin:0;white-space:pre-wrap"></pre>
            <div style="display:flex;gap:8px;margin-top:12px">
                <button id="scroll-test-run" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:#00ff88;color:#333;font-weight:bold;cursor:pointer;font-size:13px">运行测试</button>
                <button id="scroll-test-clear" style="flex:1;padding:8px;border:none;border-radius:6px;
                    background:#555;color:white;font-weight:bold;cursor:pointer;font-size:13px">清空</button>
            </div>
        </div>`;
    document.body.appendChild(panel);

    var logEl = document.getElementById('scroll-log');

    function log(t) {
        logEl.textContent += t + '\n';
        logEl.scrollTop = logEl.scrollHeight;
        console.log('[滚动测试] ' + t);
    }

    function wait(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    function getCards() {
        return document.querySelectorAll('.job-card-wrap');
    }

    // 直接滚到页面底部，触发加载，5 轮测试
    async function runTest() {
        log('===== 滚动测试 v3 (滚到底) =====');
        log('');
        log('策略: window.scrollTo(0, document.body.scrollHeight)');
        log('');

        for (var round = 1; round <= 5; round++) {
            var beforeCards = getCards().length;
            var beforeH = document.body.scrollHeight;

            // 一步滚到底
            window.scrollTo(0, document.body.scrollHeight);
            await wait(2000);

            var afterCards = getCards().length;
            var afterH = document.body.scrollHeight;
            var newCards = afterCards - beforeCards;

            log('轮' + round + ': 卡片 ' + beforeCards + '->' + afterCards
                + (newCards > 0 ? ' [+' + newCards + '张!]' : ' [无新增]')
                + ' pageH ' + beforeH + '->' + afterH);
        }

        log('');
        log('===== 测试完成 =====');
    }

    document.getElementById('scroll-test-run').onclick = runTest;
    document.getElementById('scroll-test-clear').onclick = function () { logEl.textContent = ''; };
})();
