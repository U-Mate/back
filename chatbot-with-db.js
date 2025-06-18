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

// 서비스 정보 검색 함수
async function searchServiceInfo(query) {
    try {
        // 예시: 서비스 정보 테이블에서 검색
        const [rows] = await db.execute(`
            SELECT service_name, description, features, usage_guide, faq 
            FROM services 
            WHERE service_name LIKE ? OR description LIKE ? OR features LIKE ?
            LIMIT 5
        `, [`%${query}%`, `%${query}%`, `%${query}%`]);
        
        return rows;
    } catch (error) {
        console.error('DB 검색 오류:', error);
        return [];
    }
}

// 사용자 맞춤 정보 검색
async function getUserContext(userId) {
    try {
        // 사용자 프로필, 이용 이력 등
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

// 자주 묻는 질문 검색
async function getFAQ(topic) {
    try {
        const [rows] = await db.execute(`
            SELECT question, answer, category 
            FROM faq 
            WHERE question LIKE ? OR category LIKE ?
            ORDER BY frequency DESC
            LIMIT 3
        `, [`%${topic}%`, `%${topic}%`]);
        
        return rows;
    } catch (error) {
        console.error('FAQ 검색 오류:', error);
        return [];
    }
}

// 채팅 히스토리 저장 함수
async function saveChatMessage(userId, sessionId, messageType, messageContent, audioData = null, contextInfo = null) {
    try {
        // 메시지 저장
        await db.execute(`
            INSERT INTO CHAT_HISTORY (user_id, session_id, message_type, message_content, audio_data, context_info) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, sessionId, messageType, messageContent, audioData, contextInfo]);
        
        // 세션 정보 업데이트 (upsert)
        await db.execute(`
            INSERT INTO CHAT_SESSIONS (session_id, user_id, last_message_at, message_count) 
            VALUES (?, ?, NOW(), 1)
            ON DUPLICATE KEY UPDATE 
                last_message_at = NOW(), 
                message_count = message_count + 1
        `, [sessionId, userId]);
        
        console.log(`💾 채팅 히스토리 저장: ${userId}/${sessionId}/${messageType}`);
        return true;
    } catch (error) {
        console.error('채팅 히스토리 저장 오류:', error);
        return false;
    }
}

// 채팅 히스토리 로드 함수
async function loadChatHistory(userId, sessionId, limit = 50) {
    try {
        const [rows] = await db.execute(`
            SELECT message_type, message_content, audio_data, context_info, created_at
            FROM CHAT_HISTORY
            WHERE user_id = ? AND session_id = ?
            ORDER BY created_at ASC
            LIMIT ?
        `, [userId, sessionId, limit]);
        
        console.log(`📖 채팅 히스토리 로드: ${userId}/${sessionId} (${rows.length}개 메시지)`);
        return rows;
    } catch (error) {
        console.error('채팅 히스토리 로드 오류:', error);
        return [];
    }
}

// 사용자의 세션 목록 조회
async function getUserSessions(userId, limit = 10) {
    try {
        const [rows] = await db.execute(`
            SELECT session_id, session_name, last_message_at, message_count, created_at
            FROM CHAT_SESSIONS
            WHERE user_id = ?
            ORDER BY last_message_at DESC
            LIMIT ?
        `, [userId, limit]);
        
        console.log(`📋 사용자 세션 조회: ${userId} (${rows.length}개 세션)`);
        return rows;
    } catch (error) {
        console.error('사용자 세션 조회 오류:', error);
        return [];
    }
}

// 세션명 업데이트 함수
async function updateSessionName(sessionId, sessionName) {
    try {
        await db.execute(`
            UPDATE CHAT_SESSIONS 
            SET session_name = ?, updated_at = NOW()
            WHERE session_id = ?
        `, [sessionName, sessionId]);
        
        console.log(`📝 세션명 업데이트: ${sessionId} -> ${sessionName}`);
        return true;
    } catch (error) {
        console.error('세션명 업데이트 오류:', error);
        return false;
    }
}

// ✅ checkIfHistoryNeeded 함수 제거 - 더 이상 필요 없음
// 이전 대화는 연결 시 OpenAI conversation에 미리 로드되므로 매번 판단할 필요 없음

// 이전 대화를 OpenAI conversation에 미리 로드하는 함수
async function loadPreviousChatToOpenAI(openaiWs, userId, sessionId) {
    try {
        console.log(`📚 이전 대화를 OpenAI conversation에 로드 시작: ${userId}/${sessionId}`);
        
        // 최근 10개 메시지 로드 (5쌍의 대화)
        const chatHistory = await loadChatHistory(userId, sessionId, 10);
        
        if (chatHistory.length > 0) {
            console.log(`📖 ${chatHistory.length}개의 이전 메시지를 OpenAI에 추가`);
            
            // 이전 대화를 하나씩 OpenAI conversation에 추가
            for (const msg of chatHistory) {
                const role = msg.message_type === 'assistant' ? 'assistant' : 'user';
                
                await new Promise((resolve) => {
                    openaiWs.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                            type: 'message',
                            role: role,
                            content: [
                                {
                                    type: 'input_text',
                                    text: msg.message_content
                                }
                            ]
                        }
                    }));
                    
                    // OpenAI 처리 시간을 위한 작은 지연
                    setTimeout(resolve, 50);
                });
            }
            
            console.log(`✅ 이전 대화 로드 완료: OpenAI가 이제 ${chatHistory.length}개 메시지의 컨텍스트를 기억함`);
        } else {
            console.log(`📝 새로운 세션: 로드할 이전 대화가 없음`);
        }
    } catch (error) {
        console.error('❌ 이전 대화 로드 오류:', error);
    }
}

// 컨텍스트 구성 함수 (이전 대화 제거, DB 정보만 포함)
async function buildContext(userMessage, userId = null, sessionId = null) {
    const contexts = [];
    
    // ✅ 이전 대화는 이미 OpenAI conversation에 로드되어 있으므로 제거
    
    // 1. 서비스 정보 검색
    const serviceInfo = await searchServiceInfo(userMessage);
    if (serviceInfo.length > 0) {
        contexts.push("📋 관련 서비스 정보:");
        serviceInfo.forEach(service => {
            contexts.push(`- ${service.service_name}: ${service.description}`);
            if (service.features) {
                contexts.push(`  주요 기능: ${service.features}`);
            }
            if (service.usage_guide) {
                contexts.push(`  이용 방법: ${service.usage_guide}`);
            }
        });
    }
    
    // 2. 사용자 맞춤 정보
    if (userId) {
        const userContext = await getUserContext(userId);
        if (userContext.major) {
            contexts.push(`\n👤 사용자 정보: ${userContext.major} 전공, ${userContext.grade}학년`);
        }
        if (userContext.interests) {
            contexts.push(`관심사: ${userContext.interests}`);
        }
    }
    
    // 3. FAQ 검색
    const faqs = await getFAQ(userMessage);
    if (faqs.length > 0) {
        contexts.push("\n❓ 관련 자주 묻는 질문:");
        faqs.forEach(faq => {
            contexts.push(`Q: ${faq.question}`);
            contexts.push(`A: ${faq.answer}`);
        });
    }
    
    return contexts.join('\n');
}

// GPT-4o mini Realtime WebSocket 챗봇 (DB 연동)
app.ws('/ws/realtime-chat', (clientWs, req) => {
  const sessionId = req.query.sessionId || `session_${Date.now()}_${Math.random()}`;
  const userId = req.query.userId || null; // 사용자 ID (선택적)
  
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

  // OpenAI 연결 성공 시 세션 설정 및 이전 대화 로드
  openaiWs.on('open', async () => {
    console.log(`OpenAI Realtime API 연결됨: ${sessionId}`);
    
    // 세션 설정 (음성 + 텍스트 지원)
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: `안녕하세요! 저는 UMate의 AI 어시스턴트입니다. 
대학교 서비스와 관련된 모든 질문에 대해 데이터베이스의 정확한 정보를 바탕으로 답변드리겠습니다.
사용자의 전공과 학년을 고려하여 맞춤형 조언을 제공하고, 실용적이고 친근한 답변을 드리겠습니다.

답변 시 다음을 고려해주세요:
1. 제공된 서비스 정보를 정확히 활용
2. 사용자 맞춤형 조언 제공  
3. 단계별 이용 방법 안내
4. 관련 FAQ가 있다면 참고하여 답변
5. 이전 대화 맥락을 고려하여 연속성 있는 답변`,
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

    // 🔥 이전 대화를 OpenAI conversation에 미리 로드
    if (userId && sessionId !== 'new') {
      await loadPreviousChatToOpenAI(openaiWs, userId, sessionId);
    }

    // 🔥 이전 대화 히스토리 로드 및 전송
    if (userId) {
      try {
        const chatHistory = await loadChatHistory(userId, sessionId, 20);
        const userSessions = await getUserSessions(userId, 5);
        
        // 클라이언트에 연결 성공 + 히스토리 정보 전송
        clientWs.send(JSON.stringify({
          type: 'connection',
          status: 'connected',
          message: '유식이(UMate AI)와 연결되었습니다. 대학 서비스에 대해 무엇이든 물어보세요!',
          sessionId: sessionId,
          capabilities: {
            text: true,
            audio: true,
            database: true,
            personalized: !!userId,
            history: true
          },
          chatHistory: chatHistory,
          userSessions: userSessions
        }));

        console.log(`📖 이전 대화 로드 완료: ${chatHistory.length}개 메시지, ${userSessions.length}개 세션`);
      } catch (error) {
        console.error('이전 대화 로드 오류:', error);
        
        // 히스토리 로드 실패 시 기본 연결 메시지만 전송
        clientWs.send(JSON.stringify({
          type: 'connection',
          status: 'connected',
          message: '유식이(UMate AI)와 연결되었습니다. 대학 서비스에 대해 무엇이든 물어보세요!',
          sessionId: sessionId,
          capabilities: {
            text: true,
            audio: true,
            database: true,
            personalized: !!userId,
            history: false
          }
        }));
      }
    } else {
      // 게스트 사용자 (히스토리 없음)
      clientWs.send(JSON.stringify({
        type: 'connection',
        status: 'connected',
        message: '유식이(UMate AI)와 연결되었습니다. 대학 서비스에 대해 무엇이든 물어보세요!',
        sessionId: sessionId,
        capabilities: {
          text: true,
          audio: true,
          database: true,
          personalized: false,
          history: false
        }
      }));
    }
  });

  // OpenAI로부터 메시지 수신 (기존과 동일)
  openaiWs.on('message', async (data) => {
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
              message: '🔍 데이터베이스에서 관련 정보를 찾고 있습니다...'
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
          const finalText = event.text || event.transcript;
          
          // 💾 AI 응답 DB 저장
          if (userId && finalText) {
            await saveChatMessage(userId, sessionId, 'assistant', finalText);
          }
          
          clientWs.send(JSON.stringify({
            type: 'text_done',
            text: finalText,
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

  // 클라이언트로부터 메시지 수신
  clientWs.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'user_message':
          // 💾 사용자 메시지 DB 저장 (먼저 저장)
          if (userId) {
            await saveChatMessage(userId, sessionId, 'user', data.message);
          }

          if (openaiWs.readyState === WebSocket.OPEN) {
            // 🧠 스마트 최적화: 이전 대화가 있으면 DB 정보를 다시 보내지 않음
            const hasHistory = userId && sessionId !== 'new';
            let messageToSend;
            
            if (hasHistory) {
              // ✨ 이전 대화에 이미 유저 정보가 포함되어 있으므로 단순한 메시지만 전송
              messageToSend = data.message;
              console.log(`💡 최적화: 이전 대화 존재, DB 정보 재전송 생략`);
            } else {
              // 🔍 새 세션이거나 첫 메시지인 경우에만 DB 정보 포함
              const contextInfo = await buildContext(data.message, userId, sessionId);
              messageToSend = contextInfo 
                ? `사용자 질문: "${data.message}"\n\n${contextInfo}\n\n위 데이터베이스 정보를 참고하여 답변해주세요.`
                : data.message;
              
              console.log(`🔍 새 세션: DB 정보 포함하여 전송`);
              
              // DB 저장 시 컨텍스트 정보도 포함 (새 세션의 경우)
              if (userId && contextInfo) {
                await saveChatMessage(userId, sessionId, 'user', data.message, null, contextInfo);
              }
            }

            openaiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: messageToSend
                  }
                ]
              }
            }));

            openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text'],
                instructions: hasHistory 
                  ? '이전 대화 맥락과 유저 정보를 활용하여 한국어로 친근하고 도움이 되는 답변을 해주세요.'
                  : '데이터베이스 정보를 바탕으로 한국어로 친근하고 도움이 되는 답변을 해주세요.'
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
                instructions: '데이터베이스 정보를 활용하여 한국어로 음성과 텍스트로 답변해주세요.'
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

  // 연결 종료 처리 (기존과 동일)
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

// API: 사용자 세션 목록 조회
app.get('/api/chat/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
    }

    const sessions = await getUserSessions(userId, parseInt(limit));
    res.json({
      success: true,
      userId: userId,
      sessions: sessions,
      count: sessions.length
    });
  } catch (error) {
    console.error('세션 조회 API 오류:', error);
    res.status(500).json({ error: '세션 조회 중 오류가 발생했습니다.' });
  }
});

// API: 특정 세션의 채팅 히스토리 조회
app.get('/api/chat/history/:userId/:sessionId', async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const { limit = 50 } = req.query;
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: '사용자 ID와 세션 ID가 필요합니다.' });
    }

    const history = await loadChatHistory(userId, sessionId, parseInt(limit));
    res.json({
      success: true,
      userId: userId,
      sessionId: sessionId,
      history: history,
      count: history.length
    });
  } catch (error) {
    console.error('히스토리 조회 API 오류:', error);
    res.status(500).json({ error: '히스토리 조회 중 오류가 발생했습니다.' });
  }
});

// API: 세션명 업데이트
app.put('/api/chat/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionName } = req.body;
    
    if (!sessionId || !sessionName) {
      return res.status(400).json({ error: '세션 ID와 세션명이 필요합니다.' });
    }

    const success = await updateSessionName(sessionId, sessionName);
    if (success) {
      res.json({
        success: true,
        message: '세션명이 업데이트되었습니다.',
        sessionId: sessionId,
        sessionName: sessionName
      });
    } else {
      res.status(500).json({ error: '세션명 업데이트에 실패했습니다.' });
    }
  } catch (error) {
    console.error('세션명 업데이트 API 오류:', error);
    res.status(500).json({ error: '세션명 업데이트 중 오류가 발생했습니다.' });
  }
});

// API: 세션 삭제
app.delete('/api/chat/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ error: '세션 ID가 필요합니다.' });
    }

    // 세션과 관련된 모든 메시지 삭제
    await db.execute('DELETE FROM CHAT_HISTORY WHERE session_id = ?', [sessionId]);
    
    // 세션 정보 삭제
    await db.execute('DELETE FROM CHAT_SESSIONS WHERE session_id = ?', [sessionId]);
    
    res.json({
      success: true,
      message: '세션이 삭제되었습니다.',
      sessionId: sessionId
    });
  } catch (error) {
    console.error('세션 삭제 API 오류:', error);
    res.status(500).json({ error: '세션 삭제 중 오류가 발생했습니다.' });
  }
});

// API: 서비스 검색 (별도 REST API로도 제공)
app.get('/api/services/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: '검색어가 필요합니다.' });
    }

    const services = await searchServiceInfo(q);
    res.json({
      success: true,
      query: q,
      results: services,
      count: services.length
    });
  } catch (error) {
    res.status(500).json({ error: '서비스 검색 중 오류가 발생했습니다.' });
  }
});

// API: 건강 체크
app.get('/api/health', async (req, res) => {
  try {
    // DB 연결 상태도 체크
    await db.execute('SELECT 1');
    
    res.json({ 
      status: 'OK', 
      message: 'UMate Realtime Chatbot with Database is running',
      activeConnections: userConnections.size,
      database: 'connected',
      capabilities: {
        text: true,
        audio: true,
        database: true,
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`🚀 UMate DB 연동 Realtime 챗봇이 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws/realtime-chat`);
  console.log(`🔍 서비스 검색 API: GET /api/services/search?q=검색어`);
  console.log(`💾 데이터베이스 연동으로 정확한 서비스 정보 제공`);
});

module.exports = app; 