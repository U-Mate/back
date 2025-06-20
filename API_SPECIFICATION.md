# UMate Backend API 명세서

## 기본 정보

- **Base URL**: `https://yourdomain.com`
- **Protocol**: HTTPS
- **Content-Type**: `application/json`
- **Authentication**: JWT Token (Cookie-based)

## 공통 응답 형식

### 성공 응답

```json
{
  "success": true,
  "message": "설명 메시지",
  "data": {} // 필요시 추가 데이터
}
```

### 실패 응답

```json
{
  "success": false,
  "error": "오류 메시지"
}
```

---

## 🔐 인증 관련 API

### 1. 회원가입

- **Endpoint**: `POST /signUp`
- **Description**: 새로운 사용자 계정을 생성합니다.

**Request Body:**

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

---

### 2. 휴대폰 번호 중복 확인

- **Endpoint**: `POST /duplicateCheck`
- **Description**: 휴대폰 번호 중복 여부를 확인합니다.

**Request Body:**

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

---

### 3. 이메일 인증 코드 발송

- **Endpoint**: `POST /email`
- **Description**: 이메일 인증 코드를 발송합니다.

**Request Body:**

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

---

### 4. 이메일 인증 코드 확인

- **Endpoint**: `POST /checkAuth`
- **Description**: 발송된 인증 코드를 확인합니다.

**Request Body:**

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

---

### 5. 로그인

- **Endpoint**: `POST /login`
- **Description**: 사용자 로그인 (이메일 또는 휴대폰 번호)

**Request Body:**

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
  "id": 1,
  "name": "홍길동",
  "plan": 1,
  "birthDay": "1990-01-01T00:00:00.000Z",
  "message": "로그인에 성공했습니다."
}
```

**Notes:**

- JWT 토큰이 HttpOnly 쿠키로 설정됩니다.
- 비밀번호 5회 이상 실패 시 로그인 차단

---

### 6. 로그아웃

- **Endpoint**: `POST /logout`
- **Description**: 사용자 로그아웃

**Request Body:**

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

---

### 7. 토큰 검증 및 갱신

- **Endpoint**: `POST /tokenCheck`
- **Description**: JWT 토큰 검증 및 갱신
- **Authentication**: Required (Cookie)

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

---

### 8. 비밀번호 변경

- **Endpoint**: `POST /passwordChange`
- **Description**: 기존 비밀번호 확인 후 새 비밀번호로 변경

**Request Body:**

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

---

### 9. 비밀번호 재설정

- **Endpoint**: `POST /passwordReset`
- **Description**: 이메일 인증 후 비밀번호 재설정

**Request Body:**

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

---

### 10. 비밀번호 확인

- **Endpoint**: `POST /passwordCheck`
- **Description**: 현재 비밀번호 확인

**Request Body:**

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

---

### 11. 휴대폰 번호로 이메일 찾기

- **Endpoint**: `POST /phoneNumberCheck`
- **Description**: 휴대폰 번호로 등록된 이메일 확인 (마스킹 처리)

**Request Body:**

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

---

### 12. 회원 탈퇴

- **Endpoint**: `POST /withDrawal`
- **Description**: 계정 삭제 (개인정보 익명화)

**Request Body:**

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

---

### 13. 사용자 정보 조회

- **Endpoint**: `POST /userInfo`
- **Description**: 비밀번호 확인 후 사용자 상세 정보 조회

**Request Body:**

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

---

## 📱 요금제 관련 API

### 1. 전체 요금제 목록 조회

- **Endpoint**: `GET /planList`
- **Description**: 모든 요금제 목록을 조회합니다.

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
      "CALL_INFO_DETAIL": "기본 제공",
      "SMS_INFO": "무제한",
      "DATA_INFO": "10GB",
      "DATA_INFO_DETAIL": "속도제한 후 1Mbps",
      "SHARE_DATA": "Y",
      "AGE_GROUP": "20대",
      "USER_COUNT": 150,
      "RECEIVED_STAR_COUNT": 750,
      "REVIEW_USER_COUNT": 200
    }
  ]
}
```

---

### 2. 요금제 상세 정보 조회

- **Endpoint**: `GET /planDetail/:planId`
- **Description**: 특정 요금제의 상세 정보 (혜택, 리뷰 포함)

**Response:**

```json
{
  "success": true,
  "data": {
    "plan": {
      "PLAN_ID": 1,
      "PLAN_NAME": "청춘요금제",
      "MONTHLY_FEE": 35000
      // ... 기타 요금제 정보
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
        "CREATED_AT": "2024-01-01T00:00:00.000Z",
        "UPDATED_AT": "2024-01-01T00:00:00.000Z"
      }
    ]
  },
  "message": "요금제 상세 정보 조회 성공"
}
```

