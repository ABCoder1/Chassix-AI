import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { frameDelta, loopPhase } from './animation';
import type { Chassis, Response, StructureId, ViewSettings } from './model';
import { illustrativeIndex, networkFor, type PathwayMode } from './pathwayData';
import type { BondState, SimulationResult } from './simulation';

export type CellSceneHandle = { reset: () => void; zoom: (direction: number) => void };
type Props = { chassis: Chassis; response: Response; simulation: SimulationResult; view: ViewSettings; selected: StructureId; onSelect: (id: StructureId) => void; pathwayMode: PathwayMode; selectedPathway: string; onSelectPathway: (id: string) => void };
const vertexShader = `
  uniform float uTime;
  uniform float uStress;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    float wave = sin(position.x * 4.0 + uTime * 1.6) * cos(position.y * 3.0 - uTime * 1.1) * sin(position.z * 3.0 + uTime);
    vec3 displaced = position + normal * wave * (0.012 + uStress * 0.16);
    vLocal = displaced;
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const fragmentShader = `
  uniform vec3 uColor;
  uniform float uStress;
  uniform float uOpacity;
  uniform float uCutaway;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    if (uCutaway > 0.5 && vLocal.z > 0.25) discard;
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.1);
    vec3 color = mix(uColor, vec3(1.0, 0.31, 0.25), uStress * 0.65);
    gl_FragColor = vec4(color * (0.65 + rim * 0.8), uOpacity * (0.22 + rim * 0.78));
  }
