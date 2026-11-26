// 3D-просмотр скина на странице /skin/<ник> (библиотека skinview3d, MIT)
(() => {
  const canvas = document.getElementById('skinCanvas');
  if (!canvas || !window.skinview3d) return;
  const sv = window.skinview3d;
  const box = canvas.parentElement;
  const viewer = new sv.SkinViewer({ canvas, width: box.clientWidth, height: Math.min(520, Math.max(360, box.clientWidth * 1.1)) });
  viewer.loadSkin(canvas.dataset.skin, { model: canvas.dataset.slim ? 'slim' : 'default' });
  if (canvas.dataset.cape) viewer.loadCape(canvas.dataset.cape);
  viewer.zoom = 0.72;
  viewer.fov = 40;
  viewer.autoRotate = true;
  viewer.autoRotateSpeed = 0.6;
  const anims = { idle: () => new sv.IdleAnimation(), walk: () => new sv.WalkingAnimation(), run: () => new sv.RunningAnimation(), wave: () => new sv.WaveAnimation() };
  viewer.animation = anims.idle();
  document.querySelectorAll('[data-anim]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-anim]').forEach((x) => x.classList.toggle('active', x === b));
    viewer.animation = anims[b.dataset.anim]();
  }));
  // «Спина» — развернуть, чтобы показать плащ
  document.querySelector('[data-back]')?.addEventListener('click', () => {
    viewer.autoRotate = false;
    const c = viewer.camera.position;
    viewer.playerWrapper.rotation.y = Math.atan2(c.x, c.z) + Math.PI; // спиной к камере (автоповорот крутит именно обёртку)
  });
  // пока пользователь крутит модель мышкой — без автоповорота
  canvas.addEventListener('pointerdown', () => { viewer.autoRotate = false; });
  addEventListener('resize', () => viewer.setSize(box.clientWidth, viewer.height));
})();
