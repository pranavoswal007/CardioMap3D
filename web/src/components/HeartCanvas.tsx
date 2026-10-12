import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float } from '@react-three/drei';
import * as THREE from 'three';

interface VesselProps {
  name: string;
  points: [number, number, number][];
  color: string;
  riskPercent: number;
  selected: boolean;
  onSelect: (name: string) => void;
}

function CoronaryVessel({ name, points, color, riskPercent, selected, onSelect }: VesselProps) {
  const curve = React.useMemo(() => {
    const vectors = points.map((p) => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(vectors);
  }, [points]);

  const tubeGeometry = React.useMemo(() => {
    return new THREE.TubeGeometry(curve, 64, selected ? 0.09 : 0.065, 12, false);
  }, [curve, selected]);

  return (
    <group onClick={(e) => { e.stopPropagation(); onSelect(name); }}>
      <mesh geometry={tubeGeometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.8 : 0.35}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>
      {/* Label billboard near vessel midpoint */}
      <Text
        position={points[Math.floor(points.length / 2)]}
        fontSize={0.16}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#090d16"
      >
        {`${name}: ${riskPercent}%`}
      </Text>
    </group>
  );
}

function HeartAnatomy({ selectedVessel, setSelectedVessel }: { selectedVessel: string | null; setSelectedVessel: (v: string) => void }) {
  const groupRef = useRef<THREE.Group>(null);

  // Subtle natural cardiac pulsation animation
  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime();
      const pulse = 1 + Math.sin(t * 3.2) * 0.025;
      groupRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  // LAD path (Anterior Interventricular Artery descending to apex)
  const ladPath: [number, number, number][] = [
    [0.1, 1.0, 0.45],
    [0.2, 0.6, 0.7],
    [0.15, 0.1, 0.85],
    [0.05, -0.4, 0.75],
    [-0.05, -0.9, 0.45],
  ];

  // LCX path (Left Circumflex Artery curving around left lateral margin)
  const lcxPath: [number, number, number][] = [
    [0.1, 1.0, 0.45],
    [-0.45, 0.8, 0.4],
    [-0.85, 0.4, 0.1],
    [-0.8, -0.1, -0.3],
    [-0.6, -0.5, -0.4],
  ];

  // RCA path (Right Coronary Artery running along right atrioventricular groove)
  const rcaPath: [number, number, number][] = [
    [0.1, 1.0, 0.45],
    [0.55, 0.85, 0.35],
    [0.85, 0.45, 0.25],
    [0.8, -0.1, 0.1],
    [0.5, -0.6, -0.2],
    [0.1, -0.85, -0.25],
  ];

  return (
    <group ref={groupRef}>
      {/* Myocardial Volume Base (Stylized Cardiac Muscle Mesh) */}
      <mesh position={[0, -0.05, 0]}>
        <sphereGeometry args={[1.05, 48, 48]} />
        <meshStandardMaterial
          color="#881337"
          roughness={0.65}
          metalness={0.15}
          wireframe={false}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Aortic Root / Base geometry */}
      <mesh position={[0.08, 1.05, 0.2]}>
        <cylinderGeometry args={[0.3, 0.35, 0.6, 24]} />
        <meshStandardMaterial color="#9f1239" roughness={0.4} />
      </mesh>

      {/* Coronary Arteries with Spatial Risk Mapping */}
      {/* TODO(PHASE 3): REMOVE hardcoded placeholder, replace with API-driven values */}
      <CoronaryVessel
        name="LAD"
        points={ladPath}
        color="#ef4444" // High risk demo
        riskPercent={78}
        selected={selectedVessel === 'LAD'}
        onSelect={setSelectedVessel}
      />
      {/* TODO(PHASE 3): REMOVE hardcoded placeholder, replace with API-driven values */}
      <CoronaryVessel
        name="LCX"
        points={lcxPath}
        color="#10b981" // Low risk demo
        riskPercent={24}
        selected={selectedVessel === 'LCX'}
        onSelect={setSelectedVessel}
      />
      {/* TODO(PHASE 3): REMOVE hardcoded placeholder, replace with API-driven values */}
      <CoronaryVessel
        name="RCA"
        points={rcaPath}
        color="#f59e0b" // Moderate risk demo
        riskPercent={52}
        selected={selectedVessel === 'RCA'}
        onSelect={setSelectedVessel}
      />
    </group>
  );
}

export function HeartCanvas() {
  const [selectedVessel, setSelectedVessel] = useState<string | null>('LAD');

  return (
    <div className="relative w-full h-full min-h-[500px] bg-gradient-to-b from-[#090d16] via-[#0d1527] to-[#090d16] rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* 3D Canvas Viewport Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-700/60 shadow-lg pointer-events-auto">
        <div className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
          Interactive 3D Anatomical Map
        </div>
        <p className="text-xs text-slate-300">
          Rotate: <span className="text-slate-400">Left Click + Drag</span> | Zoom: <span className="text-slate-400">Scroll</span>
        </p>
      </div>

      {/* Vessel Quick Legend */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-slate-900/80 backdrop-blur-md p-3 rounded-lg border border-slate-700/60 text-xs">
        <span className="text-slate-400 font-medium mb-1">Coronary Risk Status</span>
        <button
          onClick={() => setSelectedVessel('LAD')}
          className={`flex items-center justify-between gap-3 px-2 py-1 rounded transition ${selectedVessel === 'LAD' ? 'bg-red-950/60 text-red-200 border border-red-500/50' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          <span className="flex items-center gap-1.5 font-semibold text-red-400">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> LAD
          </span>
          {/* TODO(PHASE 3): REMOVE hardcoded placeholder, replace with API-driven values */}
          <span className="font-mono text-red-300">78%</span>
        </button>

        <button
          onClick={() => setSelectedVessel('RCA')}
          className={`flex items-center justify-between gap-3 px-2 py-1 rounded transition ${selectedVessel === 'RCA' ? 'bg-amber-950/60 text-amber-200 border border-amber-500/50' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          <span className="flex items-center gap-1.5 font-semibold text-amber-400">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span> RCA
          </span>
          {/* TODO(PHASE 3): REMOVE hardcoded placeholder, replace with API-driven values */}
          <span className="font-mono text-amber-300">52%</span>
        </button>

        <button
          onClick={() => setSelectedVessel('LCX')}
          className={`flex items-center justify-between gap-3 px-2 py-1 rounded transition ${selectedVessel === 'LCX' ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-500/50' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span> LCX
          </span>
          {/* TODO(PHASE 3): REMOVE hardcoded placeholder, replace with API-driven values */}
          <span className="font-mono text-emerald-300">24%</span>
        </button>
      </div>

      {/* Mandatory Illustrative Notice (Hard rule 4) */}
      <div className="absolute bottom-4 left-4 z-10 text-[11px] text-slate-400 bg-slate-950/80 px-2.5 py-1.5 rounded border border-slate-800 backdrop-blur-sm max-w-sm">
        <span className="font-semibold text-amber-400">Notice:</span> Vessel coloring and lumen representations are <span className="font-semibold text-white underline decoration-amber-400">illustrative</span> based on patient vessel-level predicted probabilities. No lesion-level or segment localization is claimed.
      </div>

      {/* R3F Canvas */}
      <Canvas
        camera={{ position: [0, 0.5, 3.8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
        <pointLight position={[-4, -2, -2]} intensity={0.6} color="#38bdf8" />
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
          <HeartAnatomy selectedVessel={selectedVessel} setSelectedVessel={setSelectedVessel} />
        </Float>
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1.8}
          maxDistance={6.0}
        />
      </Canvas>
    </div>
  );
}