`;

export const CellScene = forwardRef<CellSceneHandle, Props>(function CellScene(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<Partial<Record<StructureId, HTMLButtonElement | null>>>({});
  const pathwayLabels = useRef<Record<string, HTMLButtonElement | null>>({});
  const pathwayCallouts = useRef<Record<string, SVGLineElement | null>>({});
  const latest = useRef(props);
  const api = useRef<CellSceneHandle | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const pathwayNetwork = networkFor(props.chassis.id, props.pathwayMode);
  useEffect(() => { latest.current = props; });
  useImperativeHandle(ref, () => ({ reset: () => api.current?.reset(), zoom: (direction) => api.current?.zoom(direction) }), []);

  useEffect(() => {
    const container = host.current!;
    const chassis = props.chassis;
    setError('');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { setError('The 3D view needs WebGL 2. Enable hardware acceleration or try another browser. You can still explore the structures and controls.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', `${chassis.name} interactive 3D model. Drag to rotate; scroll to zoom. Use arrow keys to rotate and plus or minus to zoom.`);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    container.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const initialCamera = new THREE.Vector3(0.4, 0.6, 8.5);
    camera.position.copy(initialCamera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5.5;
    controls.maxDistance = 15;
    controls.autoRotateSpeed = 0.65;
    const zoom = (direction: number) => {
      const offset = camera.position.clone().sub(controls.target);
      const length = THREE.MathUtils.clamp(offset.length() * (direction > 0 ? 0.86 : 1.16), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(length));
      controls.update();
    };
    api.current = { reset: () => { controls.reset(); camera.position.copy(initialCamera); controls.target.set(0, 0, 0); controls.update(); }, zoom };
    scene.add(new THREE.AmbientLight(0xb7d0ef, 2));
    const key = new THREE.DirectionalLight(0xc9c0ff, 4);
    key.position.set(3, 5, 6); scene.add(key);
    const fill = new THREE.PointLight(0x43d9be, 25); fill.position.set(-4, -2, 3); scene.add(fill);
    const root = new THREE.Group(); root.rotation.z = chassis.id === 'bacterium' ? -0.3 : -0.16; scene.add(root);

    const anchors: Record<StructureId, THREE.Vector3> = {
      envelope: new THREE.Vector3(-1.5, 1.25, 0.25), genome: new THREE.Vector3(-0.5, 0.28, 0.55),
      energy: new THREE.Vector3(0.95, 0.6, 0.3), repair: new THREE.Vector3(0.55, -0.8, 0.45), ribosomes: new THREE.Vector3(-1.05, -0.6, 0.6),
    };
    const selectable: THREE.Object3D[] = [];
    const shaderMaterials: THREE.ShaderMaterial[] = [];
    const internal = new THREE.Group(); root.add(internal);
    const pathGroup = new THREE.Group(); root.add(pathGroup);
    const materials: { material: THREE.MeshStandardMaterial; structure: StructureId }[] = [];
    const materialFor = (structure: StructureId) => {
      const color = chassis.structures.find((s) => s.id === structure)!.color;
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, metalness: 0.25, roughness: 0.35 });
      materials.push({ material, structure }); return material;
    };
    const tag = (object: THREE.Object3D, id: StructureId) => { object.userData.structure = id; selectable.push(object); return object; };
    const cellGeometry = (detail: boolean) => {
      if (chassis.id === 'bacterium') { const g = new THREE.CapsuleGeometry(1.05, 2.1, detail ? 20 : 12, detail ? 40 : 24); g.rotateZ(Math.PI / 2); return g; }
      const g = new THREE.SphereGeometry(1.7, detail ? 64 : 32, detail ? 48 : 20);
      if (chassis.id === 'yeast') g.scale(1.75, 1.24, 0.86);
      return g;
    };
    const shellMaterial = (wireframe: boolean) => {
      const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, wireframe,
        uniforms: { uTime: { value: 0 }, uStress: { value: 0 }, uColor: { value: new THREE.Color(chassis.color) }, uOpacity: { value: wireframe ? 0.4 : 0.6 }, uCutaway: { value: 0 } } });
      shaderMaterials.push(material); return material;
    };
    const shell = new THREE.Mesh(cellGeometry(true), shellMaterial(false)); root.add(shell); tag(shell, 'envelope');
    const wire = new THREE.Mesh(cellGeometry(false), shellMaterial(true)); wire.scale.setScalar(1.005); root.add(wire);
    const extraShells: THREE.Object3D[] = [];
    if (chassis.id === 'yeast') {
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.72, 40, 32), shaderMaterials[0]);
      bud.position.set(2.05, 1.1, -0.05); bud.scale.set(0.92, 1.1, 0.9); root.add(bud); tag(bud, 'envelope');
      const budWire = new THREE.Mesh(new THREE.SphereGeometry(0.73, 24, 16), shaderMaterials[1]);
      budWire.position.copy(bud.position); budWire.scale.copy(bud.scale); root.add(budWire); extraShells.push(budWire);
    }
    if (chassis.id === 'bacterium') {
      const inner = new THREE.Mesh(cellGeometry(true), shellMaterial(false)); inner.scale.setScalar(0.94);
      (inner.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.2; root.add(inner);
      const flagellum = new THREE.CatmullRomCurve3(Array.from({ length: 65 }, (_, i) => new THREE.Vector3(1.95 + i * 0.03, Math.sin(i * 0.18) * 0.18, Math.cos(i * 0.18) * 0.18)));
      root.add(new THREE.Mesh(new THREE.TubeGeometry(flagellum, 64, 0.025, 6, false), materialFor('envelope')));
    }
    const genomeMaterial = materialFor('genome');
    if (chassis.id === 'yeast') {
      const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.53, 32, 24), genomeMaterial);
      nucleus.position.copy(anchors.genome); internal.add(nucleus); tag(nucleus, 'genome');
      const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), new THREE.MeshStandardMaterial({ color: '#ffdfaa', emissive: '#cc7b40', emissiveIntensity: 0.4 }));
      nucleolus.position.copy(anchors.genome).add(new THREE.Vector3(0.1, 0.05, 0.45)); internal.add(nucleolus); tag(nucleolus, 'genome');
    } else {
      const points = Array.from({ length: 90 }, (_, i) => { const t = i / 89; return new THREE.Vector3((t - 0.5) * 1.75, Math.sin(t * Math.PI * 7) * 0.3, Math.cos(t * Math.PI * 7) * 0.3 + 0.25); });
      const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 128, 0.055, 8, false), genomeMaterial);
      internal.add(coil); tag(coil, 'genome'); anchors.genome.set(-0.35, 0, 0.6);
    }
    const energyMaterial = materialFor('energy');
    const energyPositions = [anchors.energy, new THREE.Vector3(-0.95, -0.85, -0.25), new THREE.Vector3(0.9, -0.8, -0.5)];
    energyPositions.forEach((position, index) => {
      const energy = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, chassis.id === 'yeast' ? 0.36 : 0.14, 8, 16), energyMaterial);
      energy.position.copy(position); energy.rotation.z = index + 0.7; internal.add(energy); tag(energy, 'energy');
      if (chassis.id === 'yeast') {
        const foldPoints = Array.from({ length: 30 }, (_, i) => new THREE.Vector3(Math.sin(i * 1.1) * 0.11, (i / 29 - 0.5) * 0.5, 0.15));
        energy.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(foldPoints), 40, 0.018, 5, false), new THREE.MeshBasicMaterial({ color: '#d2ecff' })));
      }
    });
    const repairMaterial = materialFor('repair');
    for (let i = 0; i < 7; i++) {
      const repair = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 8, 16), repairMaterial);
      repair.position.copy(anchors.repair).add(new THREE.Vector3(Math.sin(i * 1.7) * 0.3, Math.cos(i * 1.7) * 0.25, i * 0.04));
      repair.rotation.set(i * 0.3, i * 0.5, 0); internal.add(repair); tag(repair, 'repair');
    }
    const ribosomeMaterial = materialFor('ribosomes');
    const ribosomeGeometry = new THREE.SphereGeometry(0.038, 8, 6);
    let seed = 47;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 70; i++) {
      const particle = new THREE.Mesh(ribosomeGeometry, ribosomeMaterial);
      const theta = random() * Math.PI * 2, z = random() * 2 - 1, radius = Math.cbrt(random()) * 1.35;
      const r = Math.sqrt(1 - z * z) * radius;
      particle.position.set(Math.cos(theta) * r * (chassis.id === 'bacterium' ? 1.3 : 1), Math.sin(theta) * r * (chassis.id === 'yeast' ? 1.12 : 0.75), z * radius * 0.65);
      internal.add(particle); tag(particle, 'ribosomes');
    }
    const pathwayNetwork = networkFor(chassis.id, props.pathwayMode);
    const pathwayAnchors = Object.fromEntries((pathwayNetwork?.nodes ?? []).map((node) => [node.id, new THREE.Vector3(node.position[0] * 1.45, node.position[1] * 1.28, node.position[2])]));
    const pathwayMeshes = new Map<string, THREE.Mesh>();
    const pathwayMaterials = new Map<string, THREE.MeshBasicMaterial>();
    const networkEdges: { from: string; to: string; curve: THREE.CatmullRomCurve3; line: THREE.Line; material: THREE.LineDashedMaterial; particles: THREE.Mesh[]; offset: number; targetColor: THREE.Color }[] = [];
    const bondGroup = new THREE.Group(); root.add(bondGroup);
    const bondVisuals: { id: string; line: THREE.LineSegments; material: THREE.LineDashedMaterial; beads: THREE.Mesh[]; beadMaterial: THREE.MeshBasicMaterial; particle: THREE.Mesh }[] = [];
    const bondColors: Record<BondState, string> = { stable: '#65b9d1', forming: '#35d7a5', rearranging: '#f1b15b', weakening: '#ed8a4a', broken: '#ef6271' };
    props.simulation.bonds.forEach((bond) => {
      const a = new THREE.Vector3(...bond.start), b = new THREE.Vector3(...bond.end), mid = a.clone().lerp(b, 0.5);
      const material = new THREE.LineDashedMaterial({ color: bondColors[bond.state], dashSize: 0.14, gapSize: 0.04, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
      const geometry = new THREE.BufferGeometry().setFromPoints([a, mid, mid, b]);
      const line = new THREE.LineSegments(geometry, material); line.computeLineDistances(); bondGroup.add(line);
      const beadMaterial = new THREE.MeshBasicMaterial({ color: bondColors[bond.state], transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
      const beads = [0, 1].map(() => { const bead = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), beadMaterial); bondGroup.add(bead); return bead; });
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), new THREE.MeshBasicMaterial({ color: '#baffeb', transparent: true, depthWrite: false, depthTest: false }));
      bondGroup.add(particle);
      bondVisuals.push({ id: bond.id, line, material, beads, beadMaterial, particle });
    });
    const markerGeometry = new THREE.OctahedronGeometry(0.105, 1);
    pathwayNetwork?.nodes.forEach((node) => {
      const material = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false });
      const marker = new THREE.Mesh(markerGeometry, material);
      marker.position.copy(pathwayAnchors[node.id]); pathGroup.add(marker); pathwayMeshes.set(node.id, marker); pathwayMaterials.set(node.id, material);
    });
    pathwayNetwork?.edges.forEach(([from, to], index) => {
      const a = pathwayAnchors[from], b = pathwayAnchors[to];
      if (!a || !b) return;
      const control = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.1, 0.2));
      const curve = new THREE.CatmullRomCurve3([a, control, b]);
      const target = pathwayNetwork.nodes.find((node) => node.id === to)!;
      const isGrn = props.pathwayMode === 'grn';
      const material = new THREE.LineDashedMaterial({ color: isGrn ? '#f0ad28' : '#667085', dashSize: 0.09, gapSize: 0.065, transparent: true, opacity: isGrn ? 0.82 : 0.55, depthWrite: false, depthTest: false });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), material);
      line.computeLineDistances(); pathGroup.add(line);
      const particleMaterial = new THREE.MeshBasicMaterial({ color: isGrn ? '#f8c14e' : target.color, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false });
      const particles = Array.from({ length: 2 }, () => { const particle = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), particleMaterial); pathGroup.add(particle); return particle; });
      networkEdges.push({ from, to, curve, line, material, particles, offset: index * 0.11, targetColor: new THREE.Color(target.color) });
    });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#4e768b', transparent: true, opacity: 0.18 });
    [2.4, 2.65].forEach((radius) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 4, 100), ringMaterial); ring.rotation.x = Math.PI / 2; ring.position.y = -2.6; scene.add(ring); });
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 110 * 3 }, () => (random() - 0.5) * 13), 3));
    scene.add(new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#91bbc8', size: 0.018, transparent: true, opacity: 0.35 })));

    const resize = () => { const { width, height } = container.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const raycaster = new THREE.Raycaster();
    let down = new THREE.Vector2();
    const pointerDown = (event: PointerEvent) => { down = new THREE.Vector2(event.clientX, event.clientY); };
    const pick = (event: PointerEvent) => {
      if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
      const targets = latest.current.view.internals ? selectable.filter((o) => o.userData.structure !== 'envelope') : [shell];
      const hit = raycaster.intersectObjects(targets)[0];
      if (hit) latest.current.onSelect(hit.object.userData.structure as StructureId);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += event.key === 'ArrowLeft' ? -0.12 : event.key === 'ArrowRight' ? 0.12 : 0;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + (event.key === 'ArrowUp' ? -0.12 : event.key === 'ArrowDown' ? 0.12 : 0), 0.1, Math.PI - 0.1);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); controls.update();
      } else if (event.key === '+' || event.key === '=') zoom(1);
      else if (event.key === '-') zoom(-1);
    };
    let lost = false;
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; setError('The graphics context was interrupted. Reload the 3D view to continue.'); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pick);
    renderer.domElement.addEventListener('keydown', keyboard); renderer.domElement.addEventListener('webglcontextlost', contextLost);
    let frame = 0, time = 0, last = performance.now();
    const projected = new THREE.Vector3();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (lost) return;
      const dt = frameDelta(now, last);
      last = now;
      const { response, simulation, view, selected } = latest.current;
      if (view.playing) time += dt;
      controls.autoRotate = view.rotating && view.playing;
      controls.update(dt);
      wire.visible = view.mesh; extraShells.forEach((o) => { o.visible = view.mesh; });
      internal.visible = view.internals; pathGroup.visible = view.pathways;
      shaderMaterials.forEach((material) => {
        material.uniforms.uTime.value = time;
        material.uniforms.uStress.value = response.stress;
        material.uniforms.uCutaway.value = view.cutaway ? 1 : 0;
        material.uniforms.uOpacity.value = view.pathways ? material.wireframe ? 0.72 : 0.13 : material.wireframe ? 0.4 : 0.6;
      });
      materials.forEach(({ material, structure }) => { material.emissiveIntensity = selected === structure ? 0.55 : 0.12; });
      const stressColor = new THREE.Color('#ff4d62');
      networkEdges.forEach(({ from, to, curve, line, material, particles, offset, targetColor }) => {
        const isGrn = latest.current.pathwayMode === 'grn';
        const fromIndex = isGrn ? simulation.genes.find((item) => item.id === from)?.index : simulation.pathways.find((item) => item.id === from)?.index;
        const toIndex = isGrn ? simulation.genes.find((item) => item.id === to)?.index : simulation.pathways.find((item) => item.id === to)?.index;
        const activity = ((fromIndex ?? 50) + (toIndex ?? 50)) / 200;
        material.color.copy(isGrn ? new THREE.Color('#f0ad28') : targetColor.clone().lerp(stressColor, response.stress * 0.78));
        material.opacity = 0.25 + activity * 0.6;
        particles.forEach((particle, index) => particle.position.copy(curve.getPoint(loopPhase(time * (0.08 + activity * 0.16) + offset + index * 0.5))));
        line.visible = view.pathways;
      });
      pathwayNetwork?.nodes.forEach((node) => {
        const marker = pathwayMeshes.get(node.id); const material = pathwayMaterials.get(node.id);
        if (!marker || !material) return;
        const active = latest.current.selectedPathway === node.id;
        const currentIndex = latest.current.pathwayMode === 'grn'
          ? simulation.genes.find((item) => item.id === node.id)?.index
          : simulation.pathways.find((item) => item.id === node.id)?.index;
        const intensity = (currentIndex ?? illustrativeIndex(node.base, response)) / 100;
        marker.scale.setScalar(active ? 1.45 : 0.82 + intensity * 0.35);
        material.opacity = 0.75 + intensity * 0.25;
      });
      const bondAxis = new THREE.Vector3();
      bondGroup.visible = view.pathways;
      bondVisuals.forEach(({ id, line, material, beads, beadMaterial, particle }, index) => {
        const bond = simulation.bonds.find((item) => item.id === id);
        if (!bond) return;
        const start = new THREE.Vector3(...bond.start), end = new THREE.Vector3(...bond.end);
        const state = bond.state;
        if (state === 'rearranging') {
          const shift = Math.sin(time * 4 + index) * 0.035;
          start.y += shift; end.y -= shift;
        }
        bondAxis.copy(end).sub(start).normalize();
        const gap = state === 'broken' ? 0.28 : state === 'forming' ? 0.09 + (0.5 + Math.sin(time * 4 + index) * 0.5) * 0.15 : 0;
        const middle = start.clone().lerp(end, 0.5);
        const left = middle.clone().addScaledVector(bondAxis, -gap / 2);
        const right = middle.clone().addScaledVector(bondAxis, gap / 2);
        line.geometry.setFromPoints([start, left, right, end]); line.computeLineDistances();
        material.color.set(bondColors[state]); material.opacity = state === 'weakening' ? 0.62 : 0.9;
        material.dashSize = state === 'stable' ? 0.16 : 0.07; material.gapSize = state === 'stable' ? 0.012 : 0.055;
        beads[0].position.copy(start); beads[1].position.copy(end); beadMaterial.color.set(bondColors[state]);
        particle.visible = state === 'forming';
        if (particle.visible) particle.position.copy(start.clone().lerp(end, loopPhase(time * 0.45 + index * 0.19)));
      });
      root.updateMatrixWorld();
      for (const structure of chassis.structures) {
        const label = labels.current[structure.id]; if (!label) continue;
        projected.copy(anchors[structure.id]); root.localToWorld(projected); projected.project(camera);
        const x = (projected.x * 0.5 + 0.5) * container.clientWidth;
        const y = (-projected.y * 0.5 + 0.5) * container.clientHeight;
        label.style.left = `${x}px`; label.style.top = `${y}px`;
        label.hidden = projected.z > 1 || projected.z < -1 || x < 10 || x > container.clientWidth - 10 || y < 10 || y > container.clientHeight - 10 || (!view.internals && structure.id !== 'envelope');
      }
      for (const node of pathwayNetwork?.nodes ?? []) {
        const label = pathwayLabels.current[node.id]; if (!label) continue;
        projected.copy(pathwayAnchors[node.id]); root.localToWorld(projected); projected.project(camera);
        const markerX = (projected.x * 0.5 + 0.5) * container.clientWidth;
        const markerY = (-projected.y * 0.5 + 0.5) * container.clientHeight;
        const labelX = node.x / 100 * container.clientWidth;
        const labelY = node.y / 100 * container.clientHeight;
        const callout = pathwayCallouts.current[node.id];
        if (callout) {
          callout.setAttribute('x1', `${markerX}`); callout.setAttribute('y1', `${markerY}`);
          callout.setAttribute('x2', `${labelX}`); callout.setAttribute('y2', `${labelY}`);
          callout.style.display = view.pathways && projected.z <= 1 && projected.z >= -1 ? '' : 'none';
        }
        label.style.left = `${node.x}%`; label.style.top = `${node.y}%`;
        label.hidden = !view.pathways || projected.z > 1 || projected.z < -1;
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); api.current = null;
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pick);
      renderer.domElement.removeEventListener('keydown', keyboard); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set<THREE.BufferGeometry>(); const disposedMaterials = new Set<THREE.Material>();
      scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach((material: THREE.Material) => disposedMaterials.add(material)); } });
      geometries.forEach((g) => g.dispose()); disposedMaterials.forEach((m) => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [props.chassis.id, props.pathwayMode, retry]);

  return <div className="scene" ref={host} data-testid="cell-scene">
    {!error && !props.view.pathways && <div className="model-labels" aria-label="Select a cell structure">{props.chassis.structures.map((structure) => <button key={structure.id}
      ref={(element) => { labels.current[structure.id] = element; }}
      className={`model-label ${props.selected === structure.id ? 'selected' : ''}`}
      style={{ '--structure': structure.color } as React.CSSProperties} onClick={() => props.onSelect(structure.id)} aria-pressed={props.selected === structure.id}>
      <span />{structure.label}
    </button>)}</div>}
    {!error && pathwayNetwork && <div className={`pathway-labels ${props.pathwayMode}`} aria-label={props.pathwayMode === 'grn' ? 'Select a gene network node' : 'Select a cellular pathway'}><svg className="pathway-callouts" aria-hidden="true">{pathwayNetwork.nodes.map((node) => <line key={node.id} ref={(element) => { pathwayCallouts.current[node.id] = element; }} style={{ stroke: node.color }} />)}</svg>{pathwayNetwork.nodes.map((node) => {
      const index = props.pathwayMode === 'grn' ? props.simulation.genes.find((item) => item.id === node.id)?.index : props.simulation.pathways.find((item) => item.id === node.id)?.index;
      return <button key={node.id} ref={(element) => { pathwayLabels.current[node.id] = element; }} className={`pathway-label ${props.selectedPathway === node.id ? 'selected' : ''} ${node.role ?? ''}`} style={{ '--node-color': node.color } as React.CSSProperties} onClick={() => props.onSelectPathway(node.id)} aria-pressed={props.selectedPathway === node.id}><span className="pathway-label-heading"><strong>{node.label}</strong>{node.fixtureValue && <b>Ref {node.fixtureValue}</b>}</span><small>{props.pathwayMode === 'grn' ? `Demo expression ${index ?? illustrativeIndex(node.base, props.response)}/100 · ${node.short}` : `Demo flux proxy ${index ?? illustrativeIndex(node.base, props.response)} rFU`}</small>{node.motif && <em>{node.motif}</em>}</button>;
    })}</div>}
    {!error && !pathwayNetwork && props.view.pathways && <div className="pathway-empty-banner"><Activity size={14} />No pathway fixture is connected for {props.chassis.category.toLowerCase()}.</div>}
    {error && <div className="graphics-error" role="alert"><strong>3D view unavailable</strong><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>Reload 3D view</button></div>}
  </div>;
});
