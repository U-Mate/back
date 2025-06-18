require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');
const { loadPreviousChatToOpenAI, loadChatHistory, saveChatHistory, setUpContext } = require('./chatbot-history');

// 사용자별 연결 저장
const userConnections = new Map();

// GPT-4o mini Realtime WebSocket 챗봇 (음성 + 텍스트)
const realtime = (clientWs, req) => {
  const sessionId = req.query.sessionId || `session_${Date.now()}_${Math.random()}`;
  const userEmail = req.query.email;
  console.log(`🔗 새로운 Realtime 연결: ${sessionId}, 사용자: ${userEmail || '게스트'}`);

  // OpenAI Realtime API 연결
  console.log(`🔑 OpenAI API 키 확인: ${process.env.CHATBOT_API ? '설정됨' : '없음'}`);
  
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17', {
    headers: {
      'Authorization': `Bearer ${process.env.CHATBOT_API}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });
  
  console.log(`🌐 OpenAI WebSocket 생성됨: ${sessionId}`);

  // 연결 저장
  userConnections.set(sessionId, { clientWs, openaiWs, userEmail });
  
  // 클라이언트 연결 상태 확인
  console.log(`👤 클라이언트 WebSocket 상태: ${clientWs.readyState} (OPEN=${WebSocket.OPEN})`);
  
  // 즉시 클라이언트에 연결 확인 메시지 전송
  clientWs.send(JSON.stringify({
    type: 'connection',
    status: 'connecting',
    message: '서버에 연결되었습니다. OpenAI 연결을 시도하고 있습니다...',
    sessionId: sessionId
  }));

  // 🚨 클라이언트 메시지 핸들러를 여기로 이동 (OpenAI 연결과 독립적으로 작동)
  console.log(`🎧 클라이언트 메시지 핸들러 등록 중... (세션: ${sessionId})`);
  
  // 클라이언트로부터 메시지 수신
  clientWs.on('message', async (message) => {
    console.log(`📨 클라이언트로부터 메시지 수신 (세션: ${sessionId}):`, message.toString());
    try {
      const data = JSON.parse(message);
      console.log(`📋 파싱된 데이터:`, data);
      
      switch (data.type) {
        case 'user_message':
          // 💾 사용자 메시지 히스토리 저장
          if (userEmail) {
            await saveChatHistory(userEmail, 'user', data.message);
          }

          // 🧠 최적화: 이전 대화는 이미 연결 시 OpenAI conversation에 로드됨
          // 따라서 현재 메시지만 Realtime API로 전송
          console.log(`📝 사용자 메시지 수신: "${data.message}" (세션: ${sessionId})`);
          console.log(`🔗 OpenAI 연결 상태: ${openaiWs.readyState} (OPEN=${WebSocket.OPEN})`);
          
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
                instructions: '이전 대화 맥락을 고려하여 한국어로 친근하고 연속성 있는 답변을 해주세요.'
              }
            }));

            console.log(`📤 OpenAI Realtime API로 메시지 전송: "${data.message}"`);
          } else {
            // Realtime API 연결이 안 된 경우 에러 처리
            console.error('❌ OpenAI Realtime API 연결되지 않음');
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
                instructions: '사용자의 음성 메시지에 한국어로 친근하고 도움이 되는 답변을 음성과 텍스트로 동시에 해주세요.'
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

  console.log(`✅ 클라이언트 메시지 핸들러 등록 완료 (세션: ${sessionId})`);

  // OpenAI 연결 성공 시 세션 설정
  openaiWs.on('open', async () => {
    console.log(`✅ OpenAI Realtime API 연결 성공: ${sessionId}`);
    console.log(`🔗 OpenAI WebSocket 상태: ${openaiWs.readyState} (OPEN=${openaiWs.OPEN})`);
    
    // 세션 설정 (음성 + 텍스트 지원)
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'], // 텍스트 + 음성 동시 지원
        instructions: `안녕하세요! 저는 UMate의 AI 어시스턴트입니다. 
한국어로 친근하고 도움이 되는 답변을 제공하겠습니다. 
음성으로 질문하시면 음성으로 답변하고, 텍스트로 질문하시면 텍스트로도 답변드립니다.`,
        voice: 'alloy', // 음성 종류: alloy, echo, fable, onyx, nova, shimmer
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
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
      console.log(`📨 OpenAI 이벤트 수신: ${event.type} (세션: ${sessionId})`);
      
      switch (event.type) {
        case 'session.created':
          console.log('Realtime 세션 생성됨');
          break;

        case 'session.updated':
          console.log('Realtime 세션 업데이트됨');
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
          
          // �� 사용자 음성 메시지 히스토리 저장
          if (userEmail && userTranscript) {
            await saveChatHistory(userEmail, 'user', userTranscript);
          }
          
          clientWs.send(JSON.stringify({
            type: 'transcription_complete',
            transcription: userTranscript,
            item_id: event.item_id
          }));
          break;

        case 'conversation.item.created':
          // 대화 아이템 생성됨 (이전 대화 로드 시에는 UI 업데이트하지 않음)
          // 실제 응답 생성은 response.created에서 처리
          break;

        case 'response.audio.delta':
          // 실시간 음성 스트리밍
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
          // 기타 이벤트들을 클라이언트에 전달
          clientWs.send(JSON.stringify({
            type: 'openai_event',
            event: event
          }));
      }
    } catch (error) {
      console.error('OpenAI 메시지 파싱 오류:', error);
    }
  });

  // OpenAI 연결 오류
  openaiWs.on('error', (error) => {
    console.error('❌ OpenAI Realtime API 연결 오류:', error);
    console.error('❌ 오류 상세:', error.message, error.code);
    console.error('❌ 전체 오류 객체:', JSON.stringify(error, null, 2));
    clientWs.send(JSON.stringify({
      type: 'error',
      error: `OpenAI 연결 오류: ${error.message || '알 수 없는 오류'}`
    }));
  });

  // OpenAI 연결 종료
  openaiWs.on('close', (code, reason) => {
    console.log(`❌ OpenAI Realtime API 연결 종료: ${sessionId}`);
    console.log(`❌ 종료 코드: ${code}, 이유: ${reason}`);
    clientWs.send(JSON.stringify({
      type: 'connection',
      status: 'disconnected',
      message: `OpenAI 연결이 종료되었습니다. (코드: ${code})`
    }));
  });

  // 클라이언트 연결 종료
  clientWs.on('close', (code, reason) => {
    console.log(`🔌 클라이언트 연결 종료: ${sessionId}, 코드: ${code}, 이유: ${reason}`);
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
    userConnections.delete(sessionId);
  });

  // 클라이언트 연결 오류
  clientWs.on('error', (error) => {
    console.error(`❌ 클라이언트 WebSocket 오류 (세션: ${sessionId}):`, error);
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