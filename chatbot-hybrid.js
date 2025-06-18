require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const WebSocket = require('ws');
const cors = require('cors');
const mariaDB = require("mysql2/promise");

const app = express();
expressWs(app);

// CORS 설정
app.use(cors({
  origin: [process.env.LOCALHOST, process.env.MY_HOST],
  credentials: true
}));

app.use(express.json());

// 데이터베이스 연결
const db = mariaDB.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_SCHEMA
});

// 사용자별 연결 저장
const userConnections = new Map();

// 🔥 하이브리드 방식: 정적 + 동적 데이터 분리
let staticKnowledgeBase = ''; // 정적 데이터 (자주 안 바뀜)

// 정적 지식베이스 로드 (기본 서비스 정보, FAQ)
async function loadStaticKnowledge() {
    try {
        // 정적 데이터: 기본 서비스 정보 (자주 변하지 않는 정보)
        const [staticServices] = await db.execute(`
            SELECT service_name, description, features, usage_guide, category, contact_info
            FROM services 
            WHERE category IN ('학사관리', '학습지원', '생활편의') 
            AND status = 'active'
            ORDER BY category, service_name
        `);

        // 정적 데이터: 기본 FAQ (자주 변하지 않는 질문들)
        const [staticFaqs] = await db.execute(`
            SELECT question, answer, category, keywords
            FROM faq 
            WHERE category IN ('기본정보', '이용방법', '문의처') 
            AND status = 'active'
            ORDER BY frequency DESC
        `);

        // 시스템 프롬프트용 정적 지식베이스 생성
        let knowledge = "\n\n=== UMate 기본 서비스 정보 ===\n\n";
        
        // 기본 서비스 정보
        knowledge += "📋 기본 서비스 목록:\n";
        let currentCategory = '';
        staticServices.forEach(service => {
            if (service.category !== currentCategory) {
                currentCategory = service.category;
                knowledge += `\n[${service.category}]\n`;
            }
            knowledge += `• ${service.service_name}: ${service.description}\n`;
            if (service.features) {
                knowledge += `  - 주요 기능: ${service.features}\n`;
            }
            if (service.usage_guide) {
                knowledge += `  - 이용 방법: ${service.usage_guide}\n`;
            }
            if (service.contact_info) {
                knowledge += `  - 문의처: ${service.contact_info}\n`;
            }
        });

        // 기본 FAQ
        knowledge += "\n❓ 기본 FAQ:\n";
        let faqCategory = '';
        staticFaqs.forEach(faq => {
            if (faq.category !== faqCategory) {
                faqCategory = faq.category;
                knowledge += `\n[${faq.category}]\n`;
            }
            knowledge += `Q: ${faq.question}\n`;
            knowledge += `A: ${faq.answer}\n\n`;
        });

        knowledge += "=== 기본 정보 끝 ===\n\n";
        
        return knowledge;
        
    } catch (error) {
        console.error('정적 지식베이스 로드 오류:', error);
        return "\n\n※ 기본 서비스 정보를 불러올 수 없습니다.\n\n";
    }
}

// 동적 데이터 검색 함수들
async function searchDynamicServices(query) {
    try {
        // 동적 데이터: 메뉴, 일정, 공지사항 등 (자주 변하는 정보)
        const [rows] = await db.execute(`
            SELECT service_name, description, features, usage_guide, contact_info, updated_at
            FROM services 
            WHERE (category IN ('식당', '이벤트', '공지사항', '임시서비스') 
            OR service_name LIKE '%메뉴%' OR service_name LIKE '%일정%' OR service_name LIKE '%공지%')
            AND status = 'active'
            AND (service_name LIKE ? OR description LIKE ? OR features LIKE ?)
            ORDER BY updated_at DESC
            LIMIT 5
        `, [`%${query}%`, `%${query}%`, `%${query}%`]);
        
        return rows;
    } catch (error) {
        console.error('동적 서비스 검색 오류:', error);
        return [];
    }
}

async function searchDynamicFAQ(topic) {
    try {
        // 동적 FAQ: 최신 공지, 변경사항 등
        const [rows] = await db.execute(`
            SELECT question, answer, category, updated_at
            FROM faq 
            WHERE category IN ('최신공지', '변경사항', '임시안내') 
            AND status = 'active'
            AND (question LIKE ? OR answer LIKE ? OR keywords LIKE ?)
            ORDER BY updated_at DESC, frequency DESC
            LIMIT 3
        `, [`%${topic}%`, `%${topic}%`, `%${topic}%`]);
        
        return rows;
    } catch (error) {
        console.error('동적 FAQ 검색 오류:', error);
        return [];
    }
}

