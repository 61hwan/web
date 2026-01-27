import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// ==============================================================================
// 0. [타입 정의]
// ==============================================================================
interface Message {
  role: string;
  text: string;
}

interface ChatItem {
  id: number;
  title: string;
  messages: Message[];
}

interface ChatBotProps {
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

// ==============================================================================
// 1. [스타일 정의] (기존과 동일)
// ==============================================================================
const theme = {
  container: {
    width: '100%', maxWidth: '1550px', height: '90vh', maxHeight: '800px',
    background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(15px)',
    borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex', flexDirection: 'row' as const, overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)', color: 'white', margin: '20px auto',boxSizing: 'border-box' as const, // 패딩 포함해서 크기 계산 (필수)
    minWidth: 0              // 좁은 화면에서 입력창이 무조건 줄어들게 허용 (중요)
  },
  sidebar: {
    width: '25%',            // 고정 px 대신 % 사용 (전체 화면의 1/4)
    maxWidth: '240px',       // 대신 PC에서 너무 커지면 안되니까 최대치 제한
    minWidth: '80px',       // 너무 작아서 글자가 깨지는 것 방지
    background: 'rgba(0, 0, 0, 0.2)', 
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex', 
    flexDirection: 'column' as const, 
    padding: '10px',         // 패딩도 조금 줄임
    flexShrink: 0,            // 사이드바가 찌그러지지 않게 고정
    boxSizing: 'border-box' as const // 패딩이 너비에 포함되도록
  },
  button: {
    padding: '12px', background: '#007AFF', color: 'white', 
    border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',width: '5%',minWidth: '60px'
  },
  bubbleBase: {
    padding: '10px 15px', 
    borderRadius: '18px', 
    maxWidth: '90%',
    fontSize: '1rem', 
    lineHeight: '1.5', 
    wordBreak: 'break-word' as const,
    
    // ▼▼▼ 이 두 줄을 추가해 주세요 ▼▼▼
    width: 'fit-content' as const,    // 내용물 길이에 딱 맞게 박스 축소
    display: 'block' as const         // 내부 요소(마크다운 등)가 박스를 키우지 못하게 방어
  },
  input: {
    flex: 1, 
    padding: '12px 16px', 
    background: 'rgba(255,255,255,0.1)',
    border: 'none', 
    borderRadius: '12px', 
    color: 'white', 
    fontSize: '1rem', 
    outline: 'none',
    
    // ▼▼▼ 이 3줄을 꼭 넣어주세요! (이게 핵심입니다) ▼▼▼
    minWidth: 0,                 // 1. "공간 없으면 0px까지 줄어들어라" (고집 꺾기)
    width: '100%',               // 2. 부모 박스 안에서 꽉 차게
    boxSizing: 'border-box' as const // 3. 패딩 때문에 뚱뚱해지지 않게
  },
  historyItem: {
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    fontSize: '0.85rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transition: 'background 0.2s',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center' // 삭제 버튼 배치를 위해 수정
  }
};

const getStyle = (base: React.CSSProperties, overrides?: React.CSSProperties) => {
  return { ...base, ...overrides };
};

// ==============================================================================
// 2. [API 함수] n8n 통신
// ==============================================================================
async function fetchMessageFromN8N(chatInput: string, sessionId: string) {
  try {
    const N8N_WEBHOOK_URL = "https://gilhwan0525.app.n8n.cloud/webhook/Aha"; // 본인 주소 확인
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      
      // [핵심] sessionId를 같이 보냅니다!
      body: JSON.stringify({ chatInput, sessionId }),
    });

    if (!response.ok) throw new Error("네트워크 응답 실패");

    const data = await response.json();
    const result = Array.isArray(data) ? data[0] : data;
    // n8n AI Agent 응답 필드 (output 또는 text)
    return result.output || result.text || result.explanation_text || "응답 내용이 없습니다.";

  } catch (error) {
    console.error("API 에러:", error);
    throw error;
  }
}

