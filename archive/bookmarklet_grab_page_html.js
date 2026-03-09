// 抓取页面 HTML 工具 - Bookmarklet
// 用途：在 Boss 直聘无法打开 DevTools 的情况下，抓取页面 HTML 到剪贴板
// 使用方法：新建书签，将下面 javascript: 开头的一整行粘贴到 URL 栏
//
// javascript:void(navigator.clipboard.writeText(document.querySelector('.job-list-box,.search-job-result,.job-recommend-main')?.outerHTML||document.body.innerHTML.substring(0,50000)).then(function(){alert('HTML已复制到剪贴板！('+Math.round((document.querySelector('.job-list-box,.search-job-result,.job-recommend-main')?.outerHTML||document.body.innerHTML.substring(0,50000)).length/1024)+'KB)')}).catch(function(){var t=document.createElement('textarea');t.value=document.querySelector('.job-list-box,.search-job-result,.job-recommend-main')?.outerHTML||document.body.innerHTML.substring(0,50000);document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);alert('HTML已复制！')}))