async function getUserContext(userId) {
    if (!userId) return {};
    
    try {
        const [userInfo] = await db.execute(`
            SELECT major, grade, interests, recent_services 
            FROM users 
            WHERE user_id = ?
        `, [userId]);
        
        return userInfo[0] || {};
    } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        return {};
    }
}

// 🎯 하이브리드 컨텍스트 구성 (정적 + 동적)
async function buildHybridContext(userMessage, userId = null) {
    const contexts = [];
    
    // 1. 동적 서비스 정보 검색 (최신 정보)
    const dynamicServices = await searchDynamicServices(userMessage);
    if (dynamicServices.length > 0) {
        contexts.push("📅 최신 서비스 정보:");
        dynamicServices.forEach(service => {
            contexts.push(`- ${service.service_name}: ${service.description}`);
            if (service.features) {
                contexts.push(`  주요 기능: ${service.features}`);
            }
            if (service.usage_guide) {
                contexts.push(`  이용 방법: ${service.usage_guide}`);
            }
            if (service.updated_at) {
                const updateDate = new Date(service.updated_at).toLocaleDateString('ko-KR');
                contexts.push(`  (${updateDate} 업데이트)`);
            }
        });
    }
    
    // 2. 동적 FAQ 검색 (최신 공지사항 등)
    const dynamicFaqs = await searchDynamicFAQ(userMessage);
    if (dynamicFaqs.length > 0) {
        contexts.push("\n📢 최신 공지/변경사항:");
        dynamicFaqs.forEach(faq => {
            contexts.push(`Q: ${faq.question}`);
            contexts.push(`A: ${faq.answer}`);
            if (faq.updated_at) {
                const updateDate = new Date(faq.updated_at).toLocaleDateString('ko-KR');
                contexts.push(`(${updateDate} 업데이트)\n`);
            }
        });
    }
    
    // 3. 사용자 맞춤 정보
    if (userId) {
        const userContext = await getUserContext(userId);
        if (userContext.major) {
            contexts.push(`\n👤 사용자 정보: ${userContext.major} 전공, ${userContext.grade}학년`);
        }
        if (userContext.interests) {
            contexts.push(`관심사: ${userContext.interests}`);
        }
    }
    
    return contexts.length > 0 ? contexts.join('\n') : '';
}

// 서버 시작 시 정적 지식베이스 로드
loadStaticKnowledge().then(knowledge => {
    staticKnowledgeBase = knowledge;
    console.log('📚 정적 지식베이스 로드 완료');
}).catch(console.error);

// 주기적으로 정적 지식베이스 업데이트 (6시간마다)
setInterval(async () => {
    try {
        staticKnowledgeBase = await loadStaticKnowledge();
        console.log('🔄 정적 지식베이스 업데이트됨');
    } catch (error) {
        console.error('지식베이스 업데이트 오류:', error);
    }
}, 6 * 60 * 60 * 1000); // 6시간

