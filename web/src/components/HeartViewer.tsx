import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RotateCcw, Info } from 'lucide-react';

import type { VesselId, VesselData, HeartViewerProps, VesselConfig } from '../types/viewer';
import { vesselsList } from '../anatomy';
import { evaluateVesselColor } from '../utils/vesselColors';
import { HeartBody } from './HeartBody';
import { CoronaryArteryMesh } from './CoronaryArteryMesh';
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
}: {
  selectedVessel: VesselId | null;
  resetCount: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const targetCamPos = useRef(new THREE.Vector3(...INITIAL_CAMERA_POS));
  const targetLookAt = useRef(new THREE.Vector3(...INITIAL_TARGET_POS));
  const prevSelected = useRef<VesselId | null>(null);
  const prevReset = useRef(resetCount);

  // Compute desired camera position on selection change or reset
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
          // Target slightly centered towards vessel midpoint
          const midPoint = cfg.points[Math.floor(cfg.points.length / 2)];
          targetLookAt.current.set(midPoint[0] * 0.5, midPoint[1] * 0.5, midPoint[2] * 0.5);
        }
      } else {
        targetCamPos.current.set(...INITIAL_CAMERA_POS);
        targetLookAt.current.set(...INITIAL_TARGET_POS);
      }
    }
  }, [selectedVessel, resetCount]);

  useFrame(({ camera }, delta) => {
    // Smooth camera and controls target lerp
    camera.position.lerp(targetCamPos.current, Math.min(1, delta * 3.5));
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, Math.min(1, delta * 3.5));
      controlsRef.current.update();
    }
  });

  return null;
}

export function HeartViewer({
  vessels: initialVessels,
  selectedVessel,
  onSelectVessel,
  className = '',
}: HeartViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [resetCount, setResetCount] = useState(0);
  const [hoveredVessel, setHoveredVessel] = useState<VesselId | null>(null);

  // State to support ?debug dev sliders overriding vessel inputs
  const [isDebugMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).has('debug');
    }
    return false;
  });
  const [debugVessels, setDebugVessels] = useState<Record<VesselId, VesselData> | null>(null);

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

  // Active vessel to display in info tooltip (hovered takes precedence, then selected)
  const activeVesselId = hoveredVessel || selectedVessel;
  const activeVesselConfig: VesselConfig | undefined = useMemo(() => {
    return vesselsList.find((v) => v.id === activeVesselId);
  }, [activeVesselId]);

  const activeVesselData = activeVesselId ? effectiveVessels[activeVesselId] : null;
  const activeEvaluation = useMemo(() => {
    return evaluateVesselColor(activeVesselData);
  }, [activeVesselData]);

  return (
    <div className={`flex flex-col gap-4 w-full ${className}`}>
      {/* 3D Viewport Box */}
      <div className="relative w-full h-[520px] md:h-[580px] bg-gradient-to-b from-[#060a12] via-[#0b1220] to-[#060a12] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
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

        {/* Top-Right: Reset View Button */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
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

        {/* Bottom-Left: Mandatory Illustrative Notice */}
        <div className="absolute bottom-4 left-4 z-10 text-[11px] text-slate-300 bg-slate-950/90 px-3 py-2 rounded-xl border border-slate-800/80 backdrop-blur-md max-w-md shadow-lg flex items-start gap-2 pointer-events-auto">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-400">Illustrative anatomy, not patient imaging.</span>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Coronary geometries depict stylized canonical perfusion tracts. Vessel coloring reflects screening probability models. Click a vessel to highlight; click background to deselect.
            </p>
          </div>
        </div>

        {/* Three.js Canvas */}
        <Canvas
          camera={{ position: INITIAL_CAMERA_POS, fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
          onPointerMissed={() => onSelectVessel(null)}
        >
          {/* Lighting Rig */}
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 8, 5]} intensity={1.6} />
          <directionalLight position={[-5, -4, -3]} intensity={0.4} color="#38bdf8" />
          <pointLight position={[0, 4, 3]} intensity={0.8} color="#ffffff" />

          {/* Camera Animation Rig */}
          <CameraRig
            selectedVessel={selectedVessel}
            resetCount={resetCount}
            controlsRef={controlsRef}
          />

          {/* 3D Heart Body (Semi-transparent with procedural fallback) */}
          <HeartBody opacity={0.62} />

          {/* Coronary Vessels */}
          {vesselsList.map((cfg) => (
            <CoronaryArteryMesh
              key={cfg.id}
              config={cfg}
              data={effectiveVessels[cfg.id]}
              selected={selectedVessel === cfg.id}
              hovered={hoveredVessel === cfg.id}
              onSelect={() => onSelectVessel(selectedVessel === cfg.id ? null : cfg.id)}
              onHover={(hov) => setHoveredVessel(hov ? cfg.id : null)}
            />
          ))}

          {/* Orbit Controls with Damping and Zoom Limits */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan
            enableZoom
            enableRotate
            enableDamping
            dampingFactor={0.05}
            minDistance={1.8}
            maxDistance={5.5}
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

      {/* Optional Dev Debug Panel (only when ?debug query param present) */}
      {isDebugMode && (
        <DevDebugPanel
          vessels={effectiveVessels}
          onChangeVesselData={handleDebugChange}
        />
      )}
    </div>
  );
}
export default HeartViewer;
