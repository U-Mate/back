# UMate Backend - AI Chatbot

UMate 백엔드는 OpenAI API를 활용한 AI 챗봇 서비스를 제공합니다.

## 🚀 기능

### 1. REST API 챗봇 (`chatbot.js`)

- 간단한 HTTP POST 요청으로 챗봇과 대화
- 대화 히스토리 관리
- 스트리밍 응답 지원 (Server-Sent Events)
- 내장된 테스트 웹페이지

### 2. WebSocket 챗봇 (`chatbot-websocket.js`)

- 실시간 양방향 통신
- 스트리밍 응답으로 타이핑 효과
- 세션별 대화 히스토리 관리
- 자동 재연결 기능

### 3. GPT-4o mini Realtime 챗봇 (`chatbot-realtime.js`) ⭐

- OpenAI Realtime API 사용으로 초고속 응답
- 진정한 실시간 스트리밍 대화
- 음성 입력/출력 지원
- 최신 GPT-4o mini 모델 사용

### 4. 데이터베이스 연동 챗봇 (`chatbot-with-db.js`) 🔥 최신!

- **실시간 DB 검색**: 사용자 질문에 맞는 정보를 DB에서 실시간 검색
- **컨텍스트 기반 답변**: 검색된 정보를 GPT에게 제공하여 정확한 답변 생성
- **사용자 맞춤화**: 사용자 정보를 고려한 개인화된 답변
- **FAQ 자동 연결**: 관련 FAQ를 자동으로 찾아서 제공

### 5. 정적 지식베이스 챗봇 (`chatbot-with-static-context.js`) 📚

- **전체 정보 로드**: 시스템 시작 시 모든 서비스 정보를 메모리에 로드
- **빠른 응답**: DB 조회 없이 즉시 답변 가능
- **자동 업데이트**: 주기적으로 지식베이스 업데이트
- **대용량 처리**: 많은 서비스 정보도 효율적으로 처리

## 📋 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# OpenAI API 설정 (필수)
OPENAI_API_KEY=your_openai_api_key_here
CHATBOT_API=your_openai_api_key_here

# 서버 설정
PORT=3000

# CORS 설정
LOCALHOST=http://localhost:3000
MY_HOST=http://localhost:3000

# 데이터베이스 설정 (DB 연동 챗봇용)
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_SCHEMA=umate_db

# JWT 설정 (기존 member.js용)
JWT_SECRET=your_jwt_secret_here
```

### 3. OpenAI API 키 발급

1. [OpenAI 웹사이트](https://platform.openai.com/api-keys)에서 계정 생성
2. API 키 생성
3. `.env` 파일의 `OPENAI_API_KEY`에 입력

## 🏃‍♂️ 실행 방법

### REST API 챗봇 실행

```bash
node chatbot.js
```

서버 실행 후:

- 테스트 페이지: http://localhost:3000
- API 엔드포인트: http://localhost:3000/api/chat

### WebSocket 챗봇 실행

```bash
node chatbot-websocket.js
```

서버 실행 후:

- 테스트 페이지: http://localhost:3001/websocket
- WebSocket 엔드포인트: ws://localhost:3001/ws/chat

### GPT-4o mini Realtime 챗봇 실행

```bash
npm run chatbot-realtime
```

서버 실행 후:

- 테스트 페이지: http://localhost:3002/realtime
- WebSocket 엔드포인트: ws://localhost:3002/ws/realtime-chat

### 🔥 데이터베이스 연동 Realtime 챗봇 실행 (추천!)

```bash
npm run chatbot-db
```

서버 실행 후:

- 테스트 페이지: `db-chatbot-test.html` 파일을 브라우저로 열기
- WebSocket 엔드포인트: ws://localhost:3003/ws/realtime-chat
- 서비스 검색 API: http://localhost:3003/api/services/search?q=검색어

### 📚 정적 지식베이스 챗봇 실행

```bash
npm run chatbot-static
```

서버 실행 후:

- 테스트 페이지: `db-chatbot-test.html` 파일을 열고 포트를 3004로 변경
- WebSocket 엔드포인트: ws://localhost:3004/ws/realtime-chat
- 지식베이스 상태: http://localhost:3004/api/knowledge/status

## 📚 API 사용법

### REST API 챗봇

#### 1. 기본 채팅 API

```http
POST /api/chat
Content-Type: application/json

