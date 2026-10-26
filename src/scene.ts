import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { canvasTexture, paperTexture, textTexture, terminalTexture, keyboardTexture, spineTexture, contactShadow, surfaceRelief, notebookTexture } from './materials';
import { artPath, photoNames, sketchNames, titleCase, type View } from './content';

type Callbacks = { onNavigate: (view: View) => void; onReady: () => void; onPage: (page: number) => void; onError: () => void };
const UP = new T.Vector3(0, 1, 0);
const POSES: Record<View, { position: number[]; target: number[]; fov: number }> = {
  desk: { position: [3.9, 3.85, 5.6], target: [-.65, 1.68, -.32], fov: 48 },
  work: { position: [1.9, 3.35, 4.5], target: [-.85, 1.75, -.55], fov: 39 },
  photography: { position: [2.4, 4.7, 3.6], target: [.5, 1.1, .75], fov: 37 },
  sketches: { position: [1.7, 4.5, 3.5], target: [.35, 1.1, .7], fov: 37 },
};

export class WorkspaceScene {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(43, 1, .08, 60);
  private callbacks: Callbacks;
  private host: HTMLElement;
  private resizeObserver: ResizeObserver;
  private assets = new T.LoadingManager();
  private loader = new T.TextureLoader(this.assets);
  private textures = new Set<T.Texture>();
  private targets: T.Object3D[] = [];
  private ray = new T.Raycaster();
  private pointer = new T.Vector2();
  private mouse = new T.Vector2();
  private view: View = 'desk';
  private lookAt = new T.Vector3();
  private fromPosition = new T.Vector3();
  private fromTarget = new T.Vector3();
  private toPosition = new T.Vector3();
  private toTarget = new T.Vector3();
  private basePosition = new T.Vector3();
  private fromFov = 43;
  private toFov = 43;
  private transitionStart = 0;
  private transitioning = false;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private still = false;
  private disposed = false;
  private frame = 0;
  private lastTime = 0;
  private frameSamples: number[] = [];
  private qualityChecked = false;
  private drag: { x: number; y: number; active: boolean; progress: number; start: number; canTurn: boolean; target?: View } | null = null;
  private book = new T.Group();
  private bookPage = 0;
  private bookKind: 'photography' | 'sketches' = 'sketches';
  private leftPage!: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private rightPage!: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private turningPage!: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private pageReverse!: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private turn = { value: 0, from: 0, to: 0, start: 0, moving: false, direction: 1 };
  private pageMaps = new Map<string, T.Texture>();
  private anchors: Record<string, T.Object3D> = {};
  private lampLight!: T.PointLight;
  private lampGlow!: T.Mesh;
  private lampOn = true;
  private frontMirror = { value: 0 };
  private backMirror = { value: 1 };
  private envTarget!: T.WebGLRenderTarget;
  private composer!: EffectComposer;
  private ao!: GTAOPass;
  private depthOfField!: BokehPass;
  private shadowMap!: T.Texture;
  private materials: Record<string, T.MeshStandardMaterial>;
  private sharedMaterials = new Map<string, T.MeshStandardMaterial>();

