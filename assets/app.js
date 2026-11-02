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

  var LABS = [
    { g: '血常规', k: 'lab_wbc', n: '白细胞计数', u: '×10⁹/L', ph: '3.5–9.5', step: '0.1' },
    { g: '血常规', k: 'lab_rbc', n: '红细胞计数', u: '×10¹²/L', ph: '3.8–5.8', step: '0.01' },
    { g: '血常规', k: 'lab_hct', n: '红细胞压积', u: '%', ph: '35–50', step: '0.1' },
    { g: '血常规', k: 'lab_hgb', n: '血红蛋白', u: 'g/L', ph: '115–175', step: '1' },
    { g: '血常规', k: 'lab_plt', n: '血小板计数', u: '×10⁹/L', ph: '125–350', step: '1' },
    { g: '代谢', k: 'lab_glu', n: '空腹血糖', u: 'mmol/L', ph: '3.9–6.1', step: '0.1' },
    { g: '代谢', k: 'lab_tc', n: '总胆固醇 TC', u: 'mmol/L', ph: '< 5.2', step: '0.01' },
    { g: '代谢', k: 'lab_ldl', n: 'LDL-C', u: 'mmol/L', ph: '< 3.4', step: '0.01' },
    { g: '甲状腺与营养', k: 'lab_tsh', n: 'TSH', u: 'mIU/L', ph: '0.27–4.2', step: '0.01' },
    { g: '甲状腺与营养', k: 'lab_b12', n: '维生素 B12', u: 'pg/mL', ph: '200–900', step: '1' },
    { g: '甲状腺与营养', k: 'lab_fol', n: '叶酸', u: 'ng/mL', ph: '3.0–20', step: '0.1' },
    { g: '甲状腺与营养', k: 'lab_hcy', n: '同型半胱氨酸', u: 'μmol/L', ph: '5–15', step: '0.1' }
  ];
  var LAB_KEYS = LABS.map(function (l) { return l.k; });

  function blank() {
    var s = {
      age: null, sex: '', edu: '', family: '',
      mmse: null, moca: null,
      apoe: 'unknown', hippo: 'unknown', pet: 'unknown', ptau: 'unknown',
      bmi: null, htn: '', dm: '', smoke: ''
    };
    LAB_KEYS.forEach(function (k) { s[k] = null; });
    return s;
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

    var filledLabs = 0;
    LAB_KEYS.forEach(function (k) { if (s[k] != null) filledLabs += 1; });
    if (filledLabs < LAB_KEYS.length) {
      items.push({
        n: '实验室检查（' + (LAB_KEYS.length - filledLabs) + ' / ' + LAB_KEYS.length + ' 未录入）',
        t: 'MAR · 可逆因素',
        l: 'scale',
        d: '不插补；B12、叶酸、TSH、同型半胱氨酸建议补查，其余项目影响较小。'
      });
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

  /* ---------------------------------------------------------- labs */
  function labCount(s) {
    var n = 0;
    LAB_KEYS.forEach(function (k) { if (s[k] != null) n += 1; });
    return n;
  }

  function labFlags(s) {
    var out = [];
    var male = s.sex === 'male';

    function add(k, name, unit, dir, advice, p) {
      var v = s[k];
      if (v == null || !isFinite(v)) return;
      out.push({
        k: k, name: name, unit: unit, dir: dir,
        tag: dir === 'low' ? '偏低' : '偏高',
        value: v, advice: advice, p: p
      });
    }

    var v;

    v = s.lab_b12;
    if (v != null && v < 200) add('lab_b12', '维生素 B12', 'pg/mL', 'low', '可能与认知下降相关，建议复查并评估补充。', 1);

    v = s.lab_fol;
    if (v != null && v < 3.0) add('lab_fol', '叶酸', 'ng/mL', 'low', '建议补充叶酸并复查。', 2);

    v = s.lab_tsh;
    if (v != null && v > 4.2) add('lab_tsh', 'TSH', 'mIU/L', 'high', '提示甲状腺功能减退可能，建议内分泌科就诊。', 3);
    if (v != null && v < 0.27) add('lab_tsh', 'TSH', 'mIU/L', 'low', '建议内分泌科评估甲状腺功能。', 3);

    v = s.lab_hcy;
    if (v != null && v > 15) add('lab_hcy', '同型半胱氨酸', 'μmol/L', 'high', '与血管和认知风险相关，建议补充叶酸/B12 后复查。', 4);

    v = s.lab_hgb;
    if (v != null && v < (male ? 130 : 115)) add('lab_hgb', '血红蛋白', 'g/L', 'low', '提示贫血，建议查明原因（营养、慢性病、消化道失血等）。', 5);

    v = s.lab_glu;
    if (v != null && v > 6.1) add('lab_glu', '空腹血糖', 'mmol/L', 'high', '建议复查糖化血红蛋白，排查糖尿病。', 6);

    v = s.lab_ldl;
    if (v != null && v > 3.4) add('lab_ldl', 'LDL-C', 'mmol/L', 'high', '建议控制饮食并在医生指导下管理血脂。', 7);

    v = s.lab_tc;
    if (v != null && v > 5.2) add('lab_tc', '总胆固醇', 'mmol/L', 'high', '建议饮食控制并评估心血管风险。', 8);

    v = s.lab_plt;
    if (v != null && (v < 125 || v > 350)) add('lab_plt', '血小板计数', '×10⁹/L', v < 125 ? 'low' : 'high', '建议复查，必要时血液科就诊。', 9);

    v = s.lab_wbc;
    if (v != null && (v < 3.5 || v > 9.5)) add('lab_wbc', '白细胞计数', '×10⁹/L', v < 3.5 ? 'low' : 'high', '建议结合感染或炎症情况复查。', 10);

    v = s.lab_hct;
    if (v != null && v < (male ? 40 : 35)) add('lab_hct', '红细胞压积', '%', 'low', '建议结合血红蛋白与铁代谢检查。', 11);

    v = s.lab_rbc;
    if (v != null && v < (male ? 4.3 : 3.8)) add('lab_rbc', '红细胞计数', '×10¹²/L', 'low', '建议结合血红蛋白与铁代谢检查。', 12);

    out.sort(function (a, b) { return a.p - b.p; });
    return out;
  }

  function fmtLab(v) {
    return String(Math.round(Number(v) * 100) / 100);
  }

  function renderLabs(container, prefix) {
    if (!container) return;
    var html = '';
    var last = '';
    LABS.forEach(function (l) {
      if (l.g !== last) {
        html += '<div class="lab-group">' + l.g + '</div>';
        last = l.g;
      }
      var id = prefix + '-' + l.k;
      html += '<div class="field lab-field">' +
        '<label for="' + id + '">' + l.n + ' <span class="unit">' + l.u + '</span></label>' +
        '<input id="' + id + '" data-field="' + l.k + '" type="number" min="0" step="' + l.step + '" inputmode="decimal" placeholder="' + l.ph + '">' +
        '</div>';
    });
    container.innerHTML = html;
  }

  function updateLabMeta() {
    var p = $('#pLabMeta');
    var c = $('#cLabMeta');
    if (p) p.textContent = labCount(state.patient) + ' / ' + LABS.length + ' 已填';
    if (c) c.textContent = '可选 · ' + labCount(state.clinician) + ' / ' + LABS.length + ' 已填';
  }

  function renderPatientLabs(s) {
    var section = $('#pLabSection');
    var box = $('#pLabFlags');
    if (!section || !box) return;

    if (labCount(s) === 0) {
      section.hidden = true;
      box.innerHTML = '';
      return;
    }
    section.hidden = false;

    var flags = labFlags(s);
    if (!flags.length) {
      box.innerHTML = '<li class="flag-ok"><svg class="icon"><use href="#i-check"/></svg>' +
        '<span>已录入的实验室指标未见明显异常。</span></li>';
      return;
    }

    var shown = flags.slice(0, 4);
    box.innerHTML = shown.map(function (f) {
      return '<li class="flag-item">' +
        '<div class="flag-top"><b>' + esc(f.name) + '</b>' +
        '<span class="flag-val">' + esc(fmtLab(f.value)) + ' ' + esc(f.unit) + '</span>' +
        '<span class="flag-tag ' + f.dir + '">' + f.tag + '</span></div>' +
        '<p>' + esc(f.advice) + '</p></li>';
    }).join('');

    if (flags.length > 4) {
      box.innerHTML += '<li class="flag-more">另有 ' + (flags.length - 4) + ' 项异常，建议携带化验单到记忆门诊评估。</li>';
    }
  }

  function renderClinicianLabs(s) {
    var box = $('#cLabFlags');
    if (!box) return;

    if (labCount(s) === 0) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;

    var flags = labFlags(s);
    if (!flags.length) {
      box.innerHTML = '<div class="flag-ok"><svg class="icon"><use href="#i-check"/></svg>' +
        '<span>已录入的实验室指标未见明显异常。</span></div>';
      return;
    }

    var shown = flags.slice(0, 6);
    box.innerHTML = '<div class="lab-flag-head">异常提示</div>' + shown.map(function (f) {
      return '<div class="mini-flag">' +
        '<span class="flag-tag ' + f.dir + '">' + f.tag + '</span>' +
        '<b>' + esc(f.name) + '</b>' +
        '<span class="val">' + esc(fmtLab(f.value)) + ' ' + esc(f.unit) + '</span>' +
        '<span>' + esc(f.advice) + '</span></div>';
    }).join('');

    if (flags.length > 6) {
      box.innerHTML += '<div class="flag-more">另有 ' + (flags.length - 6) + ' 项异常，请结合化验单评估。</div>';
    }
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
    renderPatientLabs(state.patient);
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
    updateLabMeta();
    renderClinicianLabs(s);

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
      updateLabMeta();
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

  renderLabs($('#pLabs'), 'p');
  renderLabs($('#cLabs'), 'c');
  updateLabMeta();

  setMode(initial, false);
  renderClinician();

  if (demo === 'clinic') {
    fillForm(clinicianView, {
      age: 76, sex: 'male', edu: '6', family: 'yes',
      mmse: 23, moca: 19, apoe: 'two', hippo: 'moderate',
      pet: 'unknown', ptau: 'positive', bmi: 24.5, htn: 'yes', dm: 'no', smoke: 'quit',
      lab_wbc: 6.2, lab_rbc: 4.5, lab_hct: 42, lab_hgb: 128, lab_plt: 210,
      lab_glu: 6.8, lab_tc: 5.6, lab_ldl: 3.9,
      lab_tsh: 5.6, lab_b12: 180, lab_fol: 4.2, lab_hcy: 18.5
    });
    sync('clinician');
    renderClinician();
  } else if (demo === 'low') {
    fillForm(clinicianView, {
      age: 68, sex: 'female', edu: '15', family: 'no',
      mmse: 29, moca: 27, apoe: 'none', hippo: 'normal',
      pet: 'negative', ptau: 'negative', bmi: 22, htn: 'no', dm: 'no', smoke: 'no',
      lab_wbc: 5.5, lab_rbc: 4.6, lab_hct: 43, lab_hgb: 140, lab_plt: 230,
      lab_glu: 5.2, lab_tc: 4.6, lab_ldl: 2.8,
      lab_tsh: 2.1, lab_b12: 450, lab_fol: 8.5, lab_hcy: 9.8
    });
    sync('clinician');
    renderClinician();
  } else if (demo) {
    fillForm(patientView, {
      age: 72, sex: 'female', edu: '9', family: 'no',
      mmse: 25, moca: 21, apoe: 'one', hippo: 'mild',
      pet: 'unknown', ptau: 'unknown',
      lab_wbc: 6.0, lab_rbc: 4.4, lab_hct: 40, lab_hgb: 130, lab_plt: 220,
      lab_glu: 5.4, lab_tc: 4.8, lab_ldl: 3.0,
      lab_tsh: 2.4, lab_b12: 180, lab_fol: 4.2, lab_hcy: 18.5
    });
    sync('patient');
    updateLabMeta();
    setMode('patient', false);
    goStep(3);
  }

  if (params.get('labs')) {
    var labDetails = $('#pLabDetails');
    if (labDetails) labDetails.open = true;
  }

  if (!demo && params.get('step') === '2') goStep(2);

  if (params.get('method')) {
    var d = $('#methodDialog');
    if (d && typeof d.showModal === 'function') d.showModal();
  }
})();
