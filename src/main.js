import * as THREE from 'three';
import { createCharacter } from './character.js';
import { createInput } from './input.js';
import { buildWorld } from './world.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');

const INTERACT_RANGE = 2.9;
const WALK_SPEED = 4.2;
const RUN_SPEED = 7.5;
const PLAYER_RADIUS = 0.4;

// ---------- data ----------
// Embedded in the page along with the title, heading and work list (see render.js).
const site = JSON.parse($('site-data').textContent);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed from three.js and fell back to this
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

const loadingManager = new THREE.LoadingManager();
const world = buildWorld(scene, site.works, new THREE.TextureLoader(loadingManager), renderer);

const character = createCharacter();
scene.add(character.root);

const input = createInput(canvas, {
  joystick: $('joystick'),
  knob: $('joystick-knob'),
  interactButton: $('touch-e'),
});

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- player + camera state ----------
const player = {
  pos: new THREE.Vector3(0, 0, 2.6),
  vel: new THREE.Vector3(),
  heading: Math.PI, // facing -Z, across the brazier
};
const cam = { yaw: 0, pitch: 0.32, dist: 6.5, smoothDist: 6.5, target: new THREE.Vector3(0, 1.5, 2.6) };
const raycaster = new THREE.Raycaster();

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function updatePlayer(dt, locked) {
  const look = input.consumeLook();
  cam.yaw -= look.x * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + look.y * 0.004, 0.05, 1.25);
  if (look.zoom) cam.dist = THREE.MathUtils.clamp(cam.dist + look.zoom * 0.6, 3, 12);

  const move = locked ? { x: 0, y: 0 } : input.move();
  const sin = Math.sin(cam.yaw);
  const cos = Math.cos(cam.yaw);
  // forward = (-sin, -cos), right = (cos, -sin) on the XZ plane
  const wishX = move.x * cos - move.y * sin;
  const wishZ = -move.x * sin - move.y * cos;
  const speed = input.running ? RUN_SPEED : WALK_SPEED;

  const accel = Math.min(1, dt * 10);
  player.vel.x += (wishX * speed - player.vel.x) * accel;
  player.vel.z += (wishZ * speed - player.vel.z) * accel;
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

  // Push out of circular colliders, then keep inside the invisible wall.
  // A couple of passes let the two constraints settle when they meet near a booth.
  for (let pass = 0; pass < 3; pass++) {
    for (const c of world.colliders) {
      const dx = player.pos.x - c.x;
      const dz = player.pos.z - c.z;
      const min = c.r + PLAYER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        player.pos.x = c.x + (dx / d) * min;
        player.pos.z = c.z + (dz / d) * min;
      }
    }
    const r = Math.hypot(player.pos.x, player.pos.z);
    if (r > world.walkRadius) {
      player.pos.x *= world.walkRadius / r;
      player.pos.z *= world.walkRadius / r;
      // Kill the outward velocity so the player slides along the wall instead of pushing into it.
      const nx = player.pos.x / world.walkRadius;
      const nz = player.pos.z / world.walkRadius;
      const out = player.vel.x * nx + player.vel.z * nz;
      if (out > 0) {
        player.vel.x -= out * nx;
        player.vel.z -= out * nz;
      }
    }
  }

  if (Math.hypot(wishX, wishZ) > 0.1) {
    const target = Math.atan2(wishX, wishZ);
    let diff = target - player.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.heading += diff * Math.min(1, dt * 12);
  }

  character.root.position.copy(player.pos);
  character.root.rotation.y = player.heading;
  character.animate(dt, Math.min(1, Math.hypot(player.vel.x, player.vel.z) / RUN_SPEED), clock.elapsedTime, player.heading);
}

function updateCamera(dt) {
  cam.target.lerp(tmp.set(player.pos.x, player.pos.y + 1.5, player.pos.z), Math.min(1, dt * 8));
  const dir = tmp2.set(
    Math.sin(cam.yaw) * Math.cos(cam.pitch),
    Math.sin(cam.pitch),
    Math.cos(cam.yaw) * Math.cos(cam.pitch),
  );

  // Pull the camera in if architecture is in the way.
  let dist = cam.dist;
  raycaster.set(cam.target, dir);
  raycaster.far = cam.dist;
  const hit = raycaster.intersectObjects(world.occluders, false)[0];
  if (hit) dist = Math.max(1.2, hit.distance - 0.3);
  cam.smoothDist += (dist - cam.smoothDist) * Math.min(1, dt * (dist < cam.smoothDist ? 20 : 4));

  camera.position.copy(cam.target).addScaledVector(dir, cam.smoothDist);
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
}

