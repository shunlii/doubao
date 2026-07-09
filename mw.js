
(function() {
  if (window._doubaoExporterInjected) return;
  window._doubaoExporterInjected = true;

  // ================= 核心工具函数 =================
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getUrlParams() {
    const realDeviceId = getCookie('device_id') || getCookie('odin_tt') || uuidv4();
    const realWebId = getCookie('web_id') || uuidv4();

    const params = new URLSearchParams({
      version_code: "20800", language: "zh", device_platform: "web",
      aid: "497858", real_aid: "497858", pkg_type: "release_version",
      pc_version: "3.26.4", 
      device_id: realDeviceId, web_id: realWebId, tea_uuid: realWebId,
      region: "CN", sys_region: "CN",
      samantha_web: "1", web_platform: "browser", use_olympus_account: "1",
      web_tab_id: uuidv4()
    });
    return params.toString();
  }

  function getCsrfToken() {
    return getCookie('passport_csrf_token') || getCookie('passport_csrf_token_default') || '';
  }

  function extractTextFromContent(contentRaw) {
    if (!contentRaw) return "";
    try {
      const obj = typeof contentRaw === 'string' ? JSON.parse(contentRaw) : contentRaw;
      if (typeof obj === 'string') return obj;
      if (typeof obj === 'object' && obj !== null) {
        const texts = [];
        function traverse(node) {
          if (typeof node === 'string') {
            texts.push(node);
          } else if (Array.isArray(node)) {
            node.forEach(traverse);
          } else if (typeof node === 'object' && node !== null) {
            if (node.text) traverse(node.text);
            else if (node.content) traverse(node.content);
            else Object.values(node).forEach(traverse);
          }
        }
        traverse(obj);
        return texts.length > 0 ? texts.join('\n') : JSON.stringify(obj, null, 2);
      }
      return String(obj);
    } catch (e) {
      return typeof contentRaw === 'object' ? JSON.stringify(contentRaw, null, 2) : String(contentRaw);
    }
  }

  function getConversationCategory(conv) {
    const botType = conv.bot_type;
    const botId = conv.bot_id || (conv.bot_info && conv.bot_info.bot_id) || "";
    const templateId = (conv.conv_extra || {}).template_id;
    const name = conv.name || (conv.bot_info && conv.bot_info.bot_name) || "";

    if (botType === 2 || templateId) return '智能体';
    if (botId && botId !== "7338286299411103781") return '智能体';
    if (botType === 1 || botType === 3 || name === "豆包") return '豆包';
    return '普通对话';
  }

  function extractAvatarUrl(conv) {
    if (conv.bot_info) return conv.bot_info.bot_avatar || conv.bot_info.avatar || conv.bot_info.icon || conv.bot_info.bot_icon_url || '';
    if (conv.inner_bot) return conv.inner_bot.inner_bot_icon_url || conv.inner_bot.icon_url || '';
    return conv.icon_url || (conv.image && conv.image.url) || '';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag]));
  }

  // ================= 样式与 UI =================
  const container = document.createElement('div');
  container.id = 'doubao-exporter-root';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;';
  document.body.appendChild(container);

  const shadow = container.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      --primary-color: #3b82f6; --primary-hover: #2563eb;
      --bg-color: #ffffff; --bg-secondary: #f3f4f6;
      --text-primary: #111827; --text-secondary: #6b7280;
      --border-color: #e5e7eb;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .fab { width: 56px; height: 56px; border-radius: 28px; background-color: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.2s; position: absolute; bottom: 0; right: 0; }
    .fab:hover { transform: scale(1.05); }
    
    .panel { position: absolute; bottom: 70px; right: 0; width: 440px; height: 580px; background-color: var(--bg-color); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; opacity: 0; pointer-events: none; transform: translateY(20px); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .panel.open { opacity: 1; pointer-events: auto; transform: translateY(0); }
    
    .header { padding: 16px 20px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
    .header h1 { margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600; }
    
    /* Toolbar: Format and Switch */
    .toolbar { padding: 16px 20px; border-bottom: 1px solid var(--border-color); background-color: #fff; }
    .format-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .format-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color); color: var(--text-secondary); font-size: 13px; cursor: pointer; transition: all 0.2s; user-select: none; }
    .format-btn:hover { background: var(--bg-secondary); }
    .format-btn.active { background: #eff6ff; border-color: #bfdbfe; color: var(--primary-color); font-weight: 500; }
    .format-btn svg { width: 16px; height: 16px; stroke-width: 2; }
    
    .toggle-row { display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); padding: 10px 14px; border-radius: 8px; }
    .toggle-label { font-size: 13px; color: var(--text-primary); font-weight: 500; display: flex; align-items: center; gap: 6px; }
    
    /* iOS Switch */
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 24px; }
    .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
    input:checked + .slider { background-color: var(--primary-color); }
    input:checked + .slider:before { transform: translateX(20px); }

    .conv-list { flex: 1; overflow-y: auto; padding: 12px; }
    .conv-item { display: flex; align-items: center; padding: 12px; margin-bottom: 8px; border-radius: 8px; background-color: #fff; border: 1px solid transparent; cursor: pointer; transition: all 0.2s; }
    .conv-item:hover { border-color: var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    
    .bot-avatar { width: 42px; height: 42px; border-radius: 50%; margin-right: 12px; object-fit: cover; background-color: var(--bg-secondary); flex-shrink: 0; }
    .conv-info { flex: 1; min-width: 0; }
    .conv-title { font-size: 14px; color: var(--text-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
    .agent-badge { font-size: 10px; background-color: #8b5cf6; color: white; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; font-weight: 500; }
    .conv-meta { font-size: 12px; color: var(--text-secondary); }
    
    .btn { background-color: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; flex-shrink: 0; transition: background 0.2s; }
    .btn:hover { background-color: var(--primary-hover); }
    
    .loading { text-align: center; padding: 40px; color: var(--text-secondary); font-size: 14px; }
    
    .overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.8); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
    .overlay.active { opacity: 1; pointer-events: auto; z-index: 10; }
    .progress-card { background: var(--bg-color); padding: 24px; border-radius: 12px; width: 75%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 1px solid var(--border-color); }
    .progress-card h3 { margin: 0 0 16px 0; font-size: 16px; color: var(--text-primary); }
    .bar { height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
    .bar-fill { height: 100%; width: 0%; background: var(--primary-color); transition: width 0.3s ease-out; }
    .stats { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 16px; color: var(--text-secondary); }
    .cancel-btn { width: 100%; padding: 8px; background: transparent; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
    .cancel-btn:hover { background: var(--bg-secondary); }
  `;

  // SVG Icons
  const icons = {
    md: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    json: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    txt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>',
    word: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z"></path><path d="M14 3v5h5M9 10l1 5 1.5-4h1L14 15l1-5"></path></svg>'
  };

  const template = `
    <div class="fab" id="fab">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    </div>
    <div class="panel" id="panel">
      <div class="header">
        <h1>豆包对话导出工具</h1>
        <button id="refresh-btn" style="background:none;border:none;color:var(--primary-color);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 2.63-6.37L21 8"></path></svg> 刷新列表
        </button>
      </div>
      <div class="toolbar">
        <div class="format-grid" id="format-grid">
          <div class="format-btn active" data-fmt="md">${icons.md} Markdown</div>
          <div class="format-btn" data-fmt="json">${icons.json} JSON</div>
          <div class="format-btn" data-fmt="txt">${icons.txt} TXT</div>
          <div class="format-btn" data-fmt="html">${icons.html} HTML</div>
          <div class="format-btn" data-fmt="pdf">${icons.pdf} PDF</div>
          <div class="format-btn" data-fmt="word">${icons.word} Word</div>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">极简核心提取 (仅对话内容)</div>
          <label class="switch">
            <input type="checkbox" id="core-switch">
            <span class="slider"></span>
          </label>
        </div>
      </div>
      <div class="conv-list" id="list"><div class="loading">正在初始化...</div></div>
      <div class="overlay" id="overlay">
        <div class="progress-card">
          <h3 id="export-title">拉取中</h3>
          <div class="bar"><div class="bar-fill" id="fill"></div></div>
          <div class="stats"><span id="p-count">0 条</span><span id="p-page">第 1 页</span></div>
          <button class="cancel-btn" id="cancel-btn">取消</button>
        </div>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;
  shadow.appendChild(wrapper);

  // ================= 逻辑处理 =================
  const fab = shadow.getElementById('fab');
  const panel = shadow.getElementById('panel');
  const listEl = shadow.getElementById('list');
  const formatBtns = shadow.querySelectorAll('.format-btn');
  const coreSwitch = shadow.getElementById('core-switch');
  const refreshBtn = shadow.getElementById('refresh-btn');
  
  const overlay = shadow.getElementById('overlay');
  const exportTitle = shadow.getElementById('export-title');
  const fill = shadow.getElementById('fill');
  const pCount = shadow.getElementById('p-count');
  const pPage = shadow.getElementById('p-page');
  const cancelBtn = shadow.getElementById('cancel-btn');

  let currentFormat = 'md';
  let allConversations = [];
  let abortExport = false;
  let isPanelOpen = false;
  let dataLoaded = false;

  // 绑定格式切换
  formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      formatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFormat = btn.dataset.fmt;
    });
  });

  fab.addEventListener('click', async () => {
    isPanelOpen = !isPanelOpen;
    if (isPanelOpen) {
      panel.classList.add('open');
      if (!dataLoaded) { await loadConversations(); dataLoaded = true; }
    } else {
      panel.classList.remove('open');
    }
  });

  refreshBtn.addEventListener('click', async () => {
    if (!abortExport && overlay.classList.contains('active')) return;
    await loadConversations();
  });

  async function loadConversations() {
    listEl.innerHTML = '<div class="loading">正在拉取会话列表...</div>';
    try {
      const url = `https://www.doubao.com/im/chain/recent_conv?${getUrlParams()}`;
      const payload = {
        cmd: 3200,
        uplink_body: { pull_recent_conv_chain_uplink_body: {
            limit: 50, message_count_per_conv: 1, api_version: 1, conv_version: 0, direction: 3,
            option: { not_need_message: false, need_complete_conversation: true, need_coco_conversation: true, need_coco_bot: true, need_pc_pin_chain: true, pc_pin_query_type: 0 }
        }},
        sequence_id: uuidv4(), channel: 2, version: "1"
      };

      const response = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json; encoding=utf-8', 'accept': 'application/json', 'origin': 'https://www.doubao.com', 'referer': 'https://www.doubao.com/chat/', 'x-tt-passport-csrf-token': getCsrfToken() },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      const code = data.status_code !== undefined ? data.status_code : data.code;
      if (code !== 0) throw new Error(data.status_msg || "鉴权失败");

      const cells = ((data.downlink_body || {}).pull_recent_conv_chain_downlink_body || {}).cells || [];
      allConversations = cells.map(cell => {
        const conv = cell.conversation || {};
        let title = "未知会话";
        let isAgent = false;
        
        const categoryText = getConversationCategory(conv);
        if (categoryText === '智能体') isAgent = true;

        if (conv.bot_info && conv.bot_info.bot_name) {
          title = conv.bot_info.bot_name;
        } else if (conv.conversation_name || conv.name) {
          title = conv.conversation_name || conv.name;
        } else if (conv.messages && conv.messages.length > 0) {
          const text = extractTextFromContent(conv.messages[0].content || "");
          title = text.length > 30 ? text.substring(0, 30) + "..." : text;
        } else {
          title = `会话 ${String(conv.conversation_id || cell.id).slice(-6)}`;
        }
        
        return {
          id: String(conv.conversation_id || cell.id),
          title,
          type: conv.conversation_type || 0,
          isPinned: Boolean(conv.pinned_time && conv.pinned_time !== "0"),
          avatarUrl: extractAvatarUrl(conv),
          categoryText: categoryText,
          isAgent: isAgent,
          botId: conv.bot_info ? conv.bot_info.bot_id : null,
          botName: conv.bot_info ? conv.bot_info.bot_name : null
        };
      });

      renderList(allConversations);
      
      const tip = document.createElement('div');
      tip.style.cssText = 'text-align:center; padding: 12px; font-size: 12px; color: #9ca3af; border-top: 1px solid #eee; margin-top: 8px;';
      tip.innerText = '仅显示默认加载的条数。未找到？请尝试向下滑动豆包左侧栏后，点击刷新列表。';
      listEl.appendChild(tip);
    } catch (err) {
      listEl.innerHTML = `<div class="loading" style="color:#ef4444">加载失败: ${err.message}</div>`;
    }
  }

  function renderList(list) {
    listEl.innerHTML = '';
    if (list.length === 0) { listEl.innerHTML = '<div class="loading">暂无记录</div>'; return; }
    
    list.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'conv-item';
      
      let avatarHtml = '';
      if (conv.avatarUrl) {
        avatarHtml = `<img class="bot-avatar" src="${conv.avatarUrl}" alt="">`;
      } else {
        avatarHtml = `<div class="bot-avatar" style="display:flex;align-items:center;justify-content:center;background:#e5e7eb;color:#6b7280;">💬</div>`;
      }
      
      item.innerHTML = `
        ${avatarHtml}
        <div class="conv-info">
          <div class="conv-title">${conv.isPinned ? '[置顶] ' : ''}${conv.title}${conv.isAgent ? '<span class="agent-badge">智能体</span>' : ''}</div>
          <div class="conv-meta">ID: ${conv.id.slice(-6)} | ${conv.categoryText}</div>
        </div>
        <button class="btn">导出</button>
      `;
      item.querySelector('.btn').addEventListener('click', () => {
        startExport(conv, currentFormat, coreSwitch.checked);
      });
      listEl.appendChild(item);
    });
  }

  cancelBtn.addEventListener('click', () => { abortExport = true; });

  async function startExport(conv, format, isCore) {
    abortExport = false;
    overlay.classList.add('active');
    exportTitle.textContent = "拉取数据中";
    fill.style.width = "0%";
    pPage.textContent = "第 0 页";
    pCount.textContent = "0 条";
    
    try {
      const url = `https://www.doubao.com/im/chain/single?${getUrlParams()}`;
      let allMessages = [];
      let anchorIndex = 9007199254740991;
      let page = 0;
      let direction = 1;

      while (!abortExport) {
        page++;
        pPage.textContent = `第 ${page} 页`;
        const payload = {
          cmd: 3100,
          uplink_body: { pull_singe_chain_uplink_body: {
              conversation_id: conv.id, anchor_index: anchorIndex, conversation_type: conv.type,
              direction: direction, limit: 50, ext: {}, filter: { index_list: [] }, evaluate_ab_params: "", evaluate_common_params: ""
          }},
          sequence_id: uuidv4(), channel: 2, version: "1"
        };

        const response = await fetch(url, {
          method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json; encoding=utf-8', 'accept': 'application/json', 'origin': 'https://www.doubao.com', 'referer': 'https://www.doubao.com/chat/', 'x-tt-passport-csrf-token': getCsrfToken() },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        const body = (data.downlink_body||{}).pull_singe_chain_downlink_body || (data.downlink_body||{}).pull_single_chain_downlink_body || {};
        const messages = body.messages || [];
        
        const validMsgs = messages.filter(m => m && typeof m === 'object');
        if (validMsgs.length === 0) break;
        
        allMessages = allMessages.concat(validMsgs);
        pCount.textContent = `${allMessages.length} 条`;
        fill.style.width = `${Math.min(95, page * 15)}%`;

        if (validMsgs.length < 50) break;

        const oldest = validMsgs.reduce((prev, curr) => parseInt(prev.index_in_conv||0) < parseInt(curr.index_in_conv||0) ? prev : curr);
        anchorIndex = parseInt(oldest.index_in_conv||0);
        direction = 0;

        await new Promise(r => setTimeout(r, 300));
      }

      if (abortExport) throw new Error("用户取消了导出");

      fill.style.width = "100%";
      exportTitle.textContent = "生成文件中...";
      
      const safeTitle = String(conv.title).replace(/[\\/*?:"<>|\r\n]/g, "").substring(0, 40);
      const filenameBase = `${safeTitle}_${conv.id}`;

      if (format === 'json') {
        let finalData;
        if (isCore) {
          finalData = allMessages.map(msg => {
            const isUser = (msg.user_type === 1 && String(msg.sender_id || "") !== ((msg.ext || {}).bot_id || ""));
            const speakerName = isUser ? "用户" : (conv.isAgent ? (conv.botName || conv.title || "智能体") : "豆包");
            let text = "";
            if (Array.isArray(msg.content_block)) {
              msg.content_block.forEach(block => {
                if (block && block.type === "text") {
                  text += (typeof block.text === 'object' ? JSON.stringify(block.text, null, 2) : (block.text || "")) + "\n";
                }
              });
            }
            if (!text.trim()) text = extractTextFromContent(msg.content || "");
            if (!text.trim()) text = typeof msg.tts_content === 'object' ? JSON.stringify(msg.tts_content, null, 2) : (msg.tts_content || "");
            
            return { speaker: speakerName, text: text.trim() };
          });
        } else {
          finalData = {
            title: conv.title,
            messages: allMessages.map(msg => {
              const isUser = (msg.user_type === 1 && String(msg.sender_id || "") !== ((msg.ext || {}).bot_id || ""));
              const speakerName = isUser ? "用户" : (conv.isAgent ? (conv.botName || conv.title || "智能体") : "豆包");
              let timeStr = "";
              let ct = parseInt(msg.create_time || 0);
              if (ct > 0) {
                if (ct > 1e11) ct = Math.floor(ct / 1000);
                timeStr = new Date(ct * 1000).toLocaleString('zh-CN');
              }
              
              let text = "";
              let thinking = "";
              
              if (Array.isArray(msg.content_block)) {
                msg.content_block.forEach(block => {
                  if (block && block.type === "text") {
                    text += (typeof block.text === 'object' ? JSON.stringify(block.text, null, 2) : (block.text || "")) + "\n";
                  } else if (block && block.type === "thinking" && block.thinking_content) {
                    thinking += block.thinking_content + "\n";
                  }
                });
              }
              if (msg.thinking_content) {
                thinking = msg.thinking_content;
              }
              if (!text.trim()) text = extractTextFromContent(msg.content || "");
              if (!text.trim()) text = typeof msg.tts_content === 'object' ? JSON.stringify(msg.tts_content, null, 2) : (msg.tts_content || "");

              const result = {
                speaker: speakerName,
                time: timeStr,
                text: text.trim()
              };
              if (thinking.trim()) {
                result.thinking = thinking.trim();
              }
              return result;
            })
          };
        }
        downloadFile(JSON.stringify(finalData, null, 2), `${filenameBase}.json`, 'application/json');
      } 
      else if (format === 'md') {
        const md = generateMarkdown(allMessages, conv, isCore);
        downloadFile(md, `${filenameBase}.md`, 'text/markdown');
      }
      else if (format === 'txt') {
        const txt = generateTXT(allMessages, conv, isCore);
        downloadFile(txt, `${filenameBase}.txt`, 'text/plain');
      }
      else if (format === 'html') {
        const html = generateHTML(allMessages, conv, isCore, false);
        downloadFile(html, `${filenameBase}.html`, 'text/html');
      }
      else if (format === 'word') {
        const wordHtml = generateHTML(allMessages, conv, isCore, true);
        downloadFile(wordHtml, `${filenameBase}.doc`, 'application/msword');
      }
      else if (format === 'pdf') {
        const pdfHtml = generateHTML(allMessages, conv, isCore, false);
        const win = window.open('', '_blank');
        if (!win) {
          throw new Error("浏览器拦截了弹出窗口。请在地址栏右侧允许本站弹出窗口后重试！");
        }
        win.document.write(pdfHtml);
        win.document.close();
        win.setTimeout(() => {
          win.print();
        }, 500);
      }
      
      setTimeout(() => overlay.classList.remove('active'), 1000);

    } catch (err) {
      alert(`导出中断: ${err.message}`);
      overlay.classList.remove('active');
    }
  }

  // ============== 数据提取与生成器 ==============

  function generateMarkdown(messages, conv, isCore) {
    messages.sort((a, b) => parseInt(a.index_in_conv || 0) - parseInt(b.index_in_conv || 0));
    const lines = [];
    
    if (!isCore) {
      lines.push(`# ${conv.title}\n`);
    }
    
    messages.forEach(msg => {
      const isUser = (msg.user_type === 1 && String(msg.sender_id || "") !== ((msg.ext || {}).bot_id || ""));
      const speakerName = isUser ? "用户" : (conv.isAgent ? (conv.botName || conv.title || "智能体") : "豆包");
      
      let blockText = "";
      let thinkingText = "";
      
      if (Array.isArray(msg.content_block)) {
        msg.content_block.forEach(block => {
          if (block && block.type === "text") {
            blockText += (typeof block.text === 'object' ? JSON.stringify(block.text, null, 2) : (block.text || "")) + "\n";
          }
          else if (!isCore && block && block.type === "thinking" && block.thinking_content && !msg.thinking_content) {
            thinkingText += block.thinking_content + "\n";
          }
        });
      }
      if (msg.thinking_content && !isCore) {
        thinkingText = msg.thinking_content;
      }
      
      if (!blockText.trim()) blockText = extractTextFromContent(msg.content || "");
      if (!blockText.trim()) blockText = typeof msg.tts_content === 'object' ? JSON.stringify(msg.tts_content, null, 2) : (msg.tts_content || "");
      
      if (!isCore) {
        let ct = parseInt(msg.create_time || 0);
        let timeStr = "未知时间";
        if (ct > 0) {
          if (ct > 1e11) ct = Math.floor(ct / 1000);
          timeStr = new Date(ct * 1000).toLocaleString('zh-CN');
        }
        lines.push(`### ${speakerName} [${timeStr}]\n`);
        
        if (thinkingText.trim()) {
          lines.push(`> 思考过程:`);
          String(thinkingText).trim().split("\n").forEach(line => lines.push(`> ${line}`));
          lines.push("");
        }
      } else {
        lines.push(`### ${speakerName}\n`);
      }
      
      lines.push(blockText.trim() || '[此条消息内容为空]');
      lines.push('');
      if (!isCore) {
        lines.push('---');
        lines.push('');
      }
    });
    
    return lines.join('\n');
  }

  function generateTXT(messages, conv, isCore) {
    messages.sort((a, b) => parseInt(a.index_in_conv || 0) - parseInt(b.index_in_conv || 0));
    const lines = [];
    if (!isCore) {
      lines.push(`标题: ${conv.title}`);
      lines.push('====================\n');
    }

    messages.forEach(msg => {
      const isUser = (msg.user_type === 1 && String(msg.sender_id || "") !== ((msg.ext || {}).bot_id || ""));
      const speakerName = isUser ? "用户" : (conv.isAgent ? (conv.botName || conv.title || "智能体") : "豆包");
      
      let blockText = "";
      let thinkingText = "";
      
      if (Array.isArray(msg.content_block)) {
        msg.content_block.forEach(block => {
          if (block && block.type === "text") {
            blockText += (typeof block.text === 'object' ? JSON.stringify(block.text, null, 2) : (block.text || "")) + "\n";
          }
          else if (!isCore && block && block.type === "thinking" && block.thinking_content && !msg.thinking_content) {
            thinkingText += block.thinking_content + "\n";
          }
        });
      }
      if (msg.thinking_content && !isCore) {
        thinkingText = msg.thinking_content;
      }
      
      if (!blockText.trim()) blockText = extractTextFromContent(msg.content || "");
      if (!blockText.trim()) blockText = typeof msg.tts_content === 'object' ? JSON.stringify(msg.tts_content, null, 2) : (msg.tts_content || "");

      if (!isCore) {
        let ct = parseInt(msg.create_time || 0);
        let timeStr = "未知时间";
        if (ct > 0) {
          if (ct > 1e11) ct = Math.floor(ct / 1000);
          timeStr = new Date(ct * 1000).toLocaleString('zh-CN');
        }
        lines.push(`【${speakerName}】  (${timeStr})`);
        if (thinkingText.trim()) {
          lines.push(`[思考过程]:\n${thinkingText.trim()}`);
        }
      } else {
        lines.push(`【${speakerName}】`);
      }
      
      lines.push(blockText.trim() || '[无内容]');
      lines.push(isCore ? '' : '\n--------------------\n');
    });
    return lines.join('\n');
  }

  function generateHTML(messages, conv, isCore, isWord) {
    messages.sort((a, b) => parseInt(a.index_in_conv || 0) - parseInt(b.index_in_conv || 0));
    
    let html = `<!DOCTYPE html>\n`;
    if (isWord) {
      html += `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n`;
    } else {
      html += `<html>\n`;
    }
    
    html += `<head>
      <meta charset="utf-8">
      <title>${escapeHtml(conv.title)}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background: #f4f5f7; }
        .chat-container { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { border-bottom: 1px solid #eee; padding-bottom: 16px; margin-bottom: 24px; text-align: center; }
        .header h1 { font-size: 24px; margin: 0 0 12px 0; color: #111; }
        .msg { margin-bottom: 24px; display: flex; flex-direction: column; }
        .msg.user { align-items: flex-end; }
        .msg.bot { align-items: flex-start; }
        .msg-header { font-size: 13px; color: #888; margin-bottom: 6px; display: flex; gap: 12px; }
        .bubble { max-width: 85%; padding: 14px 18px; border-radius: 12px; font-size: 15px; word-wrap: break-word; white-space: pre-wrap; line-height: 1.7; }
        .msg.user .bubble { background: #007aff; color: #fff; border-bottom-right-radius: 4px; }
        .msg.bot .bubble { background: #f2f2f7; color: #1c1c1e; border-bottom-left-radius: 4px; }
        .thinking { font-size: 13px; color: #666; background: #fafafa; border-left: 3px solid #ccc; padding: 10px 14px; margin-bottom: 10px; border-radius: 6px; white-space: pre-wrap; }
        pre { background: #282c34; color: #abb2bf; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: Consolas, Monaco, monospace; font-size: 13px; }
        code { font-family: Consolas, Monaco, monospace; }
        a { color: inherit; text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="chat-container">`;

    if (!isCore) {
      html += `<div class="header"><h1>${escapeHtml(conv.title)}</h1></div>`;
    }

    html += `<div class="messages">`;
    
    messages.forEach(msg => {
      const isUser = (msg.user_type === 1 && String(msg.sender_id || "") !== ((msg.ext || {}).bot_id || ""));
      const speakerName = isUser ? "用户" : (conv.isAgent ? (conv.botName || conv.title || "智能体") : "豆包");
      
      let blockText = "";
      let thinkingText = "";
      
      if (Array.isArray(msg.content_block)) {
        msg.content_block.forEach(block => {
          if (block && block.type === "text") {
            blockText += (typeof block.text === 'object' ? JSON.stringify(block.text, null, 2) : (block.text || "")) + "\n";
          }
          else if (!isCore && block && block.type === "thinking" && block.thinking_content && !msg.thinking_content) {
            thinkingText += block.thinking_content + "\n";
          }
        });
      }
      if (msg.thinking_content && !isCore) {
        thinkingText = msg.thinking_content;
      }
      
      if (!blockText.trim()) blockText = extractTextFromContent(msg.content || "");
      if (!blockText.trim()) blockText = typeof msg.tts_content === 'object' ? JSON.stringify(msg.tts_content, null, 2) : (msg.tts_content || "");

      let ct = parseInt(msg.create_time || 0);
      let timeStr = "未知时间";
      if (ct > 0) {
        if (ct > 1e11) ct = Math.floor(ct / 1000);
        timeStr = new Date(ct * 1000).toLocaleString('zh-CN');
      }

      html += `<div class="msg ${isUser ? 'user' : 'bot'}">`;
      
      if (!isCore) {
        html += `<div class="msg-header"><strong>${escapeHtml(speakerName)}</strong><span>${timeStr}</span></div>`;
      } else {
        html += `<div class="msg-header"><strong>${escapeHtml(speakerName)}</strong></div>`;
      }

      let thinkingHtml = "";
      if (!isCore && thinkingText.trim()) {
         thinkingHtml += `<div class="thinking"><strong>思考过程:</strong><br>${escapeHtml(thinkingText.trim())}</div>`;
      }
      
      html += thinkingHtml;
      
      let parsedText = escapeHtml(blockText.trim() || "[此条消息为空]");
      parsedText = parsedText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
      parsedText = parsedText.replace(/\n/g, '<br>');

      html += `<div class="bubble">${parsedText}</div></div>`;
    });

    html += `</div></div></body></html>`;
    return html;
  }

  function downloadFile(content, filename, type) {
    // 注入 UTF-8 BOM，彻底解决 iOS 和部分 Windows 软件的乱码问题
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    // 为避免破坏某些严格的 JSON 解析器，仅对文本/文档类型注入 BOM
    const blobParts = (type.includes('text') || type.includes('msword')) ? [bom, content] : [content];
    
    const blob = new Blob(blobParts, { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    shadow.appendChild(a); 
    a.click();
    shadow.removeChild(a);
    URL.revokeObjectURL(url);
  }

})();