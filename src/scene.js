import * as THREE from 'three';

export const THEMES = {
  verdant: { name: 'Verdant', accent: '#c2f970', snake: '#a9f66e', berry: '#ff776f', fog: '#10241e', grid: '#365d48' },
  tidal: { name: 'Tidal', accent: '#80e3ff', snake: '#5ee7ef', berry: '#ffb76b', fog: '#102131', grid: '#30536e' },
  dusk: { name: 'Dusk', accent: '#d8b0ff', snake: '#c6a1ff', berry: '#ffcf70', fog: '#251a35', grid: '#56406b' },
  ember: { name: 'Ember', accent: '#ffbd83', snake: '#ffaa68', berry: '#97f2bd', fog: '#2c1d18', grid: '#6e4734' },
};

export class World {
  constructor(canvas, settings) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.08, 400);
    this.scene.add(new THREE.HemisphereLight('#edffd7', '#14231d', 2.7));
    const light = new THREE.DirectionalLight('#ffffff', 3);
    light.position.set(10, 30, 20); this.scene.add(light);
    this.gridMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.37 });
    const positions = [];
    for (let n = -60; n <= 60; n += 10) {
      for (const side of [-60, 60]) {
        positions.push(-60, side, n, 60, side, n, n, side, -60, n, side, 60);
        positions.push(side, -60, n, side, 60, n, side, n, -60, side, n, 60);
        positions.push(-60, n, side, 60, n, side, n, -60, side, n, 60, side);
      }
    }
    const grid = new THREE.BufferGeometry(); grid.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.scene.add(new THREE.LineSegments(grid, this.gridMaterial));
    const specks = [];
    // Deterministic ambient dust; all visuals are generated locally.
    for (let i = 0; i < 460; i++) specks.push(Math.sin(i * 127.1) * 58, Math.sin(i * 311.7) * 58, Math.cos(i * 71.9) * 58);
    const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(specks, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#d3eacb', size: 0.12, transparent: true, opacity: 0.45 }));
    this.scene.add(this.dust);
    this.snakeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.33, metalness: 0.18, emissiveIntensity: 0.25 });
    this.tail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.57, 10, 8), this.snakeMaterial, 6000);
    this.tail.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.tail.frustumCulled = false; this.scene.add(this.tail);
    this.berryMaterial = new THREE.MeshStandardMaterial({ roughness: 0.25, emissiveIntensity: 0.65 });
    this.berryMeshes = [];
    const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
    const ctx = glowCanvas.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.18, '#ffffffb0'); gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    this.glowMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, opacity: 0.33, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 14; i++) {
      const group = new THREE.Group();
      const berry = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), this.berryMaterial); group.add(berry);
      const halo = new THREE.Sprite(this.glowMaterial); halo.scale.setScalar(8); group.add(halo);
      const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), this.snakeMaterial);
      leaf.position.set(0.22, 1.22, 0); leaf.scale.set(1, 0.45, 0.65); group.add(leaf);
      this.berryMeshes.push(group); this.scene.add(group);
    }
    this.demo = new THREE.Group(); this.scene.add(this.demo);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-15, -6, -3), new THREE.Vector3(-8, -5, 1), new THREE.Vector3(-7, 1, 0),
      new THREE.Vector3(-1, 4, -3), new THREE.Vector3(7, 1, -1), new THREE.Vector3(9, -3, 2),
      new THREE.Vector3(5, -6, 6), new THREE.Vector3(0, -3, 9), new THREE.Vector3(2, 3, 9),
      new THREE.Vector3(9, 6, 5), new THREE.Vector3(15, 4, 3),
    ]);
    this.demo.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 1.15, 14, false), this.snakeMaterial));
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), this.snakeMaterial); head.position.set(15, 4, 3); this.demo.add(head);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#132519' });
    for (const z of [-0.7, 0.7]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), eyeMaterial); eye.position.set(15.6, 4.83, 3 + z); this.demo.add(eye);
    }
    this.object = new THREE.Object3D(); this.setTheme(settings);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas.parentElement); this.resize();
  }

  resize() {
    const { width, height } = this.renderer.domElement.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  setTheme(settings) {
    const theme = THEMES[settings.theme] || THEMES.verdant;
    this.scene.background = new THREE.Color(theme.fog); this.scene.fog = new THREE.FogExp2(theme.fog, 0.011);
    this.gridMaterial.color.set(theme.grid); this.snakeMaterial.color.set(settings.snakeColor || theme.snake);
    this.snakeMaterial.emissive.copy(this.snakeMaterial.color); this.berryMaterial.color.set(theme.berry);
    this.berryMaterial.emissive.set(theme.berry); this.glowMaterial.color.set(theme.berry);
    this.flightFov = settings.fov; this.camera.fov = settings.fov; this.camera.updateProjectionMatrix();
  }

  render(game, time, menu = false, reducedMotion = false) {
    this.demo.visible = menu; this.tail.visible = !menu;
    const fov = menu ? this.camera.aspect < 1 ? 65 : 45 : this.flightFov;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (menu) {
      this.camera.position.set(20, 14, 43); this.camera.lookAt(this.camera.aspect < 1 ? 0 : -12, 0, 0);
      this.demo.rotation.y = reducedMotion ? -0.12 : -0.12 + Math.sin(time * 0.16) * 0.14;
      this.demo.scale.setScalar(this.camera.aspect < 1 ? 0.8 : 1);
      this.demo.position.set(this.camera.aspect < 1 ? 3 : 4, (this.camera.aspect < 1 ? -9 : 0) + (reducedMotion ? 0 : Math.sin(time * 0.65) * 0.55), 0);
      const demoBerries = [[18, 7, -1], [-14, 7, 4], [7, -10, 0], [0, 10, -14], [-20, -4, -10]];
      this.berryMeshes.forEach((mesh, i) => { mesh.visible = i < demoBerries.length; if (mesh.visible) mesh.position.set(...demoBerries[i]); });
    } else if (game) {
      this.camera.position.copy(game.position); this.camera.quaternion.copy(game.orientation);
      this.tail.count = Math.min(game.path.length, 6000);
      for (let i = 0; i < this.tail.count; i++) {
        this.object.position.copy(game.path[i]);
        this.object.scale.setScalar(Math.min(1, 0.3 + (game.path.length - i) / 9));
        this.object.updateMatrix(); this.tail.setMatrixAt(i, this.object.matrix);
      }
      this.tail.instanceMatrix.needsUpdate = true;
      this.berryMeshes.forEach((mesh, i) => { mesh.visible = i < game.berries.length; if (mesh.visible) mesh.position.copy(game.berries[i]); });
    }
    this.berryMeshes.forEach((mesh, i) => { mesh.children[0].rotation.set(menu && reducedMotion ? 0 : time * 0.4, menu && reducedMotion ? i : time * 0.6 + i, 0); });
    this.renderer.render(this.scene, this.camera);
  }
}
