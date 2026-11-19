/* global skinview3d */
// Редактор скина: рисование прямо на 3D-модели (skinview3d).
// Курсор → луч из камеры → треугольник модели → UV → пиксель текстуры 64×64.
'use strict';

(function () {
  const W = 64;      // размер скина
  const GRID = 16;   // во сколько раз увеличиваем текстуру, когда видна сетка
  // области второго слоя на развёртке (шапка, куртка, рукава, штанины)
  const OUTER = [[32, 0, 32, 16], [16, 32, 24, 16], [40, 32, 16, 16], [48, 48, 16, 16], [0, 32, 16, 16], [0, 48, 16, 16]];
  const inOuter = (x, y) => OUTER.some(([a, b, w, h]) => x >= a && x < a + w && y >= b && y < b + h);

  /* ---------- математика ---------- */
  const m4 = (e, x, y, z) => {
    const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
    return [(e[0] * x + e[4] * y + e[8] * z + e[12]) / w, (e[1] * x + e[5] * y + e[9] * z + e[13]) / w, (e[2] * x + e[6] * y + e[10] * z + e[14]) / w];
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  // Мёллер — Трумбор: расстояние и барицентрические координаты
  function hitTri(o, d, a, b, c) {
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-9) return null;
    const inv = 1 / det, s = sub(o, a), u = dot(s, p) * inv;
    if (u < 0 || u > 1) return null;
    const q = cross(s, e1), v = dot(d, q) * inv;
    if (v < 0 || u + v > 1) return null;
    const t = dot(e2, q) * inv;
    return t > 1e-6 ? { t, u, v } : null;
  }
  const visibleChain = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };

  function create(viewer) {
    const px = document.createElement('canvas'); px.width = px.height = W;
    const pc = px.getContext('2d', { willReadFrequently: true });
    const disp = document.createElement('canvas');
    const dc = disp.getContext('2d');
    const st = { on: false, model: 'default', grid: true, layer: 'inner', mirror: false, tool: 'brush', size: 1, color: '#c4747c' };
    let undo = [], redo = [], before = null, changed = false, painting = false, last = null, onChange = () => {};

    /* ---------- текстура → модель ---------- */
    function render() {
      const S = st.grid ? GRID : 1;
      if (disp.width !== W * S) { disp.width = disp.height = W * S; }
      dc.imageSmoothingEnabled = false;
      dc.clearRect(0, 0, disp.width, disp.height);
      dc.drawImage(px, 0, 0, disp.width, disp.height);
      if (st.grid) {
        const data = pc.getImageData(0, 0, W, W).data;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const a = data[(y * W + x) * 4 + 3];
          if (a > 0) { dc.strokeStyle = 'rgba(0,0,0,.35)'; dc.lineWidth = 1; dc.strokeRect(x * S + 0.5, y * S + 0.5, S - 1, S - 1); }
          else if (st.layer === 'outer' && inOuter(x, y)) { dc.fillStyle = 'rgba(255,255,255,.07)'; dc.fillRect(x * S, y * S, S, S); dc.strokeStyle = 'rgba(255,255,255,.28)'; dc.strokeRect(x * S + 0.5, y * S + 0.5, S - 1, S - 1); }
        }
      }
      const sc = viewer.skinCanvas;
      if (sc.width !== disp.width || viewer.playerObject.skin.modelType !== st.model) {
        viewer.loadSkin(disp, { model: st.model });
      } else {
        const c = sc.getContext('2d'); c.clearRect(0, 0, sc.width, sc.height); c.drawImage(disp, 0, 0);
        viewer.skinTexture.needsUpdate = true;
      }
      applyLayer();
    }
    function applyLayer() { viewer.playerObject.skin.setOuterLayerVisible(st.layer === 'outer' || !st.on); }

    /* ---------- луч из курсора ---------- */
    function cameraRay(cx, cy) {
      const r = viewer.canvas.getBoundingClientRect();
      const nx = ((cx - r.left) / r.width) * 2 - 1, ny = -((cy - r.top) / r.height) * 2 + 1;
      const cam = viewer.camera; cam.updateMatrixWorld();
      const pv = m4(cam.projectionMatrixInverse.elements, nx, ny, 0.5);
      const p = m4(cam.matrixWorld.elements, pv[0], pv[1], pv[2]);
      const o = [cam.matrixWorld.elements[12], cam.matrixWorld.elements[13], cam.matrixWorld.elements[14]];
      return { o, d: norm(sub(p, o)) };
    }
    function meshes() {
      const out = [];
      for (const part of viewer.playerObject.skin.getBodyParts()) {
        for (const [layer, obj] of [['inner', part.innerLayer], ['outer', part.outerLayer]]) {
          if (layer !== st.layer) continue;
          obj.traverse((m) => { if (m.isMesh && visibleChain(m)) out.push(m); });
        }
      }
      return out;
    }
    function pick(o, d) {
      viewer.playerObject.updateMatrixWorld(true);
      let best = null;
      for (const m of meshes()) {
        const g = m.geometry, pos = g.attributes.position.array, uv = g.attributes.uv.array, idx = g.index ? g.index.array : null;
        const e = m.matrixWorld.elements;
        const vw = []; for (let i = 0; i < pos.length; i += 3) vw.push(m4(e, pos[i], pos[i + 1], pos[i + 2]));
        const n = idx ? idx.length : vw.length;
        for (let i = 0; i < n; i += 3) {
          const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
          const h = hitTri(o, d, vw[a], vw[b], vw[c]);
          if (!h || (best && h.t >= best.t)) continue;
          const w0 = 1 - h.u - h.v;
          const U = uv[a * 2] * w0 + uv[b * 2] * h.u + uv[c * 2] * h.v;
          const V = uv[a * 2 + 1] * w0 + uv[b * 2 + 1] * h.u + uv[c * 2 + 1] * h.v;
          const us = [uv[a * 2], uv[b * 2], uv[c * 2]], vs = [uv[a * 2 + 1], uv[b * 2 + 1], uv[c * 2 + 1]];
          const rect = [Math.round(Math.min(...us) * W), Math.round((1 - Math.max(...vs)) * W), Math.round(Math.max(...us) * W), Math.round((1 - Math.min(...vs)) * W)];
          const x = Math.min(rect[2] - 1, Math.max(rect[0], Math.floor(U * W)));
          const y = Math.min(rect[3] - 1, Math.max(rect[1], Math.floor((1 - V) * W)));
          const nrm = norm(cross(sub(vw[b], vw[a]), sub(vw[c], vw[a])));
          best = { t: h.t, x, y, rect, point: [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t], normal: nrm };
        }
      }
      return best;
    }
    // зеркальная точка: персонаж стоит в центре без поворота, отражаем по оси X
    function mirrorOf(h) {
      const p = [-h.point[0], h.point[1], h.point[2]], nr = [-h.normal[0], h.normal[1], h.normal[2]];
      return pick([p[0] + nr[0] * 2, p[1] + nr[1] * 2, p[2] + nr[2] * 2], [-nr[0], -nr[1], -nr[2]]);
    }

    /* ---------- инструменты ---------- */
    const rgba = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
    function setPx(x, y, rect, c) {
      for (let dy = 0; dy < st.size; dy++) for (let dx = 0; dx < st.size; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= rect[2] || Y >= rect[3]) continue;
        if (c) { pc.fillStyle = c; pc.fillRect(X, Y, 1, 1); } else pc.clearRect(X, Y, 1, 1);
      }
    }
    function fill(x, y, rect, hex) {
      const img = pc.getImageData(0, 0, W, W), d = img.data, at = (X, Y) => (Y * W + X) * 4;
      const from = d.slice(at(x, y), at(x, y) + 4), to = hex ? rgba(hex) : [0, 0, 0, 0];
      if (from.every((v, i) => v === to[i])) return;
      const same = (i) => d[i] === from[0] && d[i + 1] === from[1] && d[i + 2] === from[2] && d[i + 3] === from[3];
      const stack = [[x, y]];
      while (stack.length) {
        const [X, Y] = stack.pop();
        if (X < rect[0] || Y < rect[1] || X >= rect[2] || Y >= rect[3]) continue;
        const i = at(X, Y); if (!same(i)) continue;
        d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; d[i + 3] = to[3];
        stack.push([X + 1, Y], [X - 1, Y], [X, Y + 1], [X, Y - 1]);
      }
      pc.putImageData(img, 0, 0);
    }
    function apply(h) {
      if (!h) return;
      if (st.tool === 'pick') {
        const d = pc.getImageData(h.x, h.y, 1, 1).data;
        if (d[3]) { st.color = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); onChange({ color: st.color }); }
        return;
      }
      const targets = [h]; if (st.mirror) { const m = mirrorOf(h); if (m) targets.push(m); }
      for (const t of targets) {
        if (st.tool === 'fill') fill(t.x, t.y, t.rect, st.color);
        else setPx(t.x, t.y, t.rect, st.tool === 'eraser' ? null : st.color);
      }
      changed = true;
      render();
    }
    function paintAt(cx, cy) { const r = cameraRay(cx, cy); apply(pick(r.o, r.d)); }

    /* ---------- мышь ---------- */
    const cv = viewer.canvas;
    cv.addEventListener('contextmenu', (e) => { if (st.on) e.preventDefault(); });
    cv.addEventListener('pointerdown', (e) => {
      if (!st.on || e.button !== 0) return;
      if (st.tool === 'eraser' && st.layer === 'inner') { onChange({ warn: 'На основном слое стирать нельзя: в игре там будет чёрный цвет. Закрасьте пиксель другим цветом.' }); return; }
      painting = true; changed = false; before = pc.getImageData(0, 0, W, W); last = [e.clientX, e.clientY];
      cv.setPointerCapture(e.pointerId);
      paintAt(e.clientX, e.clientY);
      if (st.tool === 'fill' || st.tool === 'pick') painting = false, endStroke();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!painting) return;
      // проходим путь мыши мелкими шагами, чтобы линия не рвалась при быстром движении
      const [lx, ly] = last, dist = Math.hypot(e.clientX - lx, e.clientY - ly), steps = Math.max(1, Math.ceil(dist / 3));
      for (let i = 1; i <= steps; i++) paintAt(lx + ((e.clientX - lx) * i) / steps, ly + ((e.clientY - ly) * i) / steps);
      last = [e.clientX, e.clientY];
    });
    const endStroke = () => {
      if (before && changed) { undo.push(before); if (undo.length > 80) undo.shift(); redo = []; onChange({ history: true }); }
      before = null; changed = false;
    };
    cv.addEventListener('pointerup', () => { if (painting) { painting = false; endStroke(); } });
    document.addEventListener('keydown', (e) => {
      if (!st.on || e.target.closest?.('input, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? api.redo() : api.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); api.redo(); }
    });

    /* ---------- камера ---------- */
    function view(angleDeg) {
      const c = viewer.controls, t = c.target, cam = viewer.camera;
      const d = Math.hypot(cam.position.x - t.x, cam.position.z - t.z) || 60, a = (angleDeg * Math.PI) / 180;
      cam.position.set(t.x + d * Math.sin(a), t.y, t.z + d * Math.cos(a));
      c.update();
    }

    const api = {
      get state() { return { ...st, canUndo: undo.length > 0, canRedo: redo.length > 0 }; },
      onChange(fn) { onChange = fn; },
      /** Включить редактор с картинкой (data:/путь) */
      async start(src, model) {
        st.on = true; st.model = model === 'slim' ? 'slim' : 'default'; undo = []; redo = [];
        viewer.animation = null; viewer.autoRotate = false; viewer.zoom = 0.66; // весь персонаж в кадре
        await viewer.loadSkin(src, { model: st.model });
        pc.clearRect(0, 0, W, W); pc.imageSmoothingEnabled = false;
        pc.drawImage(viewer.skinCanvas, 0, 0, W, W);
        viewer.controls.mouseButtons = { LEFT: -1, MIDDLE: 1, RIGHT: 0 };
        cv.classList.add('editing');
        render(); view(0);
      },
      stop() {
        st.on = false; painting = false;
        viewer.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
        cv.classList.remove('editing'); viewer.zoom = 0.78;
        for (const p of viewer.playerObject.skin.getBodyParts()) p.visible = true;
        applyLayer();
      },
      set(k, v) { st[k] = v; if (['grid', 'layer', 'model'].includes(k)) render(); onChange({}); },
      part(name, visible) { const p = viewer.playerObject.skin[name]; if (p) p.visible = visible; },
      view,
      undo() { if (!undo.length) return; redo.push(pc.getImageData(0, 0, W, W)); pc.putImageData(undo.pop(), 0, 0); render(); onChange({ history: true }); },
      redo() { if (!redo.length) return; undo.push(pc.getImageData(0, 0, W, W)); pc.putImageData(redo.pop(), 0, 0); render(); onChange({ history: true }); },
      /** Очистить второй слой целиком */
      clearOuter() { undo.push(pc.getImageData(0, 0, W, W)); redo = []; for (const [a, b, w, h] of OUTER) pc.clearRect(a, b, w, h); render(); onChange({ history: true }); },
      /** Результат: PNG 64×64 (base64 без префикса и data:-ссылка) */
      result() { const url = px.toDataURL('image/png'); return { image: url, png: url.split(',')[1] }; },
      // для автотестов: какой пиксель под точкой экрана
      probe(cx, cy) { const r = cameraRay(cx, cy); const h = pick(r.o, r.d); return h && { x: h.x, y: h.y }; },
    };
    return api;
  }

  window.SkinEditor = { create };
})();
