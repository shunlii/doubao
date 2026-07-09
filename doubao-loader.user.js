// ==UserScript==
// @name         豆包对话导出工具 (动态加载版)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  极简风格，支持 6 种导出格式。核心逻辑已分离并进行远端动态加载。
// @author       shun
// @match        https://www.doubao.com/*
// @grant        GM_addElement
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    
    // 【修改此处】: 替换为您托管的 CDN 地址 (注意：您提供的链接是原代码，如果您传了混淆后的代码，请自行改后缀)
    const REMOTE_CORE_URL = 'https://cdn.jsdmirror.com/gh/shunlii/doubao@main/doubao-core.js';
    
    // 附加防缓存时间戳，确保用户每次都能拿到您 CDN 上的最新代码
    const urlWithTimestamp = REMOTE_CORE_URL + '?t=' + new Date().getTime();

    // 使用 Tampermonkey 提供的专属 API 动态注入外部脚本，它可以直接绕过目标网站严格的 CSP 限制
    GM_addElement('script', {
        src: urlWithTimestamp,
        type: 'text/javascript'
    });
})();
