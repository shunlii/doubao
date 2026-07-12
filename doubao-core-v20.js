// ==UserScript==
// @name         豆包极简对话导出工具 V20 (纯净版)
// @namespace    http://tampermonkey.net/
// @version      20.0
// @description  摒弃冗余功能，仅保留最核心的【导出当前对话】。完美支持普通对话与智能体，抓取成功率极高。
// @author       You
// @match        *://*.doubao.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (window._doubaoV20Injected) return;
    window._doubaoV20Injected = true;

    // --- 极简 UI 注入 ---
    const btnStyle = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        background-color: #3b82f6;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    const btn = document.createElement('button');
    btn.style.cssText = btnStyle;
    btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        导出当前对话
    `;
    
    btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    document.body.appendChild(btn);

    // --- 工具函数 ---
    const getCookie = (name) => {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : '';
    };

    const getCsrfToken = () => getCookie('passport_csrf_token') || getCookie('passport_csrf_token_default') || '';

    const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    const getUrlParams = () => {
        const device_id = getCookie('doubao_device_id') || uuidv4();
        const web_id = getCookie('s_v_web_id') || uuidv4();
        return new URLSearchParams({
            version_code: '20800', language: 'zh', device_platform: 'web', aid: '497858',
            real_aid: '497858', pkg_type: 'release_version', device_id, web_id, tea_uuid: web_id,
            region: 'CN', sys_region: 'CN', samantha_web: '1', web_platform: 'browser',
            use_olympus_account: '1', web_tab_id: uuidv4()
        }).toString();
    };

    const getTitle = () => {
        let t = '';
        try {
            const el = document.querySelector('[data-testid="header-title"]') || 
                       document.querySelector('h1[class*="title"]') ||
                       document.querySelector('[class*="header"] [class*="title"]');
            if (el) t = el.innerText.trim();
        } catch(e) {}
        if (!t || t === '豆包') t = document.title.replace(' - 豆包', '').trim();
        return t || '对话';
    };

    // --- 导出逻辑 ---
    const startExport = async (conv) => {
        const url = `https://www.doubao.com/im/chain/single?${getUrlParams()}`;
        let allMessages = [];
        let anchorIndex = 9007199254740991;
        let direction = 1;
        let page = 0;

        btn.innerHTML = '正在拉取数据...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';

        try {
            while (true) {
                page++;
                const payload = {
                    cmd: 3100,
                    uplink_body: { pull_singe_chain_uplink_body: {
                        conversation_id: conv.id, anchor_index: anchorIndex, conversation_type: conv.type,
                        direction: direction, limit: 50, ext: {}, filter: { index_list: [] }, evaluate_ab_params: "", evaluate_common_params: ""
                    }},
                    sequence_id: uuidv4(), channel: 2, version: "1"
                };

                const res = await fetch(url, {
                    method: 'POST', credentials: 'include',
                    headers: { 'content-type': 'application/json; encoding=utf-8', 'accept': 'application/json', 'origin': 'https://www.doubao.com', 'referer': 'https://www.doubao.com/chat/', 'x-tt-passport-csrf-token': getCsrfToken() },
                    body: JSON.stringify(payload)
                });
                
                const data = await res.json();
                const body = (data.downlink_body||{}).pull_singe_chain_downlink_body || (data.downlink_body||{}).pull_single_chain_downlink_body || {};
                const messages = (body.messages || []).filter(m => m && typeof m === 'object');
                
                if (messages.length === 0) break;
                
                allMessages = allMessages.concat(messages);
                btn.innerHTML = `已拉取 ${allMessages.length} 条...`;
                
                if (messages.length < 50) break;

                const oldest = messages.reduce((prev, curr) => parseInt(prev.index_in_conv||0) < parseInt(curr.index_in_conv||0) ? prev : curr);
                anchorIndex = parseInt(oldest.index_in_conv||0);
                direction = 0;
                await new Promise(r => setTimeout(r, 300));
            }

            if (allMessages.length === 0) {
                alert('该对话无内容或拉取失败。');
                return;
            }

            // 转换 Markdown
            allMessages.sort((a, b) => parseInt(a.index_in_conv||0) - parseInt(b.index_in_conv||0));
            let md = `# ${conv.title}\n\n`;
            
            allMessages.forEach(m => {
                const isUser = m.user_type === 1;
                const speaker = isUser ? '用户' : (conv.isAgent ? conv.botName || '智能体' : '豆包');
                let text = '';
                let thinking = '';

                if (Array.isArray(m.content_block)) {
                    m.content_block.forEach(b => {
                        if (b.type === 'text') {
                            text += (typeof b.text === 'object' ? JSON.stringify(b.text) : b.text || '') + '\n';
                        } else if (b.type === 'thinking' && b.thinking_content) {
                            thinking += b.thinking_content + '\n';
                        }
                    });
                }
                
                if (m.thinking_content) thinking = m.thinking_content;
                if (!text.trim()) text = typeof m.content === 'object' ? JSON.stringify(m.content) : m.content || m.tts_content || '';
                if (!text.trim()) text = '[此条消息为空]';

                md += `### ${speaker}\n`;
                if (thinking.trim()) md += `> **思考过程:**\n> ${thinking.trim().split('\n').join('\n> ')}\n\n`;
                md += `${text.trim()}\n\n---\n\n`;
            });

            // 下载
            const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const safeTitle = String(conv.title).replace(/[\\/*?:"<>|\r\n]/g, "").substring(0, 40);
            a.href = downloadUrl;
            a.download = `${safeTitle}.md`;
            a.click();
            URL.revokeObjectURL(downloadUrl);
            
            // 可在此处补充卡密扣除逻辑 (如需要)
            
        } catch(err) {
            alert('导出发生错误: ' + err.message);
        } finally {
            btn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                导出当前对话
            `;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    };

    // --- 主入口 ---
    btn.addEventListener('click', async () => {
        const pathname = window.location.pathname;
        const matchRegular = pathname.match(/\/chat\/(\d+)(?![\w/])/);
        const matchBot = pathname.match(/\/(?:chat\/)?bot\/(?:chat\/)?(\d+)/);
        const title = getTitle();

        if (matchRegular) {
            // 普通对话
            const convId = matchRegular[1];
            startExport({ id: convId, title, type: 3, isAgent: false, botName: title });

        } else if (matchBot) {
            // 智能体对话
            const botId = matchBot[1];
            btn.innerHTML = '正在解析智能体...';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';

            try {
                // 核心逻辑: 调用 recent_conv 获取真实的 conversation_id
                const recentUrl = `https://www.doubao.com/im/chain/recent_conv?${getUrlParams()}`;
                const res = await fetch(recentUrl, {
                    method: 'POST', credentials: 'include',
                    headers: { 'content-type': 'application/json; encoding=utf-8', 'accept': 'application/json', 'origin': 'https://www.doubao.com', 'referer': 'https://www.doubao.com/chat/', 'x-tt-passport-csrf-token': getCsrfToken() },
                    body: JSON.stringify({
                        cmd: 3200,
                        uplink_body: { pull_recent_conv_chain_uplink_body: {
                            limit: 50, message_count_per_conv: 1, api_version: 1, conv_version: 0, direction: 3,
                            option: { not_need_message: false, need_complete_conversation: true, need_coco_conversation: true, need_coco_bot: true, need_pc_pin_chain: true, pc_pin_query_type: 0 }
                        }},
                        sequence_id: uuidv4(), channel: 2, version: '1'
                    })
                });

                const data = await res.json();
                const items = ((data.downlink_body||{}).pull_recent_conv_chain_downlink_body||{}).conversations || ((data.downlink_body||{}).pull_recent_conv_chain_downlink_body||{}).messages || [];
                
                let foundConvId = null;
                for (const item of items) {
                    const c = item.conversation || item;
                    if ((c.bot_info && String(c.bot_info.bot_id) === botId) || (c.coco_bot && String(c.coco_bot.bot_id) === botId)) {
                        foundConvId = String(c.conversation_id || item.id);
                        break;
                    }
                }

                if (foundConvId) {
                    startExport({ id: foundConvId, title, type: 3, isAgent: true, botName: title });
                } else {
                    alert('未在最近会话中找到该智能体！\n请在当前聊天框发送一句"你好"并刷新页面后重试。');
                    btn.innerHTML = '导出当前对话';
                    btn.style.pointerEvents = 'auto';
                    btn.style.opacity = '1';
                }
            } catch(e) {
                alert('解析智能体失败: ' + e.message);
                btn.innerHTML = '导出当前对话';
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
            }
        } else {
            alert('请先在豆包页面左侧点击进入一个具体的对话，然后再点击此按钮！');
        }
    });

})();