---

### 3. 요금제 필터링 조회

- **Endpoint**: `POST /filterPlans`
- **Description**: 조건에 따른 요금제 필터링

**Request Body:**

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
      "CALL_INFO": "무제한",
      "DATA_INFO": "10GB",
      "SHARE_DATA": "Y",
      "AGE_GROUP": "20대"
    }
  ],
  "message": "3개의 요금제 필터링 조회 성공"
}
```

---

### 4. 요금제 변경

- **Endpoint**: `POST /changeUserPlan`
- **Description**: 사용자의 요금제를 변경합니다.

**Request Body:**

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

---

### 5. 연령대별 맞춤 요금제 추천

- **Endpoint**: `POST /recommendPlansByAge`
- **Description**: 생년월일 기반 연령대별 맞춤 요금제 추천

**Request Body:**

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

---

## ⭐ 리뷰 관련 API

### 1. 내 리뷰 조회

- **Endpoint**: `GET /myReview/:userId`
- **Description**: 특정 사용자의 모든 리뷰 조회

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

---

### 2. 리뷰 작성

- **Endpoint**: `POST /createReview`
- **Description**: 새로운 리뷰 작성

**Request Body:**

```json
{
  "userId": 1,
  "planId": 1,
  "rating": 5,
  "review": "정말 좋은 요금제입니다! 강력 추천합니다."
}
```

**Validation:**

- `rating`: 0-5 사이의 값
- `review`: 10-100자 사이

**Response:**

```json
{
  "success": true,
  "message": "리뷰 작성 성공"
}
```

---

### 3. 리뷰 수정

- **Endpoint**: `POST /updateReview`
- **Description**: 기존 리뷰 수정

**Request Body:**

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

---

### 4. 리뷰 삭제

- **Endpoint**: `POST /deleteReview`
- **Description**: 리뷰 삭제

**Request Body:**

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

---

## 🤖 채팅봇 관련 API

### 1. 실시간 채팅 (WebSocket)

- **Endpoint**: `WS /realtime-chat`
- **Description**: OpenAI GPT-4o mini 기반 실시간 채팅 (음성 + 텍스트)
- **Parameters**:
  - `sessionId`: 세션 ID (optional)
  - `email`: 사용자 이메일 (optional)
  - `history`: 이전 대화 로드 여부 (optional)

**WebSocket Message Types:**

**Client → Server:**

```json
{
  "type": "user_message",
  "message": "안녕하세요!"
}
```

```json
{
  "type": "audio_data",
  "audio": "base64_encoded_audio"
}
```

**Server → Client:**

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
    "database": true,
    "personalized": true
  }
}
```

```json
{
  "type": "text_done",
  "text": "안녕하세요! 무엇을 도와드릴까요?",
  "response_id": "resp_123",
  "item_id": "item_123"
}
```

---

### 2. 채팅봇 연결 상태 확인

- **Endpoint**: `GET /realtime-chat/connections`
- **Description**: 현재 활성 채팅봇 연결 상태 조회

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

---

## 📋 공통 사항

### HTTP Status Codes

- `200`: 성공
- `404`: 잘못된 요청 또는 리소스 없음
- `401`: 인증 실패
- `500`: 서버 내부 오류

### Authentication

- JWT 토큰은 HttpOnly 쿠키로 관리
- 토큰 만료 시간: 30분
- 자동 갱신: `/tokenCheck` 엔드포인트 호출 시

### Rate Limiting

- 이메일 인증: 5분 내 유효
- 비밀번호 실패: 5회 이상 시 계정 잠금

### Security Features

- Argon2 해싱 (비밀번호)
- CORS 설정
- HTTPS 필수
- 입력값 유효성 검증
- SQL Injection 방지 (Prepared Statements)

### Data Validation

- 이메일: 유효한 이메일 형식
- 휴대폰: 11자리 숫자
- 비밀번호: 최소 8자, 특수문자 포함
- 생년월일: YYYY-MM-DD 형식

---

## 🗂️ 데이터베이스 스키마 참고

### 주요 테이블

- `USER`: 사용자 정보
- `PLAN_INFO`: 요금제 정보
- `PLAN_REVIEW`: 리뷰 정보
- `PLAN_BENEFIT`: 요금제 혜택
- `BENEFIT_INFO`: 혜택 정보
- `TOKEN`: JWT 토큰 관리
- `AUTHENTICATION`: 이메일 인증 코드

---

**API 버전**: v1.0.0  
**최종 업데이트**: 2024년 12월  
**문의**: 개발팀
