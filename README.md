# 📱 UMate API 명세서

> **요금제 추천 및 사용자 관리 시스템**

## 🚀 기본 정보

- **Base URL**: `https://seungwoo.i234.me:3333`
- **Protocol**: HTTPS Only
- **Authentication**: JWT (Cookie-based)
- **Content-Type**: `application/json`

---

## 📑 목차

- [🔐 사용자 인증](#-사용자-인증) (13개 API)
- [📱 요금제 관리](#-요금제-관리) (5개 API)
- [⭐ 리뷰 시스템](#-리뷰-시스템) (4개 API)
- [🤖 AI 채팅봇](#-ai-채팅봇) (2개 API)
- [📋 공통 정보](#-공통-정보)

---

## 🔐 사용자 인증

### 회원가입 & 로그인

<details>
<summary><strong>POST /signUp</strong> - 회원가입</summary>

**설명**: 새로운 사용자 계정을 생성합니다.

**Request:**

```json
{
  "name": "홍길동",
  "gender": "M",
  "birthDay": "1990-01-01",
  "phoneNumber": "01012345678",
  "email": "user@example.com",
  "password": "password123!",
  "phonePlan": 1
}
```

**Response:**

```json
{
  "success": true,
  "message": "회원가입이 완료되었습니다."
}
```

**Error Codes:**

- `404`: 올바르지못한 형식
- `500`: 회원가입에 실패했습니다.

</details>

<details>
<summary><strong>POST /login</strong> - 로그인</summary>

**설명**: 사용자 로그인 (이메일 또는 휴대폰 번호)

**Request:**

```json
{
  "id": "user@example.com", // 이메일 또는 휴대폰
  "password": "password123!"
}
```

**Response:**

```json
{
  "success": true,
  "id": 1,
  "name": "홍길동",
  "plan": 1,
  "birthDay": "1990-01-01T00:00:00.000Z",
  "message": "로그인에 성공했습니다."
}
```

**특징:**

- JWT 토큰이 HttpOnly 쿠키로 자동 설정
- 비밀번호 5회 이상 실패 시 계정 잠금

</details>

<details>
<summary><strong>POST /logout</strong> - 로그아웃</summary>

**설명**: 사용자 로그아웃 및 토큰 삭제

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "로그아웃에 성공했습니다."
}
```

</details>

### 이메일 인증

<details>
<summary><strong>POST /email</strong> - 인증코드 발송</summary>

**설명**: 이메일로 4자리 인증코드를 발송합니다.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "인증코드가 전송되었습니다."
}
```

**제한사항:**

- 인증코드 유효시간: 5분
- 보안 강화된 암호학적 난수 사용

</details>

<details>
<summary><strong>POST /checkAuth</strong> - 인증코드 확인</summary>

**설명**: 발송된 인증코드를 검증합니다.

**Request:**

```json
{
  "email": "user@example.com",
  "auth": "1234"
}
```

**Response:**

```json
{
  "success": true,
  "message": "인증코드 인증 성공"
}
```

</details>

### 비밀번호 관리

<details>
<summary><strong>POST /passwordChange</strong> - 비밀번호 변경</summary>

**설명**: 기존 비밀번호 확인 후 새 비밀번호로 변경

**Request:**

```json
{
  "email": "user@example.com",
  "password": "oldPassword123!",
  "newPassword": "newPassword123!"
}
```

**Response:**

```json
{
  "success": true,
  "message": "비밀번호 변경이 완료되었습니다."
}
```

</details>

<details>
<summary><strong>POST /passwordReset</strong> - 비밀번호 재설정</summary>

**설명**: 이메일 인증 후 비밀번호 재설정

**Request:**

```json
{
  "email": "user@example.com",
  "password": "newPassword123!"
}
```

**Response:**

```json
{
  "success": true,
  "message": "비밀번호 재설정 성공"
}
```

</details>

<details>
<summary><strong>POST /passwordCheck</strong> - 비밀번호 확인</summary>

**설명**: 현재 비밀번호가 맞는지 확인

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password123!"
}
```

**Response:**

```json
{
  "success": true,
  "message": "비밀번호 확인 성공"
}
```

</details>

### 계정 관리

<details>
<summary><strong>POST /duplicateCheck</strong> - 휴대폰 중복확인</summary>

**설명**: 휴대폰 번호 중복 여부를 확인합니다.

**Request:**

```json
{
  "phoneNumber": "01012345678"
}
```

**Response:**

```json
{
  "success": true,
  "message": "사용가능한 휴대폰 번호입니다."
}
```

</details>

<details>
<summary><strong>POST /phoneNumberCheck</strong> - 휴대폰으로 이메일 찾기</summary>

**설명**: 휴대폰 번호로 등록된 이메일 확인 (마스킹 처리)

**Request:**

```json
{
  "phoneNumber": "01012345678"
}
```

**Response:**

```json
{
  "success": true,
  "message": "등록된 이메일 : use***@example.com"
}
```

</details>

<details>
<summary><strong>POST /userInfo</strong> - 사용자 정보 조회</summary>

**설명**: 비밀번호 확인 후 사용자 상세 정보 조회

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password123!"
}
```

**Response:**

```json
{
  "success": true,
  "name": "홍길동",
  "gender": "M",
  "birthDay": "1990-01-01T00:00:00.000Z",
  "phoneNumber": "01012345678",
  "phonePlan": 1,
  "email": "user@example.com",
  "message": "유저 정보 조회 성공"
}
```

</details>

<details>
<summary><strong>POST /withDrawal</strong> - 회원 탈퇴</summary>

**설명**: 계정 삭제 (개인정보 익명화 처리)

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password123!"
}
```

**Response:**

```json
{
  "success": true,
  "message": "회원탈퇴가 완료되었습니다."
}
```

**특징:**

- 개인정보 완전 익명화
- JWT 토큰 자동 삭제

</details>

<details>
<summary><strong>GET /tokenCheck</strong> - 토큰 검증 🔒</summary>

**설명**: JWT 토큰 검증 및 자동 갱신

**Authentication**: Required (Cookie)

**Response:**

```json
{
  "success": true,
  "authenticated": true,
  "user": {
    "email": "user@example.com"
  }
}
```

**특징:**

- 토큰 자동 갱신 (30분)
- 중복 로그인 방지

</details>

---

## 📱 요금제 관리

### 요금제 조회

<details>
<summary><strong>GET /planList</strong> - 전체 요금제 목록</summary>

**설명**: 모든 요금제 목록을 조회합니다.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "PLAN_ID": 1,
      "PLAN_NAME": "청춘요금제",
      "MONTHLY_FEE": 35000,
      "CALL_INFO": "무제한",
      "DATA_INFO": "10GB",
      "AGE_GROUP": "20대",
      "USER_COUNT": 150,
      "RECEIVED_STAR_COUNT": 750,
      "REVIEW_USER_COUNT": 200
    }
  ]
}
```

</details>

<details>
<summary><strong>GET /planDetail/:planId</strong> - 요금제 상세정보</summary>

**설명**: 특정 요금제의 상세 정보 (혜택, 리뷰 포함)

**Parameters:**

- `planId`: 요금제 ID (URL 경로)

**Response:**

```json
{
  "success": true,
  "data": {
    "plan": {
      "PLAN_ID": 1,
      "PLAN_NAME": "청춘요금제",
      "MONTHLY_FEE": 35000,
      "CALL_INFO": "무제한",
      "DATA_INFO": "10GB"
    },
    "benefits": [
      {
        "BENEFIT_ID": 1,
        "NAME": "YouTube Premium",
        "TYPE": "스트리밍"
      }
    ],
    "reviews": [
      {
        "REVIEW_ID": 1,
        "USER_ID": 1,
        "STAR_RATING": 5,
        "REVIEW_CONTENT": "정말 좋은 요금제입니다!"
      }
    ]
  },
  "message": "요금제 상세 정보 조회 성공"
}
```

</details>

<details>
<summary><strong>POST /filterPlans</strong> - 요금제 필터링</summary>

**설명**: 조건에 따른 요금제 필터링 검색

**Request:**

```json
{
  "ageGroup": "20대", // optional
  "minFee": 30000, // optional
  "maxFee": 50000, // optional
  "dataType": "무제한", // optional
  "benefitIds": "1,2,3" // optional, 콤마로 구분
}
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "PLAN_ID": 1,
      "PLAN_NAME": "청춘요금제",
      "MONTHLY_FEE": 35000,
      "DATA_INFO": "10GB",
      "AGE_GROUP": "20대"
    }
  ],
  "message": "3개의 요금제 필터링 조회 성공"
}
```

</details>

<details>
<summary><strong>POST /recommendPlansByAge</strong> - 연령대별 추천</summary>

**설명**: 생년월일 기반 연령대별 맞춤 요금제 추천 (AI 기반)

**Request:**

```json
{
  "birthday": "1990-01-01"
}
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "planId": 1,
      "name": "청춘요금제",
      "monthlyFee": 35000,
      "dataInfo": "10GB",
      "shareData": "Y",
      "avgRating": 4.2,
      "reviewCount": 150
    }
  ]
}
```

**특징:**

- 연령대별 리뷰 분석
- 평점 높은 순으로 최대 5개 추천

</details>

### 요금제 변경

<details>
<summary><strong>POST /changeUserPlan</strong> - 요금제 변경</summary>

**설명**: 사용자의 요금제를 변경합니다.

**Request:**

```json
{
  "userId": 1,
  "newPlanId": 2
}
```

**Response:**

```json
{
  "success": true,
  "message": "요금제 변경에 성공했습니다."
}
```

**특징:**

- 기존 요금제 USER_COUNT 자동 감소
- 새 요금제 USER_COUNT 자동 증가

</details>

---

## ⭐ 리뷰 시스템

<details>
<summary><strong>GET /myReview/:userId</strong> - 내 리뷰 조회</summary>

**설명**: 특정 사용자의 모든 리뷰 목록 조회

**Parameters:**

- `userId`: 사용자 ID (URL 경로)

**Response:**

```json
{
  "success": true,
  "message": "내 리뷰 조회 성공",
  "reviews": [
    {
      "REVIEW_ID": 1,
      "USER_ID": 1,
      "PLAN_ID": 1,
      "STAR_RATING": 5,
      "REVIEW_CONTENT": "정말 좋은 요금제입니다!",
      "CREATED_AT": "2024-01-01T00:00:00.000Z",
      "UPDATED_AT": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

</details>

<details>
<summary><strong>POST /createReview</strong> - 리뷰 작성</summary>

**설명**: 새로운 요금제 리뷰를 작성합니다.

**Request:**

```json
{
  "userId": 1,
  "planId": 1,
  "rating": 5,
  "review": "정말 좋은 요금제입니다! 강력 추천합니다."
}
```

**Response:**

```json
{
  "success": true,
  "message": "리뷰 작성 성공"
}
```

**유효성 검증:**

- `rating`: 0~5 사이의 값 (필수)
- `review`: 10~100자 사이 (필수)

**특징:**

- 요금제 평점 자동 업데이트
- 리뷰 수 자동 증가

</details>

<details>
<summary><strong>POST /updateReview</strong> - 리뷰 수정</summary>

**설명**: 기존 작성한 리뷰를 수정합니다.

**Request:**

```json
{
  "reviewId": 1,
  "rating": 4,
  "review": "수정된 리뷰 내용입니다."
}
```

**Response:**

```json
{
  "success": true,
  "message": "리뷰 수정 성공"
}
```

**특징:**

- 요금제 평점 자동 재계산

</details>

<details>
<summary><strong>POST /deleteReview</strong> - 리뷰 삭제</summary>

**설명**: 작성한 리뷰를 삭제합니다.

**Request:**

```json
{
  "reviewId": 1
}
```

**Response:**

```json
{
  "success": true,
  "message": "리뷰 삭제 성공"
}
```

**특징:**

- 요금제 평점 자동 재계산
- 리뷰 수 자동 감소

</details>

---

## 🤖 AI 채팅봇

<details>
<summary><strong>WS /realtime-chat</strong> - 실시간 채팅 (WebSocket)</summary>

**설명**: OpenAI GPT-4o mini 기반 실시간 AI 채팅 (음성 + 텍스트)

**Connection:**

```
wss://yourdomain.com/realtime-chat?sessionId=123&email=user@example.com&history=true
```

**Parameters:**

- `sessionId`: 세션 ID (optional)
- `email`: 사용자 이메일 (optional)
- `history`: 이전 대화 로드 여부 (optional)

**클라이언트 → 서버:**

```json
{
  "type": "user_message",
  "message": "안녕하세요! 요금제 추천해주세요."
}
```

```json
{
  "type": "audio_data",
  "audio": "base64_encoded_audio_data"
}
```

**서버 → 클라이언트:**

```json
{
  "type": "connection",
  "status": "connected",
  "message": "유식이와 연결이 되었습니다.",
  "sessionId": "session_123",
  "capabilities": {
    "text": true,
    "audio": true,
    "voice": "alloy",
    "personalized": true
  }
}
```

```json
{
  "type": "text_done",
  "text": "안녕하세요! 연령대와 예산을 알려주시면 맞춤 요금제를 추천해드릴게요!",
  "response_id": "resp_123"
}
```

**주요 기능:**

- 💬 실시간 텍스트 채팅
- 🎤 음성 인식 & 음성 응답
- 🧠 대화 히스토리 자동 저장
- 🔍 부적절한 메시지 필터링
- 📱 요금제 데이터 실시간 연동

</details>

<details>
<summary><strong>GET /realtime-chat/connections</strong> - 연결 상태 확인</summary>

**설명**: 현재 활성화된 채팅봇 연결 상태를 조회합니다.

**Response:**

```json
{
  "success": true,
  "connections": [
    {
      "sessionId": "session_123",
      "userEmail": "user@example.com",
      "status": "connected",
      "connectedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

</details>

---

## 📋 공통 정보

### 응답 형식

#### ✅ 성공 응답

```json
{
  "success": true,
  "message": "성공 메시지",
  "data": {} // 추가 데이터 (선택적)
}
```

#### ❌ 실패 응답

```json
{
  "success": false,
  "error": "구체적인 오류 메시지"
}
```

### HTTP 상태 코드

| Code  | Description | 사용 예시                    |
| ----- | ----------- | ---------------------------- |
| `200` | 성공        | 정상 처리 완료               |
| `401` | 인증 실패   | 토큰 만료, 로그인 필요       |
| `404` | 요청 오류   | 잘못된 데이터, 리소스 없음   |
| `500` | 서버 오류   | 데이터베이스 오류, 서버 장애 |

### 보안 기능

- 🔐 **JWT 토큰** (30분 자동 만료)
- 🔒 **Argon2 해싱** (비밀번호 암호화)
- 🛡️ **CORS 설정** (도메인 제한)
- ✅ **SQL Injection 방지** (Prepared Statements)
- 🚫 **Rate Limiting** (5회 실패 시 계정 잠금)
- 🔍 **입력값 검증** (모든 API 파라미터)

### 데이터 유효성 검증

| 항목      | 검증 규칙               | 예시                 |
| --------- | ----------------------- | -------------------- |
| 이메일    | 유효한 이메일 형식      | `user@example.com`   |
| 휴대폰    | 11자리 숫자             | `01012345678`        |
| 비밀번호  | 최소 8자, 특수문자 포함 | `password123!`       |
| 생년월일  | YYYY-MM-DD 형식         | `1990-01-01`         |
| 리뷰 평점 | 0~5 사이 정수           | `4`                  |
| 리뷰 내용 | 10~100자                | `좋은 요금제입니다!` |

### 개발 가이드

<details>
<summary><strong>쿠키 기반 인증 처리</strong></summary>

```javascript
// 로그인 요청 시 자동으로 설정되는 JWT 쿠키
{
  httpOnly: true,        // XSS 공격 방지
  secure: true,          // HTTPS에서만 전송
  sameSite: 'none',      // CORS 요청 허용
  maxAge: 30 * 60 * 1000 // 30분 만료
}

// API 요청 시 쿠키 포함 방법
fetch('/api/tokenCheck', {
  method: 'POST',
  credentials: 'include'  // 쿠키 자동 포함
});
```

</details>

<details>
<summary><strong>오류 처리 패턴</strong></summary>

```javascript
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // JWT 쿠키 포함
      ...options,
    });

    const data = await response.json();

    // 응답 상태 확인
    if (!data.success) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    console.error("API 요청 실패:", error.message);

    // 인증 오류 시 로그인 페이지로 리다이렉트
    if (error.message.includes("토큰") || error.message.includes("인증")) {
      window.location.href = "/login";
    }

    throw error;
  }
}

// 사용 예시
try {
  const result = await apiRequest("/api/login", {
    body: JSON.stringify({ id: "user@example.com", password: "password123!" }),
  });

  console.log("로그인 성공:", result);
} catch (error) {
  alert("로그인 실패: " + error.message);
}
```

</details>

<details>
<summary><strong>WebSocket 연결 관리</strong></summary>

```javascript
class ChatbotClient {
  constructor(email) {
    this.email = email;
    this.ws = null;
    this.sessionId = null;
  }

  connect() {
    const wsUrl = `wss://yourdomain.com/realtime-chat?email=${this.email}&history=true`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("🔗 채팅봇 연결됨");
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      console.log("🔌 채팅봇 연결 종료");
      // 자동 재연결 로직
      setTimeout(() => this.connect(), 3000);
    };
  }

  sendMessage(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "user_message",
          message: message,
        })
      );
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case "connection":
        this.sessionId = data.sessionId;
        console.log("✅ 연결 완료:", data.message);
        break;

      case "text_done":
        console.log("🤖 AI 응답:", data.text);
        this.displayMessage("assistant", data.text);
        break;

      case "error":
        console.error("❌ 오류:", data.error);
        break;
    }
  }

  displayMessage(role, content) {
    // UI에 메시지 표시하는 로직
    const messageElement = document.createElement("div");
    messageElement.className = `message ${role}`;
    messageElement.textContent = content;
    document.getElementById("chat-messages").appendChild(messageElement);
  }
}

// 사용 예시
const chatbot = new ChatbotClient("user@example.com");
chatbot.connect();

// 메시지 전송
document.getElementById("send-button").onclick = () => {
  const input = document.getElementById("message-input");
  chatbot.sendMessage(input.value);
  input.value = "";
};
```

</details>

---

## 📞 지원 정보

- **API 버전**: v1.0.0
- **문서 업데이트**: 2025년 06월
- **기술 지원**: 평일 09:00-18:00

---

> 💡 **개발 팁**: 모든 API는 HTTPS 필수이며, 쿠키 기반 JWT 인증으로 보안이 강화되어 있습니다. WebSocket 연결은 자동 재연결 로직을 구현하는 것을 권장합니다.
