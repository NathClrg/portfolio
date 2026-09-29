import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Everything outside the temple: the sky island it stands on, the sky, and the life around it.

const SKY = {
  top: 0x10112e,
  mid: 0x46377a,
  horizon: 0xf4aa8b,
  fog: 0xd29db0, // also the sky colour just below the horizon, so distant fogged things blend in
  sun: 0xffc98a,
};
const SUN_DIR = new THREE.Vector3(0.85, 0.1, -0.5).normalize();
const PLANET_DIR = new THREE.Vector3(-0.35, 0.1, -1).normalize();
const GROUND_Y = -1.8; // top of the island's grass, where the temple platform sits
const CLOUD_Y = -24;

// ---------- helpers ----------
const hash = (x, y, z) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

/** Displaces vertices by a hash of their position, so shared corners move together and faces stay closed. */
function jitter(geometry, amount, weight = () => 1) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const kx = Math.round(x * 1000) / 1000;
    const ky = Math.round(y * 1000) / 1000;
    const kz = Math.round(z * 1000) / 1000;
    const a = amount * weight(x, y, z);
    pos.setXYZ(i, x + (hash(kx, ky, kz) - 0.5) * a, y + (hash(ky, kz, kx) - 0.5) * a, z + (hash(kz, kx, ky) - 0.5) * a);
  }
  return geometry;
}

/**
 * Collects many small static pieces into one vertex-coloured mesh (one draw call).
 * Colours are applied per triangle for a crisp low-poly look; `color` is a hex or fn(centroid, outColor).
 */
class Batch {
  parts = [];

