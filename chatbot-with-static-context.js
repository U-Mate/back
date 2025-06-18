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

// 서비스 정보를 로드하여 시스템 프롬프트에 포함
async function loadServiceKnowledgeBase() {
    try {
        // 모든 서비스 정보 로드
        const [services] = await db.execute(`
            SELECT service_name, description, features, usage_guide, category, contact_info
            FROM services 
            ORDER BY category, service_name
        `);

        // FAQ 정보 로드  
        const [faqs] = await db.execute(`
            SELECT question, answer, category, keywords
            FROM faq 
            ORDER BY frequency DESC, category
        `);

        // 시스템 프롬프트용 텍스트 생성
        let knowledgeBase = "\n\n=== UMate 서비스 정보 데이터베이스 ===\n\n";
        
        // 서비스 정보
        knowledgeBase += "📋 제공 서비스 목록:\n";
        let currentCategory = '';
        services.forEach(service => {
            if (service.category !== currentCategory) {
                currentCategory = service.category;
                knowledgeBase += `\n[${service.category}]\n`;
            }
            knowledgeBase += `• ${service.service_name}: ${service.description}\n`;
            if (service.features) {
                knowledgeBase += `  - 주요 기능: ${service.features}\n`;
            }
            if (service.usage_guide) {
                knowledgeBase += `  - 이용 방법: ${service.usage_guide}\n`;
            }
            if (service.contact_info) {
                knowledgeBase += `  - 문의처: ${service.contact_info}\n`;
            }
        });

        // FAQ 정보
        knowledgeBase += "\n❓ 자주 묻는 질문:\n";
        let faqCategory = '';
        faqs.forEach(faq => {
            if (faq.category !== faqCategory) {
                faqCategory = faq.category;
                knowledgeBase += `\n[${faq.category} 관련]\n`;
            }
            knowledgeBase += `Q: ${faq.question}\n`;
            knowledgeBase += `A: ${faq.answer}\n\n`;
        });

        knowledgeBase += "=== 데이터베이스 정보 끝 ===\n\n";
        
        return knowledgeBase;
        
    } catch (error) {
        console.error('서비스 정보 로드 오류:', error);
        return "\n\n※ 현재 서비스 정보를 불러올 수 없습니다.\n\n";
    }
}

// 사용자별 연결 저장
const userConnections = new Map();
let serviceKnowledgeBase = '';

// 서버 시작 시 서비스 정보 로드
loadServiceKnowledgeBase().then(knowledge => {
    serviceKnowledgeBase = knowledge;
    console.log('📚 서비스 지식베이스 로드 완료');
}).catch(console.error);

// 주기적으로 서비스 정보 업데이트 (1시간마다)
setInterval(async () => {
    try {
        serviceKnowledgeBase = await loadServiceKnowledgeBase();
        console.log('🔄 서비스 지식베이스 업데이트됨');
    } catch (error) {
        console.error('지식베이스 업데이트 오류:', error);
    }
}, 60 * 60 * 1000); // 1시간

// GPT-4o mini Realtime WebSocket 챗봇 (정적 컨텍스트)
app.ws('/ws/realtime-chat', (clientWs, req) => {
  const sessionId = req.query.sessionId || `session_${Date.now()}_${Math.random()}`;
  const userId = req.query.userId || null;
  
  console.log(`🔗 새로운 Realtime 연결: ${sessionId}, 사용자: ${userId || '게스트'}`);

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
    
    // 🔥 핵심: 시스템 프롬프트에 전체 서비스 정보 포함
    const systemInstructions = `안녕하세요! 저는 UMate의 AI 어시스턴트입니다.
대학교 서비스와 관련된 모든 질문에 대해 아래 데이터베이스 정보를 바탕으로 정확하고 친근한 답변을 드리겠습니다.

${serviceKnowledgeBase}

답변 지침:
1. 위 데이터베이스 정보를 정확히 활용하여 답변
2. 사용자의 질문과 가장 관련 있는 서비스/FAQ 내용 우선 제공
3. 단계별 이용 방법을 구체적으로 안내
4. 연락처나 추가 정보가 필요한 경우 해당 정보 제공
5. 친근하고 도움이 되는 톤으로 한국어 답변
6. 확실하지 않은 정보는 "정확한 정보는 해당 부서에 문의하세요"라고 안내

사용자가 서비스에 대해 질문하면, 관련된 정보를 찾아서 정확하고 자세히 답변해주세요.`;

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
      message: '유식이(UMate AI)와 연결되었습니다. 대학 서비스에 대해 무엇이든 물어보세요!',
      sessionId: sessionId,
      capabilities: {
        text: true,
        audio: true,
        database: true,
        knowledgeBase: 'loaded'
      }
    }));
  });

  // 나머지 이벤트 핸들러들은 기존과 동일
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
              message: '💡 서비스 지식베이스에서 정보를 찾고 있습니다...'
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
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: data.message
                  }
                ]
              }
            }));

            openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text'],
                instructions: '서비스 지식베이스 정보를 활용하여 한국어로 친근하고 정확한 답변을 해주세요.'
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
                instructions: '서비스 지식베이스를 활용하여 한국어로 음성과 텍스트로 답변해주세요.'
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

// API: 지식베이스 새로고침
app.post('/api/knowledge/refresh', async (req, res) => {
  try {
    serviceKnowledgeBase = await loadServiceKnowledgeBase();
    res.json({
      success: true,
      message: '서비스 지식베이스가 업데이트되었습니다.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '지식베이스 업데이트 중 오류가 발생했습니다.'
    });
  }
});

// API: 현재 지식베이스 확인
app.get('/api/knowledge/status', (req, res) => {
  res.json({
    loaded: !!serviceKnowledgeBase,
    size: serviceKnowledgeBase.length,
    lastUpdated: new Date().toISOString(),
    preview: serviceKnowledgeBase.substring(0, 500) + '...'
  });
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`🚀 UMate 정적 지식베이스 Realtime 챗봇이 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws/realtime-chat`);
  console.log(`🔄 지식베이스 새로고침: POST /api/knowledge/refresh`);
  console.log(`📊 지식베이스 상태: GET /api/knowledge/status`);
  console.log(`📚 시스템 프롬프트에 전체 서비스 정보 포함`);
});

module.exports = app; 