  constructor(host: HTMLElement, callbacks: Callbacks) {
    this.host = host; this.callbacks = callbacks;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.setClearColor('#121b22');
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D workspace: select the laptop, camera, or sketchbook.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.scene.fog = new T.FogExp2('#111b21', .018);
    const pmrem = new T.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(environment, .02); this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = .18; environment.dispose(); pmrem.dispose();
    const wood = this.texture('/assets/materials/wood-worn-color.jpg');
    const normal = this.texture('/assets/materials/wood-worn-normal.jpg'); normal.colorSpace = T.NoColorSpace;
    const roughness = this.texture('/assets/materials/wood-worn-roughness.jpg'); roughness.colorSpace = T.NoColorSpace;
    const leatherGrain = this.keep(surfaceRelief('leather'));
    const plasterGrain = this.keep(surfaceRelief('plaster'));
    const fabricGrain = this.keep(surfaceRelief('woven'));
    this.materials = {
      wood: new T.MeshStandardMaterial({ map: wood, normalMap: normal, normalScale: new T.Vector2(.45, .45), roughnessMap: roughness, roughness: .88, color: '#ddcbb0' }),
      darkWood: new T.MeshStandardMaterial({ map: wood, normalMap: normal, color: '#746c5c', roughness: .8 }),
      black: new T.MeshStandardMaterial({ color: '#14191b', roughness: .42, metalness: .35 }),
      rubber: new T.MeshStandardMaterial({ color: '#131817', roughness: .78, bumpMap: leatherGrain, bumpScale: .006 }),
      metal: new T.MeshStandardMaterial({ color: '#6a757a', metalness: .85, roughness: .31 }),
      brass: new T.MeshStandardMaterial({ color: '#a88044', metalness: .83, roughness: .28 }),
      paper: new T.MeshStandardMaterial({ map: this.keep(paperTexture()), roughness: .98, side: T.DoubleSide }),
      leather: new T.MeshStandardMaterial({ color: '#292723', roughness: .72, bumpMap: leatherGrain, bumpScale: .009 }),
      cloth: new T.MeshStandardMaterial({ color: '#46453b', roughness: .98, bumpMap: fabricGrain, bumpScale: .012 }),
      green: new T.MeshStandardMaterial({ color: '#35502b', roughness: .85, side: T.DoubleSide }),
      wall: new T.MeshStandardMaterial({ color: '#333b38', roughness: .98, bumpMap: plasterGrain, bumpScale: .026 }),
    };
    this.shadowMap = this.keep(contactShadow());
    this.assets.onLoad = () => { if (!this.disposed) {this.renderer.shadowMap.needsUpdate = true; callbacks.onReady();} };
    this.buildRoom(); this.buildDesk(); this.buildLaptop(); this.buildLamp(); this.buildCamera(); this.buildBook(); this.buildProps(); this.buildStudioDetails(); this.buildPlants(); this.lights();
    this.batchStaticGeometry();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, host.clientWidth, host.clientHeight);
    this.ao.updateGtaoMaterial({ radius: .3, thickness: .6, distanceFallOff: .5, scale: .8, samples: 8 });
    this.ao.blendIntensity = .55; this.composer.addPass(this.ao);
    this.depthOfField = new BokehPass(this.scene, this.camera, { focus: 6, aperture: .00085, maxblur: .004 });
    this.composer.addPass(this.depthOfField);
    this.composer.addPass(new UnrealBloomPass(new T.Vector2(host.clientWidth, host.clientHeight), .12, .55, 1.15));
    this.composer.addPass(new OutputPass());
    this.setPose('desk', true);
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(host); this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.animate);
  }

  private keep(texture: T.Texture) { this.textures.add(texture); return texture; }
  private texture(path: string) { const t = this.loader.load(path); t.colorSpace = T.SRGBColorSpace; t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); return this.keep(t); }
  private standard(color: string, roughness = .7, metalness = 0) {
    const key = `${color}/${roughness}/${metalness}`;
    let material = this.sharedMaterials.get(key);
    if (!material) {material = new T.MeshStandardMaterial({ color, roughness, metalness }); this.sharedMaterials.set(key, material);}
    return material;
  }
  private box(parent: T.Object3D, size: number[], position: number[], material: T.Material, radius = .015) {
    const mesh = new T.Mesh(radius ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius) : new T.BoxGeometry(...size as [number, number, number]), material);
    mesh.position.set(...position as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private cylinder(parent: T.Object3D, top: number, bottom: number, height: number, pos: number[], mat: T.Material, segments = 40) {
    const mesh = new T.Mesh(new T.CylinderGeometry(top, bottom, height, segments), mat); mesh.position.set(...pos as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private tube(parent: T.Object3D, points: number[][], radius: number, mat: T.Material) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p as [number, number, number])));
    const mesh = new T.Mesh(new T.TubeGeometry(curve, 30, radius, 8, false), mat); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  private shadow(parent: T.Object3D, x: number, z: number, width: number, depth: number, y = 1.225) {
    const m = new T.Mesh(new T.PlaneGeometry(width, depth), new T.MeshBasicMaterial({ map: this.shadowMap, transparent: true, depthWrite: false, opacity: .78 })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); parent.add(m);
  }
  private labelObject(group: T.Object3D, view: View, anchor?: string) {
    if (anchor === 'laptop' || anchor === 'camera') {
      group.updateWorldMatrix(true, true);
      const inverse = group.matrixWorld.clone().invert();
      const buckets = new Map<string, T.Mesh[]>();
      group.traverse(o => {if (o instanceof T.Mesh && !Array.isArray(o.material)) {const key = o.material.uuid; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(o);}});
      for (const meshes of buckets.values()) {
        if (meshes.length < 2) continue;
        const geometries = meshes.map(m => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld).applyMatrix4(inverse));
        const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
        if (!merged) continue;
        const mesh = new T.Mesh(merged, meshes[0].material); mesh.castShadow = true; mesh.receiveShadow = true;
        meshes.forEach(m => {m.removeFromParent(); m.geometry.dispose();}); group.add(mesh);
      }
    }
    group.traverse(o => { if (o instanceof T.Mesh) { o.userData.view = view; this.targets.push(o); } }); if (anchor) this.anchors[anchor] = group;
  }
  private batchStaticGeometry() {
    this.scene.updateMatrixWorld(true);
    const buckets = new Map<string, T.Mesh[]>();
    this.scene.traverse(object => {
      if (!(object instanceof T.Mesh) || object.userData.view || Array.isArray(object.material) || object.material.transparent || object === this.lampGlow) return;
      const key = object.material.uuid + '/' + object.castShadow + '/' + object.receiveShadow;
      if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(object);
    });
    for (const meshes of buckets.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrixWorld);
      });
      const merged = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
      if (!merged) continue;
      const result = new T.Mesh(merged, meshes[0].material); result.castShadow = meshes[0].castShadow; result.receiveShadow = meshes[0].receiveShadow;
      for (const mesh of meshes) {mesh.removeFromParent(); mesh.geometry.dispose();} this.scene.add(result);
    }
  }
  private picture(parent: T.Object3D, path: string, width: number, height: number, position: number[], rotation = 0, framed = false) {
    const group = new T.Group(); group.position.set(...position as [number, number, number]); group.rotation.z = rotation;
    this.box(group, [width + .055, height + .055, .035], [0, 0, -.018], framed ? this.materials.black : this.materials.paper, .006);
    const map = this.texture(path);
    const image = new T.Mesh(new T.PlaneGeometry(width * .92, height * .89), new T.MeshStandardMaterial({ map, roughness: .8 })); image.position.z = .007; group.add(image); parent.add(group); return group;
  }
  private buildRoom() {
    const { wall, darkWood, black, brass } = this.materials;
    this.box(this.scene, [16, .15, 15], [0, -.95, 0], darkWood);
    this.box(this.scene, [12, 12, .2], [0, 4.5, -2.55], wall);
    this.box(this.scene, [.2, 12, 8], [-4.05, 4.5, .8], wall);
    for (let i = 0; i < 18; i++) this.box(this.scene, [.016, 3.4, .025], [-3.95 + i * .48, 1.0, -2.42], this.standard('#202726'), 0);
    this.box(this.scene, [9, .1, .08], [0, -.5, -2.38], darkWood);
    // Window and a dim city beyond the glass.
    const windowGroup = new T.Group(); windowGroup.position.set(-2.1, 2.65, -2.35); this.scene.add(windowGroup);
    const city = this.keep(canvasTexture((c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#07111e'); g.addColorStop(1, '#233e50'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      let s = 17; const rand = () => { s = s * 16807 % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 40; i++) {const x = i * 29; const bh = 70 + rand() * 230; c.fillStyle = i % 3 ? '#0d1c28' : '#112636'; c.fillRect(x, h - bh, 27, bh); for (let y = h - bh + 12; y < h; y += 20) for (let j = 0; j < 3; j++) {if (rand() > .65) {c.fillStyle = rand() > .5 ? '#bb9b6b' : '#648597'; c.fillRect(x + 3 + j * 8, y, 3, 4);}}}
    }, 1024, 1024));
    const pane = new T.Mesh(new T.PlaneGeometry(3.1, 3.25), new T.MeshBasicMaterial({ map: city, color: '#c5d8e4' })); windowGroup.add(pane);
    [-1.6, 0, 1.6].forEach(x => this.box(windowGroup, [.07, 3.45, .12], [x, 0, .04], black));
    [-1.69, -.5, .6, 1.69].forEach(y => this.box(windowGroup, [3.3, .07, .12], [0, y, .05], black));
    this.box(windowGroup, [3.6, .12, .38], [0, -1.73, .1], darkWood);
    // Deep reveals and a translucent reflection keep the window from reading as a flat poster.
    for (const x of [-1.69, 1.69]) this.box(windowGroup, [.12, 3.6, .3], [x, 0, -.035], darkWood);
    const reflection = this.keep(canvasTexture((c, w, h) => {
      c.clearRect(0, 0, w, h);
      const glow = c.createRadialGradient(w * .8, h * .65, 0, w * .8, h * .65, w * .4);
      glow.addColorStop(0, 'rgba(255,180,91,.12)'); glow.addColorStop(1, 'rgba(255,180,91,0)'); c.fillStyle = glow; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(134,177,202,.025)'; for (let x = 0; x < w; x += 7) c.fillRect(x, 0, 1, h);
    }, 512, 512));
    const windowGlass = new T.Mesh(new T.PlaneGeometry(3.1, 3.25), new T.MeshBasicMaterial({map: reflection, transparent: true, depthWrite: false})); windowGlass.position.z = .015; windowGroup.add(windowGlass);
    // Pin board, framed artwork, and a shelf.
    this.box(this.scene, [2.1, 2.05, .06], [1.15, 2.75, -2.35], black);
    this.box(this.scene, [1.95, 1.9, .04], [1.15, 2.75, -2.3], this.standard('#3f3d33'));
    for (let i = 0; i < 10; i++) {
      this.box(this.scene, [1.9, .008, .008], [1.15, 1.9 + i * .18, -2.26], brass, 0);
      this.box(this.scene, [.008, 1.9, .008], [.3 + i * .18, 2.75, -2.26], brass, 0);
    }
    this.picture(this.scene, artPath('photography', 'golden-light'), .54, .7, [.6, 2.9, -2.22], -.07);
    this.picture(this.scene, artPath('photography', 'purple-lightning'), .5, .64, [1.55, 3.25, -2.21], .08);
    const note = new T.Mesh(new T.PlaneGeometry(.55, .75), new T.MeshStandardMaterial({ map: this.keep(textTexture(['MAKE', 'SOMETHING', 'THAT MATTERS.'], { background: '#d0bea0', color: '#40372c', size: 62 })) })); note.position.set(1.45, 2.27, -2.21); note.rotation.z = -.04; this.scene.add(note);
    this.picture(this.scene, artPath('photography', 'campus-atrium'), .75, 1.05, [2.95, 2.9, -2.35], 0, true);
    this.box(this.scene, [2.8, .1, .52], [2.1, 4.1, -2.1], darkWood);
    const colors = ['#324346', '#675438', '#252c31', '#73664c', '#374b42'];
    for (let i = 0; i < 9; i++) this.box(this.scene, [.14, .55 + (i % 3) * .1, .32], [1 + i * .17, 4.43, -2.13], this.standard(colors[i % 5]));
    // Cozy floor rug and upholstered chair.
    this.box(this.scene, [5.8, .02, 4.1], [.4, -.855, 1], this.materials.cloth, .03);
    const chair = new T.Group(); chair.position.set(.25, -.25, 2.35); chair.rotation.y = -.2; this.scene.add(chair);
    this.box(chair, [1.45, .22, 1.35], [0, .6, 0], this.materials.leather, .14);
    const back = this.box(chair, [1.45, 1.55, .25], [0, 1.3, .63], this.materials.leather, .14); back.rotation.x = -.12;
    for (const x of [-.57, .57]) this.tube(chair, [[x, .65, .78], [x, 1.3, .69], [x, 1.94, .61]], .007, this.standard('#70624d'));
    for (let i = 0; i < 4; i++) this.box(chair, [1.17, .012, .016], [0, .84 + i * .29, .76 - i * .035], this.standard('#171b1b'), .004);
    for (const x of [-.63, .63]) { this.tube(chair, [[x, .65, -.48], [x, 1.05, -.4], [x, 1.05, .45], [x, .65, .45]], .035, black); }
    this.cylinder(chair, .07, .07, .65, [0, .17, 0], this.materials.metal);
    for (let i = 0; i < 5; i++) {const a = i * Math.PI * .4; this.tube(chair, [[0, -.1, 0], [Math.cos(a) * .63, -.3, Math.sin(a) * .63]], .04, black);}
  }
  private buildDesk() {
    const { wood, black } = this.materials;
    this.box(this.scene, [6.4, .17, 3.05], [0, 1.12, 0], wood, .05);
    this.box(this.scene, [6.25, .07, 2.92], [0, 1.005, 0], this.materials.darkWood);
    for (const x of [-2.85, 2.85]) {
      this.box(this.scene, [.1, 1.95, .12], [x, .04, -1.18], black);
      this.box(this.scene, [.1, 1.95, .12], [x, .04, 1.18], black);
      this.box(this.scene, [.1, .1, 2.5], [x, -.85, 0], black);
    }
    this.box(this.scene, [1.1, .85, 2.2], [2.5, .58, -.05], this.materials.darkWood);
    for (let i = 0; i < 3; i++) {this.box(this.scene, [1.03, .245, .045], [2.5, .86 - i * .27, 1.075], wood); this.box(this.scene, [.34, .026, .055], [2.5, .88 - i * .27, 1.12], this.materials.brass);}
    this.shadow(this.scene, -.55, -.18, 2.4, 1.6);
  }
  private buildLaptop() {
    const group = new T.Group(); group.position.set(-.7, 1.224, -.23); group.rotation.y = -.08; this.scene.add(group);
    this.box(group, [1.95, .065, 1.28], [0, .04, .14], this.materials.metal, .045);
    this.box(group, [1.76, .012, .51], [0, .077, -.05], this.materials.black, .02);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 14; col++) this.box(group, [.105, .012, .071], [-.8 + col * .123, .088, -.24 + row * .098], this.materials.rubber, .007);
    const keyLabels = new T.Mesh(new T.PlaneGeometry(1.75, .49), new T.MeshStandardMaterial({ map: this.keep(keyboardTexture()), roughness: .6 }));
    keyLabels.rotation.x = -Math.PI / 2; keyLabels.position.set(0, .096, -.045); group.add(keyLabels);
    this.box(group, [.66, .007, .3], [0, .077, .52], this.standard('#687478', .3, .8), .02);
    const screen = new T.Group(); screen.position.set(0, .1, -.47); screen.rotation.x = -.17; group.add(screen);
    this.box(screen, [1.96, 1.26, .052], [0, .63, 0], this.materials.black, .04);
    const display = new T.Mesh(new T.PlaneGeometry(1.82, 1.12), new T.MeshStandardMaterial({ map: this.keep(terminalTexture()), emissiveMap: this.keep(terminalTexture()), emissive: '#aecada', emissiveIntensity: .75, roughness: .42 })); display.position.set(0, .63, .032); screen.add(display);
    const webcam = new T.Mesh(new T.SphereGeometry(.013, 8, 8), this.materials.rubber); webcam.position.set(0, 1.225, .037); screen.add(webcam);
    const glow = new T.PointLight('#8aaebd', .55, 2.1); glow.position.set(0, .65, .25); group.add(glow);
    this.labelObject(group, 'work', 'laptop');
  }
  private buildLamp() {
    const group = new T.Group(); group.position.set(1.25, 1.23, -1); this.scene.add(group);
    this.cylinder(group, .27, .3, .075, [0, .04, 0], this.materials.black);
    this.tube(group, [[0, .07, 0], [.04, .8, -.06], [-.08, 1.43, -.05], [-.33, 1.61, .08]], .028, this.materials.brass);
    this.cylinder(group, .065, .065, .045, [.02, .83, -.04], this.materials.brass);
    const shade = this.cylinder(group, .16, .4, .35, [-.32, 1.45, .11], this.materials.black);
    shade.rotation.z = -.18;
    this.lampGlow = new T.Mesh(new T.CircleGeometry(.365, 48), new T.MeshBasicMaterial({ color: '#ffcc7f', side: T.DoubleSide }));
    this.lampGlow.rotation.x = Math.PI / 2; this.lampGlow.position.set(-.32, 1.265, .11); group.add(this.lampGlow);
    this.lampLight = new T.PointLight('#ffc176', 14, 6.5, 2); this.lampLight.position.set(-.32, 1.19, .12); group.add(this.lampLight);
    this.lampLight.castShadow = true; this.lampLight.shadow.mapSize.set(1024, 1024); this.lampLight.shadow.bias = -.001; this.lampLight.shadow.normalBias = .035;
    this.shadow(this.scene, 1.25, -1, .7, .7);
  }
  private buildCamera() {
    const group = new T.Group(); group.position.set(1.83, 1.25, .04); group.rotation.y = -.23; this.scene.add(group);
    this.box(group, [.78, .5, .32], [0, .27, 0], this.materials.rubber, .055);
    this.box(group, [.25, .56, .38], [.3, .28, .035], this.materials.black, .035);
    this.box(group, [.3, .12, .24], [-.03, .56, -.025], this.materials.black, .02);
    this.cylinder(group, .07, .07, .04, [.24, .59, 0], this.materials.metal);
    this.cylinder(group, .085, .085, .045, [-.28, .53, 0], this.materials.black);
    for (let i = 0; i < 7; i++) {
      const lens = this.cylinder(group, .235 - i * .002, .235 - i * .002, .07, [-.09, .28, .18 + i * .055], i % 2 ? this.materials.rubber : this.materials.black, 64); lens.rotation.x = Math.PI / 2;
    }
    const lensMap = this.keep(canvasTexture((c, w, h) => {
      c.fillStyle = '#080f13'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {c.strokeStyle = ['#273638', '#151d28', '#31453c'][i % 3]; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, h / 2, w * (.19 + i * .027), 0, Math.PI * 2); c.stroke();}
      const reflection = c.createRadialGradient(w * .34, h * .28, 0, w * .34, h * .28, w * .3); reflection.addColorStop(0, '#6fada659'); reflection.addColorStop(.4, '#42536b30'); reflection.addColorStop(1, '#18223500'); c.fillStyle = reflection; c.fillRect(0, 0, w, h);
      c.fillStyle = '#050a0e'; c.beginPath();
      for (let i = 0; i < 7; i++) {const angle = i * Math.PI * 2 / 6; const x = w / 2 + Math.cos(angle) * w * .145, y = h / 2 + Math.sin(angle) * h * .145; i ? c.lineTo(x, y) : c.moveTo(x, y);} c.fill();
      c.fillStyle = '#a4b8bf27'; c.fillRect(w * .29, h * .24, w * .06, h * .12); c.fillRect(w * .37, h * .24, w * .06, h * .12);
    }, 512, 512));
    const glass = new T.Mesh(new T.CircleGeometry(.185, 64), new T.MeshPhysicalMaterial({ map: lensMap, metalness: .35, roughness: .09, clearcoat: 1, clearcoatRoughness: .04 })); glass.position.set(-.09, .28, .565); group.add(glass);
    const ring = new T.Mesh(new T.TorusGeometry(.215, .008, 8, 64), this.materials.metal); ring.position.set(-.09, .28, .565); group.add(ring);
    for (let i = 0; i < 48; i++) {
      const angle = i * Math.PI / 24;
      const grip = this.box(group, [.009, .01, .145], [-.09 + Math.sin(angle) * .235, .28 + Math.cos(angle) * .235, .375], this.materials.rubber, .002); grip.rotation.z = -angle;
    }
    const innerRing = new T.Mesh(new T.TorusGeometry(.145, .006, 8, 48), this.standard('#35434f', .2, .8)); innerRing.position.set(-.09, .28, .57); group.add(innerRing);
    const lensLettering = this.keep(canvasTexture((c, w, h) => {
      c.clearRect(0, 0, w, h); c.fillStyle = '#c1bdac'; c.font = '18px monospace'; c.textAlign = 'center';
      const label = '35 mm   1:1.8   •   WORKSPACE OPTICS';
      [...label].forEach((letter, i) => {const angle = -.95 + i / label.length * Math.PI * 1.65; c.save(); c.translate(w / 2 + Math.sin(angle) * 219, h / 2 - Math.cos(angle) * 219); c.rotate(angle); c.fillText(letter, 0, 0); c.restore();});
    }, 512, 512));
    const lettering = new T.Mesh(new T.PlaneGeometry(.47, .47), new T.MeshStandardMaterial({map: lensLettering, transparent: true, depthWrite: false, roughness: .7})); lettering.position.set(-.09, .28, .576); group.add(lettering);
    for (const x of [-.27, .24]) for (const y of [.12, .44]) {const screw = this.cylinder(group, .013, .013, .008, [x, y, .17], this.materials.metal, 12); screw.rotation.x = Math.PI / 2;}
    this.tube(group, [[-.4, .32, 0], [-.56, .05, -.22], [-.25, .02, -.52], [.55, .02, -.5], [.5, .15, 0]], .025, this.materials.leather);
    const logo = new T.Mesh(new T.PlaneGeometry(.19, .055), new T.MeshStandardMaterial({ map: this.keep(textTexture(['AR / 35'], { background: '#111818', color: '#d1d1c3', size: 90 })) })); logo.position.set(.2, .46, .199); group.add(logo);
    this.labelObject(group, 'photography', 'camera'); this.shadow(this.scene, 1.83, .12, 1.2, 1.1);
  }
  private buildBook() {
    this.book.position.set(.28, 1.252, .9); this.book.rotation.y = -.12; this.scene.add(this.book);
    this.box(this.book, [2.02, .07, 1.34], [0, 0, 0], this.materials.leather, .022);
    for (const side of [-1, 1]) {
      this.box(this.book, [.96, .075, 1.27], [side * .495, .065, 0], this.materials.paper, .008);
      for (let i = 0; i < 6; i++) this.box(this.book, [.958, .001, 1.268], [side * .495, .029 + i * .011, 0], this.standard('#b8a78b'), 0);
    }
    const makePage = (left: boolean) => {
      const geometry = new T.PlaneGeometry(.955, 1.26, 32, 10);
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const u = (vertices.getX(i) + .4775) / .955;
        vertices.setZ(i, Math.sin(u * Math.PI) * .028);
      }
      geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ map: this.pageTexture(left ? 0 : 1), roughness: .96, side: T.DoubleSide })); mesh.rotation.x = -Math.PI / 2; mesh.position.set(left ? -.49 : .49, .109, 0); mesh.receiveShadow = true; this.book.add(mesh); return mesh;
    };
    this.leftPage = makePage(true); this.rightPage = makePage(false);
    const geometry = new T.PlaneGeometry(.955, 1.26, 32, 10); geometry.translate(.49, 0, 0);
    this.turningPage = new T.Mesh(geometry, new T.MeshStandardMaterial({ map: this.pageTexture(1), side: T.FrontSide, roughness: .96 })); this.turningPage.visible = false; this.turningPage.castShadow = true; this.turningPage.receiveShadow = true; this.book.add(this.turningPage);
    this.pageReverse = new T.Mesh(geometry.clone(), new T.MeshStandardMaterial({ map: this.pageTexture(2), side: T.BackSide, roughness: .96 })); this.pageReverse.visible = false; this.pageReverse.castShadow = true; this.book.add(this.pageReverse);
    for (const [material, mirror] of [[this.turningPage.material, this.frontMirror], [this.pageReverse.material, this.backMirror]] as const) {
      material.onBeforeCompile = shader => {
        shader.uniforms.pageMirror = mirror;
        shader.vertexShader = 'uniform float pageMirror;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv.x = mix(vMapUv.x, 1.0 - vMapUv.x, pageMirror);\n#endif');
      };
      material.customProgramCacheKey = () => 'book-page-mirror';
    }
    this.labelObject(this.book, 'sketches', 'book'); this.shadow(this.scene, .28, .9, 2.5, 1.65);
  }
  private pageTexture(index: number) {
    const key = `${this.bookKind}-${index}`; if (this.pageMaps.has(key)) return this.pageMaps.get(key)!;
    const names = this.bookKind === 'sketches' ? sketchNames : photoNames;
    const name = names[index % names.length];
    const map = this.keep(canvasTexture((c, w, h) => {
      c.fillStyle = '#eee3cd'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {c.fillStyle = 'rgba(74,55,30,.045)'; c.fillRect(Math.random() * w, Math.random() * h, 1, 1);}
      c.fillStyle = '#685c4b'; c.font = '16px monospace'; c.fillText(this.bookKind === 'sketches' ? 'THE SKETCHBOOK / AVNISH RAJ' : 'THROUGH MY LENS / AVNISH RAJ', 38, 47);
      c.font = 'italic 25px Georgia'; c.fillText(titleCase(name), 38, h - 69);
      c.font = '16px monospace'; c.fillText(String(index + 1).padStart(2, '0'), w - 58, h - 32);
      const g = c.createLinearGradient(0, 0, 50, 0); g.addColorStop(0, 'rgba(64,37,8,.12)'); g.addColorStop(1, 'rgba(64,37,8,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    }, 768, 1024));
    const isSketch = this.bookKind === 'sketches';
    const image = new Image(); image.onload = () => {
      if (this.disposed) return;
      const c = (map.image as HTMLCanvasElement).getContext('2d')!;
      const scale = Math.min(680 / image.width, 800 / image.height);
      const width = image.width * scale, height = image.height * scale;
      if (isSketch) c.globalCompositeOperation = 'multiply';
      c.drawImage(image, (768 - width) / 2, 85 + (800 - height) / 2, width, height);
      c.globalCompositeOperation = 'source-over'; map.needsUpdate = true;
    }; image.src = artPath(this.bookKind, name); this.pageMaps.set(key, map); return map;
  }
  private buildProps() {
    const { wood, black, brass, paper } = this.materials;
    // Stacked books with printed covers.
    const titles = [['CLEAN', 'ARCHITECTURE'], ['THE PRAGMATIC', 'PROGRAMMER'], ['DESIGNING', 'USEFUL THINGS']];
    for (let i = 0; i < 3; i++) {
      const book = new T.Group(); book.position.set(-2.25, 1.25 + i * .155, -.52); book.rotation.y = -.1 + i * .13; this.scene.add(book);
      this.box(book, [1.1, .135, .74], [0, .065, 0], this.standard(['#34453e', '#514a36', '#243239'][i]), .01);
      this.box(book, [1.05, .1, .68], [0, .065, .02], paper, .003);
      this.box(book, [1.12, .017, .76], [0, .14, 0], this.standard(['#34453e', '#514a36', '#243239'][i]), .003);
      const spine = new T.Mesh(new T.PlaneGeometry(1.05, .12), new T.MeshStandardMaterial({ map: this.keep(spineTexture(titles[i].join(' '), ['#34453e', '#514a36', '#243239'][i])) })); spine.position.set(0, .07, .389); book.add(spine);
    }
    // Ceramic cup, coffee, curved handle.
    const cup = new T.Group(); cup.position.set(-1.9, 1.24, .62); this.scene.add(cup);
    const cupMat = this.standard('#b9ab8f', .38);
    this.cylinder(cup, .195, .16, .4, [0, .21, 0], cupMat);
    this.cylinder(cup, .166, .166, .009, [0, .412, 0], this.standard('#1e140c', .17));
    const rim = new T.Mesh(new T.TorusGeometry(.18, .018, 12, 40), cupMat); rim.rotation.x = Math.PI / 2; rim.position.y = .422; cup.add(rim);
    const handle = new T.Mesh(new T.TorusGeometry(.115, .033, 10, 32), cupMat); handle.position.set(-.21, .23, 0); cup.add(handle); this.shadow(this.scene, -1.9, .62, .7, .7);
    const mugPrint = this.keep(canvasTexture((c, w, h) => {
      c.fillStyle = '#b9ab8f'; c.fillRect(0, 0, w, h); c.fillStyle = '#54412b'; c.textAlign = 'center'; c.font = 'italic 73px Georgia';
      ['Good', 'Ideas', 'Compile'].forEach((line, i) => c.fillText(line, w / 2, 120 + i * 116));
    }, 512, 512));
    const mugLettering = new T.Mesh(new T.CylinderGeometry(.19, .17, .26, 32, 1, true, -.68, 1.36), new T.MeshStandardMaterial({map: mugPrint, roughness: .38})); mugLettering.position.y = .215; cup.add(mugLettering);
    // Pen tray and pencils.
    this.box(this.scene, [.3, .035, .9], [1.59, 1.248, .98], black, .02);
    for (let i = 0; i < 3; i++) {const pen = this.cylinder(this.scene, .012, .012, .68, [1.5 + i * .075, 1.285, .96], i === 1 ? brass : black, 12); pen.rotation.x = Math.PI / 2; pen.rotation.z = -.03 + i * .04;}
    // Loose photographic prints.
    const p1 = this.picture(this.scene, artPath('photography', 'purple-lightning'), .55, .7, [2.3, 1.237, .8]); p1.rotation.set(-Math.PI / 2, 0, -.16);
    const p2 = this.picture(this.scene, artPath('photography', 'golden-light'), .57, .71, [2.56, 1.255, .72]); p2.rotation.set(-Math.PI / 2, 0, .18);
    this.labelObject(p1, 'photography'); this.labelObject(p2, 'photography');
    // Candle and a mouse on a felt pad.
    this.cylinder(this.scene, .105, .105, .2, [-2.4, 1.77, -.63], this.standard('#bba989', .5));
    const flame = new T.Mesh(new T.SphereGeometry(.022, 12, 12), new T.MeshBasicMaterial({ color: '#ffca6d' })); flame.scale.y = 2; flame.position.set(-2.4, 1.88, -.63); this.scene.add(flame);
    const candle = new T.PointLight('#ffa55d', .3, 1.4); candle.position.copy(flame.position); this.scene.add(candle);
    this.box(this.scene, [.65, .009, .62], [.64, 1.228, -.2], this.standard('#3e443e'), .04);
    const mouse = new T.Mesh(new T.SphereGeometry(.15, 24, 16), this.materials.black); mouse.scale.set(.72, .35, 1.2); mouse.position.set(.64, 1.27, -.19); mouse.castShadow = true; this.scene.add(mouse);
    // Monitor stand speaker, cork coaster, headphone stand.
    this.box(this.scene, [.34, .55, .32], [-1.15, 1.49, -1.18], black, .025);
    for (const y of [1.36, 1.62]) { const disc = new T.Mesh(new T.CircleGeometry(.09, 28), this.standard('#292d2d')); disc.position.set(-1.15, y, -1.013); this.scene.add(disc); }
    this.cylinder(this.scene, .24, .24, .027, [-1.9, 1.22, .62], wood);
  }
  private buildStudioDetails() {
    const { black, brass, darkWood, paper, cloth, rubber } = this.materials;
    // Open shelving adds depth behind the desk instead of a single blank wall.
    const shelf = new T.Group(); shelf.position.set(3.7, -.8, -1.88); this.scene.add(shelf);
    for (const x of [-.56, .56]) this.box(shelf, [.055, 4.5, .055], [x, 2.25, .18], black);
    for (let level = 0; level < 5; level++) this.box(shelf, [1.23, .065, .69], [0, .2 + level * .88, .05], darkWood);
    const covers = ['#324640', '#68563c', '#272e33', '#665f4e', '#363d42'];
    const titles = ['FIELD NOTES', 'ON SEEING', 'DESIGN', 'SYSTEMS', 'COLLECTED'];
    for (let i = 0; i < 5; i++) {
      const book = new T.Group(); book.position.set(-.41 + i * .18, 1.125, .1); shelf.add(book);
      const height = .54 + (i % 3) * .07;
      this.box(book, [.15, height, .41], [0, height / 2, 0], this.standard(covers[i]), .004);
      const spine = new T.Mesh(new T.PlaneGeometry(.12, height * .91), new T.MeshStandardMaterial({map: this.keep(textTexture([titles[i]], {background: covers[i], color: '#cdbb96', size: 50}))})); spine.position.set(0, height / 2, .21); book.add(spine);
      this.box(book, [.132, .01, .38], [0, height + .001, .01], paper, 0);
    }
    for (let i = 0; i < 2; i++) {
      this.box(shelf, [.88, .28, .52], [0, .38 + i * 1.77, .06], cloth, .018);
      this.box(shelf, [.23, .07, .015], [0, .4 + i * 1.77, .328], brass, .002);
    }
    const shelfPrint = this.picture(shelf, artPath('photography', 'industrial-silhouette'), .42, .55, [.17, 3.22, .05], -.04, true); shelfPrint.rotation.x = -.13;

    // A pad and handwritten list sit under the lamp; irregular paper edges catch its light.
    const pad = new T.Group(); pad.position.set(1.87, 1.232, -.78); pad.rotation.y = -.14; this.scene.add(pad);
    this.box(pad, [.68, .038, .84], [0, .02, 0], this.materials.leather, .007);
    for (let i = 0; i < 4; i++) this.box(pad, [.65, .004, .81], [i * .002, .043 + i * .005, 0], paper, .002);
    const list = new T.Mesh(new T.PlaneGeometry(.64, .8), new T.MeshStandardMaterial({map: this.keep(notebookTexture()), roughness: .98})); list.rotation.x = -Math.PI / 2; list.position.y = .063; list.receiveShadow = true; pad.add(list);
    const clip = new T.Mesh(new T.TorusGeometry(.028, .004, 6, 16), brass); clip.rotation.x = Math.PI / 2; clip.scale.z = 2; clip.position.set(-.22, .071, -.34); pad.add(clip);

    // Pens have separate timber, graphite, ferrules and erasers rather than plain rods.
    const pencil = new T.Group(); pencil.position.set(-.7, 1.25, 1.37); pencil.rotation.set(Math.PI / 2, 0, -.15); this.scene.add(pencil);
    this.cylinder(pencil, .014, .014, .69, [0, 0, 0], this.standard('#ba8641'), 6);
    this.cylinder(pencil, 0, .014, .065, [0, .377, 0], this.standard('#c5a574'), 6);
    this.cylinder(pencil, 0, .004, .022, [0, .415, 0], black, 6);
    this.cylinder(pencil, .015, .015, .04, [0, -.361, 0], brass, 12);
    this.cylinder(pencil, .014, .014, .035, [0, -.398, 0], this.standard('#8f5f51'), 12);
    // Small drawing tools gathered in a ceramic pot beside the books.
    this.cylinder(this.scene, .105, .095, .25, [-2.14, 1.355, -.98], this.standard('#7b8070', .6));
    this.cylinder(this.scene, .088, .088, .006, [-2.14, 1.483, -.98], rubber);
    for (let i = 0; i < 7; i++) {
      const pen = this.cylinder(this.scene, .01, .01, .39 + i % 3 * .055, [-2.19 + i % 3 * .045, 1.59, -1.025 + Math.floor(i / 3) * .04], i % 3 ? brass : black, 8); pen.rotation.z = (i - 3) * .045;
    }
    // Headphones draped over their stand at the back of the desk.
    const headphones = new T.Group(); headphones.position.set(-1.7, 1.25, -1.03); this.scene.add(headphones);
    this.cylinder(headphones, .15, .17, .035, [0, .02, 0], black);
    this.cylinder(headphones, .018, .018, .59, [0, .32, 0], brass);
    this.tube(headphones, [[-.23, .35, 0], [-.24, .62, 0], [0, .76, 0], [.24, .62, 0], [.23, .35, 0]], .038, rubber);
    for (const side of [-1, 1]) {
      this.box(headphones, [.115, .26, .21], [side * .22, .35, 0], black, .045);
      this.box(headphones, [.035, .21, .16], [side * .158, .35, 0], this.materials.leather, .018);
    }
    this.tube(this.scene, [[-1.47, 1.28, -.92], [-1.7, 1.226, -.76], [-1.55, 1.226, -.55], [-1.8, 1.226, -.36]], .009, rubber);
    this.tube(this.scene, [[-1.66, 1.264, -.39], [-1.95, 1.225, -.2], [-2.14, 1.225, -.05], [-2.55, 1.225, .06], [-3.15, 1.2, -.2], [-3.25, .85, -.25]], .012, rubber);

    // A small globe and wall prints bring the left corner into the composition.
    const globe = new T.Group(); globe.position.set(-2.97, 1.23, -.22); this.scene.add(globe);
    this.cylinder(globe, .15, .17, .045, [0, .025, 0], darkWood);
    this.cylinder(globe, .018, .018, .17, [0, .12, 0], brass);
    const globeMap = this.keep(canvasTexture((c, w, h) => {
      c.fillStyle = '#2e4341'; c.fillRect(0, 0, w, h); c.strokeStyle = '#bd9e6250';
      for (let x = 0; x < w; x += 64) {c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();}
      for (let y = 0; y < h; y += 64) {c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();}
      c.fillStyle = '#94845b';
      for (const points of [[[80,80],[200,40],[240,100],[175,155],[148,235],[110,150]],[[190,235],[255,270],[225,395],[175,320]],[[465,100],[515,80],[565,135],[665,80],[850,145],[720,245],[640,180],[555,235],[525,360],[465,275]],[[805,320],[910,300],[940,380],[830,390]]]) {c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill();}
    }, 1024, 512));
    const sphere = new T.Mesh(new T.SphereGeometry(.21, 32, 24), new T.MeshStandardMaterial({map: globeMap, roughness: .6})); sphere.position.y = .35; sphere.rotation.z = -.3; globe.add(sphere);
    const meridian = new T.Mesh(new T.TorusGeometry(.235, .009, 8, 48), brass); meridian.position.y = .35; meridian.rotation.set(.08, .4, -.3); globe.add(meridian);
    this.picture(this.scene, artPath('sketches', 'charcoal-gaze'), .48, .64, [-.13, 3.51, -2.33], .035, true);
    this.picture(this.scene, artPath('sketches', 'hand-study'), .44, .6, [-.13, 2.73, -2.33], -.02, true);
    // A thin ribbon and stitch line connect the sketchbook's cover to the tabletop.
    this.tube(this.scene, [[.3, 1.27, 1.31], [.37, 1.237, 1.5], [.43, 1.23, 1.57]], .008, this.standard('#967248'));
  }
  private buildPlants() {
    const potMat = this.standard('#786448', .86);
    const leafGeom = new T.PlaneGeometry(.22, .34, 5, 6);
    const leafVertices = leafGeom.attributes.position;
    for (let i = 0; i < leafVertices.count; i++) {
      const x = leafVertices.getX(i), y = leafVertices.getY(i);
      leafVertices.setZ(i, Math.abs(x) * .4 + Math.sin(y * 7) * .025);
    }
    leafGeom.computeVertexNormals();
    const leafMaterial = new T.MeshStandardMaterial({ map: this.texture('/assets/materials/pothos-leaf.png'), alphaTest: .48, side: T.DoubleSide, roughness: .65, color: '#97a47c' });
    const place = (x: number, y: number, z: number, scale: number, hanging = false) => {
      const plant = new T.Group(); plant.position.set(x, y, z); plant.scale.setScalar(scale); this.scene.add(plant);
      this.cylinder(plant, .22, .16, .34, [0, .17, 0], potMat);
      this.cylinder(plant, .204, .204, .01, [0, .339, 0], this.standard('#211b10'));
      for (let branch = 0; branch < 7; branch++) {
        const angle = branch * 2.399; const length = .48 + (branch % 3) * .16;
        const points = [[0, .32, 0], [Math.cos(angle) * .15, .6, Math.sin(angle) * .15], [Math.cos(angle) * length * .65, hanging ? -.5 : .85 + branch % 2 * .15, Math.sin(angle) * length * .65]];
        if (hanging) points.push([Math.cos(angle) * .48, -1.2 - branch % 3 * .18, Math.sin(angle) * .35]);
        this.tube(plant, points, .009, this.materials.green);
        const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p as [number, number, number])));
        for (let i = 1; i < 7; i++) {const p = curve.getPoint(i / 7); const leaf = new T.Mesh(leafGeom, leafMaterial); leaf.position.copy(p); leaf.position.x += (i % 2 ? .05 : -.05); leaf.scale.setScalar(.8 + (i % 3) * .14); leaf.rotation.set(-.5 + i * .25, angle + i * 1.8, hanging ? 2.8 : .25 + branch * .1); leaf.castShadow = true; plant.add(leaf);}
      }
    };
    place(3.1, 4.15, -2.08, 1.6, true); place(-3.3, -.85, .25, 2.05);
    new GLTFLoader(this.assets).load('/assets/models/potted_plant_02/potted_plant_02.gltf', gltf => {
      if (this.disposed) {
        gltf.scene.traverse(o => {if (o instanceof T.Mesh) {o.geometry.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => m.dispose());}}); return;
      }
      const bounds = new T.Box3().setFromObject(gltf.scene), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
      const root = new T.Group(); gltf.scene.position.set(-center.x, -bounds.min.y, -center.z); root.add(gltf.scene);
      root.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        o.castShadow = true; o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) for (const value of Object.values(mat)) if (value instanceof T.Texture) {value.anisotropy = 4; this.textures.add(value);}
      });
      root.scale.setScalar(1.02 / size.y); root.position.set(2.78, 1.215, -.99); root.rotation.y = .4; this.scene.add(root);
      const second = root.clone(true); second.scale.setScalar(.81 / size.y); second.position.set(-2.75, 1.215, -.98); second.rotation.y = 2; this.scene.add(second);
      this.renderer.shadowMap.needsUpdate = true;
    }, undefined, () => {if (!this.disposed) {place(-2.85, 1.22, -1, 1); place(2.8, 1.22, -1.1, 1.1);}});
  }
  private lights() {
    this.scene.add(new T.HemisphereLight('#8aa6bc', '#634022', .35));
    const moon = new T.DirectionalLight('#8fb5cf', .9); moon.position.set(-4, 6, 1); this.scene.add(moon);
    const fill = new T.DirectionalLight('#f7c789', .68); fill.position.set(2, 4, 5); this.scene.add(fill);
    const wallWash = new T.PointLight('#d98f48', 1.6, 5); wallWash.position.set(1.7, 2, -1.8); this.scene.add(wallWash);
  }
  private resize = () => {
    const { width, height } = this.host.getBoundingClientRect();
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height); this.composer?.setSize(width, height);
    this.setPose(this.view, true);
  };
  private setPose(view: View, immediate = false) {
    const p = POSES[view]; const mobile = this.camera.aspect < .85;
    this.fromPosition.copy(this.basePosition.lengthSq() ? this.basePosition : this.camera.position); this.fromTarget.copy(this.lookAt);
    this.toPosition.set(...p.position as [number, number, number]); this.toTarget.set(...p.target as [number, number, number]);
    if (mobile) {
      if (view === 'desk') {this.toPosition.set(4.9, 5.6, 8.8); this.toTarget.set(.1, 2.8, -.1);}
      else if (view === 'work') {this.toPosition.set(1.1, 3.8, 5.4); this.toTarget.set(-.5, 1.7, -.25);}
      else {this.toPosition.set(.5, 5.6, 3.55); this.toTarget.set(.28, 1.2, .85);}
    }
    this.fromFov = this.camera.fov; this.toFov = mobile ? (view === 'sketches' || view === 'photography' ? 58 : 50) : p.fov;
    this.transitionStart = performance.now(); this.transitioning = !immediate;
    if (immediate || this.reduced || this.still) { this.basePosition.copy(this.toPosition); this.lookAt.copy(this.toTarget); this.camera.fov = this.toFov; this.camera.updateProjectionMatrix(); this.transitioning = false; }
  }
  navigate(view: View) {
    this.drag = null; this.view = view; this.host.dataset.view = view; this.setPose(view);
    if (view === 'photography' || view === 'sketches') {
      this.bookKind = view; this.bookPage = 0; this.turn.moving = false; this.turn.value = 0; this.updatePages(); this.callbacks.onPage(0);
    }
  }
  explore() {
    this.fromPosition.copy(this.basePosition); this.fromTarget.copy(this.lookAt); this.fromFov = this.camera.fov;
    const mobile = this.camera.aspect < .85;
    this.toPosition.set(mobile ? 2.1 : 3.45, mobile ? 5.0 : 3.55, mobile ? 6.6 : 4.6);
    this.toTarget.set(.05, mobile ? 1.75 : 1.45, .1); this.toFov = mobile ? 55 : 48;
    this.transitionStart = performance.now(); this.transitioning = true;
    if (this.reduced || this.still) {this.basePosition.copy(this.toPosition); this.lookAt.copy(this.toTarget); this.camera.fov = this.toFov; this.camera.updateProjectionMatrix(); this.transitioning = false;}
  }
  setMotion(enabled: boolean) { this.still = !enabled; }
  setLamp(enabled: boolean) { this.lampOn = enabled; if (this.reduced || this.still) this.lampLight.intensity = enabled ? 14 : .25; }
  private updatePages() {
    this.leftPage.material.map = this.pageTexture(this.bookPage * 2); this.rightPage.material.map = this.pageTexture(this.bookPage * 2 + 1);
    this.leftPage.visible = true; this.rightPage.visible = true; this.turningPage.visible = false; this.pageReverse.visible = false;
    this.pageTexture((this.bookPage + 1) * 2); this.pageTexture((this.bookPage + 1) * 2 + 1);
  }
  turnPage(direction: number) {
    if (this.turn.moving || this.transitioning) return;
    const next = this.bookPage + direction; if (next < 0 || next > 6) return;
    this.prepareTurn(direction); this.turn.from = 0; this.turn.to = 1; this.turn.start = performance.now(); this.turn.moving = true;
  }
  private prepareTurn(direction: number) {
    this.turn.direction = direction; this.turn.value = 0;
    this.frontMirror.value = direction > 0 ? 0 : 1; this.backMirror.value = direction > 0 ? 1 : 0;
    this.turningPage.material.side = direction > 0 ? T.FrontSide : T.BackSide;
    this.pageReverse.material.side = direction > 0 ? T.BackSide : T.FrontSide;
    this.turningPage.material.needsUpdate = true; this.pageReverse.material.needsUpdate = true;
    this.turningPage.material.map = this.pageTexture(this.bookPage * 2 + (direction > 0 ? 1 : 0));
    this.pageReverse.material.map = this.pageTexture(this.bookPage * 2 + (direction > 0 ? 2 : -1));
    if (direction > 0) this.rightPage.material.map = this.pageTexture(this.bookPage * 2 + 3);
    else this.leftPage.material.map = this.pageTexture(this.bookPage * 2 - 2);
    this.turningPage.visible = true; this.pageReverse.visible = true;
  }
  private deformPage(progress: number) {
    this.renderer.shadowMap.needsUpdate = true;
    const direction = this.turn.direction;
    const bend = Math.sin(progress * Math.PI) * .62;
    for (const mesh of [this.turningPage, this.pageReverse]) {
      const positions = mesh.geometry.attributes.position;
      for (let iy = 0; iy <= 10; iy++) for (let ix = 0; ix <= 32; ix++) {
        const u = ix / 32; const d = .0125 + u * .955;
        const angle = progress * Math.PI - Math.sin(u * Math.PI) * bend;
        const x = Math.cos(angle) * d * direction;
        const y = .114 + Math.sin(angle) * d + Math.sin(u * Math.PI) * (.028 + Math.sin(progress * Math.PI) * .055);
        const z = (iy / 10 - .5) * 1.26 + Math.sin(u * Math.PI) * Math.sin(progress * Math.PI) * (iy / 10 - .5) * .035;
        positions.setXYZ(iy * 33 + ix, x, y, z);
      }
      positions.needsUpdate = true; mesh.geometry.computeVertexNormals();
      // Plane vertex ordering faces upwards with this coordinate mapping.
    }
  }
  private pick(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera); return this.ray.intersectObjects(this.targets, false)[0];
  }
  private pointerDown = (e: PointerEvent) => {
    const hit = this.pick(e);
    const canTurn = (this.view === 'sketches' || this.view === 'photography') && hit?.object.userData.view === 'sketches' && !this.transitioning && !this.turn.moving;
    this.drag = { x: e.clientX, y: e.clientY, active: false, progress: 0, start: performance.now(), canTurn, target: hit?.object.userData.view };
    if (canTurn) this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private pointerMove = (e: PointerEvent) => {
    this.mouse.set(e.clientX / window.innerWidth - .5, e.clientY / window.innerHeight - .5);
    if (this.drag?.canTurn) {
      const dx = e.clientX - this.drag.x;
      if (!this.drag.active && Math.abs(dx) > 12) {
        const direction = dx < 0 ? 1 : -1;
        if (this.bookPage + direction >= 0 && this.bookPage + direction <= 6) {this.drag.active = true; this.prepareTurn(direction);}
      }
      if (this.drag.active) {this.drag.progress = T.MathUtils.clamp(-dx * this.turn.direction / (window.innerWidth < 700 ? 180 : 350), 0, .99); this.turn.value = this.drag.progress; this.deformPage(this.turn.value);}
    }
    const hit = this.pick(e); this.renderer.domElement.style.cursor = this.drag?.active ? 'grabbing' : hit ? ((this.view === 'sketches' || this.view === 'photography') ? 'grab' : 'pointer') : 'default';
  };
  private pointerUp = (e: PointerEvent) => {
    if (this.drag?.active) {
      const complete = this.drag.progress > .22;
      this.turn.from = this.turn.value; this.turn.to = complete ? 1 : 0; this.turn.start = performance.now(); this.turn.moving = true;
    } else if (this.drag && !this.drag.canTurn && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) < 10) {
      const hit = this.pick(e); if (hit && hit.object.userData.view === this.drag.target && hit.object.userData.view !== this.view) this.callbacks.onNavigate(hit.object.userData.view);
    }
    this.drag = null; if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
  };
  private pointerCancel = () => { if (this.drag?.active) {this.turn.from = this.turn.value; this.turn.to = 0; this.turn.start = performance.now(); this.turn.moving = true;} this.drag = null; };
  private contextLost = (e: Event) => {e.preventDefault(); this.disposed = true; cancelAnimationFrame(this.frame); this.callbacks.onError();};
  private visibility = () => { if (document.hidden) cancelAnimationFrame(this.frame); else {this.lastTime = 0; this.frame = requestAnimationFrame(this.animate);} };
  private animate = (now: number) => {
    if (this.disposed) return;
    const dt = this.lastTime ? now - this.lastTime : 16; this.lastTime = now;
    if (!this.qualityChecked && now > 5000) {
      this.frameSamples.push(dt);
      if (this.frameSamples.length === 120) {const avg = this.frameSamples.reduce((a, b) => a + b, 0) / 120; this.host.dataset.frameTime = avg.toFixed(1); if (avg > 24) {this.renderer.setPixelRatio(1); this.composer.setPixelRatio(1); this.ao.enabled = false; this.depthOfField.enabled = false;} this.qualityChecked = true;}
    }
    if (this.transitioning) {
      const t = T.MathUtils.clamp((now - this.transitionStart) / 1650, 0, 1); const ease = t * t * t * (t * (t * 6 - 15) + 10);
      this.basePosition.lerpVectors(this.fromPosition, this.toPosition, ease); this.basePosition.y += Math.sin(t * Math.PI) ** 2 * .24;
      this.lookAt.lerpVectors(this.fromTarget, this.toTarget, ease); this.camera.fov = T.MathUtils.lerp(this.fromFov, this.toFov, ease); this.camera.updateProjectionMatrix();
      if (t === 1) this.transitioning = false;
    }
    this.camera.position.copy(this.basePosition);
    if (!this.reduced && !this.still && !this.transitioning && this.view === 'desk') {this.camera.position.x += this.mouse.x * .12; this.camera.position.y -= this.mouse.y * .06;}
    this.camera.up.copy(UP); this.camera.lookAt(this.lookAt);
    (this.depthOfField.uniforms as Record<string, { value: number }>).focus.value = this.camera.position.distanceTo(this.lookAt);
    if (this.turn.moving) {
      const t = Math.min(1, (now - this.turn.start) / (this.reduced || this.still ? 60 : 780)); const ease = t * t * (3 - 2 * t);
      this.turn.value = T.MathUtils.lerp(this.turn.from, this.turn.to, ease); this.deformPage(this.turn.value);
      if (t === 1) {this.turn.moving = false; if (this.turn.to === 1) this.bookPage += this.turn.direction; this.updatePages(); this.renderer.shadowMap.needsUpdate = true; this.callbacks.onPage(this.bookPage);}
    }
    const lightTarget = this.lampOn ? 14 : .25;
    this.lampLight.intensity = T.MathUtils.lerp(this.lampLight.intensity, lightTarget, 1 - Math.exp(-dt * .008));
    (this.lampGlow.material as T.MeshBasicMaterial).color.setRGB(.4 + this.lampLight.intensity / 23, .34 + this.lampLight.intensity / 42, .22 + this.lampLight.intensity / 63);
    if (this.view === 'desk') for (const [name, object] of Object.entries(this.anchors)) {
      const el = document.querySelector<HTMLElement>(`[data-anchor="${name}"]`); if (!el) continue;
      const pos = object.getWorldPosition(new T.Vector3()); if (name === 'laptop') pos.y += .7; if (name === 'camera') pos.y += .35; if (name === 'book') pos.y += .15;
      pos.project(this.camera); const w = this.host.clientWidth, h = this.host.clientHeight;
      el.style.transform = `translate(${(pos.x + 1) * w / 2}px,${(-pos.y + 1) * h / 2}px) translate(-50%,-50%)`;
    }
    this.composer.render(); this.host.dataset.transitioning = String(this.transitioning); this.host.dataset.page = String(this.bookPage + 1);
    this.frame = requestAnimationFrame(this.animate);
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    const el = this.renderer.domElement; el.removeEventListener('pointerdown', this.pointerDown); el.removeEventListener('pointermove', this.pointerMove); el.removeEventListener('pointerup', this.pointerUp); el.removeEventListener('pointercancel', this.pointerCancel); el.removeEventListener('webglcontextlost', this.contextLost); document.removeEventListener('visibilitychange', this.visibility);
    this.scene.traverse(o => {if (o instanceof T.Mesh) {o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => m.dispose());}});
    this.textures.forEach(t => t.dispose()); this.envTarget.dispose(); this.composer.passes.forEach(p => p.dispose()); this.composer.dispose(); this.renderer.dispose(); el.remove();
  }
}
