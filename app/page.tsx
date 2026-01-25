'use client';

import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, ScrollControls, Scroll, useScroll } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useMemo, useRef, useEffect, Suspense, useState} from 'react';
import { ChatBot } from './ChatBot';

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
    float explosion = 0.5 + uScroll * 3.0; 
    pos.x += cos(uTime * 0.5 + pos.y) * explosion * aRandom;
    pos.z += sin(uTime * 0.5 + pos.x) * explosion * aRandom;
    pos.y += sin(uTime * 0.2 + pos.z) * explosion * 0.5;

    // 2. 마우스 인터랙션 (Mouse Repulsion)
    // 마우스와 입자 사이의 거리를 계산
    float dist = distance(pos.xy, uMouse.xy * 4.0);
    // 거리가 가까울수록 강하게 반응 (0.0 ~ 2.0 범위)
    float hover = 1.0 - smoothstep(0.0, 1.5, dist);
    
    // 마우스가 닿으면 입자가 앞으로(z축) 튀어나오고 흔들림
    pos.z += hover * 1.0;
    pos.x += cos(uTime * 1.0) * hover * 0.5;

    // 3. 기본 물결 움직임 (Always Moving)
    pos.y += sin(uTime + pos.x * 1.5) * 0.1;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // 4. 입자 크기 설정
    // 기본 크기 + 랜덤 크기 + 마우스 반응 시 커짐 + 원근감 적용
    gl_PointSize = (30.0 * aRandom + 5.0) * (1.0 + hover) * (1.0 / -mvPosition.z);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColor1; // 리액트에서 전달받을 첫 번째 색상
  uniform vec3 uColor2; // 리액트에서 전달받을 두 번째 색상
  varying vec3 vPosition;