// ---------- interaction: press E to bring a work forward, again to put it back ----------
let candidate = null;
let focused = null;

const prompt = $('prompt');
const promptTitle = $('prompt-title');
const touchE = $('touch-e');
// Movement is locked while a work is up, so the strafe keys are free to flip through images.
const PREV_KEYS = ['ArrowLeft', 'KeyA'];
const NEXT_KEYS = ['ArrowRight', 'KeyD'];

function findCandidate() {
  let best = null;
  let bestDist = INTERACT_RANGE;
  for (const d of world.displays) {
    tmp.subVectors(player.pos, d.standPos).setY(0);
    const dist = tmp.length();
    if (dist < bestDist && tmp.dot(d.facing) > 0.2) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

function showCard(work) {
  $('card-title').textContent = work.title;
  $('card-meta').textContent = [work.year, ...(work.tags || [])].filter(Boolean).join('  ·  ');
  $('card-description').textContent = work.description || '';
  const link = $('card-link');
  const safe = /^https?:\/\//i.test(work.link || '');
  link.hidden = !safe;
  if (safe) link.href = work.link;

  const software = work.software || [];
  $('card-software').hidden = !software.length;
  $('card-software-list').replaceChildren(
    ...software.map((name) => Object.assign(document.createElement('li'), { textContent: name })),
  );

  const images = work.images || [];
  $('card-gallery').hidden = images.length < 2;
  $('card-thumbs').replaceChildren(
    ...images.map((src, i) => {
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.setAttribute('aria-label', `Image ${i + 1}`);
      thumb.append(Object.assign(document.createElement('img'), { src, alt: '' }));
      thumb.addEventListener('click', () => showImage(i));
      return thumb;
    }),
  );
  updateGallery();
  $('card').classList.add('visible');
}

function updateGallery() {
  const count = focused.work.images?.length || 0;
  $('img-count').textContent = `${focused.index + 1} / ${count}`;
  const strip = $('card-thumbs');
  [...strip.children].forEach((thumb, i) => thumb.classList.toggle('active', i === focused.index));
  // Keep the active thumbnail centred in the strip when there are more than fit.
  const active = strip.children[focused.index];
  if (active) {
    const left = active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    strip.scrollTo({ left, behavior: 'smooth' });
  }
}

function showImage(i) {
  const count = focused?.work.images?.length || 0;
  if (count < 2) return;
  focused.show((i + count) % count);
  updateGallery();
}
$('img-prev').addEventListener('click', () => focused && showImage(focused.index - 1));
$('img-next').addEventListener('click', () => focused && showImage(focused.index + 1));

function openWork(display) {
  focused = display;
  display.preload();
  showCard(display.work);
}

function closeWork() {
  focused = null;
  $('card').classList.remove('visible');
}

/** Puts the player in front of a work's pedestal, camera behind them, and brings the work forward. */
function visitWork(display) {
  const { standPos, facing } = display;
  player.pos.copy(standPos).addScaledVector(facing, 2);
  player.vel.set(0, 0, 0);
  player.heading = Math.atan2(-facing.x, -facing.z);
  cam.yaw = Math.atan2(facing.x, facing.z);
  cam.target.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
  openWork(display);
}

// ---------- list view: every work as plain HTML ----------
const listView = $('list-view');

function setListOpen(open) {
  listView.hidden = !open;
  input.enabled = !open;
  if (open) closeWork();
  // Focus the list itself, so Space and the arrow keys scroll it.
  (open ? listView : $('list-open')).focus({ preventScroll: true });
}
$('list-open').addEventListener('click', () => setListOpen(true));
$('list-close').addEventListener('click', () => setListOpen(false));
addEventListener('keydown', (e) => e.code === 'Escape' && !listView.hidden && setListOpen(false));
listView.addEventListener('click', (e) => {
  const id = e.target.closest('[data-visit]')?.dataset.visit;
  const display = id && world.displays.find((d) => d.work.id === id);
  if (!display) return;
  setListOpen(false);
  visitWork(display);
});

// Links to a work's section (e.g. #oeuvre-save-the-date) open the list there.
function showLinkedWork() {
  const linked = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!linked || !listView.contains(linked)) return;
  setListOpen(true);
  linked.scrollIntoView();
}
addEventListener('hashchange', showLinkedWork);
showLinkedWork();

function updateInteraction() {
  const pressed = input.consumePresses();
  const any = (codes) => codes.some((c) => pressed.has(c));

  if (!focused) {
    candidate = findCandidate();
    if (candidate && pressed.has('KeyE')) openWork(candidate);
  } else if (any(['KeyE', 'Escape'])) {
    closeWork();
  } else if (any(PREV_KEYS)) {
    showImage(focused.index - 1);
  } else if (any(NEXT_KEYS)) {
    showImage(focused.index + 1);
  }

  prompt.classList.toggle('visible', !!candidate && !focused);
  if (candidate) promptTitle.textContent = candidate.work.title;
  touchE.classList.toggle('active', !!focused);
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const focusPos = new THREE.Vector3();
const focusQuat = new THREE.Quaternion();
const sway = new THREE.Quaternion();
const swayEuler = new THREE.Euler();
const camDir = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();

function computeFocusPose(display, time) {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const w = display.size.x + 0.18;
  const h = display.size.y + 0.18;
  const wide = camera.aspect > 1.1;
  // Fraction of the screen the frame may occupy; the info card takes the rest.
  const fracW = wide ? 0.5 : 0.8;
  const fracH = wide ? 0.7 : 0.4;
  const dist = Math.max(h / (fracH * 2 * tanHalf), w / (fracW * 2 * tanHalf * camera.aspect));
  const visibleH = 2 * dist * tanHalf;
  const visibleW = visibleH * camera.aspect;

  camera.getWorldDirection(camDir);
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  focusPos
    .copy(camera.position)
    .addScaledVector(camDir, dist)
    .addScaledVector(camRight, wide ? -visibleW * 0.2 : 0)
    .addScaledVector(camUp, wide ? 0 : visibleH * 0.22);
  swayEuler.set(Math.sin(time * 0.9) * 0.03, Math.sin(time * 0.6) * 0.06, 0);
  focusQuat.copy(camera.quaternion).multiply(sway.setFromEuler(swayEuler));
}

function setOnTop(display, on) {
  if (display.onTop === on) return;
  display.onTop = on;
  for (const m of [display.border, display.image]) {
    m.material.depthTest = !on;
    m.material.transparent = on;
    m.material.needsUpdate = true;
    m.renderOrder = on ? (m === display.image ? 1001 : 1000) : 0;
  }
  display.border.castShadow = !on;
}

function updateDisplays(dt, time) {
  let dim = 0;
  for (const d of world.displays) {
    const target = d === focused ? 1 : 0;
    d.focus += (target - d.focus) * Math.min(1, dt * 7);
    if (Math.abs(target - d.focus) < 0.001) d.focus = target;
    const e = ease(d.focus);
    dim = Math.max(dim, e);

    if (d.focus > 0) {
      computeFocusPose(d, time);
      d.frame.position.lerpVectors(d.homePos, focusPos, e);
      d.frame.quaternion.slerpQuaternions(d.homeQuat, focusQuat, e);
    } else {
      d.frame.position.copy(d.homePos);
      d.frame.quaternion.copy(d.homeQuat);
      if (d.index !== 0) d.show(0); // back on the pedestal: show the cover again
    }
    setOnTop(d, d.focus > 0.02);
  }
  renderer.toneMappingExposure = 1 - dim * 0.6;
  world.setDim(1 - dim * 0.6);
}

// ---------- loop ----------
const clock = { last: performance.now(), elapsedTime: 0 };

function frame() {
  const now = performance.now();
  const dt = Math.min((now - clock.last) / 1000, 1 / 20);
  clock.last = now;
  requestAnimationFrame(frame);
  if (!listView.hidden) return; // the list covers the scene: don't spend frames on it
  clock.elapsedTime += dt;
  const time = clock.elapsedTime;
  updatePlayer(dt, !!focused);
  updateCamera(dt);
  updateInteraction();
  updateDisplays(dt, time);
  world.update(time);
  renderer.render(scene, camera);
}

const hideLoader = () => $('loader').classList.add('done');
loadingManager.onLoad = hideLoader;
setTimeout(hideLoader, 4000); // don't block on a broken image
if (!site.works.some((w) => w.images?.length)) hideLoader();

if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

frame();
