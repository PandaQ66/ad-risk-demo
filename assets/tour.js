/* ============================================================
   AD 风险评估 · 演示模式（?tour=1）
   仅用于录制演示视频：自动光标、字幕、脚本化操作。
   ============================================================ */
(function () {
  'use strict';

  if (!new URLSearchParams(location.search).has('tour')) return;

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (s) { return document.querySelector(s); };

  /* ---------------------------------------------------------- styles */
  var css = [
    '.tour-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:99999;pointer-events:none;opacity:0;transition:opacity .35s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35));will-change:transform}',
    '.tour-ripple{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid rgba(47,128,237,.85);z-index:99998;pointer-events:none;animation:tourRipple .55s ease-out forwards}',
    '@keyframes tourRipple{from{transform:scale(.4);opacity:.9}to{transform:scale(2.4);opacity:0}}',
    '.tour-caption{position:fixed;left:50%;bottom:34px;transform:translate(-50%,10px);z-index:99999;max-width:min(86vw,880px);padding:11px 19px;border-radius:999px;background:rgba(13,27,48,.86);color:#fff;font-size:14.5px;line-height:1.5;letter-spacing:.01em;box-shadow:0 12px 32px rgba(0,0,0,.28);opacity:0;transition:opacity .35s,transform .35s;pointer-events:none;backdrop-filter:blur(10px);text-align:center}',
    '.tour-caption.show{opacity:1;transform:translate(-50%,0)}',
    '.tour-hl{box-shadow:0 0 0 4px rgba(47,128,237,.45),0 0 0 8px rgba(47,128,237,.14)!important;border-radius:10px;transition:box-shadow .2s}',
    '.ring.tour-hl{border-radius:50%}',
    '.tour-cover{position:fixed;inset:0;z-index:99997;display:grid;place-items:center;background:radial-gradient(900px 520px at 72% 18%,#1F6FD0 0%,#0E2A52 58%,#071A33 100%);color:#fff;opacity:0;transition:opacity .7s ease;pointer-events:none}',
    '.tour-cover.show{opacity:1}',
    '.tour-cover-inner{text-align:center;transform:translateY(12px);transition:transform .9s cubic-bezier(.22,.61,.36,1)}',
    '.tour-cover.show .tour-cover-inner{transform:none}',
    '.tour-mark{width:58px;height:58px;border-radius:17px;background:linear-gradient(140deg,#2F80ED,#1557B0);display:grid;place-items:center;margin:0 auto 22px;box-shadow:0 12px 34px rgba(0,0,0,.32)}',
    '.tour-mark svg{width:32px;height:32px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
    '.tour-eyebrow{font:700 10.5px/1 Arial,sans-serif;letter-spacing:.26em;color:#9DC3FF;margin-bottom:15px}',
    '.tour-cover h1{font-size:46px;letter-spacing:-.02em;margin:0 0 13px;font-weight:700}',
    '.tour-cover p{font-size:15px;color:#B9CCE6;margin:0;letter-spacing:.02em}',
    '.tour-cover .tour-sub{font-size:12px;color:#7F9CC0;margin-top:20px;letter-spacing:.08em}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------------------------------------------------------- cursor */
  var cursor = document.createElement('div');
  cursor.className = 'tour-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26">' +
    '<path d="M5.4 3.1l13.4 7.8-5.9 1.6-2.6 6.4z" fill="#fff" stroke="#15233B" stroke-width="1.4" stroke-linejoin="round"/>' +
    '</svg>';
  document.body.appendChild(cursor);

  var pos = { x: innerWidth / 2, y: innerHeight / 2 };
  function setPos(x, y) {
    pos.x = x; pos.y = y;
    cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  setPos(pos.x, pos.y);

  function animate(x1, y1, ms) {
    var x0 = pos.x, y0 = pos.y, t0 = performance.now();
    return new Promise(function (resolve) {
      function frame(t) {
        var k = Math.min(1, (t - t0) / ms);
        var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        setPos(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
        if (k < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function moveTo(el, ms) {
    if (!el) return Promise.resolve();
    var r = el.getBoundingClientRect();
    return animate(r.left + r.width / 2, r.top + r.height / 2, ms || 620);
  }

  function ripple() {
    var d = document.createElement('div');
    d.className = 'tour-ripple';
    d.style.left = pos.x + 'px';
    d.style.top = pos.y + 'px';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 600);
  }

  function highlight(el, ms) {
    if (!el) return;
    el.classList.add('tour-hl');
    setTimeout(function () { el.classList.remove('tour-hl'); }, ms || 1600);
  }

  /* ---------------------------------------------------------- caption */
  var cap = document.createElement('div');
  cap.className = 'tour-caption';
  document.body.appendChild(cap);
  var capTimer = null;

  function caption(text, ms) {
    cap.textContent = text;
    cap.classList.add('show');
    clearTimeout(capTimer);
    capTimer = setTimeout(function () { cap.classList.remove('show'); }, ms || 2600);
  }

  /* ---------------------------------------------------------- actions */
  async function type(sel, text, per) {
    var el = $(sel);
    if (!el) return;
    await moveTo(el, 450);
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    for (var i = 0; i < text.length; i++) {
      el.value += text[i];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(per || 110);
    }
    await sleep(220);
  }

  async function pick(sel, value) {
    var el = $(sel);
    if (!el) return;
    await moveTo(el, 480);
    highlight(el, 900);
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    await sleep(330);
  }

  async function choose(name, value) {
    var input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (!input) return;
    var label = input.closest('label');
    await moveTo(label, 450);
    input.click();
    await sleep(300);
  }

  async function click(sel, ms) {
    var el = $(sel);
    if (!el) return;
    await moveTo(el, ms || 600);
    ripple();
    el.click();
    await sleep(380);
  }

  async function scrollToEl(sel, block) {
    var el = $(sel);
    if (!el) return;
    var r = el.getBoundingClientRect();
    var offset = block === 'start' ? 90 : (innerHeight - r.height) / 2;
    var top = Math.max(0, window.scrollY + r.top - offset);
    window.scrollTo({ top: top, behavior: 'smooth' });
    await sleep(760);
  }

  /* ---------------------------------------------------------- cards */
  function cover(title, subtitle, note) {
    var c = document.createElement('div');
    c.className = 'tour-cover';
    c.innerHTML =
      '<div class="tour-cover-inner">' +
        '<div class="tour-mark"><svg viewBox="0 0 24 24"><path d="M3 12h4l2.2-5.5L12.5 18l2.3-7H21"/></svg></div>' +
        '<div class="tour-eyebrow">ALZHEIMER\'S DISEASE · RISK ASSESSMENT</div>' +
        '<h1>' + title + '</h1>' +
        '<p>' + subtitle + '</p>' +
        (note ? '<div class="tour-sub">' + note + '</div>' : '') +
      '</div>';
    document.body.appendChild(c);
    requestAnimationFrame(function () { c.classList.add('show'); });
    return c;
  }

  async function intro() {
    var c = cover('AD 风险评估', '患者端 · 医护端 · 缺失数据处理', 'DEMO  ·  ALZHEIMER\'S DISEASE');
    await sleep(3000);
    c.classList.remove('show');
    await sleep(650);
    c.remove();
  }

  async function outro() {
    var c = cover('演示结束', '数据仅本地计算 · 演示模型不构成诊断', 'THANK YOU');
    await sleep(2800);
    window.__tourDone = true;
  }

  /* ---------------------------------------------------------- script */
  window.__startTour = false;

  async function run() {
    while (!window.__startTour) await sleep(80);
    await sleep(350);

    await intro();
    cursor.style.opacity = '1';

    /* patient */
    caption('患者端 · 3 步完成风险评估', 2400);

    await type('#p-age', '72', 120);
    await choose('p-sex', 'female');
    await pick('#p-edu', '9');
    await choose('p-family', 'no');
    await sleep(300);

    await caption('基本信息只在本机计算', 2000);

    await click('[data-next="2"]');
    await sleep(600);
    await caption('没有检查结果也能评估', 2200);

    await type('#p-mmse', '25', 110);
    await type('#p-moca', '21', 110);
    await pick('#p-apoe', 'one');
    await pick('#p-hippo', 'mild');
    await sleep(350);

    await caption('PET 与 p-tau 留空，系统按缺失机制处理', 2800);

    await scrollToEl('[data-next="3"]', 'center');
    await click('[data-next="3"]');
    await sleep(1100);
    await caption('5 年风险约 18%，可能范围 11%–26%', 3200);

    highlight($('#pRing'), 1900);
    await sleep(450);
    highlight($('#pRange'), 1900);
    await sleep(700);

    await scrollToEl('#pAdvice', 'center');
    await sleep(500);
    await caption('分层建议：先补齐检查，再谈干预', 2600);
    highlight($('#pAdvice li'), 1700);
    await sleep(900);

    /* clinician */
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await sleep(750);
    await click('[data-mode-btn="clinician"]');
    await sleep(850);
    await caption('医护端 · 实时辅助决策', 2400);

    await type('#c-age', '76', 110);
    await choose('c-sex', 'male');
    await pick('#c-edu', '6');
    await choose('c-family', 'yes');
    await type('#c-mmse', '23', 110);
    await type('#c-moca', '19', 110);
    await pick('#c-apoe', 'two');
    await pick('#c-hippo', 'moderate');
    await pick('#c-ptau', 'positive');
    await sleep(750);

    await caption('风险实时更新，检查建议同步生成', 2800);
    highlight($('#cResultCard'), 1900);
    await sleep(550);

    await scrollToEl('#cMissing', 'center');
    await sleep(650);
    await caption('PET 缺失：不插补，只加宽风险区间', 3000);
    highlight($('#cMissing .missing-item'), 2100);
    await sleep(850);

    /* methodology */
    await scrollToEl('#methodBtn2', 'center');
    await sleep(450);

    var dlg = $('#methodDialog');
    dlg.appendChild(cap);
    await click('#methodBtn2');
    await sleep(850);
    await caption('方法学：判机制 → 四维评估 → 分层处置 → 验证报告', 4000);
    await sleep(3000);

    await click('#closeMethod');
    await sleep(650);
    document.body.appendChild(cap);

    /* end */
    cap.classList.remove('show');
    cursor.style.opacity = '0';
    await sleep(400);
    await outro();
  }

  run();
})();
