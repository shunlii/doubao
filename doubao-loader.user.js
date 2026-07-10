// ==UserScript==
// @name         豆包对话导出工具
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  极简风格，支持 6 种导出格式。
// @author       You
// @match        https://www.doubao.com/*
// @grant        GM_addElement
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    
    const REMOTE_CORE_URL = 'https://cdn.jsdmirror.com/gh/shunlii/doubao@db3/doubao-core.js';
    const urlWithTimestamp = REMOTE_CORE_URL + '?t=' + new Date().getTime();

    GM_addElement('script', {
        src: urlWithTimestamp,
        type: 'text/javascript'
    });
})();