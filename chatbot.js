require("dotenv").config();
const WebSocket = require("ws");
const axios = require("axios");
const {
  loadPreviousChatToOpenAI,
  loadChatHistory,
  saveChatHistory,
  setUpContext,
} = require("./chatbot-history");
const { filterMessage } = require("./chatbot-filter");
const { validateWebSocketMessage } = require("./xss-protection");
const logger = require("./log");

// 사용자별 연결 저장
const userConnections = new Map();

// WebSocket Rate Limiting 관리
const connectionLimits = new Map(); // IP별 연결 수 추적

// GPT-4o mini Realtime WebSocket 챗봇 (음성 + 텍스트)
const realtime = (clientWs, req) => {
  // 🛡️ WebSocket 보안 검증
  const origin = req.headers.origin;
  const allowedOrigins = [process.env.LOCALHOST, process.env.MY_HOST];

  // Origin 검증 (개발 환경이 아닌 경우에만)
  if (process.env.NODE_ENV !== "development" && origin) {
    const isAllowedOrigin = allowedOrigins.some((allowedOrigin) => {
      if (!allowedOrigin) return false;
      return origin.includes(allowedOrigin) || origin === allowedOrigin;
    });

    if (!isAllowedOrigin) {
      logger.error(`🚨 WebSocket: 허용되지 않은 Origin ${origin}`);
      clientWs.close(1008, "허용되지 않은 출처에서의 WebSocket 연결입니다.");
      return;
    }
  }

  // 기본 인증 검증
  const userEmail = req.query.email;
  const sessionId =
    req.query.sessionId || `session_${Date.now()}_${Math.random()}`;

  // 이메일 형식 검증 (있는 경우에만)
  if (userEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    logger.error(`🚨 WebSocket: 잘못된 이메일 형식 ${userEmail}`);
    clientWs.close(1008, "올바른 이메일 형식이 아닙니다.");
    return;
  }

  // IP별 연결 수 제한 (개발 환경이 아닌 경우)
  const clientIP = req.ip || req.connection.remoteAddress;
  if (process.env.NODE_ENV !== "development") {
    const currentConnections = connectionLimits.get(clientIP) || 0;
    const MAX_CONNECTIONS_PER_IP = 3; // IP당 최대 3개 동시 연결

    if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
      logger.error(
        `🚨 WebSocket: IP ${clientIP}의 연결 수 제한 초과 (${currentConnections}/${MAX_CONNECTIONS_PER_IP})`
      );
      clientWs.close(1008, "IP당 최대 연결 수를 초과했습니다.");
      return;
    }

    // 연결 수 증가
    connectionLimits.set(clientIP, currentConnections + 1);
  }

  logger.info(
    `🔗 새로운 Realtime 연결: ${sessionId}, 사용자: ${
      userEmail || "게스트"
    }, Origin: ${origin || "None"}, IP: ${clientIP}`
  );

  // OpenAI Realtime API 연결
  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17",
    {
      headers: {
        Authorization: `Bearer ${process.env.CHATBOT_API}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  // 연결 저장 (텍스트→오디오 모드 상태 포함)
  userConnections.set(sessionId, {
    clientWs,
    openaiWs,
    userEmail,
  });

  // 즉시 클라이언트에 연결 확인 메시지 전송
  clientWs.send(
    JSON.stringify({
      type: "connection",
      status: "connecting",
      message: "서버에 연결되었습니다. OpenAI 연결을 시도하고 있습니다...",
      sessionId: sessionId,
    })
  );

  // 클라이언트로부터 메시지 수신
  clientWs.on("message", async (message) => {
    try {
      // 🛡️ WebSocket 메시지 보안 검증
      if (!validateWebSocketMessage(clientWs, message)) {
        // 보안 검증 실패 시 추가 처리 중단
        return;
      }

      const data = JSON.parse(message);

      switch (data.type) {
        case "user_message":
          // 🔥 메시지 필터링 적용
          const filterResult = filterMessage(data.message);

          if (!filterResult.allowed) {
            // 필터링된 메시지에 대한 응답을 클라이언트에 전송
            clientWs.send(
              JSON.stringify({
                type: "filtered_message",
                reason: filterResult.reason,
                messageType: filterResult.type,
                response: filterResult.response,
              })
            );

            // 사용자에게 대체 응답 전송 (마치 AI가 답변한 것처럼)
            clientWs.send(
              JSON.stringify({
                type: "text_done",
                text: filterResult.response,
                response_id: "filter_response",
                item_id: "filter_item",
                filtered: true,
              })
            );

            return; // 더 이상 처리하지 않고 종료
          }

          // 💾 사용자 메시지 히스토리 저장 (필터링 통과한 경우에만)
          if (userEmail) {
            await saveChatHistory(userEmail, "user", data.message);
          }

          if (openaiWs.readyState === WebSocket.OPEN) {
            // ✨ 핵심 최적화: 새 메시지만 전송 (이전 대화는 이미 로드됨)
            openaiWs.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: data.message,
                    },
                  ],
                },
              })
            );

            // 텍스트 응답 생성 요청
            openaiWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["text"],
                  instructions:
                    'UMate 통신 서비스 관련 질문에만 답변하세요. 무관한 주제(양자역학, 요리, 영화 등)는 "죄송합니다. UMate 서비스 관련 질문만 답변드립니다"라고 응답하세요.',
                },
              })
            );
          } else {
            // Realtime API 연결이 안 된 경우 에러 처리
            logger.error("❌ OpenAI Realtime API 연결되지 않음");
            clientWs.send(
              JSON.stringify({
                type: "error",
                error:
                  "OpenAI 연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.",
              })
            );
          }
          break;

        case "audio_data":
          // 음성 데이터를 OpenAI에 전송
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: data.audio,
              })
            );
          }
          break;

        case "audio_commit":
          // 음성 입력 완료
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
              JSON.stringify({
                type: "input_audio_buffer.commit",
              })
            );

            // 음성 응답 생성 요청
            openaiWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["audio", "text"],
                  instructions:
                    'UMate 통신 서비스 관련 질문에만 답변하세요. 무관한 주제는 "죄송합니다. UMate 서비스 관련 질문만 답변드립니다"라고 음성과 텍스트로 응답하세요.',
                },
              })
            );
          }
          break;

        case "voice_change":
          // 음성 종류 변경
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
              JSON.stringify({
                type: "session.update",
                session: {
                  voice: data.voice,
                },
              })
            );
          }
          break;

        case "debug_request":
          // 디버그 정보 요청
          const connData = userConnections.get(sessionId);
          const debugInfo = {
            sessionId: sessionId,
            userEmail: userEmail,
            clientWsState: clientWs.readyState,
            openaiWsState: openaiWs.readyState,
            totalConnections: userConnections.size,
            timestamp: new Date().toISOString(),
          };

          clientWs.send(
            JSON.stringify({
              type: "debug_response",
              serverStatus: debugInfo,
              message: `서버 상태: ${
                openaiWs.readyState === WebSocket.OPEN
                  ? "✅ OpenAI 연결됨"
                  : "❌ OpenAI 연결 안됨"
              }`,
            })
          );
          break;

        case "session_update":
          // 세션 업데이트 요청
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
              JSON.stringify({
                type: "session.update",
                session: data.session,
              })
            );
          }
          break;

        default:
          // 알 수 없는 메시지 타입은 로그만 남기고 처리하지 않음
          break;
      }
    } catch (error) {
      logger.error("클라이언트 메시지 파싱 오류:", error);
      clientWs.send(
        JSON.stringify({
          type: "error",
          error: "메시지 형식이 올바르지 않습니다.",
        })
      );
    }
  });

  // OpenAI 연결 성공 시 세션 설정
  openaiWs.on("open", async () => {
    logger.info(`✅ OpenAI Realtime API 연결 성공: ${sessionId}`);

    // 세션 설정 (음성 + 텍스트 지원)
    openaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"], // 텍스트 + 음성 동시 지원
          instructions: `
당신은 "유식이"라는 이름의 UMate 통신사 전용 AI 어시스턴트입니다.

🎯 **핵심 역할**: 
- UMate 요금제 및 통신 서비스 전문 상담
- 고객의 통신 관련 문의에 대한 정확하고 친근한 답변 제공

📋 **답변 가능한 범위**:
- UMate 요금제 정보 (5G, LTE 요금제)
- 데이터 사용량 및 속도 관련 문의
- 통화, 문자, MMS 서비스
- 할인혜택, 쿠폰, 이벤트 정보
- 고객서비스 (가입, 해지, 변경, 문의)
- 개인정보, 보안, 인증 관련
- 기타 UMate 통신 서비스 전반

⛔ **절대 금지사항**:
- UMate와 무관한 주제 답변 금지 (학문, 요리, 영화, 게임, 스포츠, 다른 회사 등)
- 다른 통신사 정보 제공 금지
- 확인되지 않은 정보 추측 답변 금지
- 욕설, 부적절한 표현 사용 금지

✅ **답변 방식**:
- 친근하고 전문적인 한국어 사용 (모든 대화는 한국어로만 진행)
- 간결하면서도 정확한 정보 제공
- 음성 질문 → 음성 답변, 텍스트 질문 → 텍스트 답변
- 음성 인식은 항상 한국어로 해석하고 한국어로만 응답
- UMate 서비스와 무관한 질문 시: "죄송합니다. 저는 UMate 통신 서비스 전문 AI입니다. UMate 요금제나 서비스 관련 질문을 해주세요!"
- 상담사 연결이 필요한 경우:
  * 복잡한 기술적 문제나 시스템 오류
  * 개인정보 변경, 명의변경 등 민감한 업무
  * 특별한 할인이나 예외 처리 요청
  * 기존 상담으로 해결되지 않는 문제
  * 위약금, 연체, 법적 분쟁 관련 문의

  **상담사 연결 안내 방식**:
  * "이런 경우에는 전문 상담사와 상담하시는 것이 좋겠습니다"
  * "고객센터로 연결해드릴까요? 전화번호는 1544-0010입니다"
  * "상담 가능 시간: 평일 09:00-18:00"

  **상담사 연결 전 마지막 확인**:
  * "혹시 제가 도와드릴 수 있는 다른 문의사항은 없으신가요?"
  * "상담사 연결 전 간단한 정보 확인을 위해 몇 가지 질문드릴게요"

- 요금제 추천 시 사용자 상태에 따른 맞춤 상담을 진행하세요:

  **로그인 사용자 (기본 정보 제공됨)**:
  * 제공된 연령대와 현재 요금제 정보를 활용하여 바로 맞춤 상담 진행
  * "현재 [현재요금제]를 사용 중이시고, [연령대]이시군요. 더 정확한 추천을 위해 몇 가지 질문드릴게요!"
  * 다음 단계부터 진행

  **비로그인 사용자 (기본 정보 없음)**:
  * 1단계부터 시작하여 기본 정보 수집

  **1단계: 기본 정보 수집 (비로그인 사용자만)**
  * 연령대 확인: "연령대를 알려주세요" (10대/20대/30대/40대/50대 이상)
  * 사용 목적 파악: "주로 어떤 용도로 사용하실 예정인가요?" (업무/학업/일상/게임/영상시청 등)

  **2단계: 데이터 사용량 분석**
  * 월간 데이터 사용량: "한 달에 데이터를 얼마나 사용하시나요?" (1GB/3GB/5GB/10GB/무제한 등)
  * 사용 패턴 확인: "주로 언제 데이터를 많이 사용하시나요?" (집/외출/출퇴근/야간 등)

  **3단계: 통화 패턴 파악**
  * 월간 통화량: "한 달에 통화는 얼마나 하시나요?" (100분/300분/500분/무제한 등)
  * 통화 대상: "주로 누구와 통화하시나요?" (가족/친구/업무/고객 등)

  **4단계: 부가서비스 선호도**
  * 선호 서비스: "특별히 원하시는 부가서비스가 있나요?" (OTT/음악/고령자 서비스(실버지킴이) 등)
  * 예산 범위: "월 요금 예산은 어느 정도로 생각하고 계시나요?" (3만원/5만원/7만원/10만원 이상)

  **상담 원칙**:
  * 로그인 사용자는 제공된 정보를 활용하여 2단계부터 시작
  * 비로그인 사용자는 1단계부터 시작하여 모든 정보 수집
  * 한 번에 모든 정보를 요구하지 말고, 대화를 통해 자연스럽게 정보를 수집하세요
  * 각 단계별로 1-2개 질문씩만 하고, 사용자 답변에 따라 다음 단계로 진행하세요
  * 사용자가 답변하기 어려운 경우 구체적인 예시를 들어 설명하세요
  * 정보 수집 완료 후 "수집한 정보를 바탕으로 최적의 요금제를 추천해드리겠습니다"라고 안내하세요

  대화 예시:
  사용자: 요금제 리뷰 살펴보기
  챗봇: “어떤 요금제에 대한 리뷰를 보고 싶으신가요?
  인기 있는 요금제 중에는 이런 것들이 있어요:
  [요금제1]
  [요금제2]
  [요금제3]
  보고 싶은 요금제를 선택해주세요!”
  대화 예시:
  사용자: 요금제 리뷰 살펴보기
  챗봇: "어떤 요금제에 대한 리뷰를 보고 싶으신가요?
  인기 있는 요금제 중에는 이런 것들이 있어요:
  [요금제1]
  [요금제2]
  [요금제3]
  보고 싶은 요금제를 선택해주세요!"
  
  사용자가 특정 요금제 선택 시 또는 요금제에 대해 질문할 때:
  챗봇: "[요금제명] 리뷰를 확인해드릴게요!
  
  📊 전체 리뷰 요약:
  [전체적인 평가를 2줄로 요약 - 장점과 단점을 포함한 전반적인 인상]
  
  💬 주요 리뷰 내용:
  [구체적인 리뷰 내용들...]"
💪 **목표**: UMate 고객에게 최고의 통신 서비스 상담 경험 제공

💬 추가 정보:
- 상담사 연결 전 마지막 확인: "혹시 제가 도와드릴 수 있는 다른 문의사항은 없으신가요?"
- 상담사 연결 전 간단한 정보 확인을 위해 몇 가지 질문드릴게요

💬 **해외 로밍 신청 방법 안내**:

📱 **온라인 신청**:
• U+닷컴 또는 모바일 앱에서 간편하게 신청 가능
• 24시간 언제든지 신청 가능
• 실시간 이용 내역 확인 및 부가서비스 해지 가능

🏢 **오프라인 신청**:
• 공항 로밍센터 방문 신청
• 유플러스 고객센터 방문 신청
• 전문 상담사와 1:1 상담 가능

🌍 **해외에서도 편리하게**:
• 앱·웹으로 이용 내역 실시간 확인
• 부가서비스 해지 및 변경 가능

**신청 전 확인사항**:
• 여행 국가 및 기간 확인
• 단말기 호환성 체크
• 요금제별 로밍 요금 확인

더 자세한 정보나 특정 국가별 로밍 요금이 궁금하시면 언제든 말씀해 주세요!

💬 **위약금 안내**:

💰 **위약금 발생 기준**:
• 약정 기간(1년/2년/3년) 내에 해지하거나 요금제 변경 시 발생
• 계약 시 받았던 할인 또는 지원금을 반환해야 합니다

🧮 **대략적인 계산 공식**:
• 1년 약정 중 해지: (무약정 요금 - 실제 납부 요금) x 사용 개월 수 + 사은품 반환금
• 2년 약정 중 해지: (1년 약정 요금 - 실제 납부 요금) x 사용 개월 수  
• 3년 약정 중 해지: (2년 약정 요금 - 실제 납부 요금) x 사용 개월 수

📱 **위약금 확인 방법**:
• U+앱 또는 홈페이지 → '내 가입정보' → '예상 할인 반환금' 확인
• 정확한 금액은 홈페이지 실시간 조회 또는 고객센터 확인 권장

💡 **참고사항**:
• 약정 기간이 길수록 위약금이 높을 수 있습니다
• 정확한 위약금은 개인별 상황에 따라 다를 수 있으니 고객센터 문의를 권장합니다
• 약정 기간 만료 후에는 위약금 없이 자유롭게 변경/해지 가능합니다

더 자세한 위약금 계산이나 특정 상황에 대한 문의가 있으시면 언제든 말씀해 주세요!
💬 **정확한 정보 제공 원칙**:

✅ **확실한 정보만 제공**:
• UMate의 공식 정책과 서비스 내용만 안내
• 불확실하거나 추측성 정보는 제공하지 않음

✅ **정보 제공 시 주의사항**:
• 개인별 상황에 따라 다를 수 있음을 항상 언급
• 정확한 계산이나 상세 정보는 고객센터 확인 권장
• 법적/정책적 변경사항이 있을 수 있음을 고지

✅ **상담사 연결 기준**:
• 개인별 맞춤 상담이 필요한 경우
• 정확한 계산이나 상세 정보가 필요한 경우
• 특수한 상황이나 예외 케이스인 경우
• 최신 정책이나 변경사항 확인이 필요한 경우

💡 **정보 제공 방식**:
• 일반적인 안내와 기본적인 정보 제공
• 구체적인 계산이나 개인별 상담은 상담사 연결
• "더 자세한 정보는 고객센터 상담사와 상담하시는 것을 권장드립니다"

이렇게 정확하고 신뢰할 수 있는 정보만을 제공하여 고객의 신뢰를 얻고, 필요시 전문 상담사와의 연결을 통해 최적의 서비스를 제공하겠습니다!
`,
          voice: "alloy", // 음성 종류: alloy, echo, fable, onyx, nova, shimmer
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
            language: "ko", // 한국어로 명시적 설정
          },
          turn_detection: {
            type: "server_vad", // 음성 활동 감지
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          tools: [],
          tool_choice: "auto",
          temperature: 0.8,
          max_response_output_tokens: 4096,
        },
      })
    );

    // 🔥 음성용 Realtime API에 이전 대화 로드 (음성 메시지를 위해)
    if (userEmail) {
      await loadPreviousChatToOpenAI(openaiWs, userEmail, req.query.history);
    }

    const chatHistory = userEmail ? await loadChatHistory(userEmail) : [];

    // 클라이언트에 연결 성공 알림
    clientWs.send(
      JSON.stringify({
        type: "connection",
        status: "connected",
        message: "유식이와 연결이 되었습니다.",
        sessionId: sessionId,
        capabilities: {
          text: true,
          audio: true,
          voice: "alloy",
          database: true,
          personalized: !!userEmail,
          history: userEmail ? true : false,
          optimization: chatHistory.length > 0 ? "enabled" : "first_session",
        },
        chatHistory: chatHistory,
      })
    );
  });

  // OpenAI로부터 메시지 수신
  openaiWs.on("message", async (data) => {
    try {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case "session.created":
          break;

        case "session.updated":
          break;

        case "input_audio_buffer.speech_started":
          // 사용자가 말하기 시작
          clientWs.send(
            JSON.stringify({
              type: "speech_started",
              message: "🎤 음성을 듣고 있습니다...",
            })
          );
          break;

        case "input_audio_buffer.speech_stopped":
          // 사용자가 말하기 중단
          clientWs.send(
            JSON.stringify({
              type: "speech_stopped",
              message: "🔄 음성을 처리하고 있습니다...",
            })
          );
          break;

        case "conversation.item.input_audio_transcription.completed":
          // 음성 인식 완료
          const userTranscript = event.transcript;

          // 🔥 음성 메시지도 필터링 적용 (음성용 관대한 기준)
          if (userTranscript) {
            // 음성의 경우 더 관대한 필터링 적용
            const audioFilterResult = filterMessage(userTranscript, true); // isAudio = true

            // 음성인 경우 키워드 부족으로 인한 필터링은 무시 (부적절한 내용만 필터링)
            if (
              !audioFilterResult.allowed &&
              audioFilterResult.type === "inappropriate"
            ) {
              // 필터링된 음성 메시지 응답 전송
              clientWs.send(
                JSON.stringify({
                  type: "filtered_message",
                  reason: audioFilterResult.reason,
                  messageType: audioFilterResult.type,
                  response: audioFilterResult.response,
                  isAudio: true,
                })
              );

              // 텍스트로 필터 응답 전송
              clientWs.send(
                JSON.stringify({
                  type: "text_done",
                  text: audioFilterResult.response,
                  response_id: "audio_filter_response",
                  item_id: "audio_filter_item",
                  filtered: true,
                  isAudio: true,
                })
              );

              // 음성 인식은 완료되었다고 클라이언트에 알림 (필터링 되었지만)
              clientWs.send(
                JSON.stringify({
                  type: "transcription_complete",
                  transcription: `[부적절한 내용 필터링됨] ${userTranscript}`,
                  item_id: event.item_id,
                  filtered: true,
                })
              );

              return; // 더 이상 처리하지 않고 종료
            }
          }

          // 💾 사용자 음성 메시지 히스토리 저장 (필터링과 상관없이 저장)
          if (userEmail && userTranscript) {
            await saveChatHistory(userEmail, "user", userTranscript);
          }

          clientWs.send(
            JSON.stringify({
              type: "transcription_complete",
              transcription: userTranscript,
              item_id: event.item_id,
              filtered: false, // 음성은 기본적으로 필터링하지 않음
            })
          );
          break;

        case "conversation.item.created":
          // 대화 아이템 생성됨 (이전 대화 로드 시에는 UI 업데이트하지 않음)
          // 실제 응답 생성은 response.created에서 처리
          break;

        case "response.audio.delta":
          // 실시간 음성 스트리밍 - 클라이언트로 전송
          clientWs.send(
            JSON.stringify({
              type: "audio_delta",
              audio: event.delta,
              response_id: event.response_id,
              item_id: event.item_id,
            })
          );
          break;

        case "response.audio.done":
          // 음성 완료
          clientWs.send(
            JSON.stringify({
              type: "audio_done",
              response_id: event.response_id,
              item_id: event.item_id,
            })
          );
          break;

        case "response.audio_transcript.delta":
          // 음성 응답의 텍스트 변환 (실시간)
          clientWs.send(
            JSON.stringify({
              type: "audio_transcript_delta",
              delta: event.delta,
              response_id: event.response_id,
              item_id: event.item_id,
            })
          );
          break;

        case "response.audio_transcript.done":
          // 음성 응답의 텍스트 변환 완료
          const audioTranscript = event.transcript;

          // 💾 AI 음성 응답 히스토리 저장
          if (userEmail && audioTranscript) {
            await saveChatHistory(userEmail, "assistant", audioTranscript);
          }

          clientWs.send(
            JSON.stringify({
              type: "audio_transcript_done",
              transcript: audioTranscript,
              response_id: event.response_id,
              item_id: event.item_id,
            })
          );
          break;

        case "response.created":
          // 실제 응답 생성 시작 (이전 대화 로드와 구분)
          clientWs.send(
            JSON.stringify({
              type: "assistant_message_start",
              message: "🤖 AI가 답변을 생성하고 있습니다...",
              response_id: event.response.id,
            })
          );
          break;

        case "response.text.delta":
          // 실시간 텍스트 스트리밍
          clientWs.send(
            JSON.stringify({
              type: "text_delta",
              delta: event.delta,
              response_id: event.response_id,
              item_id: event.item_id,
            })
          );
          break;

        case "response.text.done":
          // 텍스트 완료
          const finalText = event.text;

          // 💾 AI 응답 히스토리 저장
          if (userEmail && finalText) {
            await saveChatHistory(userEmail, "assistant", finalText);
          }

          clientWs.send(
            JSON.stringify({
              type: "text_done",
              text: finalText,
              response_id: event.response_id,
              item_id: event.item_id,
            })
          );
          break;

        case "response.done":
          // 응답 완료
          clientWs.send(
            JSON.stringify({
              type: "response_complete",
              response: event.response,
            })
          );
          break;

        case "error":
          logger.error("OpenAI Realtime API 오류:", event.error);
          clientWs.send(
            JSON.stringify({
              type: "error",
              error: event.error.message || "알 수 없는 오류가 발생했습니다.",
            })
          );
          break;

        default:
          // 기타 이벤트들을 클라이언트에 전달
          clientWs.send(
            JSON.stringify({
              type: "openai_event",
              event: event,
            })
          );
      }
    } catch (error) {
      logger.error("OpenAI 메시지 파싱 오류:", error);
    }
  });

  // OpenAI 연결 오류
  openaiWs.on("error", (error) => {
    logger.error("❌ OpenAI Realtime API 연결 오류:", error);
    clientWs.send(
      JSON.stringify({
        type: "error",
        error: `OpenAI 연결 오류: ${error.message || "알 수 없는 오류"}`,
      })
    );
  });

  // OpenAI 연결 종료
  openaiWs.on("close", (code, reason) => {
    logger.info(
      `❌ OpenAI Realtime API 연결 종료: ${sessionId} (코드: ${code})`
    );
    clientWs.send(
      JSON.stringify({
        type: "connection",
        status: "disconnected",
        message: `OpenAI 연결이 종료되었습니다. (코드: ${code})`,
      })
    );
  });

  // 클라이언트 연결 종료
  clientWs.on("close", (code, reason) => {
    logger.info(`🔌 클라이언트 연결 종료: ${sessionId}`);
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
    userConnections.delete(sessionId);

    // IP별 연결 수 감소
    if (process.env.NODE_ENV !== "development") {
      const currentConnections = connectionLimits.get(clientIP) || 0;
      if (currentConnections > 0) {
        connectionLimits.set(clientIP, currentConnections - 1);
      }
      // 연결이 0이 되면 맵에서 제거
      if (connectionLimits.get(clientIP) === 0) {
        connectionLimits.delete(clientIP);
      }
    }
  });

  // 클라이언트 연결 오류
  clientWs.on("error", (error) => {
    logger.error(`❌ 클라이언트 WebSocket 오류 (세션: ${sessionId}):`, error);
  });
};

// 연결 상태 확인 API
const connections = (req, res) => {
  const connections = Array.from(userConnections.keys()).map((sessionId) => {
    const conn = userConnections.get(sessionId);
    return {
      sessionId,
      clientConnected: conn.clientWs.readyState === WebSocket.OPEN,
      openaiConnected: conn.openaiWs.readyState === WebSocket.OPEN,
    };
  });

  res.json({
    totalConnections: connections.length,
    connections,
  });
};

module.exports = { realtime, connections };
