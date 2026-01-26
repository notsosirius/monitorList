// 一定要放最外围，保证 this 指向 window
const $this = this;

// 页面A：登记新记录（按钮 + 弹窗 + 保存）
async function main() {
  // ========= 页面白名单：只在满足条件的页面执行 =========
  // TODO: 替换成页面A的实际URL判断逻辑（占位：entryid 参数）
  const url = new URL(window.location.href);
  const entryId = url.searchParams.get('entryid');
  if (!entryId) return;

  // ========= 防重复初始化：避免同页面多次注入 =========
  // SPA 场景下可能重复触发 main()，用标记保证只初始化一次
  if (window.__plugin_inited) return;
  window.__plugin_inited = true;

  // ========= （可选）等待页面关键元素加载完成 =========
  // TODO: 如果页面异步渲染，可等待某个稳定选择器出现再开始
  // const WAIT_SEL = '...';
  // await $this.libs.utils.waitForValue(WAIT_SEL);

  // ========= 注入按钮 =========
  // TODO: 替换成按钮插入位置与参考按钮选择器
  // 目标在 iframe 内：先拿到 iframe 文档再查找目标
  const frame = document.querySelector('#iframe');
  const frameDoc = frame?.contentDocument || frame?.contentWindow?.document;
  // 参考容器：enter-head
  const target = frameDoc?.querySelector('div.enter-head');
  // 参照按钮（放在其左侧）
  const refBtn = frameDoc?.querySelector('#aiResultButton');
  if (!target) return;

  const btn = document.createElement('button');
  btn.textContent = '审价';
  btn.className = 'codex-btn';
  btn.style.backgroundColor = 'magenta';
  btn.style.color = 'white';
  btn.style.padding = '0px 10px';
  btn.style.border = 'none';
  btn.style.borderRadius = '3px';
  btn.style.cursor = 'pointer';
  btn.style.height = '30px';
  btn.style.margin = '5px';
  btn.style.verticalAlign = 'middle';
  btn.style.float = 'right';

  btn.addEventListener('click', async () => {
    // ========= 获取页面字段（优先使用 fetch，避免页面 DOM 变动） =========
    // TODO: 用实际接口替换占位符（URL/方法/参数/字段路径）
    try {
      const seed = await fetchPageAData(entryId);
      openModal(seed);
    } catch (error) {
      alert(error.message || '获取页面数据失败');
    }
  });

  if (refBtn && refBtn.parentNode) {
    // 插在参考按钮左侧
    refBtn.parentNode.insertBefore(btn, refBtn);
  } else {
    // 找不到参考按钮时兜底放到容器开头
    target.prepend(btn);
  }
}

