"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { bladeOutline, leaflets, LEAF_TYPES, type LeafType } from "./core/leafShapes";
import { createLeafGeometry, createLeafRachis, createLeafSurface } from "./core/leafSurface";
import styles from "./brench.module.css";

function LeafSpecimen({ type }: { type: LeafType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch { const frame = requestAnimationFrame(() => setUnavailable(true)); return () => cancelAnimationFrame(frame); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene(), group = new THREE.Group();
    const surface = createLeafSurface(type), geometry = createLeafGeometry(type);
    group.add(new THREE.Mesh(geometry, surface.material));
    const rachisGeometry = createLeafRachis(type);
    const stalkGeometry = new THREE.CylinderGeometry(.005, .008, .16, 8);
    stalkGeometry.translate(0, -.08, 0);
    const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0x66763d, roughness: .8 });
    group.add(new THREE.Mesh(stalkGeometry, stalkMaterial));
    if (rachisGeometry) group.add(new THREE.Mesh(rachisGeometry, stalkMaterial));
    group.rotation.set(.18, -.23, -.12);
    scene.add(group, new THREE.HemisphereLight(0xffffff, 0x59643c, 2));
    const light = new THREE.DirectionalLight(0xfff4dd, 2.4); light.position.set(-2, 4, 5); scene.add(light);
    const camera = new THREE.OrthographicCamera(-.8, .8, .8, -.8, .1, 10);
    const box = new THREE.Box3().setFromObject(group), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    camera.position.set(center.x, center.y, 4);
    const render = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const aspect = width / height, view = Math.max(size.y * 1.16, size.x * 1.16 / aspect);
      camera.left = -view * aspect / 2; camera.right = view * aspect / 2;
      camera.top = view / 2; camera.bottom = -view / 2; camera.updateProjectionMatrix();
      renderer.setSize(width, height, false); renderer.render(scene, camera);
    };
    render();
    const observer = new ResizeObserver(render); observer.observe(canvas);
    return () => {
      observer.disconnect(); geometry.dispose(); rachisGeometry?.dispose(); stalkGeometry.dispose();
      stalkMaterial.dispose(); surface.dispose(); renderer.dispose();
    };
  }, [type]);
  return <div className={styles.specimen}>
    <canvas ref={canvasRef} role="img" aria-label={`${LEAF_TYPES.find(leaf => leaf.id === type)?.label} 잎 표면 확대 미리보기`} />
    {unavailable && <span>잎 미리보기를 표시할 수 없습니다.</span>}
  </div>;
}

export default function LeafSelector({ value, onChange }: { value: LeafType; onChange: (type: LeafType) => void }) {
  const selected = LEAF_TYPES.find(leaf => leaf.id === value)!;
  return <section className={styles.leafSection} aria-label="나뭇잎 종류">
    <span className={styles.sectionTitle}>LEAF COLLECTION</span>
    <LeafSpecimen type={value} />
    <div className={styles.leafDescription}><strong>{selected.label}</strong><span>{selected.detail}</span></div>
    <div className={styles.leafChoices}>
      {LEAF_TYPES.map(leaf => <button type="button" key={leaf.id} aria-pressed={leaf.id === value}
        onClick={() => onChange(leaf.id)} title={leaf.detail}>
        <svg viewBox="-.78 -1.3 1.56 1.6" aria-hidden="true">
          <path d={leaf.id === "pinnate" ? "M0,.14L0,-.94" : "M0,.14L0,-.28"} stroke={leaf.color} strokeWidth=".024" fill="none" />
          {leaflets(leaf.id).map((blade, index) => <g key={index}
            transform={`translate(${blade.x} ${-blade.y}) rotate(${-blade.angle * 180 / Math.PI}) scale(${blade.length * blade.width} ${blade.length})`}>
            <path d={bladeOutline(blade.shape)} fill={leaf.color} />
            <path d="M0,0Q.025,-.4 0,-1 M0,-.25L-.18,-.42 M0,-.4L.2,-.58 M0,-.55L-.19,-.74 M0,-.7L.13,-.83"
              fill="none" stroke={leaf.id === "variegated" ? "#d4c560" : "#e5d99e"} strokeWidth={leaf.id === "variegated" ? ".05" : ".014"} opacity=".65" />
          </g>)}
        </svg>
        <span>{leaf.label}</span>
      </button>)}
    </div>
    <p className={styles.leafHint}>선택한 모양은 본잎에 적용됩니다. 성장 손잡이를 움직여 떡잎이 지나간 뒤의 모습을 보세요.</p>
  </section>;
}
