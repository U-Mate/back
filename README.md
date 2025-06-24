# 📱 UMate API 명세서

> **요금제 추천 및 사용자 관리 시스템**

## 🚀 기본 정보

- **Base URL**: `https://seungwoo.i234.me:3333`
- **Protocol**: HTTPS Only (SSL/TLS 인증서 필수)
- **Authentication**: JWT (HttpOnly Cookie, 30분 자동 갱신, 중복 로그인 방지)
- **Content-Type**: `application/json`
- **WebSocket**: `/realtime-chat` (GPT-4o 기반 AI 챗봇)
- **Logging**: Winston (일별 로그 분리, 14일 보관)

---

## 📑 목차

- [🔐 사용자 인증](#-사용자-인증) (14개 API)
- [📱 요금제 관리](#-요금제-관리) (5개 API)
- [⭐ 리뷰 시스템](#-리뷰-시스템) (4개 API)
- [🤖 AI 챗봇](#-ai-챗봇) (WebSocket + API)
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
  "birthDay": "19900101",
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
  "id": "user@example.com", // 이메일 또는 휴대폰 번호
  "password": "password123!"
}
```

**Response:**

```json
{
  "success": true,
  "message": "로그인에 성공했습니다."
}
```

**특징:**

- **JWT 토큰**: HttpOnly 쿠키로 자동 설정 (30분 만료)
- **토큰 내용**: `{ email, id, name, plan, membership, birthDay }`
- **중복 로그인 방지**: TOKEN 테이블 기반 관리
- **계정 보안**: 비밀번호 5회 이상 실패 시 계정 잠금
- **실패 카운트 초기화**: 성공 로그인 시 자동 리셋

**Error Cases:**

- `404`: "비밀번호 5회 이상 실패했습니다.\n비밀번호 재설정 후 다시 시도해주세요."
- `404`: "로그인에 실패했습니다." (아이디/비밀번호 불일치)

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

**설명**: 이메일로 6자리 인증코드를 발송합니다.

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

- **인증코드**: 6자리 숫자 (000000~999999)
- **유효시간**: 5분
- **보안**: 48비트 암호학적 난수 (`randomBytes(6)`) 사용
- **Gmail SMTP**: 안전한 이메일 발송

</details>

<details>
<summary><strong>POST /checkAuth</strong> - 인증코드 확인</summary>

**설명**: 발송된 6자리 인증코드를 검증합니다.

**Request:**

```json
{
  "email": "user@example.com",
  "auth": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "message": "인증코드 인증 성공"
}
```

**특징:**

- **유효성 검증**: 5분 이내, 미사용 인증코드만 유효
- **일회성**: 인증 성공 시 `USE_NOT = "Y"`로 변경
- **최신 코드**: 동일 이메일의 가장 최근 인증코드만 사용

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
<summary><strong>POST /emailDuplicate</strong> - 이메일 중복확인</summary>

**설명**: 이메일 주소 중복 여부를 확인합니다.

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
  "message": "사용가능한 이메일입니다."
}
```

**Error Cases:**

- `404`: "이미 존재하는 이메일입니다."
- `500`: "이메일 확인 중 오류가 발생했습니다."

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
  "birthDay": "19900101",
  "phoneNumber": "01012345678",
  "phonePlan": 1,
  "email": "user@example.com",
  "message": "유저 정보 조회 성공"
}
```

</details>

<details>
<summary><strong>POST /withDrawal</strong> - 회원 탈퇴</summary>

**설명**: 계정 탈퇴 (개인정보 익명화 처리)

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

- **개인정보 익명화**:
  - 이메일, 비밀번호, 이름, 성별 → 빈 문자열
  - 휴대폰 번호, 요금제, 실패 카운트 → 0
  - 생년월일 → 해당 연도 1월 1일로 변경
- **토큰 완전 삭제**: TOKEN 테이블에서 제거
- **쿠키 삭제**: 브라우저에서 JWT 토큰 쿠키 자동 제거
- **트랜잭션 처리**: 모든 작업을 원자적으로 실행

</details>

<details>
<summary><strong>GET /tokenCheck</strong> - 토큰 검증 및 갱신 🔒</summary>

**설명**: JWT 토큰 검증, 자동 갱신 및 중복 로그인 체크

**Authentication**: Required (Cookie)

**Response:**

```json
{
  "success": true,
  "authenticated": true,
  "user": {
    "email": "user@example.com",
    "id": 1,
    "name": "홍길동",
    "plan": 1,
    "membership": "VIP",
    "birthDay": "1990-01-01T00:00:00.000Z"
  }
}
```

**특징:**

- **자동 토큰 갱신**: 매 요청 시 30분 연장
- **중복 로그인 방지**: TOKEN 테이블에서 현재 토큰 검증
- **보안 강화**: 다른 곳에서 로그인 시 자동 로그아웃
- **사용자 정보**: 토큰에서 디코딩된 모든 사용자 데이터 반환

**Error Cases:**

- `401`: "토큰이 없습니다."
- `401`: "토큰 검증에 실패했습니다."
- `401`: "다른 곳에서 로그인을 시도했습니다.\n안전을 위해 로그아웃 처리되었습니다."
- `500`: "토큰 갱신 중 오류가 발생했습니다.\n안전을 위해 로그아웃 처리되었습니다."

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
      "CALL_INFO_DETAIL": "",
      "SMS_INFO": "무제한",
      "DATA_INFO": "10GB",
      "DATA_INFO_DETAIL": "+무제한 제공",
      "SHARE_DATA": "5GB",
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
      "CALL_INFO_DETAIL": "",
      "SMS_INFO": "무제한",
      "DATA_INFO": "10GB",
      "DATA_INFO_DETAIL": "+무제한 제공",
      "SHARE_DATA": "5GB",
      "AGE_GROUP": "20대",
      "USER_COUNT": 150,
      "RECEIVED_STAR_COUNT": 750,
      "REVIEW_USER_COUNT": 200
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
        "REVIEW_CONTENT": "정말 좋은 요금제입니다!",
        "CREATED_AT": "2024-01-15T10:30:00.000Z",
        "UPDATED_AT": "2024-01-15T10:30:00.000Z"
      }
    ]
  },
  "message": "요금제 상세 정보 조회 성공"
}
```

</details>

<details>
<summary><strong>POST /filterPlans</strong> - 요금제 필터링</summary>

**설명**: 다양한 조건으로 요금제를 필터링하여 검색합니다.

**Request:**

```json
{
  "ageGroup": "20대", // optional: 10대, 20대, 30대, 40대, 50대, 60대, 70대, 전체대상, 상관없음
  "minFee": 30000, // optional: 최소 월 요금
  "maxFee": 50000, // optional: 최대 월 요금
  "dataType": "완전 무제한", // optional: "완전 무제한", "다쓰면 무제한", "상관없어요"
  "benefitIds": "1,2,3" // optional: 혜택 ID 목록 (콤마로 구분, AND 조건)
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
      "CALL_INFO": "무제한",
      "DATA_INFO": "10GB",
      "DATA_INFO_DETAIL": "+무제한 데이터 제공",
      "SHARE_DATA": "5GB",
      "AGE_GROUP": "20대"
    }
  ],
  "message": "3개의 요금제 필터링 조회 성공"
}
```

**특징:**

- **복합 조건 검색**: 여러 조건을 동시에 만족하는 요금제만 반환
- **데이터 타입 구분**:
  - `완전 무제한`: DATA_INFO가 "데이터 무제한"인 요금제
  - `다쓰면 무제한`: DATA_INFO_DETAIL에 추가 혜택(+)이 있는 요금제
- **혜택 매칭**: 지정된 모든 혜택을 포함하는 요금제만 반환

</details>

<details>
<summary><strong>POST /recommendPlansByAge</strong> - 연령대별 추천</summary>

**설명**: 생년월일 기반 연령대별 맞춤 요금제 추천 (AI 기반)

**Request:**

```json
{
  "birthday": "19900101"
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
      "shareData": "5GB",
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

**설명**: 사용자의 요금제를 변경하고 멤버십 등급을 자동으로 조정합니다.

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
- **멤버십 등급 자동 결정**:
  - 월 95,000원 이상: **VVIP**
  - 월 74,800원 이상: **VIP**
  - 그 외: **우수**

**Error Cases:**

- `404`: 유저 또는 요금제를 찾을 수 없음
- `500`: 요금제 변경 실패

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
      "USER_ID": 1,
      "PLAN_ID": 1,
      "STAR_RATING": 5,
      "REVIEW_CONTENT": "정말 좋은 요금제입니다!"
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

- `rating`: 0~5 사이의 값 (필수) - 범위 벗어나면 404 에러
- `review`: 10~100자 사이 (필수) - 범위 벗어나면 404 에러

**특징:**

- **요금제 평점 업데이트**: `RECEIVED_STAR_COUNT`에 새 평점 추가
- **리뷰 수 증가**: `REVIEW_USER_COUNT` 자동 +1
- **요금제 검증**: 존재하지 않는 요금제면 404 에러
- **트랜잭션 처리**: 리뷰 생성과 평점 업데이트 원자적 실행

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

- **평점 재계산**: 기존 평점을 빼고 새 평점을 더해서 정확한 평점 유지
- **유효성 검증**: 존재하는 리뷰만 수정 가능
- **트랜잭션 처리**: 리뷰와 요금제 평점을 동시에 업데이트

**Error Cases:**

- `404`: "비정상적인 접근입니다." (리뷰 평점/내용 범위 초과, 존재하지 않는 리뷰)

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

- **평점 재계산**: `RECEIVED_STAR_COUNT`에서 삭제된 평점 차감
- **리뷰 수 감소**: `REVIEW_USER_COUNT` 자동 -1
- **유효성 검증**: 존재하는 리뷰와 요금제만 처리
- **트랜잭션 처리**: 리뷰 삭제와 평점 업데이트 원자적 실행

**Error Cases:**

- `404`: "비정상적인 접근입니다." (존재하지 않는 리뷰 또는 요금제)

</details>

---

## 🤖 AI 챗봇

<details>
<summary><strong>WS /realtime-chat</strong> - 실시간 채팅 (WebSocket)</summary>

**설명**: OpenAI GPT-4o mini 기반 실시간 AI 채팅 (음성 + 텍스트)

**Connection:**

```
wss://seungwoo.i234.me:3333/realtime-chat?sessionId=123&email=user@example.com&history=true
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

- 💬 **실시간 텍스트 채팅**: 스트리밍 기반 즉시 응답
- 🎤 **음성 인식 & 음성 응답**: 6가지 음성 스타일 지원 (alloy, echo, fable, onyx, nova, shimmer)
- 🧠 **개인화된 대화**: 사용자 정보 + 전체 요금제 정보 자동 로드
- 📚 **대화 히스토리**: 최근 20개 메시지 자동 저장/로드
- 🔍 **지능형 메시지 필터링**:
  - 부적절한 언어 차단 (욕설, 폭력적 표현 등)
  - 서비스 무관 주제 차단 (학문, 요리, 영화 등)
  - 음성/텍스트별 다른 필터링 기준 적용
- 📱 **실시간 서비스 연동**: 모든 요금제 정보, 혜택, 리뷰 데이터 실시간 제공

</details>

<details>
<summary><strong>GET /realtime-chat/connections</strong> - 연결 상태 확인</summary>

**설명**: 현재 활성화된 채팅봇 연결 상태를 조회합니다.

**Response:**

```json
{
  "totalConnections": 2,
  "connections": [
    {
      "sessionId": "session_1640995200000_0.123456789",
      "clientConnected": true,
      "openaiConnected": true
    },
    {
      "sessionId": "session_1640995300000_0.987654321",
      "clientConnected": true,
      "openaiConnected": false
    }
  ]
}
```

**응답 필드:**

- `totalConnections`: 전체 활성 연결 수
- `connections`: 각 연결의 상세 정보
  - `sessionId`: 세션 고유 ID
  - `clientConnected`: 클라이언트 WebSocket 연결 상태
  - `openaiConnected`: OpenAI Realtime API 연결 상태

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

- 🔐 **JWT 토큰 관리**:
  - HttpOnly 쿠키 기반 (XSS 공격 방지)
  - 30분 자동 만료 및 갱신
  - TOKEN 테이블 기반 중복 로그인 방지
- 🔒 **Argon2 비밀번호 해싱**:
  - Argon2id 알고리즘 사용
  - 환경변수 기반 보안 파라미터 조정
- 🛡️ **CORS 보안**:
  - 허용된 도메인만 접근 가능
  - `credentials: true` 설정
- ✅ **SQL Injection 방지**: Prepared Statements 사용
- 🚫 **계정 보안**:
  - 비밀번호 5회 실패 시 계정 잠금
  - 성공 로그인 시 실패 카운트 자동 리셋
- 🔍 **입력값 검증**: 모든 API 파라미터 형식 검증
- 🎯 **AI 챗봇 보안**: 메시지 필터링 시스템

### 데이터 유효성 검증

| 항목      | 검증 규칙                                            | 예시                 |
| --------- | ---------------------------------------------------- | -------------------- |
| 이메일    | 유효한 이메일 형식                                   | `user@example.com`   |
| 휴대폰    | 10~11자리 숫자                                       | `01012345678`        |
| 비밀번호  | **12~20자, 영문 대소문자+숫자+특수문자 각 1개 이상** | `MySecurePass123!`   |
| 생년월일  | YYYYMMDD 형식, 유효한 날짜 검증                      | `19900101`           |
| 리뷰 평점 | 0~5 사이 소수점 1자리                                | `4`, `2.5`           |
| 리뷰 내용 | 10~100자                                             | `좋은 요금제입니다!` |

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
fetch('/tokenCheck', {
  method: 'GET',
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
  const result = await apiRequest("/login", {
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
    const wsUrl = `wss://seungwoo.i234.me:3333/realtime-chat?email=${this.email}&history=true`;
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

## 🧪 테스트 & 개발 도구

프로젝트에는 다양한 기능을 테스트할 수 있는 HTML 파일들이 포함되어 있습니다:

### 🛠️ 개발 환경 설정

```bash
# 의존성 설치
npm install

# 환경 변수 설정 (.env 파일 생성 필요)
PORT=3333
DB_HOST=localhost
CHATBOT_API=your_openai_api_key
HTTPS_KEY=/path/to/private.key
HTTPS_CERT=/path/to/certificate.crt

# 서버 실행
npm start  # 프로덕션
npm run dev  # 개발 (nodemon)
```

---

## 📞 지원 정보

- **API 버전**: v1.0.0
- **서버 환경**: Node.js 16+, HTTPS 전용
- **문서 업데이트**: 2025년 6월
- **기술 지원**: 평일 09:00-18:00

---

> 💡 **개발 팁**:
>
> - 모든 API는 HTTPS 필수이며, 쿠키 기반 JWT 인증으로 보안이 강화되어 있습니다
> - WebSocket 연결은 자동 재연결 로직을 구현하는 것을 권장합니다
> - 챗봇은 개인화된 응답을 위해 사용자 이메일 제공을 권장합니다
> - 음성 기능 사용 시 마이크 권한이 필요합니다
