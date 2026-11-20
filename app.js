(() => {
  const KEY = 'sewing-planner-v1';
  const TYPES = ['外布', '里布', '衬布'];
  const DEFAULT_WIDTHS = { '外布': 145, '里布': 145, '衬布': 112 };
  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // UI color themes: swatch = [background, sidebar, accent]; fabric = default piece colors.
  const THEMES = {
    clay: { name: '陶土', swatch: ['#f7f2ec', '#efe6dc', '#8a5a44'], fabric: { '外布': '#8a5a44', '里布': '#5d7a8c', '衬布': '#a8963f' } },
    sage: { name: '鼠尾草', swatch: ['#f3f5ef', '#e3eadc', '#5f7a5a'], fabric: { '外布': '#5f7a5a', '里布': '#b07d4f', '衬布': '#8c8f9a' } },
    mist: { name: '雾霾蓝', swatch: ['#f1f4f7', '#e0e7ee', '#4f6d8a'], fabric: { '外布': '#4f6d8a', '里布': '#c08a5b', '衬布': '#8a9a6b' } },
    rose: { name: '樱花粉', swatch: ['#fbf4f5', '#f3e2e7', '#b0607a'], fabric: { '外布': '#b0607a', '里布': '#6b8a9a', '衬布': '#b59a5a' } },
    lavender: { name: '薰衣草', swatch: ['#f6f4f9', '#e8e3f0', '#76659a'], fabric: { '外布': '#76659a', '里布': '#c99a6b', '衬布': '#8fa88a' } },
    teal: { name: '海盐青', swatch: ['#f0f6f5', '#dcebe8', '#3f7f7a'], fabric: { '外布': '#3f7f7a', '里布': '#d08c6a', '衬布': '#9a9a6a' } },
    mustard: { name: '姜黄', swatch: ['#faf6ec', '#efe6cf', '#8c6a14'], fabric: { '外布': '#b08a2e', '里布': '#5d7a8c', '衬布': '#9a7a5a' } },
    navy: { name: '深海（深色）', swatch: ['#161b22', '#1f2630', '#7fb0d9'], fabric: { '外布': '#7fb0d9', '里布': '#d9a07f', '衬布': '#b8c27a' }, dark: true },
    ink:  { name: '墨夜（深色）', swatch: ['#1e1c1a', '#2a2724', '#d39a78'], fabric: { '外布': '#d39a78', '里布': '#7fa3b8', '衬布': '#c8b46a' }, dark: true },
  };

  let state = load();
  let saveTimer;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.projects)) return migrate(s);
    } catch (e) {}
    return { projects: [], currentId: null, theme: 'clay' };
  }
  // Fill in fields added in later versions so older data keeps working.
  function migrate(s) {
    if (!THEMES[s.theme]) s.theme = 'clay';
    s.projects.forEach((p) => {
      if (p.seam === undefined) p.seam = 1;
      if (p.seamIncluded === undefined) p.seamIncluded = true;
      p.pieces = p.pieces || []; p.steps = p.steps || []; p.notes = p.notes || ''; p.photos = p.photos || [];
      // v2: per-type colors/widths became a list of fabrics; pieces point at a fabric instead of a type.
      if (!Array.isArray(p.fabrics) || !p.fabrics.length) {
        const colors = p.colors || {}, widths = { ...DEFAULT_WIDTHS, ...(p.widths || {}) };
        p.fabrics = TYPES.map((t) => newFabric(t, colors[t] || null, widths[t]));
      }
      const firstOf = (t) => (p.fabrics.find((f) => f.type === t) || p.fabrics[0]).id;
      p.pieces.forEach((pc) => {
        if (!p.fabrics.some((f) => f.id === pc.fabric)) pc.fabric = firstOf(pc.type || '外布');
        delete pc.type;
      });
      delete p.colors; delete p.widths;
      p.pieces.forEach((pc) => {
        if (!pc.shape) { pc.shape = 'rect'; pc.params = { L: pc.w ?? '', W: pc.h ?? '' }; delete pc.w; delete pc.h; }
        pc.params = pc.params || {};
        pc.done = !!pc.done;
      });
    });
    return s;
  }
  function newFabric(type, color = null, width = DEFAULT_WIDTHS[type]) {
    return { id: 'f' + uid(), type, name: '', color, width };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    scheduleLayout();
  }
  const current = () => state.projects.find((p) => p.id === state.currentId);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const progress = (p) => {
    const total = p.steps.length, done = p.steps.filter((s) => s.done).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  // ---------- colors ----------
  const theme = () => THEMES[state.theme] || THEMES.clay;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const fabricsOfType = (p, t) => p.fabrics.filter((f) => f.type === t);
  const pieceFabric = (pc, p = current()) => p.fabrics.find((f) => f.id === pc.fabric) || p.fabrics[0];
  // "外布" when it is the only outer fabric, otherwise "外布 A", "外布 B"…
  const fabricCode = (f, p = current()) => {
    const same = fabricsOfType(p, f.type), i = same.indexOf(f);
    return same.length > 1 ? `${f.type} ${LETTERS[i] || i + 1}` : f.type;
  };
  const fabricLabel = (f, p = current()) => fabricCode(f, p) + (f.name ? ` · ${f.name}` : '');
  const fabricWidth = (f) => { const w = parseFloat(f.width); return w > 0 ? w : DEFAULT_WIDTHS[f.type]; };
  // Unset colors follow the theme; extra fabrics of the same type get lighter/darker variants.
  const fabricColor = (f, p = current()) => {
    if (f.color) return f.color;
    const base = theme().fabric[f.type], i = fabricsOfType(p, f.type).indexOf(f);
    return i <= 0 ? base : mix(base, i % 2 ? 255 : 0, Math.min(0.15 + 0.2 * Math.ceil(i / 2), 0.6));
  };
  const fabricOf = (pc, p = current()) => fabricColor(pieceFabric(pc, p), p);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const mix = (hex, to, k) => '#' + rgb(hex).map((v) => Math.round(v + (to - v) * k).toString(16).padStart(2, '0')).join('');
  // A version of the fabric color that stays visible against the page (white fabric on light theme, black on dark).
  const edgeOf = (hex) => {
    const L = lum(hex);
    if (!theme().dark && L > 0.72) return mix(hex, 0, 0.45);
    if (theme().dark && L < 0.25) return mix(hex, 255, 0.5);
    return hex;
  };
  const textOn = (hex) => (lum(hex) > 0.6 ? '#3b2f2a' : '#fff');

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    document.querySelector('meta[name=theme-color]').content = theme().swatch[2];
  }
  function openThemeDialog() {
    const dlg = $('themeDialog');
    dlg.innerHTML = `<h3>🎨 页面配色</h3>
      <div class="theme-grid">${Object.entries(THEMES).map(([k, t]) => `
        <button class="theme-opt${k === state.theme ? ' on' : ''}" data-theme-key="${k}">
          <span class="swatches">${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <span class="tname">${t.name}</span>
          <span class="tfab">默认布色 ${TYPES.map((ty) => `<b style="background:${t.fabric[ty]}" title="${ty}"></b>`).join('')}</span>
        </button>`).join('')}</div>
      <p class="muted">配色对所有项目生效。每个项目的布料颜色可以在「裁片清单 → 布料颜色」里单独设置，用来对应真实布料。</p>
      <div class="dlg-actions"><button class="btn primary" data-act="close">完成</button></div>`;
    dlg.onclick = (e) => {
      const opt = e.target.closest('[data-theme-key]');
      if (opt) {
        state.theme = opt.dataset.themeKey; save(); applyTheme();
        dlg.querySelectorAll('.theme-opt').forEach((b) => b.classList.toggle('on', b === opt));
        if (current()) { renderFabrics(); renderPieces(); }
      }
      if (e.target === dlg || e.target.closest('[data-act=close]')) dlg.close();
    };
    dlg.showModal();
  }
  $('themeBtn').addEventListener('click', openThemeDialog);

  function renderFabrics() {
    const p = current();
    const used = (f) => p.pieces.filter((pc) => pieceFabric(pc, p) === f).length;
    $('fabricList').innerHTML = p.fabrics.map((f) => `<div class="fab-row" data-fid="${f.id}">
        <input type="color" data-ff="color" value="${fabricColor(f, p)}" title="布料颜色">
        <b class="fab-code">${fabricCode(f, p)}</b>
        <select data-ff="type" title="种类">${TYPES.map((t) => `<option${t === f.type ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <input data-ff="name" class="fab-name" value="${escapeHtml(f.name)}" placeholder="名称 / 备注，如：米色亚麻">
        <label class="fab-width">布幅<input type="number" min="1" step="1" list="widthPresets" data-ff="width" value="${escapeHtml(f.width)}">cm</label>
        <span class="muted fab-used">${used(f)} 个裁片</span>
        <button class="icon-btn" data-fact="del" title="删除这块布"${p.fabrics.length < 2 ? ' disabled' : ''}>✕</button>
      </div>`).join('');
    $('resetColors').hidden = !p.fabrics.some((f) => f.color);
  }
  const fabricRow = (el) => { const row = el.closest('.fab-row'); return row && current().fabrics.find((f) => f.id === row.dataset.fid); };
  $('fabricList').addEventListener('input', (e) => {
    const f = fabricRow(e.target), k = e.target.dataset.ff; if (!f || !k) return;
    if (k === 'type') { f.type = e.target.value; save(); renderFabrics(); renderPieces(); return; }
    f[k] = e.target.value;
    if (k === 'color') $('resetColors').hidden = false;
    save(); renderPieces();
  });
  $('fabricList').addEventListener('click', (e) => {
    if (!e.target.closest('[data-fact=del]')) return;
    const p = current(), f = fabricRow(e.target);
    if (p.fabrics.length < 2) return;
    const rest = p.fabrics.filter((x) => x !== f), to = rest.find((x) => x.type === f.type) || rest[0];
    const users = p.pieces.filter((pc) => pieceFabric(pc, p) === f);
    if (!confirm(users.length ? `有 ${users.length} 个裁片用了「${fabricLabel(f, p)}」，删除后它们会改用「${fabricLabel(to, p)}」。确定删除？` : `删除「${fabricLabel(f, p)}」？`)) return;
    users.forEach((pc) => { pc.fabric = to.id; });
    p.fabrics = rest;
    save(); renderFabrics(); renderPieces();
  });
  $('addFabric').addEventListener('click', () => {
    const p = current(), last = p.fabrics[p.fabrics.length - 1];
    p.fabrics.push(newFabric(last ? last.type : '外布'));
    save(); renderFabrics(); renderPieces();
    $('fabricList').lastElementChild.querySelector('[data-ff=name]').focus();
  });
  $('resetColors').addEventListener('click', () => {
    current().fabrics.forEach((f) => { f.color = null; });
    save(); renderFabrics(); renderPieces();
  });

  // ---------- sidebar ----------
  function renderList() {
    const ul = $('projectList');
    ul.innerHTML = state.projects.map((p) => {
      const g = progress(p);
      const cls = [p.id === state.currentId ? 'active' : '', g.total && g.done === g.total ? 'done' : ''].join(' ');
      return `<li class="${cls}" data-id="${p.id}">
        <span class="pname">${escapeHtml(p.name || '未命名项目')}</span>
        <span class="pmeta"><span>${p.pieces.length} 裁片</span><span>${g.done}/${g.total} 步</span></span>
        <span class="mini"><i style="width:${g.pct}%"></i></span></li>`;
    }).join('');
  }
  $('projectList').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    state.currentId = li.dataset.id;
    save(); render();
    document.body.classList.remove('nav-open');
  });
  $('addProject').addEventListener('click', () => {
    const p = { id: uid(), name: '新的缝纫项目', created: new Date().toISOString(), seam: 1, seamIncluded: true, fabrics: TYPES.map((t) => newFabric(t)), pieces: [], steps: [], notes: '', photos: [] };
    state.projects.unshift(p);
    state.currentId = p.id;
    save(); render();
    document.body.classList.remove('nav-open');
    $('projName').focus(); $('projName').select();
  });

  // ---------- detail ----------
  function render() {
    renderList();
    const p = current();
    $('empty').hidden = !!p;
    $('detail').hidden = !p;
    if (!p) return;
    $('projName').value = p.name;
    $('projDate').textContent = '创建于 ' + new Date(p.created).toLocaleDateString('zh-CN');
    $('notes').value = p.notes;
    $('noteSaved').textContent = '';
    $('piecesCard').classList.toggle('collapsed', !!p.piecesCollapsed);
    renderSeam(); renderFabrics(); renderPieces(); renderSteps(); renderPhotos(); $('allowRotate').checked = !!current().allowRotate; renderLayout();
  }

  function renderProgress() {
    const p = current(), g = progress(p);
    $('progressBar').style.width = g.pct + '%';
    $('progressText').textContent = g.total ? `已完成 ${g.done} / ${g.total} 步（${g.pct}%）${g.done === g.total ? ' · 🎉 全部完成！' : ''}` : '还没有添加步骤';
    $('stepCount').textContent = g.total ? `${g.done}/${g.total}` : '';
    $('resetSteps').hidden = !g.done;
    renderList();
  }

  $('projName').addEventListener('input', (e) => { current().name = e.target.value; save(); renderList(); });
  $('deleteProject').addEventListener('click', () => {
    const p = current();
    if (!confirm(`确定删除「${p.name || '未命名项目'}」吗？此操作无法撤销。`)) return;
    p.photos.forEach((ph) => PhotoDB.del(ph.id).catch(() => {}));
    state.projects = state.projects.filter((x) => x.id !== p.id);
    state.currentId = state.projects[0]?.id ?? null;
    save(); render();
  });
  $('piecesHead').addEventListener('click', () => {
    const p = current();
    p.piecesCollapsed = !p.piecesCollapsed;
    $('piecesCard').classList.toggle('collapsed', p.piecesCollapsed);
    save();
  });

  // ---------- shapes & geometry (all units cm) ----------
  const SHAPES = {
    rect:       { label: '长方形', params: [['L', '长'], ['W', '宽']] },
    square:     { label: '正方形', params: [['a', '边长']] },
    circle:     { label: '圆形', params: [['d', '直径']] },
    semicircle: { label: '半圆形', params: [['d', '直径']] },
    ellipse:    { label: '椭圆形', params: [['a', '长径'], ['b', '短径']] },
    trapezoid:  { label: '梯形', params: [['t', '上底'], ['b', '下底'], ['h', '高']] },
    triangle:   { label: '三角形', params: [['b', '底边'], ['h', '高']] },
    ring:       { label: '圆环', params: [['D', '外径'], ['d', '内径']] },
    other:      { label: '其他（按纸样）', params: [['W', '外框宽'], ['H', '外框高']] },
    binding:    { label: '包边条', params: [['w', '成品宽'], ['L', '长度']] },
  };
  // Binding strips: the cut width already contains the folds, so no seam allowance is added.
  const FOLDS = {
    '4': { label: '四折包边（裁宽 = 成品宽 × 4）', k: 4 },
    '6': { label: '法式双层包边（裁宽 = 成品宽 × 6）', k: 6 },
    custom: { label: '自定义裁宽' },
  };
  const PIECE_SEAMS = ['0', '0.5', '0.7', '1', '1.5'];
  const SEAM_PRESETS = ['1', '0.7', '0.5', '0'];
  const fmt = (v) => String(+(+v).toFixed(1));
  const r3 = (v) => +v.toFixed(3);
  const num = (v) => { const x = parseFloat(v); return x > 0 ? x : NaN; };
  const seamOf = (p) => (Number(p.seam) >= 0 ? Number(p.seam) : 1);
  // A piece may override the project's seam allowance (pc.seam = null means "follow the project").
  const pieceSeam = (pc, p) => (pc.seam != null && Number(pc.seam) >= 0 ? Number(pc.seam) : seamOf(p));
  function bindingInfo(P) {
    const fold = FOLDS[P.fold] ? P.fold : '4', w = num(P.w), L = num(P.L);
    const cw = fold === 'custom' ? num(P.cw) : w * FOLDS[fold].k;
    if (!(L && cw)) return null;
    return { w, L, cw, fold, bias: P.grain !== 'straight' };
  }
  // Schematic preview of a binding strip (not to scale): 45° ends when cut on the bias, dashed fold lines.
  function bindingGeometry(P) {
    const b = bindingInfo(P); if (!b) return null;
    const H = 1, Wd = 6, sk = b.bias ? H : 0;
    const k = b.fold === 'custom' ? 2 : FOLDS[b.fold].k;
    const ys = b.fold === '6' ? [1 / 2, 1 / 6, 5 / 6] : Array.from({ length: k - 1 }, (_, j) => (j + 1) / k);
    const lines = ys.map((t) => { const y = t * H, xl = sk * (1 - t); return `M${r3(xl)} ${r3(y)}H${r3(xl + Wd)}`; }).join('');
    return { binding: true, b, s: 0, cut: polyPath([[sk, 0], [Wd + sk, 0], [Wd, H], [0, H]]), lines,
      bbox: { x: 0, y: 0, w: Wd + sk, h: H },
      cutText: `裁宽 ${fmt(b.cw)} × 长 ${fmt(b.L)} cm`, finText: b.w ? `成品宽 ${fmt(b.w)} cm` : '自定义裁宽' };
  }

  const ellPath = (cx, cy, rx, ry) => `M${r3(cx - rx)} ${r3(cy)}a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(2 * rx)} 0a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(-2 * rx)} 0Z`;
  const polyPath = (pts) => 'M' + pts.map(([x, y]) => `${r3(x)} ${r3(y)}`).join('L') + 'Z';
  const bboxOf = (pts) => {
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };
  const area = (pts) => pts.reduce((a, q, i) => { const n = pts[(i + 1) % pts.length]; return a + q[0] * n[1] - n[0] * q[1]; }, 0) / 2;
  // Offset a convex polygon by o (positive = outward, negative = inward), with mitered corners like a real cutting line.
  function offsetPoly(pts, o) {
    if (!o) return pts;
    const n = pts.length;
    const cx = pts.reduce((a, q) => a + q[0], 0) / n, cy = pts.reduce((a, q) => a + q[1], 0) / n;
    const lines = pts.map((a, i) => {
      const b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      let nx = dy / L, ny = -dx / L;
      if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
      return { x: a[0] + nx * o, y: a[1] + ny * o, dx, dy };
    });
    return pts.map((_, i) => {
      const A = lines[(i - 1 + n) % n], B = lines[i];
      const den = A.dx * B.dy - A.dy * B.dx;
      if (Math.abs(den) < 1e-9) return [B.x, B.y];
      const t = ((B.x - A.x) * B.dy - (B.y - A.y) * B.dx) / den;
      return [A.x + A.dx * t, A.y + A.dy * t];
    });
  }
  // The outline of a shape grown by o cm from the entered size: { d, bbox, text } or null if it collapses.
  function outline(shape, P, o) {
    const poly = (pts, prefix) => {
      const q = offsetPoly(pts, o), bb = bboxOf(q);
      if (bb.w <= 0.01 || bb.h <= 0.01 || Math.sign(area(q)) !== Math.sign(area(pts))) return null;
      return { d: polyPath(q), bbox: bb, text: `${prefix}${fmt(bb.w)} × ${fmt(bb.h)} cm` };
    };
    switch (shape) {
      case 'rect': case 'other': {
        const W = num(shape === 'rect' ? P.L : P.W), H = num(shape === 'rect' ? P.W : P.H);
        return W && H ? poly([[0, 0], [W, 0], [W, H], [0, H]], shape === 'other' ? '外框 ' : '') : null;
      }
      case 'square': {
        const a = num(P.a);
        return a ? poly([[0, 0], [a, 0], [a, a], [0, a]], '') : null;
      }
      case 'trapezoid': {
        const t = num(P.t), b = num(P.b), h = num(P.h); if (!(t && b && h)) return null;
        const w = Math.max(t, b);
        return poly([[(w - t) / 2, 0], [(w + t) / 2, 0], [(w + b) / 2, h], [(w - b) / 2, h]], '外框 ');
      }
      case 'triangle': {
        const b = num(P.b), h = num(P.h);
        return b && h ? poly([[b / 2, 0], [b, h], [0, h]], '外框 ') : null;
      }
      case 'circle': {
        const d = num(P.d); if (!d) return null;
        const r = d / 2, R = r + o; if (R <= 0) return null;
        return { d: ellPath(r, r, R, R), bbox: { x: r - R, y: r - R, w: 2 * R, h: 2 * R }, text: `直径 ${fmt(2 * R)} cm` };
      }
      case 'ellipse': {
        const a = num(P.a), b = num(P.b); if (!(a && b)) return null;
        const rx = a / 2 + o, ry = b / 2 + o; if (rx <= 0 || ry <= 0) return null;
        return { d: ellPath(a / 2, b / 2, rx, ry), bbox: { x: a / 2 - rx, y: b / 2 - ry, w: 2 * rx, h: 2 * ry }, text: `${fmt(2 * rx)} × ${fmt(2 * ry)} cm` };
      }
      case 'semicircle': {
        // Arc above a flat edge at y = r, centered at (r, r).
        const d = num(P.d); if (!d) return null;
        const r = d / 2, R = r + o, yFlat = r + o;
        if (R + o <= 0.01) return null;
        let path, bb;
        if (o >= 0) {
          path = `M${r3(r - R)} ${r3(r)}A${r3(R)} ${r3(R)} 0 0 1 ${r3(r + R)} ${r3(r)}L${r3(r + R)} ${r3(yFlat)}L${r3(r - R)} ${r3(yFlat)}Z`;
          bb = { x: r - R, y: r - R, w: 2 * R, h: R + o };
        } else {
          const half = Math.sqrt(R * R - o * o);
          path = `M${r3(r - half)} ${r3(yFlat)}A${r3(R)} ${r3(R)} 0 0 1 ${r3(r + half)} ${r3(yFlat)}Z`;
          bb = { x: r - half, y: r - R, w: 2 * half, h: R + o };
        }
        return { d: path, bbox: bb, text: `${fmt(bb.w)} × ${fmt(bb.h)} cm` };
      }
      case 'ring': {
        const D = num(P.D), dd = num(P.d); if (!(D && dd) || dd >= D) return null;
        const R = D / 2, Ro = R + o, Ri = Math.max(dd / 2 - o, 0);
        if (Ro <= 0 || Ri >= Ro) return null;
        return { d: ellPath(R, R, Ro, Ro) + (Ri > 0 ? ellPath(R, R, Ri, Ri) : ''), bbox: { x: R - Ro, y: R - Ro, w: 2 * Ro, h: 2 * Ro },
          text: `外径 ${fmt(2 * Ro)} / 内径 ${fmt(2 * Ri)} cm` };
      }
    }
    return null;
  }
  // When sizes include seam allowance the entered outline is the cutting line and the stitching line lies s inside it;
  // otherwise the entered outline is the stitching line and the cutting line lies s outside.
  // Returns { cut, fin, bbox, cutText, finText, tooSmall } or null when parameters are incomplete.
  function geometry(pc, p) {
    if (pc.shape === 'binding') return bindingGeometry(pc.params || {});
    const s = pieceSeam(pc, p), inc = p.seamIncluded !== false, P = pc.params || {};
    const cut = outline(pc.shape, P, inc ? 0 : s);
    if (!cut) return null;
    const fin = outline(pc.shape, P, inc ? -s : 0);
    return { cut: cut.d, bbox: cut.bbox, cutText: cut.text, fin: fin?.d, finText: fin ? fin.text : '缝份过大', tooSmall: !fin, s };
  }
  // real = true → viewBox units are cm and the SVG is sized in cm (1:1 for printing).
  function shapeSVG(pc, p, real = false) {
    const g = geometry(pc, p);
    if (!g) return '<span class="ph">填写尺寸后<br>自动生成形状</span>';
    const pad = real ? 0.3 : Math.max(g.bbox.w, g.bbox.h) * 0.05;
    const vb = [g.bbox.x - pad, g.bbox.y - pad, g.bbox.w + 2 * pad, g.bbox.h + 2 * pad].map(r3);
    const size = real ? `width="${vb[2]}cm" height="${vb[3]}cm"` : 'preserveAspectRatio="xMidYMid meet"';
    const fab = fabricOf(pc, p), edge = real ? '#000' : edgeOf(fab);
    const ns = 'vector-effect="non-scaling-stroke" fill-rule="evenodd"';
    const hasFin = g.s && g.fin;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" ${size}>
      <path d="${g.cut}" fill="${fab}" fill-opacity="${real ? 0 : hasFin ? 0.35 : 0.85}" stroke="${edge}" stroke-width="1.5" ${ns}/>
      ${hasFin ? `<path d="${g.fin}" fill="${fab}" fill-opacity="${real ? 0 : 0.85}" stroke="${edge}" stroke-width="1" stroke-dasharray="5 3" ${ns}/>` : ''}
      ${g.lines ? `<path d="${g.lines}" fill="none" stroke="${textOn(fab)}" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>` : ''}
    </svg>`;
  }
  const cutInfoHTML = (pc, p) => {
    const g = geometry(pc, p);
    if (!g) return '<span class="muted">尺寸待填写</span>';
    if (g.tooSmall) return '⚠ 缝份比裁片还大，请检查尺寸';
    if (g.binding) return `裁剪尺寸 <b>${g.cutText}</b><span class="fin-info">${g.finText} · ${g.b.bias ? '斜裁' : '直裁'}</span>`;
    return `裁剪尺寸 <b>${g.cutText}</b><span class="fin-info">净样 ${g.finText}</span>`;
  };

  // ---------- seam allowance ----------
  function renderSeam() {
    const p = current(), v = String(seamOf(p));
    const preset = SEAM_PRESETS.includes(v) && !p.seamCustom;
    $('seamSelect').value = preset ? v : 'custom';
    $('seamCustomWrap').hidden = preset;
    $('seamCustom').value = v;
    document.querySelector(`input[name=seamInc][value="${p.seamIncluded !== false ? 1 : 0}"]`).checked = true;
  }
  $('seamSelect').addEventListener('change', (e) => {
    const p = current();
    if (e.target.value === 'custom') {
      p.seamCustom = true;
      $('seamCustomWrap').hidden = false;
      $('seamCustom').value = seamOf(p);
      $('seamCustom').focus(); $('seamCustom').select();
    } else {
      p.seamCustom = false;
      p.seam = Number(e.target.value);
      $('seamCustomWrap').hidden = true;
    }
    save(); renderPieces();
  });
  $('seamCustom').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    current().seam = v >= 0 ? v : 0;
    save(); renderPieces();
  });
  document.querySelectorAll('input[name=seamInc]').forEach((r) => r.addEventListener('change', (e) => {
    current().seamIncluded = e.target.value === '1';
    save(); refreshAllPieces();
  }));

  // ---------- pieces ----------
  function pieceHTML(pc, p) {
    const sh = SHAPES[pc.shape] || SHAPES.rect;
    return `<div class="piece${pc.done ? ' done' : ''}" data-id="${pc.id}" style="--c:${edgeOf(fabricOf(pc, p))}">
      <button class="piece-preview" data-act="zoom" title="放大查看 / 打印 1:1 纸样">${shapeSVG(pc, p)}</button>
      <div class="piece-body">
        <div class="prow">
          <input type="checkbox" class="done-box" data-f="done" title="标记为已裁好" ${pc.done ? 'checked' : ''}>
          <input class="name-in" data-f="name" value="${escapeHtml(pc.name)}" placeholder="裁片名称，如：前片">
          <select class="type-sel" data-f="fabric" title="用哪块布">${fabricOptions(pc, p)}</select>
          <label class="qty-wrap">×<input data-f="qty" type="number" min="0" value="${escapeHtml(pc.qty)}"></label>
          <button class="icon-btn" data-act="del" title="删除裁片">✕</button>
        </div>
        <div class="prow">
          <select class="shape-sel" data-f="shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}"${k === pc.shape ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
          <span class="params">${sh.params.map(([k, l]) => `<label>${l}<input data-p="${k}" type="number" min="0" step="0.1" value="${escapeHtml(pc.params[k] ?? '')}">cm</label>`).join('')}</span>
          ${pc.shape === 'binding' ? bindingControls(pc) : seamControl(pc, p)}
        </div>
        <div class="prow">
          <span class="cut-info">${cutInfoHTML(pc, p)}</span>
          <input class="note-in" data-f="note" value="${escapeHtml(pc.note)}" placeholder="备注：对折裁 / 注意布纹方向等">
        </div>
      </div></div>`;
  }
  function fabricOptions(pc, p) {
    const cur = pieceFabric(pc, p);
    return TYPES.map((t) => {
      const list = fabricsOfType(p, t); if (!list.length) return '';
      return `<optgroup label="${t}">${list.map((f) => `<option value="${f.id}"${f === cur ? ' selected' : ''}>${escapeHtml(fabricLabel(f, p))}</option>`).join('')}</optgroup>`;
    }).join('');
  }
  function seamControl(pc, p) {
    const v = pc.seam == null ? 'follow' : !pc.seamCustom && PIECE_SEAMS.includes(String(pc.seam)) ? String(pc.seam) : 'custom';
    const opt = (val, label) => `<option value="${val}"${v === val ? ' selected' : ''}>${label}</option>`;
    return `<label class="piece-seam${v === 'follow' ? '' : ' own'}">缝份<select data-f="seamSel">
        ${opt('follow', `跟随项目（${fmt(seamOf(p))} cm）`)}${opt('0', '无缝份')}
        ${PIECE_SEAMS.slice(1).map((x) => opt(x, `${x} cm`)).join('')}${opt('custom', '自定义…')}
      </select>${v === 'custom' ? `<input data-f="seamVal" type="number" min="0" step="0.1" value="${escapeHtml(pc.seam)}">cm` : ''}</label>`;
  }
  function bindingControls(pc) {
    const P = pc.params, fold = FOLDS[P.fold] ? P.fold : '4';
    return `<select data-p="fold" class="mini-sel">${Object.entries(FOLDS).map(([k, f]) => `<option value="${k}"${k === fold ? ' selected' : ''}>${f.label}</option>`).join('')}</select>
      ${fold === 'custom' ? `<span class="params"><label>裁宽<input data-p="cw" type="number" min="0" step="0.1" value="${escapeHtml(P.cw ?? '')}">cm</label></span>` : ''}
      <select data-p="grain" class="mini-sel"><option value="bias"${P.grain !== 'straight' ? ' selected' : ''}>斜裁（45°，有弹性，适合弧线）</option><option value="straight"${P.grain === 'straight' ? ' selected' : ''}>直裁（横向裁条，适合直边）</option></select>
      <span class="muted">不加缝份</span>`;
  }
  function rerenderPiece(card, pc, focusSel) {
    card.outerHTML = pieceHTML(pc, current());
    if (focusSel) $('pieceList').querySelector(`[data-id="${pc.id}"] ${focusSel}`)?.focus();
  }
  function renderPieces() {
    const p = current();
    $('pieceList').innerHTML = p.pieces.length
      ? p.pieces.map((pc) => pieceHTML(pc, p)).join('')
      : '<div class="no-rows">还没有裁片，点击下方「添加裁片」</div>';
    renderSummary();
  }
  function refreshPiece(card, pc) {
    const p = current();
    card.style.setProperty('--c', edgeOf(fabricOf(pc, p)));
    card.classList.toggle('done', !!pc.done);
    card.querySelector('.piece-preview').innerHTML = shapeSVG(pc, p);
    const info = card.querySelector('.cut-info');
    info.innerHTML = cutInfoHTML(pc, p);
    info.classList.toggle('err', !!geometry(pc, p)?.tooSmall);
  }
  function refreshAllPieces() {
    const p = current();
    $('pieceList').querySelectorAll('.piece').forEach((card) => refreshPiece(card, p.pieces.find((x) => x.id === card.dataset.id)));
  }
  function renderSummary() {
    const p = current();
    const sums = new Map();
    p.pieces.forEach((pc) => { const f = pieceFabric(pc, p); sums.set(f, (sums.get(f) || 0) + (Number(pc.qty) || 0)); });
    $('pieceSummary').innerHTML = p.fabrics.filter((f) => sums.get(f)).map((f) => {
      const c = fabricColor(f, p);
      return `<span class="chip" style="background:${c};color:${textOn(c)}" title="${escapeHtml(fabricLabel(f, p))}">${fabricCode(f, p)} × ${sums.get(f)}</span>`;
    }).join('');
    const done = p.pieces.filter((pc) => pc.done).length;
    $('pieceDone').textContent = p.pieces.length ? `已裁 ${done}/${p.pieces.length}` : '';
    $('resetPieces').hidden = !done;
    renderList();
  }
  $('addPiece').addEventListener('click', () => {
    const p = current();
    const last = p.pieces[p.pieces.length - 1];
    p.pieces.push({ id: uid(), name: '', fabric: last ? last.fabric : p.fabrics[0].id, qty: 2, shape: 'rect', params: {}, note: '', done: false });
    save(); renderPieces();
    $('pieceList').lastElementChild.querySelector('.name-in').focus();
  });
  $('resetPieces').addEventListener('click', () => {
    if (!confirm('清空所有裁片的「已完成」勾选？（裁片和尺寸都会保留）')) return;
    current().pieces.forEach((pc) => { pc.done = false; });
    save(); renderPieces();
  });
  const pieceOf = (el) => {
    const card = el.closest('.piece');
    return card && [card, current().pieces.find((x) => x.id === card.dataset.id)];
  };
  $('pieceList').addEventListener('input', (e) => {
    const hit = pieceOf(e.target); if (!hit) return;
    const [card, pc] = hit, { f, p: param } = e.target.dataset;
    if (f === 'seamSel') {
      const v = e.target.value;
      if (v === 'follow') { pc.seam = null; pc.seamCustom = false; }
      else if (v === 'custom') { pc.seamCustom = true; if (pc.seam == null) pc.seam = seamOf(current()); }
      else { pc.seam = Number(v); pc.seamCustom = false; }
      save(); rerenderPiece(card, pc, v === 'custom' ? '[data-f=seamVal]' : null);
      return;
    }
    if (f === 'seamVal') {
      const v = parseFloat(e.target.value);
      pc.seam = v >= 0 ? v : 0;
      save(); refreshPiece(card, pc);
      return;
    }
    if (param && e.target.tagName === 'SELECT') {
      pc.params[param] = e.target.value;
      save(); rerenderPiece(card, pc, param === 'fold' && e.target.value === 'custom' ? '[data-p=cw]' : null);
      return;
    }
    if (param) { pc.params[param] = e.target.value; refreshPiece(card, pc); }
    else if (f === 'done') { pc.done = e.target.checked; refreshPiece(card, pc); renderSummary(); }
    else if (f && f !== 'shape') {
      pc[f] = e.target.value;
      if (f === 'fabric') refreshPiece(card, pc);
      if (f === 'fabric' || f === 'qty') { renderSummary(); renderFabrics(); }
    }
    save();
  });
  $('pieceList').addEventListener('change', (e) => {
    if (e.target.dataset.f !== 'shape') return;
    const [card, pc] = pieceOf(e.target);
    pc.shape = e.target.value;
    pc.params = pc.shape === 'binding' ? { fold: '4', grain: 'bias' } : {};
    save();
    card.outerHTML = pieceHTML(pc, current());
    $('pieceList').querySelector(`[data-id="${pc.id}"] [data-p]`)?.focus();
  });
  $('pieceList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const [, pc] = pieceOf(btn);
    if (btn.dataset.act === 'del') {
      current().pieces = current().pieces.filter((x) => x.id !== pc.id);
      save(); renderPieces();
    } else if (btn.dataset.act === 'zoom') openPieceDialog(pc);
  });

  // ---------- piece dialog & 1:1 print ----------
  function openPieceDialog(pc) {
    const p = current(), g = geometry(pc, p);
    if (g && g.binding) return openBindingDialog(pc, p, g);
    const s = g ? g.s : pieceSeam(pc, p);
    const fits = g && ((g.bbox.w <= 19 && g.bbox.h <= 27) || (g.bbox.w <= 27 && g.bbox.h <= 19));
    const dlg = $('pieceDialog');
    dlg.innerHTML = `<h3>${escapeHtml(pc.name || '未命名裁片')} · <span style="color:${edgeOf(fabricOf(pc, p))}">${escapeHtml(fabricLabel(pieceFabric(pc, p), p))}</span>${pc.done ? ' <span class="muted">（已裁）</span>' : ''}</h3>
      <div class="dlg-svg">${shapeSVG(pc, p)}</div>
      <div class="legend"><span><i></i>裁剪线</span><span><i class="fin"></i>净样线（缝合线）</span></div>
      <dl class="dlg-info">
        <dt>形状</dt><dd>${SHAPES[pc.shape]?.label || ''}</dd>
        <dt>缝份</dt><dd>${fmt(s)} cm（${pc.seam != null ? '本裁片单独设置' : '跟随项目'}，输入尺寸${p.seamIncluded !== false ? '已含' : '不含'}缝份）</dd>
        <dt>裁剪尺寸</dt><dd><b>${g ? g.cutText : '—'}</b></dd>
        <dt>净样尺寸</dt><dd>${g ? g.finText : '—'}</dd>
        <dt>数量</dt><dd>${escapeHtml(pc.qty)} 片</dd>
        ${pc.note ? `<dt>备注</dt><dd>${escapeHtml(pc.note)}</dd>` : ''}
      </dl>
      <p class="muted">${!g ? '' : !fits ? '⚠ 这个裁片超过 A4 纸可打印范围，1:1 打印会被截断，建议直接在布上画。' : g.bbox.w > 19 ? '这个裁片需要把纸张方向设为「横向」打印，缩放选「100% / 实际大小」。' : '打印时请把缩放设为「100% / 实际大小」，并用纸样上的 5 cm 比例尺核对。'}</p>
      <div class="dlg-actions">
        ${g ? '<button class="btn" data-act="print">🖨 打印 1:1 纸样</button>' : ''}
        <button class="btn primary" data-act="close">关闭</button>
      </div>`;
    dlg.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (e.target === dlg || act === 'close') dlg.close();
      if (act === 'print') { dlg.close(); printPiece(pc); }
    };
    dlg.showModal();
  }
  function openBindingDialog(pc, p, g) {
    const b = g.b, n = Math.max(Math.floor(Number(pc.qty) || 0), 0), dlg = $('pieceDialog');
    dlg.innerHTML = `<h3>${escapeHtml(pc.name || '包边条')} · <span style="color:${edgeOf(fabricOf(pc, p))}">${escapeHtml(fabricLabel(pieceFabric(pc, p), p))}</span>${pc.done ? ' <span class="muted">（已裁）</span>' : ''}</h3>
      <div class="dlg-svg" style="height:140px">${shapeSVG(pc, p)}</div>
      <div class="legend"><span><i></i>裁剪线</span><span><i class="fin"></i>折痕（示意，不按比例）</span></div>
      <dl class="dlg-info">
        <dt>折法</dt><dd>${FOLDS[b.fold].label}</dd>
        <dt>裁法</dt><dd>${b.bias ? '斜裁：与布边成 45° 裁条，弹性好，适合领口、袖窿等弧线' : '直裁：沿布幅横向裁条，适合直边'}</dd>
        <dt>成品宽</dt><dd>${b.w ? fmt(b.w) + ' cm' : '—'}</dd>
        <dt>裁宽</dt><dd><b>${fmt(b.cw)} cm</b>（不另加缝份）</dd>
        <dt>长度</dt><dd>${fmt(b.L)} cm × ${n} 条 = <b>共 ${fmt(b.L * n)} cm</b></dd>
        ${pc.note ? `<dt>备注</dt><dd>${escapeHtml(pc.note)}</dd>` : ''}
      </dl>
      <p class="muted">${b.bias ? '用布估算按「连续斜裁法」计算（用一块方布缝成筒再螺旋裁出一整条），另加 10% 拼接余量。' : '用布估算按横向裁条计算，每条之间按一个裁宽留拼接余量。'}</p>
      <div class="dlg-actions"><button class="btn primary" data-act="close">关闭</button></div>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-act=close]')) dlg.close(); };
    dlg.showModal();
  }
  function printPiece(pc) {
    const p = current(), g = geometry(pc, p);
    $('printArea').innerHTML = `<div><b>${escapeHtml(p.name)} · ${escapeHtml(pc.name || '裁片')}</b>（${escapeHtml(fabricLabel(pieceFabric(pc, p), p))}，裁 ${escapeHtml(pc.qty)} 片）
      ｜ 缝份 ${fmt(g.s)} cm ｜ 裁剪 ${g.cutText} ｜ 净样 ${g.finText} ｜ 实线=裁剪线，虚线=净样线</div>
      ${shapeSVG(pc, p, true)}
      <div class="scale"><svg xmlns="http://www.w3.org/2000/svg" width="5.2cm" height="0.8cm" viewBox="-0.1 0 5.2 0.8">
        <path d="M0 0.1V0.5H5V0.1" fill="none" stroke="#000" stroke-width="0.03"/>
        <text x="2.5" y="0.78" font-size="0.28" text-anchor="middle">5 cm</text></svg></div>`;
    window.print();
  }

  // ---------- to-scale layout of every piece ----------
  let layoutQueued = false;
  function scheduleLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    setTimeout(() => { layoutQueued = false; if (current()) renderLayout(); }, 30);
  }
  // ---------- fabric width & yardage ----------
  $('allowRotate').addEventListener('change', (e) => { current().allowRotate = e.target.checked; save(); });

  // Shelf packing (first-fit, tallest first) inside a strip of the fabric width.
  // Returns placements and the fabric length used. Pieces wider than the fabric get their own row and are flagged.
  function packStrip(items, FW, gap, rotate) {
    const parts = items.map((it) => {
      let { w, h } = it.g.bbox, rot = false;
      if (rotate) {
        // Prefer lying the long side across the width when it fits; otherwise whichever orientation fits.
        const flatFits = Math.max(w, h) <= FW;
        if ((flatFits && h > w) || (!flatFits && w > FW && h <= FW)) { [w, h] = [h, w]; rot = true; }
      }
      return { ...it, w, h, rot, tooWide: w > FW };
    });
    const order = new Map(items.map((it, i) => [it, i]));
    parts.sort((a, b) => (b.h - a.h) || (order.get(a) - order.get(b)));
    const shelves = [];
    let length = 0;
    parts.forEach((pt) => {
      let sh = shelves.find((x) => !pt.tooWide && x.used + (x.used ? gap : 0) + pt.w <= FW && pt.h <= x.h);
      if (!sh) { sh = { y: length ? length + gap : 0, h: pt.h, used: 0 }; shelves.push(sh); length = sh.y + sh.h; }
      pt.x = sh.used ? sh.used + gap : 0; pt.y = sh.y;
      sh.used = pt.x + pt.w;
    });
    return { parts, length };
  }
  // Fabric needed for binding, as rectangles to pack: one block for continuous bias, or crosswise strips.
  function bindingRects(pc, b, n, FW) {
    const total = b.L * n, rect = (w, h) => ({ cut: polyPath([[0, 0], [w, 0], [w, h], [0, h]]), bbox: { x: 0, y: 0, w, h }, cutText: `${fmt(w)} × ${fmt(h)} cm`, s: 0 });
    const name = pc.name || '包边条';
    if (b.bias) {
      const areaNeeded = b.cw * total * 1.1, a = Math.sqrt(areaNeeded);
      const [w, h] = a <= FW ? [a, a] : [FW, areaNeeded / FW];
      return [{ pc, g: rect(w, h), i: 0, n: 1, key: `${pc.id}:b0`, label: `${name}（斜裁用料）` }];
    }
    const usable = Math.max(FW - b.cw, 1), strips = [];
    for (let rem = total; rem > 0.01 && strips.length < 50; rem -= usable) strips.push(Math.min(Math.min(rem, usable) + b.cw, FW));
    return strips.map((w, i) => ({ pc, g: rect(w, b.cw), i, n: strips.length, key: `${pc.id}:b${i}`, label: `${name} ${i + 1}/${strips.length}` }));
  }
  // ---------- manual arrangement (drag pieces in the layout) ----------
  // p.manualLayout[fabricId][pieceKey] = { x, y, rot } — once a fabric is arranged by hand its auto layout is frozen.
  let lastParts = new Map();
  const SNAP = 0.5;
  function applyManual(gr, p, gap) {
    const saved = (p.manualLayout || {})[gr.f.id];
    if (!saved) return gr;
    const placed = [], loose = [];
    gr.parts.forEach((pt) => {
      const sv = saved[pt.key];
      if (!sv) { loose.push(pt); return; }
      if (!!sv.rot !== pt.rot) { [pt.w, pt.h] = [pt.h, pt.w]; pt.rot = !!sv.rot; }
      pt.x = sv.x; pt.y = sv.y; pt.tooWide = pt.w > gr.FW;
      placed.push(pt);
    });
    // Pieces added after arranging go in a new block underneath.
    const base = placed.reduce((m, pt) => Math.max(m, pt.y + pt.h), 0);
    const extra = loose.length ? packStrip(loose, gr.FW, gap, !!p.allowRotate).parts : [];
    extra.forEach((pt) => { pt.y += base ? base + gap : 0; });
    const parts = [...placed, ...extra];
    return { ...gr, parts, manual: true, length: parts.reduce((m, pt) => Math.max(m, pt.y + pt.h), 0) };
  }
  function checkLayout(gr) {
    const eps = 0.05;
    gr.parts.forEach((a) => { a.out = a.x < -eps || a.x + a.w > gr.FW + eps; a.overlap = false; });
    gr.parts.forEach((a, i) => gr.parts.slice(i + 1).forEach((b) => {
      if (a.x + a.w - eps > b.x && b.x + b.w - eps > a.x && a.y + a.h - eps > b.y && b.y + b.h - eps > a.y) a.overlap = b.overlap = true;
    }));
    return gr;
  }
  // Freeze the current layout of a fabric so it can be edited by hand.
  function manualFor(fid) {
    const p = current();
    p.manualLayout = p.manualLayout || {};
    const m = p.manualLayout[fid] || (p.manualLayout[fid] = {});
    (lastParts.get(fid)?.parts || []).forEach((pt) => { if (!m[pt.key]) m[pt.key] = { x: pt.x, y: pt.y, rot: pt.rot }; });
    return m;
  }
  const toSvg = (svg, e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  let drag = null;
  $('layout').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.lp'); if (!el || e.button > 0) return;
    const svg = el.ownerSVGElement, st = toSvg(svg, e);
    drag = { el, svg, fid: el.dataset.fid, key: el.dataset.key, sx: st.x, sy: st.y, dx: 0, dy: 0 };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    e.preventDefault();
  });
  $('layout').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = toSvg(drag.svg, e);
    drag.dx = pt.x - drag.sx; drag.dy = pt.y - drag.sy;
    drag.el.setAttribute('transform', `translate(${r3(drag.dx)} ${r3(drag.dy)})`);
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag; drag = null;
    d.el.classList.remove('dragging');
    if (Math.hypot(d.dx, d.dy) < SNAP / 2) { d.el.removeAttribute('transform'); return; }
    const m = manualFor(d.fid), pos = m[d.key], info = lastParts.get(d.fid);
    const part = info.parts.find((x) => x.key === d.key);
    const snap = (v) => Math.round(v / SNAP) * SNAP;
    pos.x = Math.min(Math.max(snap(pos.x + d.dx), 0), Math.max(info.FW - part.w, 0));
    pos.y = Math.max(snap(pos.y + d.dy), 0);
    save(); renderLayout();
  };
  $('layout').addEventListener('pointerup', endDrag);
  $('layout').addEventListener('pointercancel', endDrag);
  $('layout').addEventListener('dblclick', (e) => {
    const el = e.target.closest('.lp'); if (!el) return;
    const pos = manualFor(el.dataset.fid)[el.dataset.key];
    pos.rot = !pos.rot;
    save(); renderLayout();
  });
  $('yardage').addEventListener('click', (e) => {
    const fid = e.target.closest('[data-reset-layout]')?.dataset.resetLayout; if (!fid) return;
    delete current().manualLayout[fid];
    save(); renderLayout();
  });

  const HELP_LEN = `<span class="help" tabindex="0" role="button" aria-label="什么是占用布长">?<span class="help-pop" role="tooltip">
    <b>占用布长</b>：把这块布的所有裁片按布幅一排排摆好后，沿布长方向一共占用的长度，也就是下方排料图里虚线框的长度。<br>
    <b>建议购买</b> = 占用布长 + 10% 余量（缩水、修整布边），再向上取整到 0.1 m。<br>
    这是粗略估算：裁片按外接矩形排，实际排料通常还能更省一点。</span></span>`;
  const YARD_MARGIN = 0.1; // 10% extra for shrinkage and straightening the cut edge
  function renderLayout() {
    const p = current(), box = $('layout');
    const items = [];
    p.pieces.forEach((pc) => {
      const g = geometry(pc, p); if (!g) return;
      const n = Math.min(Math.max(Math.floor(Number(pc.qty) || 0), 0), 50);
      if (g.binding) { if (n) bindingRects(pc, g.b, n, fabricWidth(pieceFabric(pc, p))).forEach((it) => items.push(it)); return; }
      for (let i = 0; i < n; i++) items.push({ pc, g, i, n, key: `${pc.id}:${i}` });
    });
    if (!items.length) {
      $('yardage').innerHTML = '';
      box.innerHTML = '<div class="no-rows">填写裁片尺寸和数量后，这里会按布幅排布所有裁片，并估算需要买多少布</div>';
      return;
    }
    const gap = 0.5;
    const groups = p.fabrics.map((f) => ({ f, t: fabricLabel(f, p), items: items.filter((it) => pieceFabric(it.pc, p) === f) }))
      .filter((gr) => gr.items.length)
      .map((gr) => { const FW = fabricWidth(gr.f); return checkLayout(applyManual({ ...gr, FW, ...packStrip(gr.items, FW, gap, !!p.allowRotate) }, p, gap)); });
    lastParts = new Map(groups.map((gr) => [gr.f.id, { FW: gr.FW, parts: gr.parts }]));

    // Yardage cards
    $('yardage').innerHTML = groups.map((gr) => {
      const buy = Math.ceil((gr.length * (1 + YARD_MARGIN)) / 10) / 10; // metres, rounded up to 0.1 m
      const names = (pred) => [...new Set(gr.parts.filter(pred).map((x) => x.label || (x.pc.name || '裁片') + (x.n > 1 ? ` ${x.i + 1}/${x.n}` : '')))].join('、');
      const wide = names((x) => x.tooWide), out = names((x) => x.out && !x.tooWide), lap = names((x) => x.overlap);
      return `<div class="yard" style="--c:${edgeOf(fabricColor(gr.f, p))}">${escapeHtml(gr.t)} · 布幅 ${fmt(gr.FW)} cm
        <b>约 ${buy.toFixed(1)} m</b>占用布长 ${fmt(gr.length)} cm${HELP_LEN} + 10% 余量
        ${wide ? `<div class="warn">⚠ ${escapeHtml(wide)} 比布幅还宽，需要拼接或换更宽的布</div>` : ''}
        ${out ? `<div class="warn">⚠ ${escapeHtml(out)} 超出了布幅</div>` : ''}
        ${lap ? `<div class="warn">⚠ ${escapeHtml(lap)} 有重叠</div>` : ''}
        ${gr.manual ? `<div class="manual-tag">✋ 手动排布 <button class="link-btn" data-reset-layout="${gr.f.id}">↺ 恢复自动排布</button></div>` : ''}</div>`;
    }).join('');

    // Drawing: one fabric strip per type, all at the same scale.
    const W = Math.max(...groups.map((gr) => Math.max(gr.FW, ...gr.parts.map((x) => x.w))));
    const fs = W * 0.022;
    const ns = 'vector-effect="non-scaling-stroke" fill-rule="evenodd"';
    const out = [];
    let y = 0;
    groups.forEach((gr) => {
      const { t, FW, parts, length } = gr;
      const fab = fabricColor(gr.f, p), edge = edgeOf(fab);
      const kinds = new Set(parts.map((x) => x.pc.id)).size;
      out.push(`<text x="0" y="${r3(y + fs)}"><tspan font-size="${r3(fs * 1.05)}" font-weight="600" style="fill:${edge}">${escapeHtml(t)}</tspan><tspan dx="${r3(fs * 0.6)}" font-size="${r3(fs * 0.85)}" style="fill:var(--muted)">${kinds} 种 · 共 ${parts.length} 片 · 布幅 ${fmt(FW)} cm × 占用布长 ${fmt(length)} cm</tspan></text>`);
      y += fs * 1.7;
      out.push(`<rect x="0" y="${r3(y)}" width="${r3(FW)}" height="${r3(Math.max(length, 1))}" style="fill:var(--field);stroke:var(--line)" stroke-dasharray="6 4" ${ns}/>`);
      parts.forEach(({ pc, g, i, n, key, x, y: py, w, h, rot, tooWide, out: outside, overlap, label: fixedLabel }) => {
        const bad = tooWide || outside || overlap;
        const X = x, Y = y + py, bb = g.bbox;
        const tf = rot ? `translate(${r3(X + bb.y + bb.h)} ${r3(Y - bb.x)}) rotate(90)` : `translate(${r3(X - bb.x)} ${r3(Y - bb.y)})`;
        const label = fixedLabel || (pc.name || '裁片') + (n > 1 ? ` ${i + 1}/${n}` : '');
        const lf = Math.min(fs, h * 0.6, (w * 0.9) / Math.max(label.length * 0.85, 1));
        const hasFin = g.s && g.fin;
        const show = lf >= fs * 0.35;
        out.push(`<g class="lp" data-fid="${gr.f.id}" data-key="${key}" opacity="${pc.done ? 0.35 : 1}">
          <title>${escapeHtml(label)}（${escapeHtml(t)}${rot ? '，已旋转 90°' : ''}${pc.done ? '，已裁' : ''}）裁剪 ${g.cutText}</title>
          <g transform="${tf}">
            <path d="${g.cut}" fill="${fab}" fill-opacity="${hasFin ? 0.35 : 0.85}" stroke="${bad ? 'var(--danger)' : edge}" stroke-width="${bad ? 2.2 : 1.2}" ${ns}/>
            ${hasFin ? `<path d="${g.fin}" fill="${fab}" fill-opacity="0.85" stroke="${edge}" stroke-width="0.8" stroke-dasharray="4 3" ${ns}/>` : ''}
          </g>
          ${show ? `<text x="${r3(X + w / 2)}" y="${r3(Y + h / 2)}" font-size="${r3(lf)}" text-anchor="middle" dominant-baseline="central" style="fill:${textOn(fab)}">${escapeHtml(label)}${rot ? ' ↻' : ''}</text>` : ''}
          ${pc.done && show ? `<text x="${r3(X + w / 2)}" y="${r3(Y + h / 2 + lf * 1.2)}" font-size="${r3(lf * 0.9)}" text-anchor="middle" dominant-baseline="central" style="fill:${textOn(fab)}">✓</text>` : ''}
        </g>`);
      });
      y += Math.max(length, 1) + fs * 2;
    });
    // 10 cm scale bar
    out.push(`<g style="stroke:var(--muted);fill:var(--muted)">
      <path d="M0 ${r3(y)}v${r3(fs * 0.5)}h10v${r3(-fs * 0.5)}" fill="none" vector-effect="non-scaling-stroke"/>
      <text x="${r3(10 + fs * 0.5)}" y="${r3(y + fs * 0.5)}" font-size="${r3(fs * 0.8)}" stroke="none">10 cm</text></g>`);
    y += fs * 1.2;
    const pad = 1;
    box.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(-pad)} ${r3(-pad)} ${r3(W + 2 * pad)} ${r3(y + 2 * pad)}" role="img" aria-label="排料图">${out.join('')}</svg>`;
  }

  // ---------- finished photos (stored in IndexedDB; localStorage is too small for images) ----------
  const PhotoDB = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('xincai-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('photos', mode), req = fn(t.objectStore('photos'));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      get: (id) => run('readonly', (st) => st.get(id)),
      put: (id, v) => run('readwrite', (st) => st.put(v, id)),
      del: (id) => run('readwrite', (st) => st.delete(id)),
      clear: () => run('readwrite', (st) => st.clear()),
    };
  })();
  const photoCache = new Map();
  const photoSrc = async (id) => {
    if (!photoCache.has(id)) photoCache.set(id, await PhotoDB.get(id));
    return photoCache.get(id);
  };
  // Shrink to at most 1600 px on the long side so many photos fit in browser storage.
  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    } finally { URL.revokeObjectURL(url); }
  }
  function renderPhotos() {
    const p = current(), grid = $('photoGrid');
    if (!p.photos.length) { grid.innerHTML = '<div class="no-rows photo-empty">还没有照片。做好后上传成品照片，留个纪念吧 📷</div>'; return; }
    grid.innerHTML = p.photos.map((ph) => `<button class="photo" data-id="${ph.id}" title="${escapeHtml(ph.caption || '')}">
      <img alt="${escapeHtml(ph.caption || '成品照片')}">
      <span class="cap">${escapeHtml(ph.caption || new Date(ph.date).toLocaleDateString('zh-CN'))}</span></button>`).join('');
    grid.querySelectorAll('.photo').forEach(async (el) => {
      const src = await photoSrc(el.dataset.id).catch(() => null);
      if (src) el.querySelector('img').src = src;
    });
  }
  $('photoInput').addEventListener('change', async (e) => {
    const p = current(), files = [...e.target.files];
    e.target.value = '';
    let failed = 0;
    for (const f of files) {
      try {
        const data = await compressImage(f), id = uid();
        await PhotoDB.put(id, data);
        photoCache.set(id, data);
        p.photos.push({ id, date: new Date().toISOString(), caption: '' });
      } catch (err) { failed++; }
    }
    save(); renderPhotos();
    if (failed) alert(`${failed} 张照片无法读取（可能是浏览器不支持的格式，如 HEIC，请先转成 JPG）。`);
  });
  $('photoGrid').addEventListener('click', (e) => {
    const el = e.target.closest('.photo'); if (el) openPhoto(el.dataset.id);
  });
  async function openPhoto(id) {
    const p = current(), ph = p.photos.find((x) => x.id === id), dlg = $('photoDialog');
    dlg.innerHTML = `<img class="photo-big" src="${await photoSrc(id)}" alt="">
      <div class="photo-meta">
        <input data-cap value="${escapeHtml(ph.caption)}" placeholder="写一句说明，如：第二次做，换了提手长度">
        <span class="muted">${new Date(ph.date).toLocaleDateString('zh-CN')}</span>
      </div>
      <div class="dlg-actions">
        <button class="btn danger" data-act="del">删除照片</button>
        <button class="btn primary" data-act="close">完成</button>
      </div>`;
    dlg.querySelector('[data-cap]').addEventListener('input', (e) => { ph.caption = e.target.value; save(); });
    dlg.onclick = async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'del') {
        if (!confirm('删除这张照片？此操作无法撤销。')) return;
        p.photos = p.photos.filter((x) => x.id !== id);
        await PhotoDB.del(id).catch(() => {}); photoCache.delete(id);
        save();
      }
      if (e.target === dlg || act) { dlg.close(); renderPhotos(); }
    };
    dlg.showModal();
  }

  // ---------- steps ----------
  function renderSteps() {
    const p = current();
    $('stepList').innerHTML = p.steps.map((s, i) => `<li data-id="${s.id}" class="${s.done ? 'checked' : ''}">
      <input type="checkbox" ${s.done ? 'checked' : ''}>
      <input class="text" value="${escapeHtml(s.text)}">
      <span class="tools">
        <button class="icon-btn move" data-act="up" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn move" data-act="down" title="下移" ${i === p.steps.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-btn" data-act="del" title="删除">✕</button>
      </span></li>`).join('');
    renderProgress();
  }
  $('stepForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('stepInput').value.trim();
    if (!text) return;
    current().steps.push({ id: uid(), text, done: false });
    $('stepInput').value = '';
    save(); renderSteps();
  });
  $('resetSteps').addEventListener('click', () => {
    if (!confirm('清空所有步骤的勾选？（步骤内容会保留）')) return;
    current().steps.forEach((s) => { s.done = false; });
    save(); renderSteps();
  });
  $('stepList').addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const li = e.target.closest('li');
    const s = current().steps.find((x) => x.id === li.dataset.id);
    s.done = e.target.checked;
    li.classList.toggle('checked', s.done);
    save(); renderProgress();
  });
  $('stepList').addEventListener('input', (e) => {
    if (!e.target.classList.contains('text')) return;
    const s = current().steps.find((x) => x.id === e.target.closest('li').dataset.id);
    s.text = e.target.value; save();
  });
  $('stepList').addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const steps = current().steps;
    const i = steps.findIndex((x) => x.id === e.target.closest('li').dataset.id);
    if (act === 'del') steps.splice(i, 1);
    if (act === 'up' && i > 0) [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
    if (act === 'down' && i < steps.length - 1) [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
    save(); renderSteps();
  });

  // ---------- notes ----------
  $('notes').addEventListener('input', (e) => {
    current().notes = e.target.value;
    $('noteSaved').textContent = '保存中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { save(); $('noteSaved').textContent = '已保存 ✓'; }, 400);
  });

  // ---------- import / export ----------
  $('exportBtn').addEventListener('click', async () => {
    const photoData = {};
    for (const p of state.projects) for (const ph of p.photos) {
      const src = await photoSrc(ph.id).catch(() => null);
      if (src) photoData[ph.id] = src;
    }
    const blob = new Blob([JSON.stringify({ ...state, photoData })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `心裁备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.projects)) throw new Error();
      if (!confirm(`将导入 ${data.projects.length} 个项目，并覆盖当前数据，确定吗？`)) return;
      state = migrate({ projects: data.projects, currentId: data.currentId ?? data.projects[0]?.id ?? null, theme: data.theme });
      await PhotoDB.clear(); photoCache.clear();
      for (const [id, src] of Object.entries(data.photoData || {})) await PhotoDB.put(id, src);
      save(); applyTheme(); render();
    } catch (err) { alert('导入失败：文件格式不正确'); }
    e.target.value = '';
  });

  // ---------- mobile nav ----------
  $('menuBtn').addEventListener('click', () => document.body.classList.add('nav-open'));
  $('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

  // ---------- install as an app (PWA) ----------
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installPrompt = null;
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Ask the browser not to clear our data when space runs low (granted silently for installed apps).
  if (standalone() && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  $('installBtn').hidden = standalone();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  window.addEventListener('appinstalled', () => { installPrompt = null; $('installBtn').hidden = true; });
  $('installBtn').addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => {});
      installPrompt = null;
      return;
    }
    const dlg = $('installDialog');
    dlg.innerHTML = `<h3>📱 把心裁添加到主屏幕 / 程序坞</h3>
      ${location.protocol === 'file:' ? '<p class="warn-box">⚠ 现在是直接打开的本地文件，无法安装。请把网站放到网上（https 地址）后，用手机浏览器打开那个网址再安装。</p>' : ''}
      <dl class="dlg-info">
        <dt>iPhone / iPad</dt><dd>用 <b>Safari</b> 打开本页 → 点底部的「分享」按钮 <b>⬆︎</b> → 选「<b>添加到主屏幕</b>」</dd>
        <dt>安卓手机</dt><dd>用 <b>Chrome</b> 打开本页 → 点右上角 <b>⋮</b> → 选「<b>安装应用</b>」或「<b>添加到主屏幕</b>」</dd>
        <dt>Mac（Safari）</dt><dd>菜单栏「<b>文件</b>」→「<b>添加到程序坞…</b>」，或点工具栏的「分享」按钮 <b>⬆︎</b> →「<b>添加到程序坞</b>」（需要 macOS 14 Sonoma 或更新版本）</dd>
        <dt>电脑（Chrome / Edge）</dt><dd>打开本页 → 点地址栏右侧的「<b>安装</b>」图标</dd>
      </dl>
      <p class="muted">添加后，心裁会像普通 App 一样在独立窗口中打开，没有网络也能用。<br>
      ⚠ 主屏幕 / 程序坞里的心裁和浏览器里的数据是<b>分开保存</b>的：如果已经在浏览器里记录了项目，请先点「导出备份」，再在主屏幕或程序坞里打开的心裁中点「导入」。</p>
      <div class="dlg-actions"><button class="btn primary" data-act="close">知道了</button></div>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-act=close]')) dlg.close(); };
    dlg.showModal();
  });

  if (!current() && state.projects.length) state.currentId = state.projects[0].id;
  applyTheme();
  render();
})();
