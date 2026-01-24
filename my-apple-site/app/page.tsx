'use client';

import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, ScrollControls, Scroll, useScroll } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useMemo, useRef, useEffect, Suspense } from 'react';

// --------------------------------------------------------
// [1] 셰이더 (GLSL) - 입자의 움직임과 색상을 담당
// --------------------------------------------------------
const vertexShader = `
  uniform float uTime;
  uniform float uScroll;
  uniform vec3 uMouse;
  
  attribute float aRandom;
  varying vec3 vPosition;

  void main() {
    vPosition = position;
    vec3 pos = position;

    // 1. 스크롤 폭발 효과 (Scroll Explosion)
    // 스크롤 값이 커질수록 입자가 사방으로 흩어짐
    float explosion = 1.0 + uScroll * 2.0; 
    pos.x += cos(uTime * 0.5 + pos.y) * explosion * aRandom;
    pos.z += sin(uTime * 0.5 + pos.x) * explosion * aRandom;
    pos.y += sin(uTime * 0.2 + pos.z) * explosion * 0.5;

    // 2. 마우스 인터랙션 (Mouse Repulsion)
    // 마우스와 입자 사이의 거리를 계산
    float dist = distance(pos.xy, uMouse.xy * 4.0);
    // 거리가 가까울수록 강하게 반응 (0.0 ~ 2.0 범위)
    float hover = 1.0 - smoothstep(0.0, 2.0, dist);
    
    // 마우스가 닿으면 입자가 앞으로(z축) 튀어나오고 흔들림
    pos.z += hover * 2.0;
    pos.x += cos(uTime * 5.0) * hover * 0.1;

    // 3. 기본 물결 움직임 (Always Moving)
    pos.y += sin(uTime + pos.x * 2.0) * 0.05;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // 4. 입자 크기 설정
    // 기본 크기 + 랜덤 크기 + 마우스 반응 시 커짐 + 원근감 적용
    gl_PointSize = (30.0 * aRandom + 5.0) * (1.0 + hover) * (1.0 / -mvPosition.z);
  }
`;

const fragmentShader = `
  uniform float uTime;
  varying vec3 vPosition;

  void main() {
    // 입자를 동그랗게 깎기
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard;

    // 색상 그라데이션 (Cyberpunk Blue & Purple)
    vec3 color1 = vec3(0.1, 0.5, 1.0);
    vec3 color2 = vec3(1.0, 0.2, 0.5);
    
    // 위치와 시간에 따라 색이 섞임
    float mixRatio = sin(uTime + vPosition.x + vPosition.y) * 0.5 + 0.5;
    vec3 finalColor = mix(color1, color2, mixRatio);

    gl_FragColor = vec4(finalColor, 0.8);
  }
`;

