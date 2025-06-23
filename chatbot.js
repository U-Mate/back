require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');
const { loadPreviousChatToOpenAI, loadChatHistory, saveChatHistory, setUpContext } = require('./chatbot-history');
const { filterMessage } = require('./chatbot-filter');
const logger = require('./log');

// 사용자별 연결 저장
const userConnections = new Map();

// GPT-4o mini Realtime WebSocket 챗봇 (음성 + 텍스트)
const realtime = (clientWs, req) => {
  const sessionId = req.query.sessionId || `session_${Date.now()}_${Math.random()}`;
  const userEmail = req.query.email;
  logger.info(`🔗 새로운 Realtime 연결: ${sessionId}, 사용자: ${userEmail || '게스트'}`);

  // OpenAI Realtime API 연결
  logger.info(`🔑 OpenAI API 키 확인: ${process.env.CHATBOT_API ? '설정됨' : '없음'}`);
  
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17', {
    headers: {
      'Authorization': `Bearer ${process.env.CHATBOT_API}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });
  
  logger.info(`🌐 OpenAI WebSocket 생성됨: ${sessionId}`);

  // 연결 저장 (텍스트→오디오 모드 상태 포함)
  userConnections.set(sessionId, { 
    clientWs, 
    openaiWs, 
    userEmail
  });
  
  // 즉시 클라이언트에 연결 확인 메시지 전송
  clientWs.send(JSON.stringify({
    type: 'connection',
    status: 'connecting',
    message: '서버에 연결되었습니다. OpenAI 연결을 시도하고 있습니다...',
    sessionId: sessionId
  }));

  // 🚨 클라이언트 메시지 핸들러를 여기로 이동 (OpenAI 연결과 독립적으로 작동)
  logger.info(`🎧 클라이언트 메시지 핸들러 등록 중... (세션: ${sessionId})`);
  
  // 클라이언트로부터 메시지 수신
  clientWs.on('message', async (message) => {
    logger.info(`📨 클라이언트로부터 메시지 수신 (세션: ${sessionId}):`, message.toString());
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'user_message':
          logger.info(`📥 사용자 메시지 수신 (세션: ${sessionId}): "${data.message}"`);
          
          // 🔥 메시지 필터링 적용
          const filterResult = filterMessage(data.message);
          
          if (!filterResult.allowed) {
            logger.info(`🚫 메시지 차단됨: ${filterResult.reason} - "${data.message}"`);
            
            // 필터링된 메시지에 대한 응답을 클라이언트에 전송
            clientWs.send(JSON.stringify({
              type: 'filtered_message',
              reason: filterResult.reason,
              messageType: filterResult.type,
              response: filterResult.response
            }));
            
            // 사용자에게 대체 응답 전송 (마치 AI가 답변한 것처럼)
            clientWs.send(JSON.stringify({
              type: 'text_done',
              text: filterResult.response,
              response_id: 'filter_response',
              item_id: 'filter_item',
              filtered: true
            }));
            
            // 🚫 필터링된 메시지는 DB에 저장하지 않음
            logger.info(`🗑️ 필터링된 메시지 DB 저장 건너뜀`);
            
            return; // 더 이상 처리하지 않고 종료
          }
          
          logger.info(`✅ 메시지 필터링 통과: 관련성 점수 ${filterResult.relevanceScore}`);
          
          // 💾 사용자 메시지 히스토리 저장 (필터링 통과한 경우에만)
          if (userEmail) {
            await saveChatHistory(userEmail, 'user', data.message);
          }
          
          if (openaiWs.readyState === WebSocket.OPEN) {
            // ✨ 핵심 최적화: 새 메시지만 전송 (이전 대화는 이미 로드됨)
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

            // 텍스트 응답 생성 요청
            openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text'],
                instructions: 'UMate 통신 서비스 관련 질문에만 답변하세요. 무관한 주제(양자역학, 요리, 영화 등)는 "죄송합니다. UMate 서비스 관련 질문만 답변드립니다"라고 응답하세요.'
              }
            }));

            logger.info(`📤 OpenAI Realtime API로 메시지 전송: "${data.message}"`);
          } else {
            // Realtime API 연결이 안 된 경우 에러 처리
            logger.error('❌ OpenAI Realtime API 연결되지 않음');
            clientWs.send(JSON.stringify({
              type: 'error',
              error: 'OpenAI 연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.'
            }));
          }
          break;

        case 'audio_data':
          // 음성 데이터를 OpenAI에 전송
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: data.audio
            }));
          }
          break;

        case 'audio_commit':
          // 음성 입력 완료
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.commit'
            }));

            // 음성 응답 생성 요청
            openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['audio', 'text'],
                instructions: 'UMate 통신 서비스 관련 질문에만 답변하세요. 무관한 주제는 "죄송합니다. UMate 서비스 관련 질문만 답변드립니다"라고 음성과 텍스트로 응답하세요.'
              }
            }));
          }
          break;

        case 'voice_change':
          // 음성 종류 변경
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'session.update',
              session: {
                voice: data.voice
              }
            }));
          }
          break;

        case 'debug_request':
          // 디버그 정보 요청
          const connData = userConnections.get(sessionId);
          const debugInfo = {
            sessionId: sessionId,
            userEmail: userEmail,
            clientWsState: clientWs.readyState,
            openaiWsState: openaiWs.readyState,
            totalConnections: userConnections.size,
            timestamp: new Date().toISOString()
          };
          
          logger.info(`🔍 디버그 정보 요청 (세션: ${sessionId}):`, debugInfo);
          
          clientWs.send(JSON.stringify({
            type: 'debug_response',
            serverStatus: debugInfo,
            message: `서버 상태: ${openaiWs.readyState === WebSocket.OPEN ? '✅ OpenAI 연결됨' : '❌ OpenAI 연결 안됨'}`
          }));
          break;

        case 'session_update':
          // 세션 업데이트 요청
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'session.update',
              session: data.session
            }));
          }
          break;

        default:
          logger.info('알 수 없는 클라이언트 메시지 타입:', data.type);
      }
    } catch (error) {
      logger.error('클라이언트 메시지 파싱 오류:', error);
      clientWs.send(JSON.stringify({
        type: 'error',
        error: '메시지 형식이 올바르지 않습니다.'
      }));
    }
  });

  logger.info(`✅ 클라이언트 메시지 핸들러 등록 완료 (세션: ${sessionId})`);

  // OpenAI 연결 성공 시 세션 설정
  openaiWs.on('open', async () => {
    logger.info(`✅ OpenAI Realtime API 연결 성공: ${sessionId}`);
    logger.info(`🔗 OpenAI WebSocket 상태: ${openaiWs.readyState} (OPEN=${openaiWs.OPEN})`);
    
    // 세션 설정 (음성 + 텍스트 지원)
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'], // 텍스트 + 음성 동시 지원
        instructions: `당신은 "유식이"라는 이름의 UMate 통신사 전용 AI 어시스턴트입니다.

🎯 **핵심 역할**: UMate 요금제 및 통신 서비스 전문 상담
📋 **답변 범위**: 오직 UMate 관련 질문만 답변 (요금제, 데이터, 통화, 문자, 할인혜택, 고객서비스 등)

⛔ **절대 금지사항**:
- UMate와 무관한 주제 답변 절대 금지 (양자역학, 요리, 영화, 학문, 일반상식, 다른 회사 등)
- 다른 통신사 정보 제공 금지
- 확인되지 않은 정보 추측 답변 금지

✅ **답변 방식**:
- 친근하고 전문적인 한국어 사용 (모든 입력과 출력은 한국어로만 처리)
- 간결하면서도 정확한 정보 제공
- 음성 질문 → 음성 답변, 텍스트 질문 → 텍스트 답변
- 음성 인식은 항상 한국어로 해석하고 한국어로만 응답
- UMate 서비스와 무관한 질문 시: "죄송합니다. 저는 UMate 통신 서비스 전문 AI입니다. UMate 요금제나 서비스 관련 질문을 해주세요!"

💪 **목표**: UMate 고객에게 최고의 통신 서비스 상담 경험 제공`,
        voice: 'alloy', // 음성 종류: alloy, echo, fable, onyx, nova, shimmer
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
          language: 'ko' // 한국어로 명시적 설정
        },
        turn_detection: {
          type: 'server_vad', // 음성 활동 감지
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        tools: [],
        tool_choice: 'auto',
        temperature: 0.8,
        max_response_output_tokens: 4096
      }
    }));

    // 🔥 음성용 Realtime API에 이전 대화 로드 (음성 메시지를 위해)
    if(userEmail){
      await loadPreviousChatToOpenAI(openaiWs, userEmail, req.query.history);
    }

    const chatHistory = userEmail ? await loadChatHistory(userEmail) : [];

    // 클라이언트에 연결 성공 알림
    clientWs.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      message: '유식이와 연결이 되었습니다.',
      sessionId: sessionId,
      capabilities: {
        text: true,
        audio: true,
        voice: 'alloy',
        database: true,
        personalized: !!userEmail,
        history: userEmail ? true : false,
        optimization: chatHistory.length > 0 ? 'enabled' : 'first_session'
      },
      chatHistory: chatHistory
    }));
  });

  // OpenAI로부터 메시지 수신
  openaiWs.on('message', async (data) => {
    try {
      const event = JSON.parse(data.toString());
      
      // 오디오 관련 이벤트는 더 상세히 로깅
      if (event.type.includes('audio') || event.type === 'response.created' || event.type === 'response.done') {
        logger.info(`📨 OpenAI 이벤트 수신 (상세): ${event.type} (세션: ${sessionId})`, {
          type: event.type,
          response_id: event.response_id || event.response?.id,
          item_id: event.item_id,
          delta_length: event.delta ? event.delta.length : undefined,
          modalities: event.response?.modalities,
          status: event.response?.status
        });
      } else {
        logger.info(`📨 OpenAI 이벤트 수신: ${event.type} (세션: ${sessionId})`);
      }
      
      switch (event.type) {
        case 'session.created':
          logger.info('Realtime 세션 생성됨');
          break;

        case 'session.updated':
          logger.info('Realtime 세션 업데이트됨');
          break;

        case 'input_audio_buffer.speech_started':
          // 사용자가 말하기 시작
          clientWs.send(JSON.stringify({
            type: 'speech_started',
            message: '🎤 음성을 듣고 있습니다...'
          }));
          break;

        case 'input_audio_buffer.speech_stopped':
          // 사용자가 말하기 중단
          clientWs.send(JSON.stringify({
            type: 'speech_stopped',
            message: '🔄 음성을 처리하고 있습니다...'
          }));
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // 음성 인식 완료
          const userTranscript = event.transcript;
          logger.info(`🎤 음성 인식 결과 (${sessionId}): "${userTranscript}"`);
          
          // 🔥 음성 메시지도 필터링 적용 (음성용 관대한 기준)
          if (userTranscript) {
            // 음성의 경우 더 관대한 필터링 적용
            logger.info(`🎤 음성 인식 결과 필터링 시작: "${userTranscript}"`);
            
            // 음성의 경우 기본적인 부적절성만 체크, 키워드 체크는 매우 완화
            const audioFilterResult = filterMessage(userTranscript, true); // isAudio = true
            
            // 음성인 경우 키워드 부족으로 인한 필터링은 무시 (부적절한 내용만 필터링)
            if (!audioFilterResult.allowed && audioFilterResult.type === 'inappropriate') {
              logger.info(`🚫 음성 메시지 차단됨 (부적절한 내용): ${audioFilterResult.reason} - "${userTranscript}"`);
              
              // 필터링된 음성 메시지 응답 전송
              clientWs.send(JSON.stringify({
                type: 'filtered_message',
                reason: audioFilterResult.reason,
                messageType: audioFilterResult.type,
                response: audioFilterResult.response,
                isAudio: true
              }));
              
              // 텍스트로 필터 응답 전송
              clientWs.send(JSON.stringify({
                type: 'text_done',
                text: audioFilterResult.response,
                response_id: 'audio_filter_response',
                item_id: 'audio_filter_item',
                filtered: true,
                isAudio: true
              }));
              
              // 음성 인식은 완료되었다고 클라이언트에 알림 (필터링 되었지만)
              clientWs.send(JSON.stringify({
                type: 'transcription_complete',
                transcription: `[부적절한 내용 필터링됨] ${userTranscript}`,
                item_id: event.item_id,
                filtered: true
              }));
              
              return; // 더 이상 처리하지 않고 종료
            }
            
            // 🎤 음성의 경우 키워드 부족 등은 무시하고 통과시킴
            if (!audioFilterResult.allowed && audioFilterResult.type !== 'inappropriate') {
              logger.info(`🎤 음성 메시지 키워드 부족하지만 통과시킴: "${userTranscript}" (점수: ${audioFilterResult.score})`);
              // 필터링하지 않고 계속 진행
            } else if (audioFilterResult.allowed) {
              logger.info(`✅ 음성 메시지 필터링 통과: 관련성 점수 ${audioFilterResult.relevanceScore || audioFilterResult.score}`);
            }
          }
          
          // 💾 사용자 음성 메시지 히스토리 저장 (필터링과 상관없이 저장)
          if (userEmail && userTranscript) {
            await saveChatHistory(userEmail, 'user', userTranscript);
          }
          
          clientWs.send(JSON.stringify({
            type: 'transcription_complete',
            transcription: userTranscript,
            item_id: event.item_id,
            filtered: false // 음성은 기본적으로 필터링하지 않음
          }));
          break;

        case 'conversation.item.created':
          // 대화 아이템 생성됨 (이전 대화 로드 시에는 UI 업데이트하지 않음)
          // 실제 응답 생성은 response.created에서 처리
          break;

        case 'response.audio.delta':
          // 실시간 음성 스트리밍 - 클라이언트로 전송
          logger.info(`🔊 오디오 델타 전송 (세션: ${sessionId}):`, {
            deltaLength: event.delta ? event.delta.length : 0,
            response_id: event.response_id,
            item_id: event.item_id
          });
          
          clientWs.send(JSON.stringify({
            type: 'audio_delta',
            audio: event.delta,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.audio.done':
          // 음성 완료
          clientWs.send(JSON.stringify({
            type: 'audio_done',
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.audio_transcript.delta':
          // 음성 응답의 텍스트 변환 (실시간)
          clientWs.send(JSON.stringify({
            type: 'audio_transcript_delta',
            delta: event.delta,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.audio_transcript.done':
          // 음성 응답의 텍스트 변환 완료
          const audioTranscript = event.transcript;
          
          // 💾 AI 음성 응답 히스토리 저장
          if (userEmail && audioTranscript) {
            await saveChatHistory(userEmail, 'assistant', audioTranscript);
          }
          
          clientWs.send(JSON.stringify({
            type: 'audio_transcript_done',
            transcript: audioTranscript,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.created':
          // 실제 응답 생성 시작 (이전 대화 로드와 구분)
          logger.info(`🤖 응답 생성 시작 (세션: ${sessionId}):`, {
            response_id: event.response.id,
            modalities: event.response.modalities || 'unknown',
            output: event.response.output || 'unknown'
          });
          
          clientWs.send(JSON.stringify({
            type: 'assistant_message_start',
            message: '🤖 AI가 답변을 생성하고 있습니다...',
            response_id: event.response.id
          }));
          break;

        case 'response.text.delta':
          // 실시간 텍스트 스트리밍
          clientWs.send(JSON.stringify({
            type: 'text_delta',
            delta: event.delta,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.text.done':
          // 텍스트 완료
          const finalText = event.text;
          const currentConn = userConnections.get(sessionId);
          
          logger.info(`📝 텍스트 응답 완료 (세션: ${sessionId}):`, {
            textLength: finalText ? finalText.length : 0,
            connectionExists: !!currentConn
          });
          
          // 💾 AI 응답 히스토리 저장
          if (userEmail && finalText) {
            await saveChatHistory(userEmail, 'assistant', finalText);
          }
          
          clientWs.send(JSON.stringify({
            type: 'text_done',
            text: finalText,
            response_id: event.response_id,
            item_id: event.item_id
          }));
          break;

        case 'response.done':
          // 응답 완료
          logger.info(`✅ 응답 완료 (세션: ${sessionId}):`, {
            response_id: event.response.id,
            status: event.response.status,
            status_details: event.response.status_details,
            output: event.response.output ? Object.keys(event.response.output) : 'no output',
            usage: event.response.usage
          });
          
          clientWs.send(JSON.stringify({
            type: 'response_complete',
            response: event.response
          }));
          break;

        case 'error':
          logger.error('OpenAI Realtime API 오류:', event.error);
          clientWs.send(JSON.stringify({
            type: 'error',
            error: event.error.message || '알 수 없는 오류가 발생했습니다.'
          }));
          break;

        default:
          // 기타 이벤트들을 클라이언트에 전달
          clientWs.send(JSON.stringify({
            type: 'openai_event',
            event: event
          }));
      }
    } catch (error) {
      logger.error('OpenAI 메시지 파싱 오류:', error);
    }
  });

  // OpenAI 연결 오류
  openaiWs.on('error', (error) => {
    logger.error('❌ OpenAI Realtime API 연결 오류:', error);
    logger.error('❌ 오류 상세:', error.message, error.code);
    logger.error('❌ 전체 오류 객체:', JSON.stringify(error, null, 2));
    clientWs.send(JSON.stringify({
      type: 'error',
      error: `OpenAI 연결 오류: ${error.message || '알 수 없는 오류'}`
    }));
  });

  // OpenAI 연결 종료
  openaiWs.on('close', (code, reason) => {
    logger.info(`❌ OpenAI Realtime API 연결 종료: ${sessionId}`);
    logger.info(`❌ 종료 코드: ${code}, 이유: ${reason}`);
    clientWs.send(JSON.stringify({
      type: 'connection',
      status: 'disconnected',
      message: `OpenAI 연결이 종료되었습니다. (코드: ${code})`
    }));
  });

  // 클라이언트 연결 종료
  clientWs.on('close', (code, reason) => {
    logger.info(`🔌 클라이언트 연결 종료: ${sessionId}, 코드: ${code}, 이유: ${reason}`);
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
    userConnections.delete(sessionId);
  });

  // 클라이언트 연결 오류
  clientWs.on('error', (error) => {
    logger.error(`❌ 클라이언트 WebSocket 오류 (세션: ${sessionId}):`, error);
  });
};

// 연결 상태 확인 API
const connections = (req, res) => {
  const connections = Array.from(userConnections.keys()).map(sessionId => {
    const conn = userConnections.get(sessionId);
    return {
      sessionId,
      clientConnected: conn.clientWs.readyState === WebSocket.OPEN,
      openaiConnected: conn.openaiWs.readyState === WebSocket.OPEN
    };
  });

  res.json({
    totalConnections: connections.length,
    connections
  });
};

module.exports = { realtime, connections };