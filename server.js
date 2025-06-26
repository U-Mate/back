require("dotenv").config();
const fs = require("fs");
const https = require("https");
const express = require("express");
const expressWs = require("express-ws");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const cors = require("cors");

const {
  signUp,
  phoneNumberDuplicate,
  emailDuplicate,
  emailAuth,
  checkAuth,
  getUserInfo,
  tokenCheck,
  logout,
  login,
  withDrawal,
  passwordChange,
  passwordReset,
  passwordCheck,
  phoneNumberCheck,
  authenticateToken,
} = require("./member");
const { realtime, connections } = require("./chatbot");
const {
  getMyReview,
  createReview,
  updateReview,
  deleteReview,
  survey,
} = require("./review");
const {
  getPlanList,
  getPlanDetail,
  filterPlans,
  changeUserPlan,
  recommendPlansByAge,
} = require("./plan");
const logger = require("./log");

// 🛡️ 종합 보안 모듈 import
const {
  validateAndSanitizeInput,
  setSecurityHeaders,
  detectAndBlockXSS,
  validateCSRFToken,
  setCSRFToken,
  safeSendJSON,
  setSecureCookie,
} = require("./xss-protection");

// 🛡️ 기본 보안 설정 (helmet)
app.use(
  helmet({
    contentSecurityPolicy: false, // 우리 커스텀 CSP 사용
    frameguard: { action: "deny" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// 🛡️ Rate Limiting (DDoS 및 브루트포스 방지)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 100, // 각 IP당 최대 100 요청
  message: {
    success: false,
    error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 🛡️ 보안 헤더 설정
app.use(setSecurityHeaders);

// 🛡️ XSS 공격 감지 및 차단
app.use(detectAndBlockXSS);

// 🛡️ 입력 검증 및 정화
app.use(validateAndSanitizeInput);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use(
  cors({
    origin: [process.env.LOCALHOST, process.env.MY_HOST],
    credentials: true,
  })
);

const options = {
  key: fs.readFileSync(process.env.HTTPS_KEY),
  cert: fs.readFileSync(process.env.HTTPS_CERT),
  ca: fs.readFileSync(process.env.HTTPS_CA),
};

// HTTPS 서버 생성
const server = https.createServer(options, app);

// WebSocket을 HTTPS 서버에 연결
expressWs(app, server);

// chat bot
app.ws("/realtime-chat", (clientWs, req) => realtime(clientWs, req));

app.get("/realtime-chat/connections", (req, res) => connections(req, res));

/**
 * 보안 관련
 */

// CSRF 토큰 발급
app.get("/csrf-token", setCSRFToken, (req, res) => {
  logger.info("CSRF 토큰 발급");
  res.json({
    success: true,
    csrfToken: req.csrfToken, // 클라이언트 호환성을 위해 유지
    _csrf: req.csrfToken, // 새로운 필드명 추가
    message: "CSRF 토큰이 발급되었습니다.",
  });
});

/**
 * 유저 관련
 */

// 회원가입
app.post("/signUp", async (req, res) => await signUp(req, res));

// 휴대폰 중복확인
app.post(
  "/duplicateCheck",
  async (req, res) => await phoneNumberDuplicate(req, res)
);

// 이메일 중복확인
app.post("/emailDuplicate", async (req, res) => await emailDuplicate(req, res));

// 이메일 인증
app.post("/email", async (req, res) => await emailAuth(req, res));

// 이메일 인증 확인
app.post("/checkAuth", async (req, res) => await checkAuth(req, res));

// 비밀번호 변경 (CSRF 보호)
app.post(
  "/passwordChange",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await passwordChange(req, res)
);

// 비밀번호 초기화 (CSRF 보호)
app.post("/passwordReset", async (req, res) => await passwordReset(req, res));

// 비밀번호 확인 (CSRF 보호)
app.post(
  "/passwordCheck",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await passwordCheck(req, res)
);

// 휴대폰 번호 확인
app.post(
  "/phoneNumberCheck",
  async (req, res) => await phoneNumberCheck(req, res)
);

// 회원탈퇴 (CSRF 보호)
app.post(
  "/withDrawal",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await withDrawal(req, res)
);

// 로그인
app.post("/login", async (req, res) => await login(req, res));

// 로그아웃 (JWT + CSRF 이중 보안)
app.post(
  "/logout",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await logout(req, res)
);

// 토큰 체크(검증 및 갱신)
app.get(
  "/tokenCheck",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await tokenCheck(req, res)
);

// 유저 정보 조회
app.post(
  "/userInfo",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await getUserInfo(req, res)
);

/**
 * 리뷰 관련
 */

// 내 리뷰 조회
app.get(
  "/myReview/:userId",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await getMyReview(req, res)
);

// 리뷰 작성 (CSRF 보호)
app.post(
  "/createReview",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await createReview(req, res)
);

// 리뷰 수정 (CSRF 보호)
app.post(
  "/updateReview",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await updateReview(req, res)
);

// 리뷰 삭제 (CSRF 보호)
app.post(
  "/deleteReview",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await deleteReview(req, res)
);

// 설문 작성
app.post("/survey", async (req, res) => await survey(req, res));

/*
 * 요금제 관련
 *
 */

// 전체 요금제 조회
app.get("/planList", async (req, res) => await getPlanList(req, res));

// 요금제 상세 정보 조회
app.get(
  "/planDetail/:planId",
  async (req, res) => await getPlanDetail(req, res)
);

// 요금제 필터링 조회
app.post("/filterPlans", async (req, res) => await filterPlans(req, res));

// 요금제 변경 (CSRF 보호)
app.post(
  "/changeUserPlan",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await changeUserPlan(req, res)
);

// 요금제 추천 (CSRF 보호)
app.post(
  "/recommendPlansByAge",
  authenticateToken,
  validateCSRFToken,
  async (req, res) => await recommendPlansByAge(req, res)
);

server.listen(process.env.PORT, () => logger.info("서버가 연결되었습니다."));
