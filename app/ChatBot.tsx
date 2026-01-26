import React, { useState, useRef, useEffect } from 'react';

interface ChatBotProps {
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ChatBot({ isLoading, setIsLoading }: ChatBotProps) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: 'ai', text: '안녕하세요! 무엇이든 물어보세요.' }
  ]);
  const [inputValue, setInputValue] = useState("");
  
  // 자동 스크롤을 위한 참조(Ref) 추가
  const scrollRef = useRef<HTMLDivElement>(null);

  // 메시지가 추가될 때마다 바닥으로 스크롤 내리기
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMsg = { role: 'user', text: inputValue };
    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      const N8N_WEBHOOK_URL = "https://gilhwan0525.app.n8n.cloud/webhook/Aha";
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatInput: inputValue }),
    });

      if (!response.ok) throw new Error("네트워크 응답이 좋지 않습니다.");

        const data = await response.json();
        console.log("n8n에서 온 데이터:", data); // Array(1) 확인용

        // 1. 배열 형태인지 확인하고 첫 번째 항목을 가져옵니다.
        const result = Array.isArray(data) ? data[0] : data;

        // 2. 만약 n8n에서 'error' 필드가 왔다면 raw_text를 보여주도록 방어 코드를 짭니다.
        const finalMessage = result.explanation_text || result.raw_text || "응답 내용이 비어있습니다.";

        setMessages(prev => [...prev, { 
        role: 'ai', 
        text: finalMessage 
        }]);
        // 파싱 실패 시에도 텍스트가 나올 수 있도록 fallback 설정
        const textToDisplay = result.explanation_text || result.raw_text || "답변을 가져오지 못했습니다.";


        console.log("n8n에서 온 데이터:", data);

        // 3. 머메이드 코드는 나중에 렌더링을 위해 콘솔에만 찍어둡니다.
        if (result.mermaid_code) {
        console.log("받은 머메이드 코드:", result.mermaid_code);
        }

    } catch (error) {
      console.error("n8n 연결 에러:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "연결에 실패했어요. n8n 서버를 확인해주세요!" }]);
    } finally {
      setIsLoading(false);
    }
  };
return (
    <div style={{
      width: '120%',            // 모바일에서 양옆에 약간의 여백을 줌
      maxWidth: '1500px',
      height: '90vh',          // 고정 px 대신 화면 높이의 80%를 사용 (중요!)
      maxHeight: '800px',      // 너무 커지지 않게 최대치만 제한
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(15px)',
      borderRadius: '20px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden',
      pointerEvents: 'auto',
      boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
      color: 'white',
      margin: '0 auto'         // 화면 가운데 정렬
    }}>

  {/* --- 왼쪽 사이드바 추가 --- */}
  <div style={{
    width: '10vw',
    minWidth: '30px',    // 너무 작아지지는 않게 최소치만 설정
    background: 'rgba(0, 0, 0, 0.2)',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    flexShrink: 0 // 사이드바 크기 고정
  }}>
    <button style={{
      padding: '12px', background: '#007AFF', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', marginBottom: '10px'
    }}>+ 새 대화</button>
    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>최근 대화</div>
    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
      임시 대화 기록 1
    </div>
  </div>


      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* 헤더 */}
      <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', textAlign: 'center' }}>
        AHA! 학습 코치 (n8n 연결됨)
      </div>

{/* 메시지창 - scrollRef 연결 */}
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          padding: '15px', // 패딩 약간 축소
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px' // 간격 미세 조정
        }}
      >
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            background: msg.role === 'user' ? '#007AFF' : 'rgba(36, 36, 36, 0.9)',
            padding: '10px 14px', // 모바일 가독성을 위해 패딩 최적화
            borderRadius: '18px',
            borderBottomRightRadius: msg.role === 'user' ? '4px' : '18px',
            borderBottomLeftRadius: msg.role === 'ai' ? '4px' : '18px',
            maxWidth: '90%', // 모바일에서 너무 좁지 않게 확장
            fontSize: '1rem', // 표준 크기로 조정
            lineHeight: '1.5', // 가독성 향상
            wordBreak: 'break-word' // 긴 단어 깨짐 방지
          }}>
            {msg.text}
          </div>
        ))}
        {isLoading && (
          <div style={{ 
            opacity: 0.5, 
            fontSize: '0.85rem', 
            paddingLeft: '5px' 
          }}>
            AI가 생각 중입니다...
          </div>
        )}
      </div>

      {/* 입력창 영역 */}
      <div style={{ 
        padding: '12px 15px', // 위아래 여백 최적화
        background: 'rgba(0,0,0,0.2)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        width: '100%',        // 부모 너비에 맞춤
        boxSizing: 'border-box' // 패딩이 너비에 포함되도록 설정 (매우 중요!)
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%'}}>
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder={isLoading ? "생각 중..." : "메시지 입력..."}
            disabled={isLoading}
            style={{ 
              flex: 1, 
              minWidth: 0,     // flex 아이템이 부모를 뚫고 나가는 현상 방지
              padding: '12px 16px', // 모바일에서 너무 크지 않게 조정
              background: 'rgba(255,255,255,0.1)', 
              border: 'none', 
              borderRadius: '12px',
              color: 'white', 
              fontSize: '1rem', // 모바일 자동 줌 방지를 위해 1rem 유지
              outline: 'none',
              WebkitAppearance: 'none' // iOS 입력창 기본 스타일 제거
            }}
          />
          
          <button 
            onClick={handleSend}
            disabled={isLoading}
            style={{
              padding: '12px 18px',
              background: isLoading ? 'rgba(255,255,255,0.1)' : '#007AFF',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '60px' // 버튼이 너무 작아지지 않게 고정
            }}
          >
            {isLoading ? "..." : "전송"}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}