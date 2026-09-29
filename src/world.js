import * as THREE from 'three';
import { buildScenery } from './scenery.js';
import { incomingTexture, placeholderTexture, plaqueTexture, seededRandom } from './textures.js';

const COLORS = {
  stone: 0xdcc9a6,
  stoneDark: 0xb49b78,
  stoneDeep: 0x8f7a5e,
  floorA: 0xe6d6b8,
  floorB: 0xcdb896,
  gold: 0xd6a64a,
  bronze: 0x9a6a3a,
};

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export const COLUMN_HEIGHT = 6;

/**
 * Builds the temple around the given works.
 * Returns everything the game loop needs: colliders, displays, walk bounds and an update hook.
 */
export function buildWorld(scene, works, textureLoader, renderer) {
  const rand = seededRandom(42);
  const slots = Math.max(works.length, 6);
  const R = Math.max(7, (slots * 3.4) / (Math.PI * 2));
  const colliders = [];
  const displays = [];
  const animated = [];
  const occluders = []; // meshes the camera should not pass through

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xffe6c7, 0x4a3b52, 1.05));

  const sun = new THREE.DirectionalLight(0xffd1a1, 1.8);
  sun.position.set(R * 0.6, 30, R * 0.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = R + 8;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  // ---------- stepped platform ----------
  const platform = [
    { r: R + 3, h: 1.8, color: COLORS.stone },
    { r: R + 4, h: 1.2, color: COLORS.stoneDark },
    { r: R + 5, h: 0.6, color: COLORS.stoneDeep },
  ];
  for (const { r, h, color } of platform) {
    const tier = mesh(new THREE.CylinderGeometry(r, r + 0.15, h, 32), flat(color));
    tier.position.y = h / 2 - 1.8;
    scene.add(tier);
  }

  // Floor tiles: alternating rings of wedges on top of the platform.
  const ringCount = Math.ceil((R + 3) / 2);
  for (let ring = 0; ring < ringCount; ring++) {
    const inner = ring * 2;
    const outer = Math.min(R + 3, inner + 2);
    const segs = 8 + ring * 6;
    for (let j = 0; j < segs; j++) {
      const geo = new THREE.RingGeometry(inner, outer, 3, 1, (j / segs) * Math.PI * 2, (Math.PI * 2) / segs);
      geo.rotateX(-Math.PI / 2);
      const tile = mesh(geo, flat((ring + j) % 2 ? COLORS.floorA : COLORS.floorB), { cast: false });
      tile.position.y = 0.01;
      scene.add(tile);
    }
  }
  const inlay = mesh(new THREE.RingGeometry(2.4, 2.7, 32), flat(COLORS.gold, { metalness: 0.4, roughness: 0.5 }), { cast: false });
  inlay.geometry.rotateX(-Math.PI / 2);
  inlay.position.y = 0.025;
  scene.add(inlay);

  // ---------- colonnade ----------
  const columnCount = slots < 10 ? slots * 2 : slots;
  const columnR = R + 1.4;
  const columnMat = flat(COLORS.stone);
  const columnTrim = flat(COLORS.stoneDark);
  for (let i = 0; i < columnCount; i++) {
    // Columns sit between pedestals (or flank each one when there are few).
    const a = ((columnCount === slots ? i : i + 0.5) / columnCount) * Math.PI * 2 - Math.PI / 2;
    const col = new THREE.Group();
    const foot = mesh(new THREE.BoxGeometry(1.05, 0.35, 1.05), columnTrim);
    foot.position.y = 0.175;
    const shaft = mesh(new THREE.CylinderGeometry(0.36, 0.44, COLUMN_HEIGHT - 0.7, 7), columnMat);
    shaft.position.y = COLUMN_HEIGHT / 2;
    const cap = mesh(new THREE.BoxGeometry(1.05, 0.35, 1.05), columnTrim);
    cap.position.y = COLUMN_HEIGHT - 0.175;
    col.add(foot, shaft, cap);
    occluders.push(shaft);
    col.position.set(Math.cos(a) * columnR, 0, Math.sin(a) * columnR);
    col.rotation.y = -a;
    scene.add(col);
    colliders.push({ x: col.position.x, z: col.position.z, r: 0.6 });
  }

  // Entablature ring on top of the columns.
  const beamProfile = [
    new THREE.Vector2(R + 0.4, 0),
    new THREE.Vector2(R + 2.5, 0),
    new THREE.Vector2(R + 2.7, 0.35),
    new THREE.Vector2(R + 2.5, 0.8),
    new THREE.Vector2(R + 0.4, 0.8),
    new THREE.Vector2(R + 0.4, 0),
  ];
  const beam = mesh(new THREE.LatheGeometry(beamProfile, 40), flat(COLORS.stoneDark));
  beam.position.y = COLUMN_HEIGHT;
  scene.add(beam);
  occluders.push(beam);

  // Low-poly dome with an oculus in the middle.
  const domeR = R + 2.2;
  const dome = mesh(
    new THREE.SphereGeometry(domeR, 20, 7, 0, Math.PI * 2, Math.PI * 0.1, Math.PI * 0.4),
    flat(COLORS.stone, { side: THREE.DoubleSide }),
    { cast: false, receive: false },
  );
  dome.scale.y = 0.55;
  dome.position.y = COLUMN_HEIGHT + 0.8;
  scene.add(dome);
  occluders.push(dome);
  const oculusR = Math.sin(Math.PI * 0.1) * domeR;
  const oculusY = COLUMN_HEIGHT + 0.8 + Math.cos(Math.PI * 0.1) * domeR * 0.55;

  // Light shaft through the oculus.
  const shaftGeo = new THREE.CylinderGeometry(oculusR * 0.9, 3.2, oculusY, 20, 1, true);
  const lightShaft = new THREE.Mesh(
    shaftGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffd9a8,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  lightShaft.position.y = oculusY / 2;
  scene.add(lightShaft);

  // ---------- central brazier ----------
  const brazier = new THREE.Group();
  const stand = mesh(new THREE.CylinderGeometry(0.45, 0.7, 0.9, 8), flat(COLORS.stoneDark));
  stand.position.y = 0.45;
  const bowl = mesh(new THREE.CylinderGeometry(0.95, 0.5, 0.45, 8), flat(COLORS.bronze, { metalness: 0.5, roughness: 0.6 }));
  bowl.position.y = 1.1;
  const rim = mesh(new THREE.TorusGeometry(0.95, 0.06, 4, 8), flat(COLORS.gold, { metalness: 0.5, roughness: 0.5 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.33;
  // Coal bed sits inside the rim; flames grow up from it so nothing pokes through the bowl.
  const coals = mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.06, 8), flat(0x2b1a12), { cast: false });
  coals.position.y = 1.34;
  brazier.add(stand, bowl, rim, coals);
  const FIRE_BASE = 1.37;
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f, toneMapped: false });
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.2 + rand() * 0.55;
    const ember = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + rand() * 0.05, 0), emberMat);
    ember.position.set(Math.cos(a) * r, FIRE_BASE, Math.sin(a) * r);
    ember.rotation.set(rand() * 3, rand() * 3, 0);
    brazier.add(ember);
  }

  const flames = [];
  const flameColors = [0xff6a1f, 0xff9a33, 0xffc94d, 0xffe38a];
  const flameLayout = [
    { r: 0, radius: 0.36, height: 1.35, color: 0 },
    { r: 0, radius: 0.24, height: 1.05, color: 2 },
    { r: 0, radius: 0.12, height: 0.7, color: 3 },
    ...Array.from({ length: 6 }, (_, i) => ({ r: 0.4, a: (i / 6) * Math.PI * 2, radius: 0.2, height: 0.55 + rand() * 0.35, color: i % 2 })),
  ];
  for (const { r, a = 0, radius, height, color } of flameLayout) {
    const geo = new THREE.ConeGeometry(radius, height, 5);
    geo.translate(0, height / 2, 0); // pivot at the base so scaling only grows upwards
    const f = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: flameColors[color], toneMapped: false }));
    f.position.set(Math.cos(a) * r, FIRE_BASE, Math.sin(a) * r);
    f.userData.seed = rand() * 10;
    flames.push(f);
    brazier.add(f);
  }

  // Sparks rising from the fire.
  const sparkCount = 24;
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkLife = Array.from({ length: sparkCount }, () => rand());
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: 0xffb347, size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  brazier.add(sparks);
  scene.add(brazier);
  colliders.push({ x: 0, z: 0, r: 1.05 });

  const fireLight = new THREE.PointLight(0xff9a4a, 9, R * 2, 1.6);
  fireLight.position.set(0, 2.2, 0);
  scene.add(fireLight);

  let lastT = 0;
  animated.push((t) => {
    const dt = Math.min(0.05, t - lastT);
    lastT = t;
    for (const f of flames) {
      const k = f.userData.seed;
      const s = 0.85 + Math.sin(t * 9 + k) * 0.18 + Math.sin(t * 17 + k * 2) * 0.08;
      f.scale.set(1 - (s - 0.85) * 0.5, s, 1 - (s - 0.85) * 0.5);
      f.rotation.y = t * 1.2 + k;
      f.rotation.z = Math.sin(t * 3 + k) * 0.06;
    }
    for (let i = 0; i < sparkCount; i++) {
      sparkLife[i] += dt * (0.5 + (i % 5) * 0.12);
      if (sparkLife[i] > 1) sparkLife[i] -= 1;
      const life = sparkLife[i];
      const a = i * 2.39996 + t * 0.4;
      const r = 0.15 + life * 0.35 + (i % 3) * 0.1;
      sparkPos.set([Math.cos(a) * r, FIRE_BASE + 0.3 + life * 2.4, Math.sin(a) * r], i * 3);
    }
    sparkGeo.attributes.position.needsUpdate = true;
    fireLight.intensity = 9 + Math.sin(t * 11) * 1.2 + Math.sin(t * 23) * 0.8;
  });

  // ---------- dust motes ----------
  const dustCount = 350;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (R + 1);
    dustPos.set([Math.cos(a) * r, rand() * COLUMN_HEIGHT, Math.sin(a) * r], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xffe2b0, size: 0.045, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(dust);
  animated.push((t) => {
    dust.rotation.y = t * 0.02;
    dust.position.y = Math.sin(t * 0.3) * 0.2;
  });

  // ---------- outside: sky island, clouds, sky ----------
  const scenery = buildScenery(scene, { R, rand });
  animated.push(scenery.update);

  // Invisible wall: the player stays inside the ring of booths, so the outside is scenery only.
  const walkRadius = R + 0.5;

  // ---------- work displays ----------
  const pedestalMat = flat(COLORS.stoneDark);
  const frameMat = () => flat(COLORS.gold, { metalness: 0.55, roughness: 0.45 });
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  for (let i = 0; i < slots; i++) {
    const a = ((i + 0.5) / slots) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * R;
    const pz = Math.sin(a) * R;
    const work = works[i];

    const stand = new THREE.Group();
    stand.position.set(px, 0, pz);
    stand.lookAt(0, 0, 0);
    scene.add(stand);

    const pedestal = mesh(new THREE.BoxGeometry(1.7, 1.1, 0.8), pedestalMat);
    pedestal.position.y = 0.55;
    const top = mesh(new THREE.BoxGeometry(1.9, 0.12, 0.95), flat(COLORS.stone));
    top.position.y = 1.16;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.35),
      new THREE.MeshStandardMaterial({ map: work ? plaqueTexture(work.title, work.year) : plaqueTexture('Bientôt'), roughness: 0.6 }),
    );
    plaque.position.set(0, 0.65, 0.405);
    stand.add(pedestal, top, plaque);
    colliders.push({ x: px, z: pz, r: 0.95 });

    if (!work) {
      // Empty booth: a "Work Incoming" sign that gently pulses. Not interactive.
      const sign = new THREE.Group();
      const signBorder = mesh(new THREE.BoxGeometry(1.78, 1.28, 0.08), frameMat());
      const signMat = new THREE.MeshBasicMaterial({ map: incomingTexture(), toneMapped: false });
      const signFace = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), signMat);
      signFace.position.z = 0.045;
      sign.add(signBorder, signFace);
      sign.position.set(0, 1.22 + 0.64 + 0.12, 0);
      sign.rotation.x = -0.05;
      stand.add(sign);
      const phase = i * 1.3;
      animated.push((t) => signMat.color.setScalar(0.8 + Math.sin(t * 2 + phase) * 0.2));
      continue;
    }

    // The frame is what gets pulled towards the camera.
    const frame = new THREE.Group();
    const border = mesh(new THREE.BoxGeometry(1, 1, 0.08), frameMat());
    const imageMat = new THREE.MeshBasicMaterial({ map: placeholderTexture(work.title), toneMapped: false });
    const image = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), imageMat);
    image.position.z = 0.045;
    frame.add(border, image);
    scene.add(frame);
    stand.updateMatrixWorld(true);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0, 0));

    const display = {
      work,
      frame,
      border,
      image,
      standPos: new THREE.Vector3(px, 0, pz),
      facing: new THREE.Vector3(-px, 0, -pz).normalize(),
      homePos: new THREE.Vector3(),
      homeQuat: new THREE.Quaternion(),
      size: new THREE.Vector2(),
      focus: 0,
      index: 0, // which of the work's images the frame shows
    };

    const setAspect = (aspect) => {
      const maxW = 2.1;
      const maxH = 1.7;
      const w = aspect > maxW / maxH ? maxW : maxH * aspect;
      const h = w / aspect;
      display.size.set(w, h);
      image.scale.set(w, h, 1);
      border.scale.set(w + 0.18, h + 0.18, 1);
      display.homePos.set(0, 1.22 + h / 2 + 0.12, 0).applyMatrix4(stand.matrixWorld);
      display.homeQuat.copy(stand.quaternion).multiply(tilt);
      frame.position.copy(display.homePos);
      frame.quaternion.copy(display.homeQuat);
    };
    setAspect(4 / 3);

    const images = work.images || [];
    const placeholder = imageMat.map;
    const textures = [];
    const loadTexture = (i) =>
      (textures[i] ??= new Promise((resolve) => {
        textureLoader.load(
          images[i],
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = maxAniso;
            resolve(tex);
          },
          undefined,
          () => resolve(null),
        );
      }));

    /** Puts image `i` in the frame. Textures load on first use and stay cached. */
    display.show = (i) => {
      display.index = i;
      if (!images[i]) return;
      loadTexture(i).then((tex) => {
        if (!tex || display.index !== i) return; // failed, or the visitor already moved on
        if (imageMat.map === placeholder) placeholder.dispose();
        imageMat.map = tex;
        imageMat.needsUpdate = true;
        setAspect(tex.image.width / tex.image.height);
      });
    };
    display.preload = () => images.forEach((_, i) => loadTexture(i));
    display.show(0);

    displays.push(display);
  }

  return {
    radius: R,
    walkRadius,
    colliders,
    occluders,
    displays,
    setDim: scenery.setDim,
    update: (t) => animated.forEach((fn) => fn(t)),
  };
}
