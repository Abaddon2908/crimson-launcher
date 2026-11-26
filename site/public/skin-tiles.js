// Плитки галереи скинов: рисуем персонажа спереди (2D) прямо из PNG скина
(() => {
  // [sx, sy, w, h, dx, dy] — участки развёртки 64×64, вид спереди; фигура 16×32
  const draw = (ctx, img, slim) => {
    const legacy = img.height === 32;
    const aw = slim ? 3 : 4;
    const part = (sx, sy, w, h, dx, dy, flip) => {
      if (!flip) return ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
      ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h); ctx.restore();
    };
    // основной слой
    part(8, 8, 8, 8, 4, 0);                 // голова
    part(20, 20, 8, 12, 4, 8);              // туловище
    part(44, 20, aw, 12, 4 - aw, 8);        // правая рука (слева на экране)
    if (legacy) part(44, 20, aw, 12, 12, 8, true); else part(36, 52, aw, 12, 12, 8); // левая рука
    part(4, 20, 4, 12, 4, 20);              // правая нога
    if (legacy) part(4, 20, 4, 12, 8, 20, true); else part(20, 52, 4, 12, 8, 20);    // левая нога
    // второй слой
    part(40, 8, 8, 8, 4, 0);                // шапка
    if (!legacy) {
      part(20, 36, 8, 12, 4, 8);            // куртка
      part(44, 36, aw, 12, 4 - aw, 8);      // рукава
      part(52, 52, aw, 12, 12, 8);
      part(4, 36, 4, 12, 4, 20);            // штанины
      part(4, 52, 4, 12, 8, 20);
    }
  };
  const render = (c) => {
    const img = new Image();
    img.onload = () => {
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 16, 32);
      draw(ctx, img, c.dataset.slim === '1');
      c.classList.add('ready');
    };
    img.src = c.dataset.skin2d;
  };
  const list = document.querySelectorAll('canvas[data-skin2d]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); render(e.target); } }), { rootMargin: '300px' });
    list.forEach((c) => io.observe(c));
  } else list.forEach(render);
})();