// 🚀 하이브리드 GPT-4o mini Realtime WebSocket 챗봇
app.ws('/ws/realtime-chat', (clientWs, req) => {
  const sessionId = req.query.sessionId || `session_${Date.now()}_${Math.random()}`;
  const userId = req.query.userId || null;
  
  console.log(`🔗 하이브리드 연결: ${sessionId}, 사용자: ${userId || '게스트'}`);

  // OpenAI Realtime API 연결
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
    headers: {
      'Authorization': `Bearer ${process.env.CHATBOT_API}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });

  // 연결 저장
  userConnections.set(sessionId, { clientWs, openaiWs, userId });

  // OpenAI 연결 성공 시 세션 설정
  openaiWs.on('open', () => {
    console.log(`OpenAI Realtime API 연결됨: ${sessionId}`);
    
    // 🎯 하이브리드 시스템 프롬프트 (정적 지식베이스 포함)
    const systemInstructions = `안녕하세요! 저는 UMate의 AI 어시스턴트입니다.
대학교 서비스 관련 질문에 대해 다음과 같이 답변합니다:

1. **기본 정보**: 아래 정적 지식베이스의 정보를 활용
2. **최신 정보**: 실시간으로 검색된 동적 정보를 우선 활용
3. **통합 답변**: 정적 + 동적 정보를 종합하여 완전한 답변 제공

${staticKnowledgeBase}

💡 **답변 가이드라인**:
- 최신 정보(동적 데이터)가 제공되면 우선적으로 활용
- 기본 정보(정적 데이터)로 보완 설명
- 업데이트 날짜가 있으면 신뢰성 강조
- 사용자 전공/학년 고려한 맞춤형 조언
- 확실하지 않으면 "최신 정보는 담당 부서에 확인" 안내

실시간 검색으로 제공되는 최신 정보와 위 기본 정보를 결합하여 정확하고 도움되는 답변을 해주세요.`;

    // 세션 설정 (음성 + 텍스트 지원)
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: systemInstructions,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        tools: [],
        tool_choice: 'auto',
        temperature: 0.7,
        max_response_output_tokens: 4096
      }
    }));

    // 클라이언트에 연결 성공 알림
    clientWs.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      message: '하이브리드 유식이(UMate AI)와 연결되었습니다! 기본 정보 + 최신 정보를 함께 제공해드려요!',
      sessionId: sessionId,
      capabilities: {
        text: true,
        audio: true,
        static_knowledge: true,
        dynamic_search: true,
        hybrid_mode: true,
        personalized: !!userId
      }
    }));
  });

  // OpenAI 메시지 처리 (기존과 동일)
  openaiWs.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      
      switch (event.type) {
        case 'session.created':
          console.log('Realtime 세션 생성됨');
          break;

        case 'session.updated':
          console.log('Realtime 세션 업데이트됨');
          break;

        case 'input_audio_buffer.speech_started':
          clientWs.send(JSON.stringify({
            type: 'speech_started',
            message: '🎤 음성을 듣고 있습니다...'
          }));
          break;

        case 'input_audio_buffer.speech_stopped':
          clientWs.send(JSON.stringify({
            type: 'speech_stopped',
            message: '🔄 음성을 처리하고 있습니다...'
          }));
          break;

        case 'conversation.item.input_audio_transcription.completed':
          clientWs.send(JSON.stringify({
            type: 'transcription_complete',
            transcription: event.transcript,
            item_id: event.item_id
          }));
          break;

        case 'conversation.item.created':
          if (event.item.type === 'message' && event.item.role === 'assistant') {
            clientWs.send(JSON.stringify({
              type: 'assistant_message_start',
              message: '🔍 기본 정보 + 최신 정보를 함께 찾고 있습니다...'
            }));
          }
          break;

        case 'response.audio.delta':
          clientWs.send(JSON.stringify({
            type: 'audio_delta',
            audio: event.delta,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.audio_transcript.delta':
          clientWs.send(JSON.stringify({
            type: 'audio_transcript_delta',
            delta: event.delta,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.text.delta':
          clientWs.send(JSON.stringify({
            type: 'text_delta',
            delta: event.delta,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.text.done':
        case 'response.audio_transcript.done':
          clientWs.send(JSON.stringify({
            type: 'text_done',
            text: event.text || event.transcript,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.done':
          clientWs.send(JSON.stringify({
            type: 'response_complete',
            response: event.response
          }));
          break;

        case 'error':
          console.error('OpenAI Realtime API 오류:', event.error);
          clientWs.send(JSON.stringify({
            type: 'error',
            error: event.error.message || '알 수 없는 오류가 발생했습니다.'
          }));
          break;

        default:
          clientWs.send(JSON.stringify({
            type: 'openai_event',
            event: event
          }));
      }
    } catch (error) {
      console.error('OpenAI 메시지 파싱 오류:', error);
    }
  });

  // 클라이언트 메시지 처리
  clientWs.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'user_message':
          // 🔥 핵심: 하이브리드 컨텍스트 구성 (정적 + 동적)
          const dynamicContext = await buildHybridContext(data.message, userId);
          
          if (openaiWs.readyState === WebSocket.OPEN) {
            // 동적 컨텍스트가 있으면 추가, 없으면 정적 지식베이스만 활용
            const enhancedMessage = dynamicContext 
              ? `사용자 질문: "${data.message}"\n\n📋 실시간 검색 결과:\n${dynamicContext}\n\n위 최신 정보와 기본 지식베이스를 함께 활용하여 답변해주세요.`
              : `사용자 질문: "${data.message}"\n\n기본 지식베이스 정보를 활용하여 답변해주세요.`;

            openaiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: enhancedMessage
                  }
                ]
              }
            }));

            openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text'],
                instructions: '하이브리드 정보(기본 + 최신)를 활용하여 한국어로 정확하고 친근한 답변을 해주세요.'
              }
            }));
          }
          break;

        case 'audio_data':
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: data.audio
            }));
          }
          break;

        case 'audio_commit':
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.commit'
            }));

            openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['audio', 'text'],
                instructions: '하이브리드 정보를 활용하여 한국어로 음성과 텍스트로 답변해주세요.'
              }
            }));
          }
          break;

        case 'voice_change':
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'session.update',
              session: {
                voice: data.voice
              }
            }));
          }
          break;

        default:
          console.log('알 수 없는 클라이언트 메시지 타입:', data.type);
      }
    } catch (error) {
      console.error('클라이언트 메시지 파싱 오류:', error);
      clientWs.send(JSON.stringify({
        type: 'error',
        error: '메시지 형식이 올바르지 않습니다.'
      }));
    }
  });

  // 연결 종료 처리
  openaiWs.on('error', (error) => {
    console.error('OpenAI Realtime API 오류:', error);
    clientWs.send(JSON.stringify({
      type: 'error',
      error: 'OpenAI 연결 오류가 발생했습니다.'
    }));
  });

  openaiWs.on('close', () => {
    console.log(`OpenAI Realtime API 연결 종료: ${sessionId}`);
    clientWs.send(JSON.stringify({
      type: 'connection',
      status: 'disconnected',
      message: 'OpenAI 연결이 종료되었습니다.'
    }));
  });

  clientWs.on('close', () => {
    console.log(`클라이언트 연결 종료: ${sessionId}`);
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
    userConnections.delete(sessionId);
  });

  clientWs.on('error', (error) => {
    console.error('클라이언트 WebSocket 오류:', error);
  });
});

// API: 동적 서비스 검색
app.get('/api/services/dynamic', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: '검색어가 필요합니다.' });
    }

    const services = await searchDynamicServices(q);
    res.json({
      success: true,
      query: q,
      type: 'dynamic',
      results: services,
      count: services.length
    });
  } catch (error) {
    res.status(500).json({ error: '동적 서비스 검색 중 오류가 발생했습니다.' });
  }
});

// API: 정적 지식베이스 새로고침
app.post('/api/knowledge/refresh', async (req, res) => {
  try {
    staticKnowledgeBase = await loadStaticKnowledge();
    res.json({
      success: true,
      message: '정적 지식베이스가 업데이트되었습니다.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '지식베이스 업데이트 중 오류가 발생했습니다.'
    });
  }
});

// API: 하이브리드 시스템 상태
app.get('/api/hybrid/status', (req, res) => {
  res.json({
    static_loaded: !!staticKnowledgeBase,
    static_size: staticKnowledgeBase.length,
    dynamic_search: true,
    hybrid_mode: true,
    active_connections: userConnections.size,
    last_updated: new Date().toISOString(),
    capabilities: {
      static_knowledge: true,
      dynamic_search: true,
      user_personalization: true,
      voice_support: true,
      real_time: true
    }
  });
});

// API: 건강 체크
app.get('/api/health', async (req, res) => {
  try {
    // DB 연결 상태 체크
    await db.execute('SELECT 1');
    
    res.json({ 
      status: 'OK', 
      message: 'UMate Hybrid Realtime Chatbot is running',
      mode: 'hybrid',
      activeConnections: userConnections.size,
      database: 'connected',
      static_knowledge: !!staticKnowledgeBase,
      capabilities: {
        text: true,
        audio: true,
        static_db: true,
        dynamic_db: true,
        hybrid: true,
        realtime: true
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Database connection failed',
      database: 'disconnected'
    });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`🚀 UMate 하이브리드 Realtime 챗봇이 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws/realtime-chat`);
  console.log(`🔍 동적 검색 API: GET /api/services/dynamic?q=검색어`);
  console.log(`🔄 정적 지식베이스 새로고침: POST /api/knowledge/refresh`);
  console.log(`📊 하이브리드 상태: GET /api/hybrid/status`);
  console.log(`⚡ 하이브리드 모드: 정적 지식베이스 + 동적 실시간 검색`);
});

module.exports = app; 