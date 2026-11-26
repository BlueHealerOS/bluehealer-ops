import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ReviewStatus, Vec3 } from './types';

export interface CameraState { position: Vec3; target: Vec3; fov: number }
export interface ViewerPin { id: string; title: string; point: Vec3; camera?: CameraState | null; status: ReviewStatus }
export interface Placement { point: Vec3; part: string | null; camera: CameraState }
type Mode = 'orbit' | 'pin' | 'measure';
type Axis = 'x' | 'y' | 'z';

const M_TO_MM = 1000; // GLB files are in metres; the viewer works in millimetres, Y up.
const v3 = (v: THREE.Vector3): Vec3 => [round(v.x), round(v.y), round(v.z)];
const round = (n: number) => Math.round(n * 100) / 100;

interface Part { name: string; node: THREE.Object3D; visible: boolean }

function partOf(obj: THREE.Object3D | null, parts: Part[]): string | null {
  for (let o = obj; o; o = o.parent) { const p = parts.find((x) => x.node === o); if (p) return p.name; }
  return null;
}

export default function ModelViewer({ glb, pins, selectedId, onPlace, onSelectPin }: {
  glb: ArrayBuffer; pins: ViewerPin[]; selectedId: string | null;
  onPlace: (p: Placement) => void; onSelectPin: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    model: THREE.Group | null; plane: THREE.Plane; render: () => void; fit: () => void; overlay: THREE.Group;
  } | null>(null);
  const pinEls = useRef(new Map<string, HTMLButtonElement>());
  const measureLabel = useRef<HTMLDivElement>(null);
  const measurePts = useRef<THREE.Vector3[]>([]);
  const partsRef = useRef<Part[]>([]);
  const pinsRef = useRef(pins); pinsRef.current = pins;
  const modeRef = useRef<Mode>('orbit');
  const firstFit = useRef(true);

  const [mode, setMode] = useState<Mode>('orbit');
  const [parts, setParts] = useState<Part[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [section, setSection] = useState<{ on: boolean; axis: Axis; offset: number; flip: boolean }>({ on: false, axis: 'x', offset: 0, flip: false });
  const [range, setRange] = useState<[number, number]>([-50, 50]);
  const [measure, setMeasure] = useState<string>('');
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  modeRef.current = mode;

  const renderNow = useCallback(() => three.current?.render(), []);

  const applyCamera = useCallback((c: CameraState) => {
    const t = three.current; if (!t) return;
    t.camera.position.set(...c.position); t.controls.target.set(...c.target); t.camera.fov = c.fov; t.camera.updateProjectionMatrix();
    t.controls.update(); t.render();
  }, []);

  // ---- scene setup (once)
  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); }
    catch { setUnsupported('The 3D view needs WebGL, which this browser or device does not offer.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf7f7f8);
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '3D model view. Use the toolbar and the pin buttons for keyboard access.');
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
    camera.position.set(110, 80, 110);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a96, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 140, 60); scene.add(sun);
    const grid = new THREE.GridHelper(200, 20, 0x9a9aa3, 0xd5d5db); grid.position.y = -0.5; scene.add(grid);
    const overlay = new THREE.Group(); scene.add(overlay);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;

    const project = new THREE.Vector3();
    const render = () => {
      renderer.render(scene, camera);
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
      const place = (node: HTMLElement | null, p: THREE.Vector3) => {
        if (!node) return;
        project.copy(p).project(camera);
        const visible = project.z < 1 && project.z > -1;
        node.style.display = visible ? '' : 'none';
        node.style.transform = `translate(${((project.x + 1) / 2) * w}px, ${((1 - project.y) / 2) * h}px) translate(-50%, -50%)`;
      };
      for (const p of pinsRef.current) place(pinEls.current.get(p.id) ?? null, new THREE.Vector3(...p.point));
      const m = measurePts.current;
      if (m.length === 2 && measureLabel.current) place(measureLabel.current, m[0]!.clone().add(m[1]!).multiplyScalar(0.5));
    };
    controls.addEventListener('change', render);

    const fit = () => {
      const box = new THREE.Box3().setFromObject(scene.getObjectByName('__model') ?? scene);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()).length();
      camera.position.copy(c).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(size * 1.4));
      controls.target.copy(c); camera.fov = 45; camera.updateProjectionMatrix(); controls.update(); render();
    };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); render();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    // Clicks that are not drags place a pin or a measure point.
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || modeRef.current === 'orbit') { down = null; return; }
      down = null;
      const t = three.current; if (!t?.model) return;
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(t.model, true).find((h) => h.object.visible && (!t.plane || !sectionOn.current || t.plane.distanceToPoint(h.point) >= 0));
      if (!hit) return;
      if (modeRef.current === 'pin') {
        onPlaceRef.current({ point: v3(hit.point), part: partOf(hit.object, partsRef.current), camera: { position: v3(camera.position), target: v3(controls.target), fov: camera.fov } });
        setMode('orbit');
      } else addMeasurePoint(hit.point);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const addMeasurePoint = (p: THREE.Vector3) => {
      const pts = measurePts.current;
      if (pts.length >= 2) { pts.length = 0; overlay.clear(); setMeasure(''); }
      pts.push(p.clone());
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1.2), new THREE.MeshBasicMaterial({ color: 0xb42318, depthTest: false }));
      dot.position.copy(p); dot.renderOrder = 10; overlay.add(dot);
      if (pts.length === 2) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xb42318, depthTest: false })); line.renderOrder = 10; overlay.add(line);
        setMeasure(`${pts[0]!.distanceTo(pts[1]!).toFixed(2)} mm`);
      } else setMeasure('Pick the second point.');
      render();
    };

    three.current = { renderer, scene, camera, controls, model: null, plane, render, fit, overlay };
    return () => {
      ro.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()); });
      renderer.dispose(); renderer.domElement.remove(); three.current = null;
    };
  }, []);

  const onPlaceRef = useRef(onPlace); onPlaceRef.current = onPlace;
  const sectionOn = useRef(false); sectionOn.current = section.on;

  // ---- (re)load the model whenever the bytes change; the camera stays where the user left it
  useEffect(() => {
    const t = three.current; if (!t) return;
    let cancelled = false;
    new GLTFLoader().parse(glb, '', (gltf) => {
      if (cancelled || !three.current) return;
      const old = t.scene.getObjectByName('__model'); if (old) t.scene.remove(old);
      const group = new THREE.Group(); group.name = '__model'; group.scale.setScalar(M_TO_MM); group.add(gltf.scene);
      const list: Part[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) { mesh.material = (mesh.material as THREE.Material).clone(); }
        if (o !== gltf.scene && o.name && !(o as THREE.Mesh).isMesh && o.children.some((c) => (c as THREE.Mesh).isMesh)) list.push({ name: o.name, node: o, visible: true });
      });
      if (list.length === 0) gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name) list.push({ name: o.name, node: o, visible: true }); });
      partsRef.current = list; setParts(list); t.model = group; t.scene.add(group);
      const box = new THREE.Box3().setFromObject(group); const lo = Math.floor(Math.min(box.min.x, box.min.y, box.min.z)), hi = Math.ceil(Math.max(box.max.x, box.max.y, box.max.z));
      setRange([lo, hi]); setLoadError(null);
      if (firstFit.current) { firstFit.current = false; t.fit(); } else t.render();
    }, (err) => setLoadError(`The model could not be read: ${(err as { message?: string }).message ?? 'unknown error'}`));
    return () => { cancelled = true; };
  }, [glb]);

  // ---- section plane
  useEffect(() => {
    const t = three.current; if (!t?.model) return;
    const n = new THREE.Vector3(section.axis === 'x' ? 1 : 0, section.axis === 'y' ? 1 : 0, section.axis === 'z' ? 1 : 0).multiplyScalar(section.flip ? -1 : 1);
    t.plane.set(n, section.flip ? section.offset : -section.offset);
    t.model.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const mat = m.material as THREE.Material; mat.clippingPlanes = section.on ? [t.plane] : []; mat.side = section.on ? THREE.DoubleSide : THREE.FrontSide; mat.needsUpdate = true;
    });
    t.render();
  }, [section, parts, glb]);

  // ---- part visibility and highlight
  useEffect(() => {
    const t = three.current; if (!t) return;
    for (const p of parts) {
      p.node.visible = p.visible;
      p.node.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.MeshStandardMaterial).emissive?.setHex(highlight === p.name ? 0x1f5c94 : 0x000000); });
    }
    t.render();
  }, [parts, highlight]);

  // ---- measure state resets when the mode changes
  useEffect(() => {
    if (mode === 'measure') return;
    measurePts.current.length = 0; three.current?.overlay.clear(); setMeasure(''); renderNow();
  }, [mode, renderNow]);

  // ---- pins follow the model, and the selected item's camera is restored
  useEffect(() => { renderNow(); }, [pins, renderNow]);
  const lastSel = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId && selectedId !== lastSel.current) { const c = pins.find((p) => p.id === selectedId)?.camera; if (c) applyCamera(c); }
    lastSel.current = selectedId;
  }, [selectedId, pins, applyCamera]);

  if (unsupported) return <p role="alert" className="card text-sm">{unsupported}</p>;
  const mm = (n: number) => `${n} mm`;
  const toggle = (m: Mode) => setMode(mode === m ? 'orbit' : m);

  return (
    <div className="space-y-2">
      <div role="toolbar" aria-label="3D view tools" className="flex flex-wrap items-center gap-1">
        <button className={`btn ${mode === 'pin' ? 'btn-primary' : ''}`} aria-pressed={mode === 'pin'} onClick={() => toggle('pin')}>Drop pin</button>
        <button className={`btn ${mode === 'measure' ? 'btn-primary' : ''}`} aria-pressed={mode === 'measure'} onClick={() => toggle('measure')}>Measure</button>
        <button className={`btn ${section.on ? 'btn-primary' : ''}`} aria-pressed={section.on} onClick={() => setSection({ ...section, on: !section.on })}>Section</button>
        <button className="btn" onClick={() => three.current?.fit()}>Reset view</button>
        <span role="status" aria-live="polite" className="ml-1 text-sm text-ink-muted">
          {mode === 'pin' && 'Click the model to place a pin.'}
          {mode === 'measure' && (measure ? `Distance: ${measure}` : 'Click two points on the model.')}
        </span>
      </div>
      {section.on && (
        <div className="card flex flex-wrap items-center gap-3 !p-3 text-sm">
          <fieldset className="flex items-center gap-1"><legend className="sr-only">Section axis</legend>
            {(['x', 'y', 'z'] as const).map((a) => <button key={a} className={`btn !min-h-9 !px-3 ${section.axis === a ? 'btn-primary' : ''}`} aria-pressed={section.axis === a} onClick={() => setSection({ ...section, axis: a })}>{a.toUpperCase()}</button>)}
          </fieldset>
          <label className="flex items-center gap-2">Offset
            <input type="range" min={range[0]} max={range[1]} step={0.5} value={section.offset} onChange={(e) => setSection({ ...section, offset: Number(e.target.value) })} />
            <output>{mm(section.offset)}</output>
          </label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={section.flip} onChange={(e) => setSection({ ...section, flip: e.target.checked })} />Flip side</label>
        </div>
      )}
      <div className="relative overflow-hidden rounded-card border border-hairline" style={{ height: 'min(60vh, 520px)', minHeight: 280 }}>
        <div ref={host} className="absolute inset-0" />
        {loadError && <p role="alert" className="absolute left-2 top-2 rounded-control bg-danger-soft px-2 py-1 text-sm text-danger">{loadError}</p>}
        <div className="pointer-events-none absolute inset-0">
          {pins.map((p, i) => (
            <button key={p.id} ref={(n) => { if (n) pinEls.current.set(p.id, n); else pinEls.current.delete(p.id); }} type="button"
              className={`pointer-events-auto absolute left-0 top-0 flex h-7 min-w-7 items-center justify-center rounded-full border-2 px-1 text-xs font-semibold shadow-float ${selectedId === p.id ? 'border-white bg-primary-strong text-white' : 'border-primary-strong bg-surface text-primary-strong'}`}
              aria-label={`Pin ${i + 1}, ${p.id}: ${p.title}`} aria-current={selectedId === p.id ? 'true' : undefined}
              onClick={() => { onSelectPin(p.id); if (p.camera) applyCamera(p.camera); }}>{i + 1}</button>
          ))}
          <div ref={measureLabel} className="absolute left-0 top-0 rounded bg-surface/90 px-1.5 text-xs font-semibold text-danger" style={{ display: measure.endsWith('mm') ? '' : 'none' }}>{measure}</div>
        </div>
      </div>
      <details className="card !p-3" open>
        <summary className="cursor-pointer text-sm font-semibold">Parts ({parts.length})</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {parts.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.visible} onChange={() => setParts(parts.map((x) => (x.name === p.name ? { ...x, visible: !x.visible } : x)))} />
                <span className="sr-only">Show </span>{p.name}</label>
              <button className="btn btn-quiet !min-h-8 !px-2 text-xs" aria-pressed={highlight === p.name} onClick={() => setHighlight(highlight === p.name ? null : p.name)}>Highlight</button>
            </li>
          ))}
          {parts.length === 0 && <li className="text-ink-muted">No named parts in this model.</li>}
        </ul>
      </details>
    </div>
  );
}