{
  "message": "안녕하세요!",
  "conversationHistory": []
}
```

**응답:**

```json
{
  "success": true,
  "reply": "안녕하세요! 무엇을 도와드릴까요?",
  "conversationHistory": [
    { "role": "user", "content": "안녕하세요!" },
    { "role": "assistant", "content": "안녕하세요! 무엇을 도와드릴까요?" }
  ]
}
```

#### 2. 스트리밍 API

```http
POST /api/chat/stream
Content-Type: application/json

{
  "message": "긴 답변이 필요한 질문을 해주세요",
  "conversationHistory": []
}
```

**응답 (Server-Sent Events):**

```
data: {"content": "안녕", "done": false}
data: {"content": "하세요", "done": false}
data: {"content": "", "done": true, "fullResponse": "안녕하세요"}
```

### WebSocket 챗봇

#### 연결

```javascript
const ws = new WebSocket(
  "ws://localhost:3001/ws/chat?sessionId=unique_session_id"
);
```

#### 메시지 전송

```javascript
ws.send(
  JSON.stringify({
    message: "안녕하세요!",
  })
);
```

#### 메시지 수신

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "connection":
      console.log("연결됨:", data.message);
      break;
    case "stream":
      console.log("스트리밍:", data.content);
      break;
    case "complete":
      console.log("완료:", data.fullResponse);
      break;
    case "error":
      console.log("오류:", data.message);
      break;
  }
};
```

## 🔧 고급 설정

### 1. OpenAI 모델 변경

`chatbot.js` 또는 `chatbot-websocket.js`에서 모델을 변경할 수 있습니다:

```javascript
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini", // 기본값: GPT-4o mini 사용
  // 다른 옵션: "gpt-4o", "gpt-4", "gpt-3.5-turbo"
  // ...
});
```

**💡 모델 비교:**

- `gpt-4o-mini`: 빠르고 저렴한 최신 모델 (권장)
- `gpt-4o`: 가장 강력한 모델
- `gpt-4`: 고품질 응답
- `gpt-3.5-turbo`: 빠르고 저렴한 기존 모델

### 2. 시스템 프롬프트 커스터마이징

```javascript
{
  role: 'system',
  content: '당신은 UMate의 전문 상담사입니다. 대학생들의 고민을 친근하게 들어주세요.'
}
```

### 3. 응답 설정 조정

```javascript
const completion = await openai.chat.completions.create({
  model: "gpt-3.5-turbo",
  messages: messages,
  max_tokens: 2000, // 최대 토큰 수 증가
  temperature: 0.5, // 창의성 조절 (0-1)
  top_p: 0.9, // 응답 다양성 조절
  frequency_penalty: 0.1, // 반복 억제
  presence_penalty: 0.1, // 주제 다양성
});
```

## 🐛 문제 해결

### 1. OpenAI API 오류

- API 키가 올바른지 확인
- 잔액이 충분한지 확인
- 요청 제한(Rate Limit)에 걸리지 않았는지 확인

### 2. WebSocket 연결 실패

- 방화벽 설정 확인
- 포트 충돌 확인 (3001 포트)
- 브라우저 개발자 도구에서 네트워크 탭 확인

### 3. CORS 오류

`.env` 파일의 CORS 설정을 확인하세요:

```env
LOCALHOST=http://localhost:3000
MY_HOST=https://yourdomain.com
```

## 📊 모니터링

### 세션 정보 확인

```http
GET /api/sessions
```

### 특정 세션 초기화

```http
DELETE /api/sessions/{sessionId}
```

### 서버 상태 확인

```http
GET /api/health
```

## 🔒 보안 고려사항

1. **API 키 보호**: `.env` 파일을 반드시 `.gitignore`에 추가
2. **CORS 설정**: 프로덕션에서는 허용된 도메인만 설정
3. **Rate Limiting**: 과도한 요청을 방지하기 위한 제한 설정 권장
4. **입력 검증**: 사용자 입력에 대한 적절한 검증 구현

## 📈 성능 최적화

1. **응답 캐싱**: 자주 묻는 질문에 대한 캐싱 구현
2. **세션 정리**: 오래된 세션 자동 정리 구현
3. **로드 밸런싱**: 다중 인스턴스 운영 시 고려
4. **데이터베이스**: 대화 히스토리의 영속성을 위한 DB 연동

## 🤝 기여하기

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 라이센스

ISC License
