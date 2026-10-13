import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RotateCcw, Info, Layers } from 'lucide-react';

import type { VesselId, VesselData, HeartViewerProps, VesselConfig, HeartTransformConfig } from '../types/viewer';
import { vesselsList, defaultHeartTransform } from '../anatomy';
import { evaluateVesselColor } from '../utils/vesselColors';
import { HeartBody } from './HeartBody';
import { CoronaryArteryMesh } from './CoronaryArteryMesh';
import { createTaperedTubeGeometry } from '../utils/taperedTube';
import { VesselLegend } from './VesselLegend';
import { VesselList } from './VesselList';
import { DevDebugPanel } from './DevDebugPanel';

const INITIAL_CAMERA_POS: [number, number, number] = [0, 0.4, 3.8];
const INITIAL_TARGET_POS: [number, number, number] = [0, 0, 0];

/**
 * Camera controller handling smooth transition animations on vessel selection and view reset.
 */
function CameraRig({
  selectedVessel,
  resetCount,
  controlsRef,
  allVesselPoints,
}: {
  selectedVessel: VesselId | null;
  resetCount: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  allVesselPoints: Record<VesselId, [number, number, number][]>;
}) {
  const targetCamPos = useRef(new THREE.Vector3(...INITIAL_CAMERA_POS));
  const targetLookAt = useRef(new THREE.Vector3(...INITIAL_TARGET_POS));
  const prevSelected = useRef<VesselId | null>(null);
  const prevReset = useRef(resetCount);

  useEffect(() => {
    if (resetCount !== prevReset.current) {
      prevReset.current = resetCount;
      targetCamPos.current.set(...INITIAL_CAMERA_POS);
      targetLookAt.current.set(...INITIAL_TARGET_POS);
      return;
    }

    if (selectedVessel !== prevSelected.current) {
      prevSelected.current = selectedVessel;
      if (selectedVessel) {
        const cfg = vesselsList.find((v) => v.id === selectedVessel);
        if (cfg) {
          targetCamPos.current.set(...cfg.cameraFocus);
          const pts = allVesselPoints[selectedVessel] || cfg.points;
          const midPoint = pts[Math.floor(pts.length / 2)];
          if (midPoint) {
            targetLookAt.current.set(midPoint[0] * 0.5, midPoint[1] * 0.5, midPoint[2] * 0.5);
          }
        }
      } else {
        targetCamPos.current.set(...INITIAL_CAMERA_POS);
        targetLookAt.current.set(...INITIAL_TARGET_POS);
      }
    }
  }, [selectedVessel, resetCount, allVesselPoints]);

  useFrame(({ camera }, delta) => {
    camera.position.lerp(targetCamPos.current, Math.min(1, delta * 3.5));
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, Math.min(1, delta * 3.5));
      controlsRef.current.update();
    }
  });

  return null;
}

/**
 * Pulsing group providing subtle cardiac rhythm when bpm prop is provided.
 * Disabled when bpm is absent or when prefers-reduced-motion is active.
 */
function PulsingHeartGroup({
  bpm,
  children,
}: {
  bpm?: number;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!bpm || bpm <= 0 || prefersReducedMotion) {
      groupRef.current.scale.set(1, 1, 1);
      return;
    }

    const elapsed = clock.getElapsedTime();
    const freq = (bpm / 60) * 2 * Math.PI;
    const pulse = 1.0 + 0.015 * (1 + Math.sin(elapsed * freq));
    groupRef.current.scale.set(pulse, pulse, pulse);
  });

  return <group ref={groupRef}>{children}</group>;
}

/**
 * Live trace preview line and control point markers rendered during trace mode.
 */
function TracePreview({
  points,
}: {
  points: [number, number, number][];
}) {
  const previewGeometry = useMemo(() => {
    if (points.length < 2) return null;
    const vectors = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(vectors, false, 'catmullrom', 0.5);
    return createTaperedTubeGeometry(curve, 48, 0.045, 0.025, 10);
  }, [points]);

  return (
    <group>
      {/* Markers at clicked points */}
      {points.map((pt, idx) => (
        <mesh key={idx} position={pt}>
          <sphereGeometry args={[0.022, 12, 12]} />
          <meshBasicMaterial color={idx === 0 ? '#10b981' : '#38bdf8'} />
        </mesh>
      ))}

      {/* Real-time spline connecting points */}
      {previewGeometry && (
        <mesh geometry={previewGeometry}>
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#38bdf8"
            emissiveIntensity={0.6}
            roughness={0.2}
          />
        </mesh>
      )}
    </group>
  );
}

