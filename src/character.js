import * as THREE from 'three';

// A little self-illumination keeps the character readable when backlit by the fire.
const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, emissive: color, emissiveIntensity: 0.18, ...extra });

function part(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function pivot(x = 0, y = 0, z = 0, ...children) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (children.length) g.add(...children); // add() with nothing logs an error
  return g;
}

/** A little wandering mage built from primitives. Faces +Z, feet at y = 0. */
export function createCharacter() {
  const M = {
    tunic: mat(0x3a5a8c),
    tunicDark: mat(0x2c4570),
    cape: mat(0x2a3553, { side: THREE.DoubleSide }),
    capeLining: mat(0xb8463f, { side: THREE.DoubleSide }),
    skin: mat(0xf2c7a0),
    blush: mat(0xf09a8a),
    hair: mat(0x5b3a29),
    pants: mat(0x2d2b3a),
    leather: mat(0x5a3a26),
    boots: mat(0x44291c),
    gold: mat(0xd6a64a, { metalness: 0.6, roughness: 0.4 }),
    scarf: mat(0xd9534f),
    eye: new THREE.MeshBasicMaterial({ color: 0x1b1b24 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    gem: new THREE.MeshBasicMaterial({ color: 0x7fe3ff, toneMapped: false }),
  };

  const root = new THREE.Group();

  // ---------- hips + legs ----------
  const HIP_Y = 0.76;
  const hips = pivot(0, HIP_Y, 0);
  root.add(hips);
  hips.add(part(new THREE.CylinderGeometry(0.27, 0.25, 0.2, 7), M.pants, 0, 0.02));

  function leg(side) {
    const thigh = pivot(side * 0.13, -0.04, 0);
    thigh.add(part(new THREE.BoxGeometry(0.17, 0.36, 0.18), M.pants, 0, -0.18));
    const knee = pivot(0, -0.36, 0);
    knee.add(part(new THREE.BoxGeometry(0.15, 0.3, 0.16), M.pants, 0, -0.14));
    // Boot with a folded cuff and a toe that sticks forward.
    knee.add(part(new THREE.BoxGeometry(0.19, 0.08, 0.2), M.leather, 0, -0.2));
    knee.add(part(new THREE.BoxGeometry(0.17, 0.12, 0.18), M.boots, 0, -0.28));
    knee.add(part(new THREE.BoxGeometry(0.17, 0.08, 0.3), M.boots, 0, -0.32, 0.05));
    thigh.add(knee);
    hips.add(thigh);
    return { thigh, knee };
  }
  const legL = leg(-1);
  const legR = leg(1);

  // ---------- torso ----------
  const spine = pivot(0, 0.1, 0);
  hips.add(spine);
  spine.add(part(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 7), M.tunic, 0, 0.25));
  // Tunic skirt flaring over the hips
  spine.add(part(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 7), M.tunicDark, 0, -0.04));
  // Belt, buckle, satchel strap and satchel
  spine.add(part(new THREE.CylinderGeometry(0.305, 0.31, 0.07, 7), M.leather, 0, 0.06));
  spine.add(part(new THREE.BoxGeometry(0.1, 0.09, 0.04), M.gold, 0, 0.06, 0.3));
  const strap = part(new THREE.BoxGeometry(0.06, 0.52, 0.02), M.leather, 0, 0.28, 0.262);
  strap.rotation.z = 0.72;
  spine.add(strap);
  const strapBack = part(new THREE.BoxGeometry(0.06, 0.52, 0.02), M.leather, 0, 0.28, -0.262);
  strapBack.rotation.z = -0.72;
  spine.add(strapBack);
  const satchel = pivot(0.33, 0.02, 0.02);
  satchel.add(part(new THREE.BoxGeometry(0.1, 0.2, 0.24), M.leather));
  satchel.add(part(new THREE.BoxGeometry(0.11, 0.08, 0.25), mat(0x7a5234), 0, 0.07));
  spine.add(satchel);
  // Collar pendant
  spine.add(part(new THREE.OctahedronGeometry(0.045, 0), M.gem, 0, 0.36, 0.26));

  // Scarf with a tail that flaps behind
  const scarfRing = part(new THREE.TorusGeometry(0.21, 0.075, 4, 8), M.scarf, 0, 0.5);
  scarfRing.rotation.x = Math.PI / 2;
  spine.add(scarfRing);
  const scarfTail = pivot(0.1, 0.48, -0.2);
  scarfTail.add(part(new THREE.BoxGeometry(0.13, 0.04, 0.36), M.scarf, 0, 0, -0.18));
  const scarfTip = pivot(0, 0, -0.36);
  scarfTip.add(part(new THREE.BoxGeometry(0.13, 0.04, 0.22), M.scarf, 0, 0, -0.11));
  scarfTail.add(scarfTip);
  spine.add(scarfTail);

  // Cape in two hinged segments so it can ripple
  const cape = pivot(0, 0.46, -0.22);
  const capeTop = new THREE.Group();
  capeTop.add(part(new THREE.BoxGeometry(0.52, 0.4, 0.025), M.cape, 0, -0.2));
  capeTop.add(part(new THREE.BoxGeometry(0.5, 0.38, 0.01), M.capeLining, 0, -0.2, 0.016));
  const capeBottom = pivot(0, -0.4, 0);
  capeBottom.add(part(new THREE.BoxGeometry(0.58, 0.36, 0.025), M.cape, 0, -0.18));
  capeBottom.add(part(new THREE.BoxGeometry(0.56, 0.34, 0.01), M.capeLining, 0, -0.18, 0.016));
  capeTop.add(capeBottom);
  cape.add(capeTop);
  spine.add(cape);

  // ---------- arms ----------
  function arm(side) {
    const shoulder = pivot(side * 0.33, 0.43, 0);
    shoulder.add(part(new THREE.IcosahedronGeometry(0.11, 0), M.tunicDark));
    shoulder.add(part(new THREE.BoxGeometry(0.13, 0.26, 0.13), M.tunic, 0, -0.14));
    const elbow = pivot(0, -0.27, 0);
    elbow.add(part(new THREE.BoxGeometry(0.12, 0.22, 0.12), M.tunic, 0, -0.1));
    elbow.add(part(new THREE.BoxGeometry(0.14, 0.07, 0.14), M.leather, 0, -0.2)); // glove cuff
    elbow.add(part(new THREE.IcosahedronGeometry(0.075, 0), M.leather, 0, -0.27)); // hand
    shoulder.add(elbow);
    shoulder.rotation.z = side * 0.1;
    spine.add(shoulder);
    return { shoulder, elbow };
  }
  const armL = arm(-1);
  const armR = arm(1);

  // ---------- head ----------
  const neck = pivot(0, 0.56, 0);
  spine.add(neck);
  const head = pivot(0, 0.24, 0);
  neck.add(head);
  const skull = part(new THREE.IcosahedronGeometry(0.27, 1), M.skin);
  skull.scale.set(1, 0.95, 0.95);
  head.add(skull);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = pivot(side * 0.095, 0.0, 0.25);
    eye.add(part(new THREE.BoxGeometry(0.055, 0.09, 0.04), M.eye));
    eye.add(part(new THREE.BoxGeometry(0.02, 0.025, 0.01), M.shine, side * -0.01, 0.022, 0.017));
    eye.rotation.y = side * 0.25;
    head.add(eye);
    eyes.push(eye);
    const cheek = part(new THREE.BoxGeometry(0.06, 0.03, 0.02), M.blush, side * 0.15, -0.07, 0.21);
    cheek.rotation.y = side * 0.5;
    head.add(cheek);
  }
  head.add(part(new THREE.TetrahedronGeometry(0.035, 0), M.skin, 0, -0.04, 0.265));

  // Hair tufts peeking from under the hat
  const tufts = [
    [-0.16, 0.1, 0.18, 0.4],
    [-0.05, 0.13, 0.22, 0.1],
    [0.08, 0.12, 0.21, -0.2],
    [0.2, 0.06, 0.12, -0.5],
    [-0.22, 0.02, 0.05, 0.7],
    [0.23, 0.0, 0.02, -0.7],
    [0, 0.0, -0.24, 0],
  ];
  for (const [x, y, z, rz] of tufts) {
    const t = part(new THREE.ConeGeometry(0.07, 0.16, 4), M.hair, x, y, z);
    t.rotation.set(z > 0 ? 2.6 : z < -0.1 ? -2.6 : 3.1, 0, rz);
    head.add(t);
  }
  head.add(part(new THREE.IcosahedronGeometry(0.24, 0), M.hair, 0, 0.04, -0.08));

  // Wizard hat: brim, band with a gem, and a tip in two bendable segments
  const hat = pivot(0, 0.17, -0.02);
  hat.rotation.x = -0.08;
  hat.add(part(new THREE.CylinderGeometry(0.46, 0.48, 0.04, 9), M.tunicDark));
  hat.add(part(new THREE.CylinderGeometry(0.26, 0.29, 0.1, 9), M.gold, 0, 0.06));
  hat.add(part(new THREE.OctahedronGeometry(0.05, 0), M.gem, 0, 0.06, 0.285));
  hat.add(part(new THREE.CylinderGeometry(0.17, 0.27, 0.26, 9), M.tunic, 0, 0.2));
  const hatMid = pivot(0, 0.33, 0);
  hatMid.add(part(new THREE.CylinderGeometry(0.08, 0.17, 0.24, 9), M.tunic, 0, 0.12));
  const hatTip = pivot(0, 0.24, 0);
  hatTip.add(part(new THREE.ConeGeometry(0.08, 0.2, 9), M.tunic, 0, 0.1));
  hatTip.add(part(new THREE.IcosahedronGeometry(0.04, 0), M.gold, 0, 0.2));
  hatMid.add(hatTip);
  hat.add(hatMid);
  head.add(hat);

  // ---------- animation ----------
  let phase = 0;
  let blend = 0;
  let blinkTimer = 2;
  let lastHeading = 0;
  let turn = 0;

  /**
   * speed01: 0 idle → ~0.55 walk → 1 run.
   * heading: current facing angle, used to lean into turns.
   */
  function animate(dt, speed01, time, heading = 0) {
    blend += (speed01 - blend) * Math.min(1, dt * 8);
    const b = blend;
    const moving = b > 0.03;
    phase += dt * (5 + 7 * b) * (moving ? 1 : 0);
    if (!moving) phase += (Math.round(phase / Math.PI) * Math.PI - phase) * Math.min(1, dt * 6);

    let dHeading = heading - lastHeading;
    dHeading = Math.atan2(Math.sin(dHeading), Math.cos(dHeading));
    lastHeading = heading;
    turn += (THREE.MathUtils.clamp(dHeading / Math.max(dt, 1e-3), -6, 6) * 0.04 - turn) * Math.min(1, dt * 6);

    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const stride = 0.55 + 0.35 * b;

    // Legs: thigh swings, knee bends while the leg travels forward.
    legL.thigh.rotation.x = s * stride * b;
    legR.thigh.rotation.x = -s * stride * b;
    legL.knee.rotation.x = Math.max(0, -c) * (0.6 + 0.6 * b) * b;
    legR.knee.rotation.x = Math.max(0, c) * (0.6 + 0.6 * b) * b;

    // Arms swing opposite to legs, elbows bend more when running.
    armL.shoulder.rotation.x = -s * stride * 0.9 * b;
    armR.shoulder.rotation.x = s * stride * 0.9 * b;
    armL.elbow.rotation.x = -(0.15 + 0.9 * b * b) + Math.sin(time * 1.6) * 0.03 * (1 - b);
    armR.elbow.rotation.x = -(0.15 + 0.9 * b * b) + Math.sin(time * 1.6 + 1) * 0.03 * (1 - b);

    // Body: bounce twice per stride, lean forward and into turns, twist with the stride.
    const breathe = Math.sin(time * 2.2) * 0.012 * (1 - b);
    hips.position.y = HIP_Y - Math.abs(s) * 0.06 * b + breathe; // dip when the legs are spread
    hips.rotation.y = s * 0.12 * b;
    spine.rotation.y = -s * 0.2 * b;
    spine.rotation.x = 0.06 + 0.18 * b * b;
    spine.rotation.z = -turn * (0.3 + b);
    spine.scale.set(1 + breathe * 0.8, 1 + breathe * 1.5, 1 + breathe * 0.8);

    // Head: keeps looking forward while walking, looks around lazily when idle.
    const idleLook = Math.sin(time * 0.45) * 0.45 + Math.sin(time * 1.1) * 0.08;
    neck.rotation.y = -spine.rotation.y * 0.8 + idleLook * (1 - b);
    neck.rotation.x = -spine.rotation.x * 0.7 + Math.sin(time * 0.7) * 0.04 * (1 - b);
    neck.rotation.z = Math.sin(time * 0.5) * 0.05 * (1 - b) + turn * 0.4;

    // Blink every few seconds.
    blinkTimer -= dt;
    let lid = 1;
    if (blinkTimer < 0.12) lid = Math.abs(blinkTimer - 0.06) / 0.06;
    if (blinkTimer <= 0) blinkTimer = 2 + Math.random() * 3;
    for (const eye of eyes) eye.scale.y = Math.max(0.1, lid);

    // Cloth: cape, scarf and hat tip trail behind with some flutter.
    const flutter = (f, k) => Math.sin(time * f + k) * (0.05 + 0.12 * b);
    capeTop.rotation.x = 0.08 + 0.75 * b + flutter(7, 0);
    capeBottom.rotation.x = 0.1 + 0.45 * b + flutter(9, 1.2);
    capeTop.rotation.z = -turn * 0.8;
    scarfTail.rotation.x = -1.25 + 1.0 * b + flutter(8, 0.5);
    scarfTip.rotation.x = 0.2 * b + flutter(11, 2);
    scarfTail.rotation.y = Math.sin(time * 5) * 0.15 + turn;
    hatMid.rotation.x = -0.12 - 0.25 * b + flutter(6, 0.3) * 0.5;
    hatTip.rotation.x = -0.25 - 0.35 * b + flutter(7, 1) * 0.6;
    hatMid.rotation.z = turn * 0.6;
    satchel.rotation.x = -s * 0.25 * b;
  }

  return { root, animate };
}