  add(geometry, color, matrix) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.deleteAttribute('uv');
    if (matrix) g.applyMatrix4(matrix);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const centroid = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      centroid.set(
        (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
        (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3,
        (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3,
      );
      if (typeof color === 'function') color(centroid, c);
      else c.set(color);
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  build(material, { cast = false, receive = false } = {}) {
    const geometry = mergeGeometries(this.parts);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
  }
}

const vertexMat = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, ...extra });

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glowTexture = () =>
  canvasTexture(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

function waterTexture(rand) {
  const tex = canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(150, 215, 255, 0.55)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.6})`;
      const x = rand() * w;
      const y = rand() * h;
      const len = 20 + rand() * 90;
      ctx.fillRect(x, y, 1 + rand() * 3, len);
      ctx.fillRect(x, y - h, 1 + rand() * 3, len); // wrap vertically
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------- props (added to batches) ----------
const BLOSSOMS = [0xf4a6c6, 0xe989b3, 0xf9d3e3, 0xf6b98a];
const GREENS = [0x5f9a63, 0x76ad5f, 0x4d8266];

function addBlossomTree(b, x, y, z, s, rand) {
  const h = (1.3 + rand() * 0.8) * s;
  b.add(new THREE.CylinderGeometry(0.1 * s, 0.18 * s, h, 5), 0x5a3a2a, M(x, y + h / 2, z, 0, 0, (rand() - 0.5) * 0.2));
  const color = BLOSSOMS[Math.floor(rand() * BLOSSOMS.length)];
  for (let i = 0; i < 4; i++) {
    const r = (0.55 + rand() * 0.4) * s;
    b.add(
      new THREE.IcosahedronGeometry(r, 0),
      i === 0 ? color : BLOSSOMS[Math.floor(rand() * BLOSSOMS.length)],
      M(x + (rand() - 0.5) * 1.1 * s, y + h + rand() * 0.5 * s, z + (rand() - 0.5) * 1.1 * s, rand() * 3, rand() * 3, 0),
    );
  }
}

function addPine(b, x, y, z, s, rand) {
  const h = 0.6 * s;
  b.add(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, h, 5), 0x4a3024, M(x, y + h / 2, z));
  const color = rand() < 0.5 ? 0x3f7a6a : 0x4c8a5c;
  for (let l = 0; l < 3; l++) {
    b.add(new THREE.ConeGeometry((0.9 - l * 0.22) * s, 1.1 * s, 6), color, M(x, y + h + l * 0.55 * s + 0.4 * s, z, 0, rand() * 3, 0));
  }
}

function addBush(b, x, y, z, s, rand) {
  const color = GREENS[Math.floor(rand() * GREENS.length)];
  for (let i = 0; i < 3; i++) {
    b.add(new THREE.IcosahedronGeometry((0.35 + rand() * 0.25) * s, 0), color, M(x + (i - 1) * 0.35 * s, y + 0.25 * s, z + (rand() - 0.5) * 0.4 * s, rand(), rand(), 0));
  }
}

function addRuin(b, x, y, z, s, rand, ry = 0) {
  const stone = 0xd8c6a4;
  b.add(new THREE.CylinderGeometry(0.28 * s, 0.32 * s, 1.6 * s, 7), stone, M(x, y + 0.8 * s, z, 0, ry));
  // Fallen drum lying on its side
  b.add(new THREE.CylinderGeometry(0.28 * s, 0.28 * s, 1.1 * s, 7), 0xc9b590, M(x + Math.cos(ry) * 1.1 * s, y + 0.28 * s, z - Math.sin(ry) * 1.1 * s, Math.PI / 2, ry + 0.4, 0));
  b.add(new THREE.BoxGeometry(0.8 * s, 0.25 * s, 0.8 * s), 0xb49b78, M(x, y + 0.12 * s, z, 0, ry + rand()));
}

function addCrystals(b, x, y, z, s, rand, colors = [0x7fe3ff, 0xb59cff]) {
  for (let i = 0; i < 4; i++) {
    b.add(
      new THREE.OctahedronGeometry(0.3 * s, 0),
      colors[i % colors.length],
      M(x + (rand() - 0.5) * 0.7 * s, y + 0.35 * s, z + (rand() - 0.5) * 0.7 * s, (rand() - 0.5) * 0.8, rand() * 3, (rand() - 0.5) * 0.8, 0.7, 1.8 + rand(), 0.7),
    );
  }
}

function addFlowers(b, cx, cz, radiusMin, radiusMax, y, count, rand) {
  const colors = [0xffffff, 0xffd166, 0xf49ac1, 0xc3a6ff];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = radiusMin + rand() * (radiusMax - radiusMin);
    b.add(new THREE.OctahedronGeometry(0.07 + rand() * 0.05, 0), colors[Math.floor(rand() * colors.length)], M(cx + Math.cos(a) * r, y + 0.08, cz + Math.sin(a) * r));
  }
}

/** Rock colour by height: warm sandstone at the top fading to deep violet at the tip. */
function rockColor(top, bottom) {
  const cTop = new THREE.Color(0xa47f62);
  const cMid = new THREE.Color(0x7a5c79);
  const cBot = new THREE.Color(0x3b3156);
  return (p, c) => {
    const t = THREE.MathUtils.clamp((p.y - bottom) / (top - bottom), 0, 1);
    if (t > 0.5) c.lerpColors(cMid, cTop, (t - 0.5) * 2);
    else c.lerpColors(cBot, cMid, t * 2);
    c.offsetHSL(0, 0, (hash(p.x, p.y, p.z) - 0.5) * 0.08);
  };
}

// ---------- main builder ----------
export function buildScenery(scene, { R, rand }) {
  const updaters = [];
  const glow = glowTexture();

  // ----- sky -----
  scene.background = null;
  scene.fog = new THREE.Fog(SKY.fog, 45, 330);

  // The sky is not tone mapped so that it matches the fog colour exactly (fog skips tone mapping too).
  // Dimming while a work is in focus is done by hand through `dim`.
  const fogColor = new THREE.Color(SKY.fog);
  const skyUniforms = {
    top: { value: new THREE.Color(SKY.top) },
    mid: { value: new THREE.Color(SKY.mid) },
    horizon: { value: new THREE.Color(SKY.horizon) },
    below: { value: fogColor.clone() },
    sunColor: { value: new THREE.Color(SKY.sun) },
    sunDir: { value: SUN_DIR },
    dim: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(360, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, mid, horizon, below, sunColor, sunDir;
        uniform float dim;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h >= 0.0
            ? mix(mix(horizon, mid, smoothstep(0.0, 0.3, h)), top, smoothstep(0.3, 0.85, h))
            : mix(horizon, below, smoothstep(0.0, 0.05, -h));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 5.0) * 0.4 + pow(s, 80.0) * 0.6);
          gl_FragColor = vec4(col * dim, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  // Sun: a low-poly disc with a soft halo, low on the horizon.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(11, 10), new THREE.MeshBasicMaterial({ color: 0xfff0cf, fog: false, toneMapped: false }));
  sunDisc.position.copy(SUN_DIR).multiplyScalar(320);
  sunDisc.lookAt(0, 0, 0);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffb070, fog: false, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  sunHalo.position.copy(sunDisc.position);
  sunHalo.scale.setScalar(110);
  scene.add(sunDisc, sunHalo);

  // Ringed planet and its moon.
  const planetGroup = new THREE.Group();
  planetGroup.position.copy(PLANET_DIR).multiplyScalar(300);
  const bands = [0xb39ce0, 0xd7a6d0, 0x9c86d4, 0xf0c2c8];
  const planetBatch = new Batch().add(new THREE.IcosahedronGeometry(40, 2), (p, c) => {
    c.set(bands[Math.floor((p.y / 40 + 1) * 3.5 + hash(p.x, 0, p.z) * 0.6) % bands.length]);
  });
  const planet = planetBatch.build(vertexMat({ fog: false, emissive: 0x2a2150, emissiveIntensity: 1 }));
  planet.rotation.z = 0.35;
  planetGroup.add(planet);
  const rings = new THREE.Group();
  [
    [52, 58, 0xf1d6b3, 0.75],
    [59.5, 68, 0xd4a3c6, 0.55],
    [69, 73, 0xf6e2cf, 0.4],
  ].forEach(([inner, outer, color, opacity]) => {
    rings.add(
      new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 56, 1),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, fog: false, depthWrite: false }),
      ),
    );
  });
  rings.rotation.set(1.25, 0.2, 0.35);
  planetGroup.add(rings);
  const moon = new Batch().add(new THREE.IcosahedronGeometry(8, 1), (p, c) => c.set(0xcfc4e0).offsetHSL(0, 0, (hash(p.x, p.y, p.z) - 0.5) * 0.15)).build(vertexMat({ fog: false, emissive: 0x302848 }));
  planetGroup.add(moon);
  scene.add(planetGroup);
  updaters.push((t) => {
    planet.rotation.y = t * 0.02;
    moon.position.set(Math.cos(t * 0.05) * 95, 18 + Math.sin(t * 0.05) * 10, Math.sin(t * 0.05) * 60);
  });

  // Stars that twinkle, fading towards the horizon.
  const starLayers = [0, 1].map((layer) => {
    const positions = [];
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < 450; i++) {
      const a = rand() * Math.PI * 2;
      const h = 0.08 + rand() * 0.92;
      const ring = Math.sqrt(1 - h * h);
      positions.push(Math.cos(a) * ring * 340, h * 340, Math.sin(a) * ring * 340);
      c.setHSL(0.6 + rand() * 0.15, 0.4, 0.75 + rand() * 0.25).multiplyScalar(Math.min(1, h * 2.5));
      colors.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: layer ? 2.4 : 1.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false }),
    );
    scene.add(points);
    return points;
  });
  updaters.push((t) => {
    starLayers[0].material.opacity = 0.75 + Math.sin(t * 1.7) * 0.25;
    starLayers[1].material.opacity = 0.65 + Math.sin(t * 2.3 + 1) * 0.35;
  });

  // Shooting star every few seconds.
  const shootGeo = new THREE.BufferGeometry();
  shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  shootGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.95, 0.85, 0, 0, 0]), 3));
  const shooting = new THREE.Line(shootGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  shooting.frustumCulled = false;
  scene.add(shooting);
  const shot = { start: new THREE.Vector3(), dir: new THREE.Vector3(), born: -10, next: 3 };
  updaters.push((t) => {
    if (t > shot.next) {
      const a = Math.random() * Math.PI * 2;
      const h = 0.25 + Math.random() * 0.4;
      shot.start.set(Math.cos(a) * 300, h * 330, Math.sin(a) * 300);
      shot.dir.set(-Math.sin(a) + (Math.random() - 0.5), -0.45, Math.cos(a)).normalize();
      shot.born = t;
      shot.next = t + 4 + Math.random() * 6;
    }
    const life = (t - shot.born) / 1.1;
    shooting.visible = life >= 0 && life <= 1;
    if (!shooting.visible) return;
    const head = shot.start.clone().addScaledVector(shot.dir, life * 160);
    const tail = head.clone().addScaledVector(shot.dir, -30);
    shootGeo.attributes.position.array.set([head.x, head.y, head.z, tail.x, tail.y, tail.z]);
    shootGeo.attributes.position.needsUpdate = true;
    shooting.material.opacity = Math.sin(life * Math.PI);
  });

  // ----- the sky island under the temple -----
  const islandTop = GROUND_Y;
  const rimR = R + 7.6;
  const coneH = 20;
  const island = new Batch();
  island.add(new THREE.CylinderGeometry(rimR, rimR - 0.3, 0.6, 36), (p, c) => c.set(p.y > islandTop - 0.05 ? 0x7fa65c : 0x5d8a4d).offsetHSL(0, 0, (hash(p.x, 0, p.z) - 0.5) * 0.06), M(0, islandTop - 0.3, 0));
  island.add(jitter(new THREE.CylinderGeometry(rimR - 0.3, rimR - 1.1, 1.8, 36, 2), 0.5, (x, y) => (Math.abs(y) > 0.89 ? 0 : 1)), (p, c) => c.set(0x8a6446).offsetHSL(0, 0, (hash(p.x, p.y, p.z) - 0.5) * 0.08), M(0, islandTop - 1.5, 0));
  const coneTop = islandTop - 2.4;
  const rockGeo = new THREE.ConeGeometry(rimR - 1.1, coneH, 18, 6);
  rockGeo.rotateX(Math.PI); // tip pointing down
  jitter(rockGeo, 2.4, (x, y) => (y > coneH / 2 - 0.01 ? 0 : 1)); // keep the top ring flush with the soil
  island.add(rockGeo, rockColor(coneTop, coneTop - coneH), M(0, coneTop - coneH / 2, 0));

  // Hanging roots under the rim
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const len = 1 + rand() * 3.5;
    const r = rimR - 0.8 - rand() * 0.6;
    island.add(new THREE.CylinderGeometry(0.03, 0.1, len, 4), rand() < 0.5 ? 0x4c3a2a : 0x4f7a4a, M(Math.cos(a) * r, islandTop - 2.2 - len / 2, Math.sin(a) * r, (rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2));
  }
  scene.add(island.build(vertexMat(), { receive: true }));

  // Glowing crystals growing out of the underside
  const crystals = new Batch();
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const depth = 1 + rand() * (coneH - 6);
    const r = (rimR - 1.1) * (1 - depth / coneH) * 0.92;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const size = 0.5 + rand() * 1.1;
    // Point outwards and down
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), -1.3, Math.sin(a)).normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, coneTop - depth, z), q, new THREE.Vector3(size * 0.5, size * 1.8, size * 0.5));
    crystals.add(new THREE.OctahedronGeometry(1, 0), rand() < 0.6 ? 0x7fe3ff : 0xb59cff, m);
  }
  const crystalMesh = crystals.build(vertexMat({ emissive: 0x3a7fc0, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 }));
  scene.add(crystalMesh);
  updaters.push((t) => (crystalMesh.material.emissiveIntensity = 0.75 + Math.sin(t * 1.5) * 0.25));

  // Vegetation, ruins and flowers on the grass ring around the temple platform
  const waterfallAngles = [-Math.PI / 2 + 0.55, -Math.PI / 2 + 2.65, -Math.PI / 2 + 4.6];
  const nearWaterfall = (a) => waterfallAngles.some((w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w))) < 0.22);
  const rim = new Batch();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
    if (nearWaterfall(a)) continue;
    const r = R + 5.9 + rand() * 1.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const roll = rand();
    if (roll < 0.35) addBlossomTree(rim, x, islandTop, z, 1 + rand() * 0.4, rand);
    else if (roll < 0.55) addPine(rim, x, islandTop, z, 1 + rand() * 0.5, rand);
    else if (roll < 0.85) addBush(rim, x, islandTop, z, 1 + rand() * 0.5, rand);
    else addRuin(rim, x, islandTop, z, 0.8, rand, a);
  }
  addFlowers(rim, 0, 0, R + 5.3, rimR - 0.3, islandTop, 160, rand);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = R + 5.2 + rand() * 2.3;
    rim.add(new THREE.ConeGeometry(0.08, 0.35, 3), GREENS[i % 3], M(Math.cos(a) * r, islandTop + 0.15, Math.sin(a) * r, (rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4));
  }
  scene.add(rim.build(vertexMat(), { cast: true, receive: true }));

  // Waterfalls pouring off the edge into the clouds
  const waterTex = waterTexture(rand);
  const fallMat = new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const streamTex = waterTex.clone();
  streamTex.needsUpdate = true;
  streamTex.wrapS = streamTex.wrapT = THREE.RepeatWrapping;
  const streamMat = new THREE.MeshBasicMaterial({ map: streamTex, transparent: true, opacity: 0.9, depthWrite: false });
  waterTex.repeat.set(1, 5);
  const mistMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.85 });
  const mists = [];
  const springs = new Batch();
  for (const a of waterfallAngles) {
    const group = new THREE.Group();
    group.rotation.y = -a + Math.PI / 2; // local +Z points outwards
    scene.add(group);

    // Stream crossing the grass from a little spring
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(0.9, rimR - (R + 5.4)), streamMat);
    stream.rotation.x = -Math.PI / 2;
    stream.position.set(0, islandTop + 0.03, (rimR + R + 5.4) / 2);
    group.add(stream);
    springs.add(new THREE.DodecahedronGeometry(0.55, 0), 0x8c8479, M(Math.cos(a) * (R + 5.4) - 0.6 * Math.sin(a), islandTop + 0.2, Math.sin(a) * (R + 5.4) + 0.6 * Math.cos(a), rand(), rand(), 0));
    springs.add(new THREE.DodecahedronGeometry(0.4, 0), 0x7d756b, M(Math.cos(a) * (R + 5.2) + 0.5 * Math.sin(a), islandTop + 0.15, Math.sin(a) * (R + 5.2) - 0.5 * Math.cos(a), rand(), rand(), 0));

    // Falling sheet that curves outwards as it drops
    const fallH = islandTop - CLOUD_Y + 6;
    const fallGeo = new THREE.PlaneGeometry(1.2, fallH, 1, 16);
    const p = fallGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.5 - p.getY(i) / fallH; // 0 at the top, 1 at the bottom
      p.setZ(i, 3.2 * k * k);
      p.setX(i, p.getX(i) * (1 + k * 1.2));
    }
    const fall = new THREE.Mesh(fallGeo, fallMat);
    fall.position.set(0, islandTop - fallH / 2 + 0.05, rimR + 0.05);
    group.add(fall);

    // Mist where it meets the clouds
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rand() * 0.8, 0), mistMat);
      puff.position.set((rand() - 0.5) * 3, CLOUD_Y + 2 + rand(), rimR + 3 + rand() * 1.5);
      puff.userData.k = rand() * 6;
      group.add(puff);
      mists.push(puff);
    }
  }
  scene.add(springs.build(vertexMat(), { cast: true, receive: true }));
  let lastT = 0;
  updaters.push((t) => {
    const dt = Math.min(0.05, t - lastT);
    lastT = t;
    waterTex.offset.y += dt * 0.9;
    streamTex.offset.y += dt * 0.6;
    for (const m of mists) m.scale.setScalar(1 + Math.sin(t * 1.2 + m.userData.k) * 0.15);
  });

  // ----- sea of clouds, far peaks and cloud banks -----
  const cloudTop = new THREE.Color(0xfff2f0);
  const cloudShade = new THREE.Color(0xd49bb8);
  const clouds = new Batch();
  const addCloud = (x, y, z, s, detail) => {
    const n = 3 + Math.floor(rand() * 3);
    const color = (p, c) => c.lerpColors(cloudShade, cloudTop, THREE.MathUtils.clamp((p.y - y + s * 0.3) / (s * 0.9), 0, 1));
    for (let i = 0; i < n; i++) {
      const r = s * (0.6 + rand() * 0.5);
      clouds.add(
        new THREE.IcosahedronGeometry(1, detail),
        color,
        M(x + (i - n / 2) * s * 0.75 + (rand() - 0.5) * s * 0.4, y + rand() * s * 0.25, z + (rand() - 0.5) * s * 0.8, 0, rand() * 3, 0, r * 1.35, r * 0.7, r),
      );
    }
  };
  for (let i = 0; i < 190; i++) {
    const a = rand() * Math.PI * 2;
    const d = R + 10 + Math.pow(rand(), 0.8) * 240;
    const s = 2.5 + (d / 250) * 9 + rand() * 2;
    addCloud(Math.cos(a) * d, CLOUD_Y + rand() * 3, Math.sin(a) * d, s, d < 70 ? 1 : 0);
  }
  // High banks near the horizon
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const d = 190 + rand() * 70;
    addCloud(Math.cos(a) * d, 8 + rand() * 30, Math.sin(a) * d, 10 + rand() * 8, 0);
  }
  const cloudMesh = clouds.build(vertexMat({ roughness: 1, emissive: 0x3a2440, emissiveIntensity: 0.5 }));
  scene.add(cloudMesh);
  const cloudFloor = new THREE.Mesh(new THREE.CircleGeometry(380, 48), new THREE.MeshStandardMaterial({ color: 0xd7a3bd, roughness: 1 }));
  cloudFloor.rotation.x = -Math.PI / 2;
  cloudFloor.position.y = CLOUD_Y - 1.5;
  scene.add(cloudFloor);
  updaters.push((t) => (cloudMesh.rotation.y = t * 0.004));

  const peaks = new Batch();
  const rockA = new THREE.Color(0x6b5a8c);
  const rockB = new THREE.Color(0x8a6f9c);
  const snow = new THREE.Color(0xf6ecf6);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rand() * 0.2;
    const d = 175 + rand() * 70;
    const h = 45 + rand() * 75;
    const r = 25 + rand() * 30;
    const base = CLOUD_Y - 8;
    const geo = jitter(new THREE.ConeGeometry(r, h, 7, 4), r * 0.2, (x, y) => (y > h / 2 - 0.01 ? 0.2 : 1));
    const snowLine = 0.62 + rand() * 0.12;
    peaks.add(
      geo,
      (p, c) => {
        const k = (p.y - base) / h;
        if (k > snowLine + (hash(p.x, 0, p.z) - 0.5) * 0.1) c.copy(snow);
        else c.lerpColors(rockA, rockB, hash(p.x, p.y, p.z));
      },
      M(Math.cos(a) * d, base + h / 2, Math.sin(a) * d, 0, rand() * 3, 0),
    );
  }
  scene.add(peaks.build(vertexMat()));

  // ----- smaller floating islets drifting around -----
  const isletTypes = ['blossom', 'ruin', 'shrine', 'crystal', 'pine', 'blossom', 'ruin', 'crystal', 'shrine'];
  const islets = isletTypes.map((type, i) => {
    const size = 1.8 + rand() * 2.4;
    const b = new Batch();
    const h = size * 2.4;
    const cone = new THREE.ConeGeometry(size, h, 8, 3);
    cone.rotateX(Math.PI);
    jitter(cone, size * 0.35, (x, y) => (y > h / 2 - 0.01 ? 0.2 : 1));
    b.add(cone, rockColor(0, -h), M(0, -h / 2, 0));
    b.add(new THREE.CylinderGeometry(size * 1.06, size, size * 0.25, 9), (p, c) => c.set(p.y > size * 0.2 ? 0x7fa65c : 0x5d8a4d), M(0, size * 0.1, 0));
    const top = size * 0.225;
    const s = size / 2.6;
    if (type === 'blossom') {
      addBlossomTree(b, 0, top, 0, s * 1.3, rand);
      addBush(b, size * 0.5, top, size * 0.3, s * 0.8, rand);
      addFlowers(b, 0, 0, size * 0.2, size * 0.9, top, 14, rand);
    } else if (type === 'pine') {
      addPine(b, -size * 0.3, top, 0, s * 1.4, rand);
      addPine(b, size * 0.4, top, size * 0.2, s, rand);
    } else if (type === 'ruin') {
      addRuin(b, -size * 0.3, top, 0, s * 1.3, rand, rand() * 3);
      b.add(new THREE.CylinderGeometry(0.28 * s * 1.3, 0.32 * s * 1.3, 2.4 * s, 7), 0xd8c6a4, M(size * 0.4, top + 1.2 * s, size * 0.2));
    } else if (type === 'shrine') {
      // Tiny temple: plinth, four columns, pyramid roof, and a crystal inside
      b.add(new THREE.BoxGeometry(size * 1.1, 0.25 * s, size * 1.1), 0xcdb896, M(0, top + 0.12 * s, 0));
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        b.add(new THREE.CylinderGeometry(0.12 * s, 0.14 * s, 1.6 * s, 6), 0xe6d6b8, M(cx * size * 0.4, top + 1.05 * s, cz * size * 0.4));
      }
      b.add(new THREE.ConeGeometry(size * 0.8, 0.9 * s, 4), 0xc0643c, M(0, top + 2.3 * s, 0, 0, Math.PI / 4));
      addCrystals(b, 0, top + 0.2 * s, 0, s * 0.8, rand, [0xffd66b]);
    } else {
      addCrystals(b, 0, top, 0, s * 1.6, rand);
      b.add(new THREE.DodecahedronGeometry(0.5 * s, 0), 0x8c8479, M(size * 0.5, top + 0.2 * s, 0));
    }
    const mesh = b.build(vertexMat(), { receive: true });
    const a = (i / isletTypes.length) * Math.PI * 2 + rand() * 0.35;
    const d = 30 + rand() * 28;
    mesh.position.set(Math.cos(a) * d, -3 + rand() * 13, Math.sin(a) * d);
    mesh.rotation.y = rand() * Math.PI * 2;
    mesh.userData = { baseY: mesh.position.y, k: rand() * 10, spin: (rand() - 0.5) * 0.04 };
    scene.add(mesh);
    return mesh;
  });
  updaters.push((t) => {
    for (const m of islets) {
      const { baseY, k, spin } = m.userData;
      m.position.y = baseY + Math.sin(t * 0.4 + k) * 0.7;
      m.rotation.y += spin * 0.016;
      m.rotation.z = Math.sin(t * 0.3 + k) * 0.03;
    }
  });

  // ----- floating lanterns rising past the island -----
  const LANTERNS = 40;
  const lanternGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.17, 0.13, 0.36, 6),
    new THREE.CylinderGeometry(0.05, 0.17, 0.1, 6).translate(0, 0.23, 0),
  ]);
  const lanterns = new THREE.InstancedMesh(lanternGeo, new THREE.MeshBasicMaterial({ color: 0xffbf6e, toneMapped: false }), LANTERNS);
  lanterns.frustumCulled = false;
  const haloPos = new Float32Array(LANTERNS * 3);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
  const halos = new THREE.Points(
    haloGeo,
    new THREE.PointsMaterial({ map: glow, color: 0xff9d4a, size: 2.6, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  halos.frustumCulled = false;
  scene.add(lanterns, halos);
  const lanternData = Array.from({ length: LANTERNS }, () => ({
    a: rand() * Math.PI * 2,
    r: R + 10 + rand() * 24,
    y: rand(),
    speed: 0.012 + rand() * 0.012,
    k: rand() * 10,
  }));
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  let lastLantern = 0;
  updaters.push((t) => {
    const dt = Math.min(0.05, t - lastLantern);
    lastLantern = t;
    lanternData.forEach((l, i) => {
      l.y += dt * l.speed;
      if (l.y > 1) l.y -= 1;
      const a = l.a + t * 0.01;
      const x = Math.cos(a) * l.r + Math.sin(t * 0.5 + l.k) * 0.4;
      const z = Math.sin(a) * l.r;
      const y = -22 + l.y * 55;
      const fade = Math.min(1, l.y * 8, (1 - l.y) * 8);
      tmpV.set(x, y, z);
      tmpS.setScalar(fade);
      tmpQ.setFromEuler(tmpE.set(Math.sin(t + l.k) * 0.1, t * 0.3 + l.k, 0));
      lanterns.setMatrixAt(i, tmpM.compose(tmpV, tmpQ, tmpS));
      haloPos.set([x, y, z], i * 3);
    });
    lanterns.instanceMatrix.needsUpdate = true;
    haloGeo.attributes.position.needsUpdate = true;
  });

  // ----- birds circling the island -----
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b2440, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.14, 0, 0, -0.12, 0.75, 0, -0.08], 3));
  const bodyGeo = new THREE.ConeGeometry(0.09, 0.55, 4).rotateX(Math.PI / 2);
  const birds = Array.from({ length: 7 }, (_, i) => {
    const bird = new THREE.Group();
    const wingL = new THREE.Mesh(wingGeo, birdMat);
    const wingR = new THREE.Mesh(wingGeo, birdMat);
    wingL.scale.x = -1;
    bird.add(new THREE.Mesh(bodyGeo, birdMat), wingL, wingR);
    bird.userData = { wingL, wingR, r: R + 12 + (i % 3) * 3 + rand() * 2, h: 4 + rand() * 5, a0: (i < 4 ? 0 : Math.PI) + i * 0.18, w: 0.16 + (i < 4 ? 0 : 0.03), k: rand() * 10 };
    bird.scale.setScalar(1.3);
    scene.add(bird);
    return bird;
  });
  updaters.push((t) => {
    for (const bird of birds) {
      const { wingL, wingR, r, h, a0, w, k } = bird.userData;
      const a = a0 + t * w;
      bird.position.set(Math.cos(a) * r, h + Math.sin(t * 0.6 + k) * 0.8, Math.sin(a) * r);
      bird.rotation.set(0, -a, -0.25);
      const glide = Math.sin(t * 0.5 + k) > 0.3 ? 0.15 : 1;
      const flap = Math.sin(t * 9 + k) * 0.7 * glide + 0.1;
      wingR.rotation.z = flap;
      wingL.rotation.z = -flap;
    }
  });

  return {
    update: (t) => updaters.forEach((fn) => fn(t)),
    /** 1 = normal, lower = darker. Keeps sky and fog in step with the renderer exposure. */
    setDim(v) {
      skyUniforms.dim.value = v;
      scene.fog.color.copy(fogColor).multiplyScalar(v);
    },
  };
}