// ==============================================================================
// 3. [메인 컴포넌트] ChatBot
// ==============================================================================
export function ChatBot({ isLoading, setIsLoading }: ChatBotProps) {

  // [1] 대화 기록 State (초기값: 로컬 스토리지에서 불러오기)
  const [chatHistory, setChatHistory] = useState<ChatItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aha_chat_history');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: '안녕하세요! 시작해야하는 프로젝트나 해결하고 싶은 문제를 적어주세요.' }
  ]);
  const [inputValue, setInputValue] = useState("");
  // 현재 대화방 ID (없으면 현재 시간으로 생성)
  const [activeSessionId, setActiveSessionId] = useState<string>(() => String(Date.now()));
  const scrollRef = useRef<HTMLDivElement>(null);

  // [2] chatHistory가 변할 때마다 로컬 스토리지에 자동 저장
  useEffect(() => {
    localStorage.setItem('aha_chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  // 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);


  // [핵심] 중복 방지 및 새 대화 로직
  // [3] 새 대화 시작 (ID 새로 발급)
  const handleNewChat = () => {
    if (messages.length <= 1) {
      setMessages([{ role: 'ai', text: '안녕하세요! 새로운 대화를 시작합니다.' }]);
      return;
    }

    const currentTitle = messages.find(m => m.role === 'user')?.text.substring(0, 15) || "새 대화";
    const newId = String(Date.now());
    setActiveSessionId(newId);
    
    if (chatHistory.length > 0 && chatHistory[0].title === currentTitle) {
      setMessages([{ role: 'ai', text: '안녕하세요! 새로운 대화를 시작합니다.' }]);
      return; 
    }

    const newHistoryItem: ChatItem = {
      id: Number(activeSessionId), // 현재 세션 ID로 저장
      title: currentTitle,
      messages: [...messages]
    };

    setChatHistory(prev => [newHistoryItem, ...prev]);
    
    // 리셋
    setMessages([{ role: 'ai', text: '안녕하세요! 새로운 대화를 시작합니다.' }]);
    setInputValue("");
    setActiveSessionId(String(Date.now())); // ★ 새 ID 발급
  };

  // 기록 삭제
  const deleteChat = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setChatHistory(prev => prev.filter(chat => chat.id !== id));
  };

  // 대화 불러오기 (ID 교체)
  const loadChat = (historyMessages: Message[], id: number) => {
    setMessages(historyMessages);
    setActiveSessionId(String(id)); // 클릭한 방의 ID로 교체!
  };

  // 메시지 전송
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const currentInput = inputValue;
    const currentId = activeSessionId; // 현재 ID 캡처

    setMessages(prev => [...prev, { role: 'user', text: currentInput }]);
    setInputValue("");
    setIsLoading(true);

    try {
      const aiResponseText = await fetchMessageFromN8N(currentInput, currentId);
      setMessages(prev => [...prev, { role: 'ai', text: aiResponseText }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: "연결에 실패했어요." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={getStyle(theme.container)}>
      
      {/* --- 왼쪽 사이드바 --- */}
      <div style={getStyle(theme.sidebar)}>
        <button 
          onClick={handleNewChat}
          style={getStyle(theme.button, { marginBottom: '20px', width: '100%' })}
        >
          + 새 대화 시작
        </button>
        
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>최근 대화</div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {chatHistory.length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: '10px' }}>
              기록이 없습니다.
            </div>
          ) : (
            chatHistory.map((chat) => (
              <div 
                key={chat.id}
                onClick={() => loadChat(chat.messages, chat.id)}
                style={getStyle(theme.historyItem)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                  📄 {chat.title}
                </span>
                {/* 삭제 버튼 (X) */}
                <span 
                  onClick={(e) => deleteChat(e, chat.id)}
                  style={{ color: 'rgba(255,255,255,0.3)', padding: '0 5px', fontSize: '10px',  }}
                >
                  ✕
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- 오른쪽 채팅 영역 --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', textAlign: 'center' }}>
          AHA! 학습 코치
        </div>

        <div ref={scrollRef} style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div key={i} style={getStyle(theme.bubbleBase, {
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                background: isUser ? '#007AFF' : 'rgba(36, 36, 36, 0.9)',
                borderBottomRightRadius: isUser ? '4px' : '18px',
                borderBottomLeftRadius: isUser ? '18px' : '4px'
              })}>
                {/* 텍스트 줄바꿈 처리 (중요) */}
                {/* 2. 일반 텍스트 대신 ReactMarkdown 사용 */}
              {isUser ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              ) : (
                <div className="markdown-container" style={{ fontSize: '1rem' }}>
                  <ReactMarkdown components={{
                    p: ({node, ...props}) => <p style={{ margin: 0 }} {...props} /> // 위아래 여백 제거!
                  }}>
                    {msg.text}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
          })}
          {isLoading && <div style={{ opacity: 0.5, fontSize: '0.85rem', padding: '10px' }}>AI가 생각 중입니다...</div>}
        </div>

        <div style={{ padding: '12px 18px', background: 'rgba(0,0,0,0.2)', width: '100%', boxSizing: 'border-box' as const }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              placeholder={isLoading ? "생각 중..." : "메시지 입력..."}
              disabled={isLoading}
              style={getStyle(theme.input)} 
            />
        <button 
        onClick={handleSend} 
        disabled={isLoading}
        style={getStyle(theme.button, { 
          background: isLoading ? 'rgba(255,255,255,0.1)' : '#007AFF' 
        })}
      >
        전송
      </button>
          </div>
        </div>

      </div>
    </div>
  );
}