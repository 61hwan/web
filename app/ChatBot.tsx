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
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: data.output || data.response || "응답을 처리할 수 없습니다." 
      }]);

    } catch (error) {
      console.error("n8n 연결 에러:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "연결에 실패했어요. n8n 서버를 확인해주세요!" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '1000px',
      height: '800px',
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(15px)',
      borderRadius: '28px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      pointerEvents: 'auto',
      boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
      color: 'white'
    }}>
      {/* 헤더 */}
      <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', textAlign: 'center' }}>
        AHA! 학습 코치 (n8n 연결됨)
      </div>

      {/* 메시지창 - scrollRef 연결 */}
      <div 
        ref={scrollRef}
        style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            background: msg.role === 'user' ? '#007AFF' : 'rgba(255,255,255,0.13)',
            padding: '12px 18px',
            borderRadius: '18px',
            borderBottomRightRadius: msg.role === 'user' ? '4px' : '18px',
            borderBottomLeftRadius: msg.role === 'ai' ? '4px' : '18px',
            maxWidth: '85%',
            fontSize: '1.1rem',
            lineHeight: '1.4'
          }}>
            {msg.text}
          </div>
        ))}
        {isLoading && <div style={{ opacity: 0.5, fontSize: '0.9rem' }}>AI가 생각 중입니다...</div>}
      </div>

      {/* 입력창 영역 */}
      <div style={{ padding: '20px', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder={isLoading ? "생각 중..." : "질문을 입력하세요..."}
            disabled={isLoading}
            style={{ 
              flex: 1, 
              padding: '15px 20px', 
              background: 'rgba(255,255,255,0.1)', 
              border: 'none', 
              borderRadius: '12px',
              color: 'white', 
              fontSize: '1.1rem',
              outline: 'none'
            }}
          />
          
          <button 
            onClick={handleSend}
            disabled={isLoading}
            style={{
              padding: '15px 20px',
              background: isLoading ? 'rgba(255,255,255,0.1)' : '#007AFF',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isLoading ? "..." : "전송"}
          </button>
        </div>
      </div>
    </div>
  );
}