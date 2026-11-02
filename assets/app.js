/* ============================================================
   AD 风险评估 · 交互逻辑
   ============================================================ */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var CIRC = 2 * Math.PI * 58;

  var TIERS = {
    low: {
      label: '低风险',
      patient: '目前风险处于较低水平。保持健康生活方式，并定期复查认知功能即可。'
    },
    mid: {
      label: '中风险',
      patient: '风险处于中等水平。建议到记忆门诊做进一步评估，补齐尚未完成的检查。'
    },
    high: {
      label: '高风险',
      patient: '风险处于较高水平。建议尽快到记忆门诊就诊，结合影像与生物标志物明确原因。'
    }
  };

  var patientView = $('#patientView');
  var clinicianView = $('#clinicianView');

  function blank() {
    return {
      age: null, sex: '', edu: '', family: '',
      mmse: null, moca: null,
      apoe: 'unknown', hippo: 'unknown', pet: 'unknown', ptau: 'unknown',
      bmi: null, htn: '', dm: '', smoke: ''
    };
  }

  var state = { patient: blank(), clinician: blank() };
  var pStep = 1;

  /* ---------------------------------------------------------- model */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function compute(s) {
    if (s.age == null || !isFinite(s.age)) return null;
    var age = clamp(s.age, 40, 100);
    var edu = s.edu ? Number(s.edu) : 12;

    var z = -4.0
      + 0.05 * (age - 65)
      + (s.sex === 'female' ? 0.10 : 0)
      - 0.05 * (edu - 12)
      + (s.family === 'yes' ? 0.55 : 0);

    z += ({ none: 0, one: 0.5, two: 1.0 }[s.apoe] || 0);

    if (s.mmse != null) z += 0.10 * (30 - clamp(s.mmse, 0, 30));
    if (s.moca != null) z += 0.06 * (30 - clamp(s.moca, 0, 30));

    z += ({ normal: 0, mild: 0.35, moderate: 0.7, severe: 1.05 }[s.hippo] || 0);

    if (s.pet === 'positive') z += 0.8;
    else if (s.pet === 'negative') z -= 0.3;

    if (s.ptau === 'positive') z += 0.6;
    else if (s.ptau === 'negative') z -= 0.2;

    z = clamp(z, -4.5, 3.2);

    var risk = 100 / (1 + Math.exp(-z));

    var w = 2.0;
    if (s.apoe === 'unknown') w += 3.0;
    if (s.pet === 'unknown') w += 3.0;
    if (s.ptau === 'unknown') w += 2.5;
    if (s.mmse == null) w += 1.5;
    if (s.moca == null) w += 1.2;
    if (s.hippo === 'unknown') w += 1.5;
    if (!s.edu) w += 1.0;
    w = Math.min(w, 14);

    var tier = risk < 10 ? 'low' : (risk < 25 ? 'mid' : 'high');

    return {
      risk: risk,
      tier: tier,
      lo: Math.max(0, Math.round(risk - w)),
      hi: Math.min(95, Math.round(risk + w)),
      width: w
    };
  }

  function completeness(s) {
    var done = 0;
    var core = [
      s.age != null,
      !!s.sex,
      !!s.edu,
      !!s.family,
      s.mmse != null,
      s.moca != null,
      s.apoe !== 'unknown',
      s.hippo !== 'unknown',
      s.pet !== 'unknown',
      s.ptau !== 'unknown'
    ];
    core.forEach(function (v) { if (v) done += 1; });
    return Math.round(done / core.length * 100);
  }

  function missingItems(s, opts) {
    var items = [];

    if (opts && opts.basics) {
      if (s.age == null) items.push({ n: '年龄', t: '基础', l: 'basic', d: '必填项；未录入无法生成评估。' });
      if (!s.sex) items.push({ n: '性别', t: '基础', l: 'basic', d: '必填项；按中性值处理会影响精度。' });
      if (!s.edu) items.push({ n: '受教育年限', t: '基础', l: 'basic', d: '按 12 年中性值处理，建议补录。' });
      if (!s.family) items.push({ n: '家族史', t: '基础', l: 'basic', d: '按「不详」处理，不额外调整风险。' });
    }

    if (s.apoe === 'unknown') {
      items.push({ n: 'APOE ε4 基因', t: '关键 · MNAR', l: 'key', d: '不做单点插补；按人群频率处理，并加宽风险区间。' });
    }
    if (s.pet === 'unknown') {
      items.push({ n: '淀粉样蛋白 PET', t: '关键 · MNAR', l: 'key', d: '不插补；采用临床-认知模型 + 缺失指示，报告风险区间。' });
    }
    if (s.ptau === 'unknown') {
      items.push({ n: '血液 p-tau217', t: '关键 · MNAR', l: 'key', d: '不插补；作为 PET 的低侵入替代，缺失时区间加宽。' });
    }
    if (s.mmse == null) {
      items.push({ n: 'MMSE', t: '量表 · MAR', l: 'scale', d: 'MICE 多重插补（m=20），以 MoCA 与教育年限为辅助。' });
    }
    if (s.moca == null) {
      items.push({ n: 'MoCA', t: '量表 · MAR', l: 'scale', d: 'MICE 多重插补（m=20），以 MMSE 与教育年限为辅助。' });
    }
    if (s.hippo === 'unknown') {
      items.push({ n: '海马体积（MRI）', t: '影像 · MAR', l: 'scale', d: 'MICE 插补，或按未检查处理并加宽区间。' });
    }

    if (opts && opts.low) {
      var low = [];
      if (s.bmi == null) low.push('BMI');
      if (!s.htn) low.push('高血压');
      if (!s.dm) low.push('糖尿病');
      if (!s.smoke) low.push('吸烟');
      if (low.length) {
        items.push({ n: low.join('、'), t: '低影响', l: 'low', d: '影响小：直接删除，不参与模型，也不插补。' });
      }
    }

    return items;
  }

  /* ---------------------------------------------------------- helpers */
  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function adviceHtml(list) {
    return list.map(function (t) {
      return '<li><span class="tick"><svg class="icon"><use href="#i-check"/></svg></span><span>' + esc(t) + '</span></li>';
    }).join('');
  }

  function setRing(ring, bar, numEl, risk, tier) {
    ring.setAttribute('data-tier', tier);
    bar.style.strokeDashoffset = String(CIRC * (1 - clamp(risk, 0, 100) / 100));
    animateNumber(numEl, Math.round(risk));
  }

  var animToken = 0;
  function animateNumber(el, to) {
    if (document.body.classList.contains('no-anim') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      el.textContent = String(to);
      return;
    }
    var from = Number(el.textContent);
    if (!isFinite(from)) from = 0;
    var token = ++animToken;
    var t0 = performance.now();
    function frame(t) {
      if (token !== animToken) return;
      var k = Math.min(1, (t - t0) / 520);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- patient */
  function patientAdvice(s) {
    var a = [];
    if (s.hippo === 'unknown') a.push('到记忆门诊完成头颅 MRI，了解海马体积与萎缩程度。');
    if (s.pet === 'unknown' && s.ptau === 'unknown') a.push('与医生讨论是否需要淀粉样蛋白 PET 或血液 p-tau217 检查。');
    if (s.apoe === 'unknown') a.push('可考虑 APOE ε4 基因检测，帮助细化风险分层。');
    a.push('保持每周至少 150 分钟中等强度运动，控制血压、血糖与体重。');
    if (a.length < 3) a.push('增加社交与认知活动，保证规律作息与充足睡眠。');
    if (a.length < 3) a.push('每 1–2 年复查一次认知量表，关注记忆变化。');
    return a.slice(0, 3);
  }

  function renderPatientResult() {
    var r = compute(state.patient);
    if (!r) return;
    var meta = TIERS[r.tier];

    setRing($('#pRing'), $('#pRingBar'), $('#pRingNum'), r.risk, r.tier);

    var tierEl = $('#pTier');
    tierEl.className = 'badge ' + r.tier;
    tierEl.textContent = meta.label;

    $('#pHeadline').textContent = '未来 5 年风险约 ' + Math.round(r.risk) + '%';
    $('#pDesc').textContent = meta.patient;
    $('#pRange').textContent = '可能范围 ' + r.lo + '% – ' + r.hi + '%（含未完成检查的不确定性）';
    $('#pAdvice').innerHTML = adviceHtml(patientAdvice(state.patient));
  }

  function validateStep1() {
    var s = state.patient;
    var ok = true;

    $$('#patientView .field').forEach(function (f) { f.classList.remove('invalid'); });
    $$('#patientView .seg').forEach(function (f) { f.classList.remove('invalid'); });

    if (s.age == null || s.age < 40 || s.age > 100) {
      $('#p-age').closest('.field').classList.add('invalid');
      ok = false;
    }
    if (!s.sex) {
      $('input[name="p-sex"]').closest('.field').querySelector('.seg').classList.add('invalid');
      ok = false;
    }
    if (!s.edu) {
      $('#p-edu').closest('.field').classList.add('invalid');
      ok = false;
    }
    if (!s.family) {
      $('input[name="p-family"]').closest('.field').querySelector('.seg').classList.add('invalid');
      ok = false;
    }

    $('#pError').hidden = ok;
    return ok;
  }

  function goStep(n) {
    pStep = n;
    $$('#patientView .panel').forEach(function (p) {
      p.classList.toggle('active', Number(p.dataset.panel) === n);
    });
    $$('#stepper .step').forEach(function (st) {
      var k = Number(st.dataset.step);
      st.classList.toggle('active', k === n);
      st.classList.toggle('done', k < n);
    });
    if (n === 3) renderPatientResult();

    var wizard = $('.wizard');
    if (wizard) {
      var y = wizard.getBoundingClientRect().top + window.pageYOffset - 86;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  }

  /* ---------------------------------------------------------- clinician */
  function clinicianAdvice(s, r) {
    var a = [];
    if (s.pet === 'unknown' && s.ptau === 'unknown') {
      a.push('完善淀粉样蛋白 PET 或血液 p-tau217，明确病理负荷。');
    } else if (s.pet === 'unknown') {
      a.push('PET 未完成，可考虑血液 p-tau217 作为低侵入替代。');
    } else if (s.ptau === 'unknown') {
      a.push('可补充血液 p-tau217，用于随访与疗效监测。');
    }
    if (s.hippo === 'unknown') a.push('完成头颅 MRI 与海马体积测量，评估内侧颞叶萎缩。');
    if (s.apoe === 'unknown') a.push('补充 APOE ε4 基因检测，细化遗传风险分层。');

    if (r && r.tier === 'high') a.push('建议 3 个月内转诊记忆门诊，并复查认知量表。');
    else if (r && r.tier === 'mid') a.push('建议 6–12 个月复查认知量表，结合临床随访。');
    else if (r) a.push('保持年度认知筛查，控制血管危险因素。');

    if (!a.length) a.push('资料完整，建议按常规路径随访。');
    if (a.length < 2) a.push('关注记忆变化，如有下降及时就诊。');
    return a.slice(0, 3);
  }

  function renderMissing(s) {
    var items = missingItems(s, { basics: true, low: true });
    var box = $('#cMissing');

    if (!items.length) {
      box.innerHTML = '<li class="complete-state"><svg class="icon"><use href="#i-check"/></svg>' +
        '<span>关键变量完整，可直接输出点估计；仍建议定期更新检查结果。</span></li>';
      return;
    }

    box.innerHTML = items.map(function (it) {
      var tagCls = it.l;
      return '<li class="missing-item">' +
        '<span class="mdot ' + tagCls + '"></span>' +
        '<div><b>' + esc(it.n) + '</b><span class="tag ' + tagCls + '">' + esc(it.t) + '</span>' +
        '<p>' + esc(it.d) + '</p></div></li>';
    }).join('');
  }

  function renderExam(s) {
    var rows = [
      ['APOE 基因', s.apoe !== 'unknown', '遗传易感性'],
      ['头颅 MRI（海马体积）', s.hippo !== 'unknown', '内侧颞叶萎缩'],
      ['AD 血液标志物（p-tau217）', s.ptau !== 'unknown', '低侵入性病理指标'],
      ['淀粉样蛋白 PET', s.pet !== 'unknown', 'Aβ 负荷']
    ];

    $('#cExamBody').innerHTML = rows.map(function (row) {
      var on = row[1];
      return '<tr><td>' + esc(row[0]) + '</td>' +
        '<td><span class="status ' + (on ? 'done' : 'missing') + '">' + (on ? '已录入' : '未完成') + '</span></td>' +
        '<td>' + esc(row[2]) + '</td></tr>';
    }).join('');
  }

  function renderClinician() {
    var s = state.clinician;
    var r = compute(s);

    var pct = completeness(s);
    $('#cComplete').textContent = pct + '%';
    $('#cBar').style.width = pct + '%';

    renderExam(s);
    renderMissing(s);

    if (!r) {
      $('#cRingNum').textContent = '--';
      $('#cRingBar').style.strokeDashoffset = String(CIRC);
      $('#cRing').setAttribute('data-tier', 'mid');
      var badge = $('#cTier');
      badge.className = 'badge mid';
      badge.textContent = '等待数据';
      var range = $('#cRange');
      range.className = 'range-pill muted';
      range.textContent = '录入年龄后生成';
      $('#cAdvice').innerHTML = adviceHtml(['请先录入年龄等基本信息。']);
      return;
    }

    setRing($('#cRing'), $('#cRingBar'), $('#cRingNum'), r.risk, r.tier);

    var tierEl = $('#cTier');
    tierEl.className = 'badge ' + r.tier;
    tierEl.textContent = TIERS[r.tier].label;

    var rp = $('#cRange');
    rp.className = 'range-pill';
    rp.textContent = r.lo + '% – ' + r.hi + '%（含缺失不确定性）';

    $('#cAdvice').innerHTML = adviceHtml(clinicianAdvice(s, r));
  }

  /* ---------------------------------------------------------- binding */
  function sync(key) {
    var root = key === 'patient' ? patientView : clinicianView;
    var s = state[key];

    $$('[data-field]', root).forEach(function (el) {
      var f = el.dataset.field;
      if (el.type === 'radio') {
        if (el.checked) s[f] = el.value;
        return;
      }
      if (el.type === 'number') {
        s[f] = el.value.trim() === '' ? null : Number(el.value);
        return;
      }
      s[f] = el.value;
    });
  }

  function fillForm(root, data) {
    Object.keys(data).forEach(function (k) {
      $$('[data-field="' + k + '"]', root).forEach(function (el) {
        if (el.type === 'radio') el.checked = el.value === String(data[k]);
        else el.value = data[k];
      });
    });
  }

  function clearInvalid(el) {
    var field = el.closest('.field');
    if (field) field.classList.remove('invalid');
    var seg = el.closest('.seg');
    if (seg) seg.classList.remove('invalid');
    var err = $('#pError');
    if (err) err.hidden = true;
  }

  ['input', 'change'].forEach(function (evt) {
    patientView.addEventListener(evt, function (e) {
      if (!e.target.matches('[data-field]')) return;
      sync('patient');
      clearInvalid(e.target);
    });
    clinicianView.addEventListener(evt, function (e) {
      if (!e.target.matches('[data-field]')) return;
      sync('clinician');
      renderClinician();
    });
  });

  patientView.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-next]');
    if (!btn) return;
    var n = Number(btn.dataset.next);
    if (n === 2 && !validateStep1()) return;
    if (n === 3 && !validateStep1()) { goStep(1); return; }
    goStep(n);
  });

  /* ---------------------------------------------------------- mode */
  function setMode(mode, push) {
    var isPatient = mode !== 'clinician';
    document.body.dataset.mode = isPatient ? 'patient' : 'clinician';
    patientView.hidden = !isPatient;
    clinicianView.hidden = isPatient;

    $$('.mode-btn').forEach(function (b) {
      var on = b.dataset.modeBtn === (isPatient ? 'patient' : 'clinician');
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (!isPatient) renderClinician();
    if (push !== false) {
      try { history.replaceState(null, '', '#' + (isPatient ? 'patient' : 'clinician')); } catch (err) { /* noop */ }
    }
    window.scrollTo(0, 0);
  }

  $$('.mode-btn').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.modeBtn); });
  });

  var brand = $('.brand');
  if (brand) brand.addEventListener('click', function (e) { e.preventDefault(); setMode('patient'); });

  /* ---------------------------------------------------------- reset / print */
  $('#cReset').addEventListener('click', function () {
    $$('[data-field]', clinicianView).forEach(function (el) {
      if (el.type === 'radio') el.checked = false;
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    Object.assign(state.clinician, blank());
    renderClinician();
  });

  $('#pPrint').addEventListener('click', function () { window.print(); });
  $('#cPrint').addEventListener('click', function () { window.print(); });

  /* ---------------------------------------------------------- method dialog */
  var dlg = $('#methodDialog');
  if (dlg && typeof dlg.showModal === 'function') {
    ['#methodBtn', '#methodBtn2'].forEach(function (sel) {
      var b = $(sel);
      if (b) b.addEventListener('click', function () { dlg.showModal(); });
    });
    $('#closeMethod').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) {
      if (e.target !== dlg) return;
      var rect = dlg.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        dlg.close();
      }
    });
  }

  /* ---------------------------------------------------------- init */
  var params = new URLSearchParams(location.search);
  var demo = params.get('demo');
  var initial = (location.hash.indexOf('clinician') >= 0 || demo === 'clinic' || demo === 'low') ? 'clinician' : 'patient';

  if (params.get('static')) document.body.classList.add('no-anim');

  setMode(initial, false);
  renderClinician();

  if (demo === 'clinic') {
    fillForm(clinicianView, {
      age: 76, sex: 'male', edu: '6', family: 'yes',
      mmse: 23, moca: 19, apoe: 'two', hippo: 'moderate',
      pet: 'unknown', ptau: 'positive', bmi: 24.5, htn: 'yes', dm: 'no', smoke: 'quit'
    });
    sync('clinician');
    renderClinician();
  } else if (demo === 'low') {
    fillForm(clinicianView, {
      age: 68, sex: 'female', edu: '15', family: 'no',
      mmse: 29, moca: 27, apoe: 'none', hippo: 'normal',
      pet: 'negative', ptau: 'negative', bmi: 22, htn: 'no', dm: 'no', smoke: 'no'
    });
    sync('clinician');
    renderClinician();
  } else if (demo) {
    fillForm(patientView, {
      age: 72, sex: 'female', edu: '9', family: 'no',
      mmse: 25, moca: 21, apoe: 'one', hippo: 'mild',
      pet: 'unknown', ptau: 'unknown'
    });
    sync('patient');
    setMode('patient', false);
    goStep(3);
  }

  if (params.get('method')) {
    var d = $('#methodDialog');
    if (d && typeof d.showModal === 'function') d.showModal();
  }
})();