// --------------------------------------------------------
// [2] 3D 파티클 컴포넌트 (TypeScript 에러 완벽 해결)
// --------------------------------------------------------
function InteractiveParticles() {
  const { scene } = useGLTF('/test_model.glb');
  const scroll = useScroll();
  
  const mouse = useRef({ x: 0, y: 0 });
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);

  // [1] 마우스 감지 (HTML 무시하고 작동)
  useEffect(() => {
    const handleMouseMove = (event: any) => {
      mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const particles = useMemo(() => {
    let sourceMesh: THREE.Mesh | null = null;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!sourceMesh || mesh.geometry.attributes.position.count > sourceMesh.geometry.attributes.position.count) {
          sourceMesh = mesh;
        }
      }
    });

    if (!sourceMesh) return null;

    const sourceGeo = (sourceMesh as THREE.Mesh).geometry;
    const sourcePos = sourceGeo.attributes.position;
    const sourceCount = sourcePos.count;
    
    const particleCount = 40000; 
    const newPositions = new Float32Array(particleCount * 3);
    const newRandoms = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const sourceIndex = Math.floor(Math.random() * sourceCount);
      newPositions[i * 3] = sourcePos.getX(sourceIndex);
      newPositions[i * 3 + 1] = sourcePos.getY(sourceIndex);
      newPositions[i * 3 + 2] = sourcePos.getZ(sourceIndex);
      newRandoms[i] = Math.random();
    }

    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    newGeo.setAttribute('aRandom', new THREE.BufferAttribute(newRandoms, 1));
    
    // 크기 조정
    newGeo.computeBoundingSphere();
    const radius = newGeo.boundingSphere?.radius || 1;
    const scaleFactor = 2.0 / radius;
    newGeo.scale(scaleFactor, scaleFactor, scaleFactor);
    newGeo.center();

    // 🔥 [핵심 수정 1] 아예 데이터 자체를 180도 돌려서 저장합니다.
    // 이제 껍데기를 안 돌려도 모델이 예쁜 각도로 시작합니다.
    newGeo.rotateY(Math.PI); 

    return newGeo;
  }, [scene]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uScroll.value = scroll.offset;
      
      // 🔥 [핵심 수정 2] 마우스 좌표 정상화 (마이너스 제거)
      // 모델 자체가 돌아갔으니 이제 마우스는 그냥 그대로 넣으면 됩니다.
      materialRef.current.uniforms.uMouse.value.lerp(
        new THREE.Vector3(mouse.current.x, mouse.current.y, 0),
        0.1
      );
    }

    if (pointsRef.current) {
      const r = scroll.offset;
      
      // 🔥 [핵심 수정 3] 기본 회전값(Math.PI) 제거
      // 위에서 이미 돌려놨으니, 여기선 0부터 시작하면 됩니다.
      pointsRef.current.rotation.y = r * Math.PI * 2; 
      pointsRef.current.rotation.x = r * Math.PI * 1; 
      pointsRef.current.rotation.z = r * Math.PI * 0.5; 
    }
  });

  if (!particles) return null;

  return (
    <points ref={pointsRef} geometry={particles}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uScroll: { value: 0 },
          uMouse: { value: new THREE.Vector3(0, 0, 0) }
        }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// --------------------------------------------------------
// [3] 메인 페이지 구성
// --------------------------------------------------------
export default function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000000' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 6], fov: 50 }}>
        <color attach="background" args={['#000000']} />

        <ScrollControls pages={3} damping={0.25}>
  
  {/* Suspense로 감싸면 로딩 중에 에러가 안 나고 기다려줍니다 */}
  <Suspense fallback={null}>
     <InteractiveParticles />
  </Suspense>

          {/* HTML 레이어: 글자 내용 */}
          <Scroll html style={{ width: '100%' }}>
            
            {/* [페이지 1] 메인 타이틀 */}
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'white', pointerEvents: 'none' }}>
                <h1 style={{ fontSize: '5rem', fontWeight: '800', letterSpacing: '-0.05em', margin: 0 }}>
                  Gilhwan
                </h1>
                <p style={{ fontSize: '1.2rem', opacity: 0.6, marginTop: '10px' }}>
                  Scroll Down 
                </p>
              </div>
            </div>

            {/* [페이지 2] 소개 (좌측 배치) */}
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', paddingLeft: '15vw' }}>
              <div style={{ color: 'white', pointerEvents: 'none', maxWidth: '600px' }}>
                <h2 style={{ fontSize: '3rem', fontWeight: '700', marginBottom: '20px' }}>
                  뻘짓거리 중
                </h2>
                <p style={{ fontSize: '1.2rem', lineHeight: '1.6', opacity: 0.8 }}>
                  3D 그래픽과 웹 기술을 융합하여<br />
                  웹사이트 만들기.
                </p>
              </div>
            </div>

            {/* [페이지 3] 연락처 (중앙 배치) */}
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <div style={{ textAlign: 'center' }}>
                 <h2 style={{ fontSize: '4rem', color: '#4facfe', fontWeight: '900' }}>
                   이제 이 사이트에 어떤 걸 추가할까요??
                 </h2>
                 <p style={{ color: 'white', fontSize: '1.5rem', marginTop: '20px' }}>
                   010-4471-3832
                 </p>
               </div>
            </div>

          </Scroll>
        </ScrollControls>

        {/* 후처리 효과: 뽀샤시한 빛 번짐 (Bloom) */}
        <EffectComposer>
          <Bloom 
            luminanceThreshold={0.2} 
            mipmapBlur 
            intensity={1.2} 
            radius={0.6} 
          />
        </EffectComposer>

      </Canvas>
    </div>
  );
}