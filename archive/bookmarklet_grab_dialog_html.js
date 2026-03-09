// 抓取弹窗 HTML 工具 - Bookmarklet
// 用途：在 Boss 直聘点击"立即沟通"后，抓取弹出的对话框 HTML 到剪贴板
// 使用方法：新建书签，将下面 javascript: 开头的一整行粘贴到 URL 栏
//
// javascript:void(function(){var html='';var ds=document.querySelectorAll('[class*=dialog],[class*=modal],[class*=greet],[class*=popup],[class*=toast]');for(var i=0;i<ds.length;i++){if(ds[i].offsetParent!==null||ds[i].innerHTML.indexOf('继续沟通')!==-1||ds[i].innerHTML.indexOf('沟通')!==-1){html+=ds[i].outerHTML+'\n---\n'}}if(!html){html='未找到弹窗，尝试全页面搜索含沟通的元素:\n';var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){if(all[i].innerHTML.indexOf('继续沟通')!==-1&&all[i].children.length<10){html+=all[i].tagName+'.'+all[i].className+': '+all[i].outerHTML.substring(0,500)+'\n---\n'}}}navigator.clipboard.writeText(html).then(function(){alert('弹窗HTML已复制!('+html.length+'字符)')});console.log(html)}())