export function HeartViewer({
  vessels: initialVessels,
  selectedVessel,
  onSelectVessel,
  className = '',
  bpm,
}: HeartViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const heartMeshRef = useRef<THREE.Mesh | null>(null);

  const [resetCount, setResetCount] = useState(0);
  const [hoveredVessel, setHoveredVessel] = useState<VesselId | null>(null);
  const [xRay, setXRay] = useState(false);

  // ?debug detection
  const [isDebugMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).has('debug');
    }
    return false;
  });

  const [debugVessels, setDebugVessels] = useState<Record<VesselId, VesselData> | null>(null);
  const [heartTransform, setHeartTransform] = useState<HeartTransformConfig>(defaultHeartTransform);
  const [normalOffset, setNormalOffset] = useState<number>(0.02);

  // Spline points for all vessels (draft persistence)
  const [allVesselPoints, setAllVesselPoints] = useState<Record<VesselId, [number, number, number][]>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cardiomap_coronary_draft');
        if (saved) return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return {
      lad: vesselsList.find((v) => v.id === 'lad')?.points || [],
      lcx: vesselsList.find((v) => v.id === 'lcx')?.points || [],
      rca: vesselsList.find((v) => v.id === 'rca')?.points || [],
    };
  });

  // Active Tracing State
  const [tracingVessel, setTracingVessel] = useState<VesselId | null>(null);
  const [activeTracePoints, setActiveTracePoints] = useState<[number, number, number][]>([]);

  const effectiveVessels = isDebugMode && debugVessels ? debugVessels : initialVessels;

  const handleResetView = () => {
    setResetCount((c) => c + 1);
  };

  const handleDebugChange = (id: VesselId, data: VesselData) => {
    setDebugVessels((prev) => ({
      ...(prev || effectiveVessels),
      [id]: data,
    }));
  };

  // Trace Tool Handlers
  const handleStartTracing = (vessel: VesselId) => {
    setTracingVessel(vessel);
    setActiveTracePoints([]);
  };

  const handleCancelTracing = useCallback(() => {
    setTracingVessel(null);
    setActiveTracePoints([]);
  }, []);

  const handleFinishTracing = useCallback(() => {
    if (tracingVessel && activeTracePoints.length >= 2) {
      setAllVesselPoints((prev) => {
        const updated = {
          ...prev,
          [tracingVessel]: activeTracePoints,
        };
        try {
          localStorage.setItem('cardiomap_coronary_draft', JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    }
    setTracingVessel(null);
    setActiveTracePoints([]);
  }, [tracingVessel, activeTracePoints]);

  const handleUndoLastPoint = useCallback(() => {
    setActiveTracePoints((pts) => pts.slice(0, -1));
  }, []);

  const handleResetPoints = () => {
    try {
      localStorage.removeItem('cardiomap_coronary_draft');
    } catch {
      // ignore
    }
    setAllVesselPoints({
      lad: vesselsList.find((v) => v.id === 'lad')?.points || [],
      lcx: vesselsList.find((v) => v.id === 'lcx')?.points || [],
      rca: vesselsList.find((v) => v.id === 'rca')?.points || [],
    });
  };

  // Raycast click on heart surface during trace mode
  const handleMeshPointerDown = (point: THREE.Vector3, normal?: THREE.Vector3) => {
    if (!tracingVessel) return;
    const norm = normal || new THREE.Vector3(0, 0, 1);
    const offsetPoint: [number, number, number] = [
      Number((point.x + norm.x * normalOffset).toFixed(3)),
      Number((point.y + norm.y * normalOffset).toFixed(3)),
      Number((point.z + norm.z * normalOffset).toFixed(3)),
    ];
    setActiveTracePoints((prev) => [...prev, offsetPoint]);
  };

  // Snap existing control points to outer mesh surface
  const handleSnapToSurface = () => {
    if (!heartMeshRef.current) return;
    const mesh = heartMeshRef.current;
    const raycaster = new THREE.Raycaster();

    const snapped: Record<VesselId, [number, number, number][]> = { ...allVesselPoints };
    (Object.keys(allVesselPoints) as VesselId[]).forEach((vid) => {
      const pts = allVesselPoints[vid];
      snapped[vid] = pts.map((p) => {
        const v = new THREE.Vector3(p[0], p[1], p[2]);
        const dir = new THREE.Vector3(0, 0, 0).sub(v).normalize();
        const origin = v.clone().addScaledVector(dir, -0.6);
        raycaster.set(origin, dir);
        const hits = raycaster.intersectObject(mesh, false);
        if (hits.length > 0) {
          const hit = hits[0];
          const hitNorm = hit.face?.normal || new THREE.Vector3(0, 0, 1);
          const newPt = hit.point.clone().addScaledVector(hitNorm, normalOffset);
          return [
            Number(newPt.x.toFixed(3)),
            Number(newPt.y.toFixed(3)),
            Number(newPt.z.toFixed(3)),
          ];
        }
        return p;
      });
    });

    setAllVesselPoints(snapped);
    try {
      localStorage.setItem('cardiomap_coronary_draft', JSON.stringify(snapped));
    } catch {
      // ignore
    }
  };

  // Keyboard shortcut listener for tracing
  useEffect(() => {
    if (!tracingVessel) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelTracing();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleFinishTracing();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleUndoLastPoint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracingVessel, handleCancelTracing, handleFinishTracing, handleUndoLastPoint]);

  // Active vessel to display in info tooltip (hovered takes precedence, then selected)
  const activeVesselId = hoveredVessel || selectedVessel;
  const activeVesselConfig: VesselConfig | undefined = useMemo(() => {
    return vesselsList.find((v) => v.id === activeVesselId);
  }, [activeVesselId]);

  const activeVesselData = activeVesselId ? effectiveVessels[activeVesselId] : null;
  const activeEvaluation = useMemo(() => {
    return evaluateVesselColor(activeVesselData);
  }, [activeVesselData]);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className={`flex flex-col gap-4 w-full ${className}`}>
      {/* 3D Viewport Box */}
      <div
        className="relative w-full h-[520px] md:h-[580px] bg-gradient-to-b from-[#060a12] via-[#0b1220] to-[#060a12] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl"
        onDoubleClick={() => {
          if (tracingVessel) handleFinishTracing();
        }}
      >
        {/* Top-Left: Viewport Instructions and Title */}
        <div className="absolute top-4 left-4 z-10 bg-slate-900/85 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-700/60 shadow-lg pointer-events-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            3D Coronary Anatomy Model
          </div>
          <p className="text-[11px] text-slate-300">
            Rotate: <span className="text-slate-400">Left Click + Drag</span> &bull; Zoom: <span className="text-slate-400">Scroll</span> &bull; Pan: <span className="text-slate-400">Right Click</span>
          </p>
        </div>

        {/* Top-Right: Toolbar Buttons (X-Ray + Reset) */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setXRay(!xRay)}
            aria-label="Toggle X-ray semi-transparent view"
            className={`flex items-center gap-1.5 px-3 py-1.5 backdrop-blur-md rounded-lg border text-xs font-medium transition shadow-lg ${
              xRay
                ? 'bg-sky-600/90 text-white border-sky-400'
                : 'bg-slate-900/85 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>{xRay ? 'X-Ray Active' : 'X-Ray View'}</span>
          </button>
          <button
            onClick={handleResetView}
            aria-label="Reset 3D camera viewpoint"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md text-slate-300 hover:text-white rounded-lg border border-slate-700/60 text-xs font-medium transition shadow-lg"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Reset View</span>
          </button>
        </div>

        {/* Floating Active Vessel Tooltip (Hover / Selection) */}
        {activeVesselConfig && (
          <div
            className="absolute top-16 left-4 z-10 max-w-xs bg-slate-950/90 backdrop-blur-xl p-3 rounded-xl border shadow-2xl transition-all duration-200 pointer-events-none"
            style={{ borderColor: activeEvaluation.hex }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: activeEvaluation.hex }}
                />
                {activeVesselConfig.displayName}
              </span>
              <span
                className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
                style={{
                  color: activeEvaluation.hex,
                  backgroundColor: `${activeEvaluation.hex}20`,
                }}
              >
                {activeVesselData && activeVesselData.probability !== null
                  ? `${(activeVesselData.probability * 100).toFixed(1)}%`
                  : 'No prediction yet'}
              </span>
            </div>

            <div className="text-[11px] font-medium text-slate-300 mb-1.5">
              Status:{' '}
              <span style={{ color: activeEvaluation.hex }}>
                {activeEvaluation.label}
              </span>{' '}
              <span className="text-slate-500 font-mono text-[10px]">
                (cutoff t = {(activeEvaluation.t * 100).toFixed(1)}%)
              </span>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-1.5">
              {activeVesselConfig.description}
            </p>
          </div>
        )}

        {/* Bottom-Left: Mandatory Illustrative Notice & Model Attribution */}
        <div className="absolute bottom-4 left-4 z-10 text-[11px] text-slate-300 bg-slate-950/90 px-3.5 py-2.5 rounded-xl border border-slate-800/80 backdrop-blur-md max-w-lg shadow-lg flex items-start gap-2.5 pointer-events-auto">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-400">Illustrative anatomy, not patient imaging.</div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Coronary geometries depict stylized canonical perfusion tracts. Vessel coloring reflects screening probability models. Click a vessel to highlight; click background to deselect.
            </p>
            <div className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-1 flex flex-col gap-0.5">
              <span className="font-medium text-slate-300">
                Heart model by Hannah Newey, University of Dundee (CAHID), CC BY-NC-SA 4.0
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Adapted from &ldquo;Cardiac Anatomy: Coronary arteries of the heart&rdquo; (CC BY-NC-SA 4.0)
              </span>
            </div>
          </div>
        </div>

        {/* Three.js Canvas */}
        <Canvas
          camera={{ position: INITIAL_CAMERA_POS, fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
          onPointerMissed={() => {
            if (!tracingVessel) onSelectVessel(null);
          }}
        >
          {/* Lighting Rig: Key, Fill, Rim Light */}
          <ambientLight intensity={0.65} />
          {/* Key light: bright anterior/superior from top right */}
          <directionalLight position={[4, 6, 5]} intensity={1.5} />
          {/* Fill light: softer cool fill from opposite side */}
          <directionalLight position={[-4, -2, 3]} intensity={0.5} color="#93c5fd" />
          {/* Subtle Rim light: sharp backlight from behind */}
          <directionalLight position={[0, 4, -5]} intensity={0.8} color="#e0f2fe" />

          {/* Soft Contact Shadow */}
          <ContactShadows
            position={[0, -1.25, 0]}
            opacity={0.45}
            scale={3.5}
            blur={2.2}
            far={3.0}
          />

          {/* Camera Animation Rig */}
          <CameraRig
            selectedVessel={selectedVessel}
            resetCount={resetCount}
            controlsRef={controlsRef}
            allVesselPoints={allVesselPoints}
          />

          {/* Cardiac Model & Vessel Geometry (wrapped in pulsing group when bpm is active) */}
          <PulsingHeartGroup bpm={bpm}>
            {/* 3D Heart Body with Meshopt Loading & Procedural Fallback */}
            <HeartBody
              xRay={xRay}
              transform={heartTransform}
              onMeshPointerDown={handleMeshPointerDown}
              meshRef={heartMeshRef}
            />

            {/* Epicardial Coronary Vessels */}
            {vesselsList.map((cfg) => (
              <CoronaryArteryMesh
                key={cfg.id}
                config={cfg}
                data={effectiveVessels[cfg.id]}
                selected={selectedVessel === cfg.id}
                hovered={hoveredVessel === cfg.id}
                onSelect={() => onSelectVessel(selectedVessel === cfg.id ? null : cfg.id)}
                onHover={(hov) => setHoveredVessel(hov ? cfg.id : null)}
                overridePoints={allVesselPoints[cfg.id]}
              />
            ))}

            {/* Live Trace Markers & Spline Preview during debug trace mode */}
            {tracingVessel && activeTracePoints.length > 0 && (
              <TracePreview points={activeTracePoints} />
            )}
          </PulsingHeartGroup>

          {/* Orbit Controls with Damping, Zoom Limits, and Auto-Rotation */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan={!tracingVessel}
            enableZoom
            enableRotate
            enableDamping
            dampingFactor={0.05}
            minDistance={1.8}
            maxDistance={5.5}
            autoRotate={!prefersReducedMotion && !tracingVessel}
            autoRotateSpeed={0.6}
          />
        </Canvas>
      </div>

      {/* External Keyboard-Accessible Vessel Selector List */}
      <VesselList
        configs={vesselsList}
        vessels={effectiveVessels}
        selectedVessel={selectedVessel}
        onSelectVessel={onSelectVessel}
      />

      {/* Dynamic Color Legend */}
      <VesselLegend vessels={effectiveVessels} />

      {/* Optional Dev Debug & Surface Tracing Panel (?debug) */}
      {isDebugMode && (
        <DevDebugPanel
          vessels={effectiveVessels}
          onChangeVesselData={handleDebugChange}
          tracingVessel={tracingVessel}
          onStartTracing={handleStartTracing}
          onCancelTracing={handleCancelTracing}
          onFinishTracing={handleFinishTracing}
          onUndoLastPoint={handleUndoLastPoint}
          tracePointsCount={activeTracePoints.length}
          allVesselPoints={allVesselPoints}
          normalOffset={normalOffset}
          onChangeNormalOffset={setNormalOffset}
          onSnapToSurface={handleSnapToSurface}
          heartTransform={heartTransform}
          onChangeHeartTransform={setHeartTransform}
          onResetPoints={handleResetPoints}
        />
      )}
    </div>
  );
}

export default HeartViewer;
