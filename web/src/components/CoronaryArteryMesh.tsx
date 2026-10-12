import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VesselConfig, VesselData } from '../types/viewer';
import { evaluateVesselColor } from '../utils/vesselColors';

interface CoronaryArteryMeshProps {
  config: VesselConfig;
  data: VesselData;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}

export function CoronaryArteryMesh({
  config,
  data,
  selected,
  hovered,
  onSelect,
  onHover,
}: CoronaryArteryMeshProps) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Compute curve from points once
  const curve = useMemo(() => {
    const vectors = config.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(vectors, false, 'catmullrom', 0.5);
  }, [config.points]);

  // Main tube geometry
  const tubeGeometry = useMemo(() => {
    return new THREE.TubeGeometry(curve, 64, config.radius, 12, false);
  }, [curve, config.radius]);

  // Selection outline/halo tube geometry
  const glowGeometry = useMemo(() => {
    return new THREE.TubeGeometry(curve, 64, config.radius * 1.5, 12, false);
  }, [curve, config.radius]);

  // Target color evaluation from current data
  const evaluation = useMemo(() => evaluateVesselColor(data), [data]);
  const targetColor = useMemo(() => new THREE.Color(evaluation.hex), [evaluation.hex]);

  // Smooth per-frame color and glow interpolation (no allocations in loop)
  useFrame((_, delta) => {
    if (materialRef.current) {
      // Lerp base color towards evaluated target color
      materialRef.current.color.lerp(targetColor, Math.min(1, delta * 6));

      // Emissive highlights
      const emissiveIntensity = selected ? 0.75 : hovered ? 0.45 : 0.2;
      materialRef.current.emissive.lerp(targetColor, Math.min(1, delta * 6));
      materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        emissiveIntensity,
        Math.min(1, delta * 8)
      );
    }

    if (glowMaterialRef.current && (selected || hovered)) {
      glowMaterialRef.current.color.lerp(targetColor, Math.min(1, delta * 6));
    }
  });

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        onHover(true);
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
        onHover(false);
      }}
    >
      {/* Outer Glow Tube for Selected or Hovered state */}
      {(selected || hovered) && (
        <mesh geometry={glowGeometry}>
          <meshBasicMaterial
            ref={glowMaterialRef}
            color={evaluation.hex}
            transparent
            opacity={selected ? 0.35 : 0.2}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Main Coronary Tube */}
      <mesh geometry={tubeGeometry}>
        <meshStandardMaterial
          ref={materialRef}
          color={evaluation.hex}
          roughness={0.25}
          metalness={0.35}
          emissive={evaluation.hex}
          emissiveIntensity={selected ? 0.75 : 0.2}
        />
      </mesh>
    </group>
  );
}