void main() {
    // 1. 입자를 동그랗게 깎기
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard;

    // 2. 입자마다 고유한 랜덤 시드 생성
    float randomSeed = fract(sin(dot(vPosition.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    
    // 3. 시간과 랜덤값을 섞어 반짝임 비율 계산 (중복 제거)
    float mixRatio = sin(uTime * 0.5 + randomSeed * 10.0) * 0.5 + 0.5;
    
    // 4. 리액트에서 넘겨준 두 색상을 비율에 따라 섞기
    vec3 finalColor = mix(uColor1, uColor2, mixRatio);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// --------------------------------------------------------
// [2] 3D 파티클 컴포넌트 (TypeScript 에러 완벽 해결)
// --------------------------------------------------------
export function InteractiveParticles({ modelPath, isLoading, color1, color2 }: any) {
  const { scene } = useGLTF(modelPath) as any;
  const scroll = useScroll();
  const mouse = useRef({ x: 0, y: 0 });
  
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);


  // 🌟 [추가] 모델이 바뀔 때마다 입자 데이터를 새로 추출합니다.
  const { positions, count } = useMemo(() => {

    const tempPositions: number[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh) {
        const pos = child.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
          tempPositions.push(pos[i], pos[i + 1], pos[i + 2]);
        }
      }
    });
    return {
      positions: new Float32Array(tempPositions),
      count: tempPositions.length / 3
    };
  }, [scene]); // 👈 scene(모델)이 바뀌면 다시 계산!


  // 1. 셰이더용 Uniforms 설정 (메모리 효율을 위해 useMemo 사용)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uMouse: { value: new THREE.Vector3(0, 0, 0) },
    uColor1: { value: color1 },
    uColor2: { value: color2 },
  }), []);

  // 2. 부모의 색상(color1, color2)이 바뀌면 셰이더 값에 즉시 복사
  useEffect(() => {
    if (uniforms) {
      uniforms.uColor1.value.copy(color1);
      uniforms.uColor2.value.copy(color2);
    }
  }, [color1, color2, uniforms]);

  // 3. 마우스 감지
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 4. 파티클 지오메트리 생성 (모델 추출 및 회전)
  const particles = useMemo(() => {
    let sourceMesh: THREE.Mesh | null = null;
    scene.traverse((child: any) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!sourceMesh || mesh.geometry.attributes.position.count > sourceMesh.geometry.attributes.position.count) {
          sourceMesh = mesh;
        }
      }
    });

    if (!sourceMesh) return null;
   const sourceGeo = (sourceMesh as THREE.Mesh).geometry as THREE.BufferGeometry;
    const sourcePos = sourceGeo.attributes.position;
    const sourceCount = sourcePos.count;
    const particleCount = 20000; 
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
    
    newGeo.computeBoundingSphere();
    const radius = newGeo.boundingSphere?.radius || 1;
    const scaleFactor = 3.0 / radius;
    newGeo.scale(scaleFactor, scaleFactor, scaleFactor);
    newGeo.center();
    newGeo.rotateY(Math.PI); // 모델 180도 회전

    return newGeo;
  }, [scene]);




  // 5. 매 프레임 애니메이션 처리
  useFrame((state, delta) => {
    if (!pointsRef.current || !materialRef.current) return;

    // 1. [추가] 스크롤에 따른 회전 (가장 중요!)
    // scroll.offset(0~1)에 따라 360도(Math.PI * 2) 회전합니다.
    pointsRef.current.rotation.y = scroll.offset * Math.PI * 1.2
    pointsRef.current.rotation.x = scroll.offset * 0.6;
    pointsRef.current.rotation.z = scroll.offset * 0.6;

    // AI 답변 중(isLoading)일 때 속도 6배 가속 (0.5 -> 3.0)
    const targetSpeed = isLoading ? 2.5 : 0.5;
    materialRef.current.uniforms.uTime.value += delta * targetSpeed;

    // 스크롤 및 마우스 연동
    materialRef.current.uniforms.uScroll.value = scroll.offset;
    materialRef.current.uniforms.uMouse.value.lerp(
      new THREE.Vector3(mouse.current.x, mouse.current.y, 0),
      0.1
    );

    // AI 답변 중일 때 부르르 떠는 진동 효과
    if (isLoading) {
      pointsRef.current.position.x = Math.sin(state.clock.elapsedTime * 3.0) * 0.03;
      pointsRef.current.position.y = Math.cos(state.clock.elapsedTime * 3.0) * 0.03;
    } else {
      pointsRef.current.position.set(0, 0, 0);
    }
  });

  if (!particles) return null;

  return (
  <points ref={pointsRef}>
    <bufferGeometry>
  <bufferAttribute 
    attach="attributes-position"
    count={count}
    array={positions}
    itemSize={3}
    args={[positions, 3]}
  />
</bufferGeometry>
    
    <shaderMaterial
      ref={materialRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
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

  const [models, setModels] = useState<string[]>([]); // 모델 목록 저장
  const [currentIndex, setCurrentIndex] = useState(0); // 현재 몇 번째 모델인지
  const [isLoading, setIsLoading] = useState(false);


 // 1. 페이지 로드 시 public 폴더의 모델 목록 가져오기
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) setModels(data);
      });
  }, []);

  // 2. 다음 모델로 넘기는 함수
  const nextModel = () => {
  console.log("--- 모델 교체 시작 ---");
  console.log("이전 인덱스:", currentIndex);
  console.log("전체 모델 리스트:", models);

  
  setCurrentIndex((prev) => {
    const nextIdx = (prev + 1) % models.length;
    console.log("다음 인덱스(예정):", nextIdx);
    console.log("불러올 경로:", models[nextIdx]);
    return nextIdx;
  });
};

  // 현재 보여줄 모델 경로 (목록이 없으면 기본값 설정)
  const currentModelPath = models[currentIndex] || '/test_model.glb';

  // 1. 색상 상태 관리
  const [color1, setColor1] = useState(new THREE.Color('#1b4d7e'));
  const [color2, setColor2] = useState(new THREE.Color('#0088ff'));

  // 2. 버튼 클릭 시 호출할 함수
  const changeTheme = () => {
    const newHue = Math.random();
    setColor1(new THREE.Color().setHSL(newHue, 0.7, 0.3));
    setColor2(new THREE.Color().setHSL((newHue + 0.2) % 1, 0.7, 0.6));
  };
  
  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative', backgroundColor: '#000' }}>

      <UnifiedButton 
  label={`다음 모델 (${currentIndex + 1}/${models.length})`} 
  onClick={nextModel} 
  style={{ position: 'fixed', top: '85px', right: '30px' }} 
/>


  {/* 1. 고정 버튼 */}
  <UnifiedButton 
  label="테마 변경" 
  onClick={changeTheme} 
  style={{ position: 'fixed', top: '30px', right: '30px' }} 
