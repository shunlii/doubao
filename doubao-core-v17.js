// ==UserScript==
// @name         豆包对话导出工具 (V17 纯净页面提取版)
// @namespace    http://tampermonkey.net/
// @version      17.0
// @description  无API限制版，纯净复刻现成扩展抓取逻辑
// @match        *://*.doubao.com/*
// @grant        none
// ==/UserScript==

(async function() {
  if (window._doubaoExporterInjected) return;
  
  // ================= 卡密与设备授权验证(Supabase) =================
  const SUPABASE_URL = "https://lemcwiqcnefrbimfacrz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_foGDY7WU_yKadMDTh1ukYg_QsAF5-Ep";
  
  async function supabaseRequest(endpoint, method = 'GET', data = null) {
      const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
      const options = {
          method,
          headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
          }
      };
      if (data) options.body = JSON.stringify(data);
      try {
          const res = await fetch(url, options);
          return await res.json();
      } catch (e) {
          return { error: e.message };
      }
  }

  function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  let deviceId = localStorage.getItem('doubao_device_id');
  if (!deviceId) {
      deviceId = uuidv4();
      localStorage.setItem('doubao_device_id', deviceId);
  }

  async function getPublicIp() {
      try {
          const res = await fetch('https://api.ipify.org?format=json');
          const data = await res.json();
          return data.ip;
      } catch (e) {
          return "unknown";
      }
  }

  async function verifyAndRegisterDevice(key) {
      if (!key) {
          alert("卡密不能为空！");
          return false;
      }
      
      const publicIp = await getPublicIp();
      const keys = await supabaseRequest(`vip_keys?key=eq.${key}&select=*`);
      
      if (!keys || keys.error || keys.length === 0) {
          alert("无效的卡密！");
          return false;
      }
      
      const keyData = keys[0];
      if (keyData.status_code === 0) {
          alert("该卡密已过期，请购买新卡密！");
          return false;
      }
      
      if (keyData.uses_left !== null && keyData.uses_left <= 0) {
          alert("试用次数已用尽！");
          return false;
      }
      
      const devices = await supabaseRequest(`devices?key=eq.${key}&select=*`);
      if (devices && !devices.error) {
          const isRegistered = devices.some(d => d.device_id === deviceId);
          if (isRegistered) return true;
          
          if (devices.length >= keyData.p_count) {
              alert(`绑定失败！该卡密已达到最大设备数限制 (${keyData.p_count} 个设备)`);
              return false;
          }
      }
      
      const insertRes = await supabaseRequest('devices', 'POST', {
          key: key,
          device_id: deviceId,
          ip: publicIp
      });
      
      if (!insertRes || insertRes.error) {
          alert("设备绑定失败，请检查网络或联系客服！");
          return false;
      }
      return true;
  }

  let savedKey = localStorage.getItem('doubao_vip_key');
  if (!savedKey) {
      savedKey = prompt("【豆包对话导出工具】\n检测到您首次使用，请输入您的授权卡密：");
      if (!savedKey) return;
  }
  
  const isValid = await verifyAndRegisterDevice(savedKey);
  if (!isValid) {
      localStorage.removeItem('doubao_vip_key');
      return;
  }
  localStorage.setItem('doubao_vip_key', savedKey);
  if (!localStorage.getItem('doubao_vip_welcomed')) {
      alert("授权成功！设备已绑定。V17新版已完全采用纯页面抓取机制，不会再报没记录了！");
      localStorage.setItem('doubao_vip_welcomed', '1');
  }

  window._doubaoExporterInjected = true;

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
    
    .panel { position: absolute; bottom: 70px; right: 0; width: 340px; background-color: var(--bg-color); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; opacity: 0; pointer-events: none; transform: translateY(20px); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .panel.open { opacity: 1; pointer-events: auto; transform: translateY(0); }
    
    .header { padding: 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
    .header h1 { margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600; }
    
    .toolbar { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
    .format-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .format-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-color); color: var(--text-secondary); font-size: 14px; cursor: pointer; transition: all 0.2s; user-select: none; }
    .format-btn:hover { background: var(--bg-secondary); }
    .format-btn.active { background: #eff6ff; border-color: #bfdbfe; color: var(--primary-color); font-weight: 500; }
    
    .export-btn { background-color: #10b981; color: white; border: none; padding: 12px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2); }
    .export-btn:hover { background-color: #059669; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3); }
    .export-btn:active { transform: translateY(0); }
  `;
  
  const html = `
    <div class="fab" id="fab">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    </div>
    <div class="panel" id="panel">
      <div class="header">
        <h1>豆包对话导出工具 (V17)</h1>
      </div>
      <div class="toolbar">
        <div class="format-grid" id="format-grid">
          <div class="format-btn active" data-fmt="md">Markdown</div>
          <div class="format-btn" data-fmt="txt">纯文本 TXT</div>
        </div>
        <button class="export-btn" id="export-current-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          极速抓取导出本页
        </button>
      </div>
    </div>
  `;
  
  shadow.appendChild(style);
  const contentDiv = document.createElement('div');
  contentDiv.innerHTML = html;
  shadow.appendChild(contentDiv);

  const fab = shadow.getElementById('fab');
  const panel = shadow.getElementById('panel');
  const exportCurrentBtn = shadow.getElementById('export-current-btn');
  const formatBtns = shadow.querySelectorAll('.format-btn');
  
  let currentFormat = 'md';

  // Toggle Panel
  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  // Format selection
  formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      formatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFormat = btn.dataset.fmt;
    });
  });

  // 纯粹的提取逻辑 (SpecShot-like + Auto Scroll)
  exportCurrentBtn.addEventListener('click', async () => {
    
    // ================ 卡密扣除逻辑 ================
    const keyToUse = localStorage.getItem('doubao_vip_key');
    if (keyToUse) {
        const keyData = await supabaseRequest(`vip_keys?key=eq.${keyToUse}&select=uses_left`);
        if (keyData && keyData.length > 0) {
            let left = keyData[0].uses_left;
            if (left !== null) {
                if (left <= 0) {
                    alert("试用次数已用尽，无法导出！");
                    return;
                }
                supabaseRequest('rpc/decrement_uses_left', 'POST', { p_key: keyToUse });
            }
        }
    }

    // ================ 抓取逻辑 ================
    let titleText = "";
    try {
        const headerTitleEl = document.querySelector('[class*="header"] [class*="title"]') || document.querySelector('[data-testid="header-title"]');
        if (headerTitleEl) titleText = headerTitleEl.innerText.trim();
        if (!titleText) {
            const activeSessionEl = document.querySelector('.session.active') || document.querySelector('[class*="item"][class*="selected"]');
            if (activeSessionEl) titleText = activeSessionEl.innerText.trim().split('\n')[0];
        }
    } catch(e) {}
    
    if (!titleText || titleText === "豆包") {
        let docTitle = document.title.replace(' - 豆包', '').trim();
        if (docTitle) titleText = docTitle;
    }
    if (!titleText || titleText === "豆包") {
        titleText = "提取对话_" + new Date().getTime();
    }

    const originalBtnHTML = exportCurrentBtn.innerHTML;
    exportCurrentBtn.innerHTML = "正在向上滚动抓取中...";
    exportCurrentBtn.style.pointerEvents = "none";
    exportCurrentBtn.style.opacity = "0.7";

    try {
        const scroller = document.querySelector('.chat-scroller') || 
                         document.querySelector('[class*="scroller"][class*="v_list_scroller"]') || 
                         document.querySelector('.v_list_scroller') ||
                         document.querySelector('[data-testid="chat-message-list"]');
        
        if (!scroller) {
            alert("未检测到聊天记录容器，请确保当前在豆包聊天界面！");
            return;
        }

        // 尝试不断将 scrollTop 置 0 来触发向上滚动加载
        let lastScrollHeight = scroller.scrollHeight;
        let sameCount = 0;
        let scrollAttempts = 0;
        
        while (scrollAttempts < 40) { // 最多滚动尝试 40 次
            scroller.scrollTop = 0;
            scroller.dispatchEvent(new Event('scroll'));
            await new Promise(r => setTimeout(r, 300)); // 等待网络加载
            
            if (scroller.scrollHeight === lastScrollHeight) {
                sameCount++;
                if (sameCount > 4) break; // 连续 4 次高度不变说明到顶了
            } else {
                sameCount = 0;
            }
            lastScrollHeight = scroller.scrollHeight;
            scrollAttempts++;
        }
        
        exportCurrentBtn.innerHTML = "正在提取内容...";
        await new Promise(r => setTimeout(r, 300));

        const messages = [];

        // 完全复刻 SpecShot 的 DOM 提取机制
        const messageContainers = document.querySelectorAll('[data-testid="message-block-container"]');
        
        if (messageContainers.length > 0) {
            for (let i = 0; i < messageContainers.length; i++) {
                const container = messageContainers[i];
                
                const userMessage = container.querySelector('[data-testid="send_message"]');
                if (userMessage) {
                    messages.push({
                        isUser: true,
                        text: userMessage.innerText || ""
                    });
                    continue;
                }

                const aiMessage = container.querySelector('[data-testid="receive_message"]');
                if (aiMessage) {
                    messages.push({
                        isUser: false,
                        text: aiMessage.innerText || ""
                    });
                    continue;
                }
            }
        } else {
            // 如果 SpecShot 规则失效，则使用最通用的纯文本抓取
            const rows = document.querySelectorAll('.v_list_row');
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const msgEl = row.querySelector('[data-message-id]');
                if (!msgEl) continue;
                
                let isUser = true;
                if (row.querySelector('[data-testid="chat-message-action-edit"]') || 
                    row.querySelector('.user-avatar') || 
                    row.className.includes('user')) {
                    isUser = true;
                } else if (msgEl.innerHTML.includes('bot-avatar') || row.querySelector('.bot-avatar') || msgEl.innerHTML.includes('bot')) {
                    isUser = false;
                } else {
                    isUser = false;
                }
                
                messages.push({
                    isUser: isUser,
                    text: msgEl.innerText || ""
                });
            }
        }

        if (messages.length === 0) {
            alert("页面抓取失败：未找到任何对话块！\n可能是豆包页面结构发生了改变。");
            return;
        }

        let outputStr = "# " + titleText + "\n\n";
        messages.forEach(msg => {
            outputStr += "**" + (msg.isUser ? "我" : "豆包") + "**：\n" + msg.text + "\n\n";
        });
        
        let ext = currentFormat === "txt" ? ".txt" : ".md";
        let type = currentFormat === "txt" ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8";
        
        const blob = new Blob([outputStr], { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = titleText + ext;
        a.click();
        URL.revokeObjectURL(url);

    } catch(e) {
        alert("提取失败: " + e.message);
    } finally {
        exportCurrentBtn.innerHTML = originalBtnHTML;
        exportCurrentBtn.style.pointerEvents = "auto";
        exportCurrentBtn.style.opacity = "1";
    }
  });

})();