// ========= 弹窗与保存 =========
function openModal(seed) {
  // 避免重复打开弹窗
  if (document.getElementById('codex-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'codex-modal';
  modal.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,0.45)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:9999'
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width:520px',
    'background:#fff',
    'border-radius:10px',
    'padding:16px',
    'box-shadow:0 10px 30px rgba(0,0,0,0.2)'
  ].join(';');

  // 弹窗表单：录入最终发票日期、资料签收日期、属性字段、资料交互情况、备注
  card.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:10px;">审价登记</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;">
        最终发票日期
        <input id="finalInvoiceDate" type="date" />
      </label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;">
        资料签收日期
        <input id="docReceiptDate" type="date" />
      </label>
      <label style="grid-column:1/-1;display:flex;flex-direction:column;font-size:12px;gap:4px;">
        属性字段（多选）
        <div id="attributeFlags" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
      </label>
      <label style="grid-column:1/-1;display:flex;flex-direction:column;font-size:12px;gap:4px;">
        资料交互情况
        <textarea id="infoExchange" rows="2"></textarea>
      </label>
      <label style="grid-column:1/-1;display:flex;flex-direction:column;font-size:12px;gap:4px;">
        备注
        <textarea id="remark" rows="2"></textarea>
      </label>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
      <button id="codex-save" style="padding:6px 12px;">保存</button>
      <button id="codex-cancel" style="padding:6px 12px;">取消</button>
    </div>
  `;

  modal.appendChild(card);
  document.body.appendChild(modal);

  // 属性多选选项（与后端枚举一致）
  const options = [
    '公式定价',
    '特殊关系',
    '特许权使用费',
    '事中验估',
    '事后验估',
    '虚拟混矿',
    '保税内销有内销价',
    '保税内销无内销价'
  ];
  const flagsContainer = card.querySelector('#attributeFlags');
  options.forEach((label) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = label;
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(label));
    flagsContainer.appendChild(wrap);
  });

  card.querySelector('#codex-cancel').addEventListener('click', () => {
    modal.remove();
  });

  card.querySelector('#codex-save').addEventListener('click', async () => {
    const finalInvoiceDate = card.querySelector('#finalInvoiceDate').value || undefined;
    const docReceiptDate = card.querySelector('#docReceiptDate').value || undefined;
    const infoExchange = card.querySelector('#infoExchange').value.trim() || undefined;
    const remark = card.querySelector('#remark').value.trim() || undefined;
    const attributeFlags = Array.from(flagsContainer.querySelectorAll('input:checked')).map(
      (el) => el.value
    );

    const payload = {
      declNo: seed.declNo,
      taxNo: seed.taxNo,
      goodsName: seed.goodsName,
      declareDate: seed.declareDate,
      finalInvoiceDate,
      docReceiptDate,
      attributeFlags: attributeFlags.length ? attributeFlags : undefined,
      infoExchange,
      remark
    };

    try {
      await createLedger(payload, false);
      modal.remove();
      alert('保存成功');
    } catch (err) {
      if (err.code === 'DUPLICATE_DECL_NO') {
        const ok = window.confirm('报关单号已存在，是否仍要新增？');
        if (ok) {
          await createLedger(payload, true);
          modal.remove();
          alert('保存成功');
        }
        return;
      }
      alert(err.message || '保存失败');
    }
  });
}

// ========= 获取页面A数据（fetch 占位实现） =========
async function fetchPageAData(entryId) {
  // TODO: 替换为页面A真实接口
  // 1) URL 占位
  const API_URL = 'PAGE_A_API_URL';
  // 2) 请求方式（GET/POST）
  const METHOD = 'POST';
  // 3) 请求体/查询参数占位
  const payload = {
    entryId
    // 例如：page: 1, size: 1
  };

  // 4) 发送请求（同域可直接带 cookie）
  const res =
    METHOD === 'GET'
      ? await fetch(`${API_URL}?entryId=${encodeURIComponent(entryId)}`, {
          credentials: 'include'
        })
      : await fetch(API_URL, {
          method: METHOD,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

  if (!res.ok) {
    throw new Error(`页面数据接口失败（${res.status}）`);
  }
  const data = await res.json();

  // 5) 字段路径（来自页面A返回结构）
  // entryHead.entryId: 报关单号
  // entryHead.dDate: 申报日期（YYYY/MM/DD）
  // entryList[0].codeTs: 税号
  // entryList[0].gName: 商品名称
  const declNo = data?.entryHead?.entryId || '';
  const taxNo = data?.entryList?.[0]?.codeTs || '';
  const goodsName = data?.entryList?.[0]?.gName || '';
  const declareDate = data?.entryHead?.dDate || '';

  return { declNo, taxNo, goodsName, declareDate };
}

// 创建台账记录：重复报关单号时走二次确认
async function createLedger(payload, confirmDuplicate) {
  const res = await fetch('/api/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, confirmDuplicate })
  });
  if (res.status === 409) {
    const json = await res.json();
    const err = new Error(json.message || '报关单号重复');
    err.code = json.code;
    throw err;
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

// ========= URL 变化监听：保证 SPA 场景也会触发 main() =========
function onUrlChange() {
  main();
}

window.addEventListener('hashchange', onUrlChange, false);
window.addEventListener('popstate', onUrlChange, false);

(function () {
  const _pushState = history.pushState;
  const _replaceState = history.replaceState;

  history.pushState = function () {
    const ret = _pushState.apply(this, arguments);
    onUrlChange();
    return ret;
  };

  history.replaceState = function () {
    const ret = _replaceState.apply(this, arguments);
    onUrlChange();
    return ret;
  };
})();

// ========= 首次进入执行 =========
main();