/>
  <Canvas>
    {/* 2. 파티클 (Suspense로 감싸서 로딩 에러 방지) */}
    <Suspense fallback={null}>

      {/* 3. 스크롤 컨트롤 (pages: 2) */}
      <ScrollControls pages={2} damping={0.25}>

      {currentModelPath && (
        <InteractiveParticles 
          key={currentModelPath}        // 👈 이게 있어야 컴포넌트가 새로고침됩니다.
          modelPath={currentModelPath}  // 👈 대소문자(modelPath) 꼭 확인!
          isLoading={isLoading} 
          color1={color1} 
          color2={color2} 
        />
      )}
    

      <Scroll html style={{ width: '100%' }}>
        
        {/* [페이지 1] 메인 타이틀 */}
        <div id='page-1' style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'white', pointerEvents: 'none' }}>
            <h1 style={{ fontSize: '5rem', fontWeight: '800', margin: 0 }}>AHA! 학습코치</h1>
            <p style={{ fontSize: '1.3rem', opacity: 0.6 }}>Scroll Down</p>
            <div style={{ margin: '15px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div style={{ width: '30px', height: '1px', background: 'white', opacity: 0.2 }}></div>
              <span style={{ fontSize: '0.9rem', opacity: 0.4, fontWeight: '300' }}>or</span>
              <div style={{ width: '30px', height: '1px', background: 'white', opacity: 0.2 }}></div>
            </div>
          </div>
          <PageButton label="시작하기" pageIndex={2} /> {/* pageIndex 1은 2번째 페이지 의미 */}
        </div>

        {/* [페이지 2] 챗봇 영역 */}
        <div id="page-2" style={{ 
          height: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '0 20px',
          position: 'relative',
          zIndex: 10 
        }}>



          {/* 부모의 상태를 ChatBot에도 전달해야 연동됩니다 */}
          <ChatBot isLoading={isLoading} setIsLoading={setIsLoading} />
        </div>

        {/* [페이지 3] 연락처 (중앙 배치) */}
        <div id="page-3" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '4rem', color: '#4facfe', fontWeight: '900' }}>
              현재 안 쓰이는 페이지
            </h2>
            <PageButton label="처음으로" pageIndex={0} />
          </div>
        </div>

      </Scroll>
    </ScrollControls>
  </Suspense>

    {/* 4. 후처리 효과 */}
    <EffectComposer>
      <Bloom 
        luminanceThreshold={0.5} 
        mipmapBlur 
        intensity={0.5} 
        radius={0.6} 
      />
    </EffectComposer>

  </Canvas>
</main> // 👈 div가 아니라 main으로 닫아야 합니다.
  );
}


// 독립된 버튼 컴포넌트
// 1. 버튼 부품 정의 (Props 사용)
interface ButtonProps {
  label: string;       // 버튼에 쓰일 글자
  targetId: string;    // 클릭 시 이동할 위치 (ID)
}

function PageButton({ label, pageIndex }: { label: string, pageIndex: number }) {
  // react-three/drei에서 제공하는 스크롤 상태 제어 도구
  const scroll = useScroll();
  const [isHovered, setIsHovered] = useState(false);

  const goToPage = () => {
    // scroll.el은 ScrollControls가 만든 실제 스크롤 컨테이너입니다.
    // clientHeight(화면 높이)에 페이지 번호를 곱해 정확한 위치를 계산합니다.
    const targetScroll = scroll.el.clientHeight * pageIndex;

    // 브라우저 기본 스크롤이 아닌, 3D 스크롤 박스를 직접 스무스하게 이동시킵니다.
    scroll.el.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  };

  return (
    <button 
      onClick={goToPage}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        marginTop: '10px',
        padding: '12px 35px',
        fontSize: '1rem',
        color: isHovered ? 'black' : 'white',
        background: isHovered ? 'white' : 'transparent',
        border: '1px solid white',
        borderRadius: '30px',
        cursor: 'pointer',
        pointerEvents: 'auto', 
        transition: 'all 0.4s ease',
        zIndex: 1000,
      }}
    >
      {label}
    </button>
  );
}



function UnifiedButton({ label, onClick, style }: any) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        // 1. 기본 위치 및 간격
        padding: '12px 25px',
        fontSize: '0.9rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 9999,
        pointerEvents: 'auto',

        // 2. 색상 및 배경 (질감의 핵심)
        color: isHovered ? '#000' : '#fff',
        background: isHovered ? '#fff' : 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)', // 뒤에 있는 파티클이 은은하게 비침

        // 3. 두께감 표현 (핵심!)
        border: '1px solid rgba(255, 255, 255, 0.3)', // 은은한 흰색 테두리
        borderRadius: '50px',
        boxShadow: isHovered 
          ? '0 10px 20px rgba(0,0,0,0.3)' // 호버 시 붕 뜨는 느낌
          : '0 4px 12px rgba(0,0,0,0.2)',  // 평소의 묵직한 두께감
        ...style // 위치 설정(top, right 등)을 덮어씌울 수 있게 함
      }}
    >
      {label}
    </button>
  );
}