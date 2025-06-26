const DOMPurify = require("isomorphic-dompurify");
const validator = require("validator");
const logger = require("./log");

/**
 * XSS 공격 방지를 위한 종합 보안 모듈
 *
 * 보안 계층:
 * 1. 입력 검증 및 정화 (Input Sanitization)
 * 2. 출력 인코딩 (Output Encoding)
 * 3. HTTP 보안 헤더 (Security Headers)
 * 4. 컨텐츠 보안 정책 (CSP)
 */

// 🚫 위험한 HTML 태그 및 속성 목록
const DANGEROUS_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "option",
  "meta",
  "link",
  "style",
  "base",
  "frame",
  "frameset",
  "applet",
  "audio",
  "video",
  "source",
];

const DANGEROUS_ATTRIBUTES = [
  "onload",
  "onerror",
  "onclick",
  "onmouseover",
  "onmouseout",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onreset",
  "onselect",
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "javascript:",
  "vbscript:",
  "data:",
  "expression",
];

// 🔒 HTML 엔티티 인코딩 맵
const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#96;",
  "=": "&#61;",
};

/**
 * 1️⃣ 입력 검증 및 정화 (Input Sanitization)
 */

// 기본 HTML 태그 제거 및 정화
const sanitizeHTML = (input) => {
  if (typeof input !== "string") return input;

  try {
    // DOMPurify를 사용한 고급 HTML 정화
    const cleanHTML = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [], // 모든 HTML 태그 제거
      ALLOWED_ATTR: [], // 모든 속성 제거
      KEEP_CONTENT: true, // 텍스트 내용은 유지
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      WHOLE_DOCUMENT: false,
    });

    return cleanHTML;
  } catch (error) {
    logger.error("HTML 정화 오류:", error);
    return escapeHTML(input); // 폴백으로 기본 이스케이프 사용
  }
};

// HTML 특수문자 이스케이프
const escapeHTML = (input) => {
  if (typeof input !== "string") return input;

  return input.replace(/[&<>"'`=/]/g, (match) => HTML_ENTITIES[match]);
};

// JavaScript 문자열 이스케이프
const escapeJavaScript = (input) => {
  if (typeof input !== "string") return input;

  return input
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/\v/g, "\\v")
    .replace(/\0/g, "\\0");
};

// SQL 인젝션 방지 (추가 보안)
const sanitizeSQL = (input) => {
  if (typeof input !== "string") return input;

  // 기본적인 SQL 인젝션 패턴 제거
  return input
    .replace(/('|(\\'))|(;|(\s*(--|\#|\/\*)))/gi, "")
    .replace(
      /(union|select|insert|update|delete|drop|create|alter|exec|execute)/gi,
      ""
    )
    .trim();
};

// URL 검증 및 정화
const sanitizeURL = (url) => {
  if (typeof url !== "string") return "";

  try {
    // 위험한 프로토콜 차단
    if (url.match(/^(javascript|vbscript|data|file|ftp):/i)) {
      logger.error(`위험한 URL 프로토콜 감지: ${url}`);
      return "";
    }

    // validator.js를 사용한 URL 검증
    if (
      !validator.isURL(url, {
        protocols: ["http", "https"],
        require_protocol: true,
        allow_underscores: false,
        allow_trailing_dot: false,
        allow_protocol_relative_urls: false,
      })
    ) {
      return "";
    }

    return validator.escape(url);
  } catch (error) {
    logger.error("URL 정화 오류:", error);
    return "";
  }
};

// 이메일 정화
const sanitizeEmail = (email) => {
  if (typeof email !== "string") return "";

  try {
    const normalizedEmail = validator.normalizeEmail(email, {
      gmail_lowercase: true,
      gmail_remove_dots: false,
      outlookdotcom_lowercase: true,
      yahoo_lowercase: true,
      icloud_lowercase: true,
    });

    if (!validator.isEmail(normalizedEmail)) {
      return "";
    }

    return escapeHTML(normalizedEmail);
  } catch (error) {
    logger.error("이메일 정화 오류:", error);
    return "";
  }
};

/**
 * 2️⃣ 종합 입력 검증 미들웨어
 */
const validateAndSanitizeInput = (req, res, next) => {
  try {
    // Request Body 정화
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body);
    }

    // Query Parameters 정화
    if (req.query && typeof req.query === "object") {
      req.query = sanitizeObject(req.query);
    }

    // URL Parameters 정화
    if (req.params && typeof req.params === "object") {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error("입력 검증 중 오류:", error);
    return res.status(400).json({
      success: false,
      error: "입력 데이터 형식이 올바르지 않습니다.",
    });
  }
};

// 객체 재귀적 정화
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = sanitizeHTML(key);
      sanitized[cleanKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  if (typeof obj === "string") {
    // 특정 필드별 다른 정화 방식 적용
    if (obj.includes("@") && validator.isEmail(obj)) {
      return sanitizeEmail(obj);
    } else if (obj.startsWith("http")) {
      return sanitizeURL(obj);
    } else {
      return sanitizeHTML(obj);
    }
  }

  return obj;
};

/**
 * 3️⃣ HTTP 보안 헤더 설정
 */
const setSecurityHeaders = (req, res, next) => {
  // Content Security Policy (CSP)
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' wss: https:",
      "media-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ")
  );

  // XSS Protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Content Type Options
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Frame Options
  res.setHeader("X-Frame-Options", "DENY");

  // Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy
  res.setHeader(
    "Permissions-Policy",
    [
      "geolocation=()",
      "microphone=(self)",
      "camera=()",
      "magnetometer=()",
      "gyroscope=()",
      "speaker=(self)",
      "vibrate=()",
      "fullscreen=(self)",
      "payment=()",
    ].join(", ")
  );

  next();
};

/**
 * 4️⃣ 출력 안전화 함수들
 */

// JSON 응답 안전화
const safeSendJSON = (res, data) => {
  try {
    // 응답 데이터 정화
    const sanitizedData = sanitizeObject(data);

    // JSON 응답 시 XSS 방지 헤더 추가
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.json(sanitizedData);
  } catch (error) {
    logger.error("JSON 응답 안전화 오류:", error);
    return res.status(500).json({
      success: false,
      error: "응답 처리 중 오류가 발생했습니다.",
    });
  }
};

// HTML 응답 안전화
const safeSendHTML = (res, html) => {
  try {
    const sanitizedHTML = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "h1",
        "h2",
        "h3",
        "div",
        "span",
      ],
      ALLOWED_ATTR: ["class", "id"],
      KEEP_CONTENT: true,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.send(sanitizedHTML);
  } catch (error) {
    logger.error("HTML 응답 안전화 오류:", error);
    return res.status(500).send("응답 처리 중 오류가 발생했습니다.");
  }
};

/**
 * 5️⃣ 위험 패턴 감지 및 차단
 */
const detectXSSAttempt = (input) => {
  if (typeof input !== "string") return false;

  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /onmouseover\s*=/gi,
    /<iframe[^>]*>/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi,
    /expression\s*\(/gi,
    /url\s*\(\s*javascript:/gi,
    /@import/gi,
    /data:text\/html/gi,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
};

// SQL 인젝션 공격 감지
const detectSQLInjectionAttempt = (input) => {
  if (typeof input !== "string") return false;

  const sqlPatterns = [
    /(\bunion\b.*\bselect\b)/gi,
    /(\bselect\b.*\bfrom\b)/gi,
    /(\binsert\b.*\binto\b)/gi,
    /(\bupdate\b.*\bset\b)/gi,
    /(\bdelete\b.*\bfrom\b)/gi,
    /(\bdrop\b.*\btable\b)/gi,
    /(\bcreate\b.*\btable\b)/gi,
    /(\balter\b.*\btable\b)/gi,
    /('.*or.*'.*=.*')/gi,
    /('.*and.*'.*=.*')/gi,
    /(--|\#|\/\*)/gi,
    /(\bor\b.*\d+\s*=\s*\d+)/gi,
    /(\band\b.*\d+\s*=\s*\d+)/gi,
    /('.*;\s*(update|delete|drop|insert|create|alter))/gi,
    /(\bexec\b|\bexecute\b)/gi,
    /(\bsp_\w+)/gi,
    /(\bxp_\w+)/gi,
    /(\bconcat\s*\()/gi,
    /(\bchar\s*\(\d+\))/gi,
    /(\bhex\s*\()/gi,
    /(\bsubstring\s*\()/gi,
    /(\bascii\s*\()/gi,
    /(\bversion\s*\(\))/gi,
    /(\buser\s*\(\))/gi,
    /(\bdatabase\s*\(\))/gi,
    /(\bschema\s*\(\))/gi,
    /(\binformation_schema)/gi,
    /(\bsysobjects\b)/gi,
    /(\bsyscolumns\b)/gi,
    /(\bmysql\.user)/gi,
    /(\bpg_user)/gi,
    /(\ball_users)/gi,
    /(\bdba_users)/gi,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
};

// XSS & SQL 인젝션 공격 시도 감지 미들웨어
const detectAndBlockAttacks = (req, res, next) => {
  try {
    const checkInput = (obj, path = "") => {
      if (typeof obj === "string") {
        if (detectXSSAttempt(obj)) {
          logger.error(
            `XSS 공격 시도 감지: ${path} - ${obj.substring(0, 100)}`
          );
          throw new Error("XSS 공격이 감지되었습니다.");
        }
        if (detectSQLInjectionAttempt(obj)) {
          logger.error(
            `SQL 인젝션 공격 시도 감지: ${path} - ${obj.substring(0, 100)}`
          );
          throw new Error("SQL 인젝션 공격이 감지되었습니다.");
        }
      } else if (typeof obj === "object" && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          checkInput(value, `${path}.${key}`);
        }
      }
    };

    // Request의 모든 입력 검사
    checkInput(req.body, "body");
    checkInput(req.query, "query");
    checkInput(req.params, "params");

    next();
  } catch (error) {
    logger.error("보안 공격 차단:", error.message);
    return res.status(400).json({
      success: false,
      error: "요청에 보안 위험 요소가 포함되어 있습니다.",
    });
  }
};

// 하위 호환성을 위한 별칭
const detectAndBlockXSS = detectAndBlockAttacks;

/**
 * 6️⃣ 쿠키 보안 강화
 */
const setSecureCookie = (res, name, value, options = {}) => {
  const secureOptions = {
    httpOnly: true, // XSS 공격 방지
    secure: true, // HTTPS에서만 전송
    sameSite: "strict", // CSRF 공격 방지 (기본값)
    maxAge: 30 * 60 * 1000, // 30분
    path: "/",
    ...options,
  };

  // 쿠키 값 정화
  const sanitizedValue = escapeHTML(String(value));

  res.cookie(name, sanitizedValue, secureOptions);
};

/**
 * 7️⃣ CSRF 공격 방지 (강화된 서명 방식)
 */

// 강화된 CSRF 토큰 생성 (서명 포함)
const generateCSRFToken = () => {
  const crypto = require("crypto");
  const timestamp = Date.now();
  const randomData = crypto.randomBytes(16).toString("hex");
  const userId = Math.random().toString(36).substring(2, 8); // 세션별 고유 ID

  // 토큰 데이터 생성
  const tokenData = `${timestamp}:${randomData}:${userId}`;

  // 서버 비밀키로 HMAC 서명
  const secret =
    process.env.CSRF_SECRET || "default-csrf-secret-key-change-in-production";
  const signature = crypto
    .createHmac("sha256", secret)
    .update(tokenData)
    .digest("hex");

  return `${tokenData}:${signature}`;
};

// 서명된 CSRF 토큰 검증
const verifyCSRFTokenSignature = (token) => {
  try {
    if (!token || typeof token !== "string") {
      return { valid: false, reason: "TOKEN_EMPTY" };
    }

    const parts = token.split(":");
    if (parts.length !== 4) {
      return { valid: false, reason: "TOKEN_FORMAT_INVALID" };
    }

    const [timestamp, randomData, userId, signature] = parts;

    // 1. 토큰 만료 확인 (1시간)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 60 * 60 * 1000) {
      return { valid: false, reason: "TOKEN_EXPIRED" };
    }

    // 2. 타임스탬프 유효성 확인 (미래 토큰 방지)
    if (parseInt(timestamp) > Date.now() + 60000) {
      // 1분 여유
      return { valid: false, reason: "TOKEN_FUTURE" };
    }

    // 3. 서명 검증
    const crypto = require("crypto");
    const secret =
      process.env.CSRF_SECRET || "default-csrf-secret-key-change-in-production";
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}:${randomData}:${userId}`)
      .digest("hex");

    // 4. 타이밍 공격 방지를 위한 상수 시간 비교
    if (signature.length !== expectedSignature.length) {
      return { valid: false, reason: "SIGNATURE_INVALID" };
    }

    let isValid = true;
    for (let i = 0; i < signature.length; i++) {
      if (signature[i] !== expectedSignature[i]) {
        isValid = false;
      }
    }

    if (!isValid) {
      return { valid: false, reason: "SIGNATURE_INVALID" };
    }

    return {
      valid: true,
      tokenAge: tokenAge,
      userId: userId,
      timestamp: parseInt(timestamp),
    };
  } catch (error) {
    return { valid: false, reason: "TOKEN_PARSE_ERROR", error: error.message };
  }
};

// 강화된 CSRF 토큰 검증 미들웨어
const validateCSRFToken = (req, res, next) => {
  // GET 요청은 CSRF 토큰 검증하지 않음 (읽기 전용)
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    return next();
  }

  try {
    const tokenFromHeader = req.get("X-CSRF-Token") || req.get("X-CSRF-TOKEN");
    const tokenFromBody = req.body._csrf;
    const tokenFromCookie = req.cookies._csrf;

    const providedToken = tokenFromHeader || tokenFromBody;

    // 1. CSRF 토큰 존재 확인 (헤더/바디 중 하나는 필수)
    if (!providedToken) {
      logSecurityEvent(
        "CSRF_TOKEN_MISSING",
        {
          providedToken: !!providedToken,
          cookieToken: !!tokenFromCookie,
          headers: req.headers,
        },
        req
      );

      return res.status(403).json({
        success: false,
        error: "CSRF 토큰이 누락되었습니다.",
      });
    }

    // 2. Double Submit Cookie 검증 (쿠키가 있을 때만)
    if (tokenFromCookie && providedToken !== tokenFromCookie) {
      logSecurityEvent(
        "CSRF_TOKEN_MISMATCH",
        {
          providedToken: providedToken.substring(0, 8) + "...",
          cookieToken: tokenFromCookie.substring(0, 8) + "...",
        },
        req
      );

      return res.status(403).json({
        success: false,
        error: "CSRF 토큰이 일치하지 않습니다.",
      });
    }

    // 3. 서명 검증 (서버 발급 여부 확인)
    const verification = verifyCSRFTokenSignature(providedToken);

    if (!verification.valid) {
      let errorMessage = "CSRF 토큰이 유효하지 않습니다.";
      let logDetails = { reason: verification.reason };

      switch (verification.reason) {
        case "TOKEN_EXPIRED":
          errorMessage =
            "CSRF 토큰이 만료되었습니다. 새로고침 후 다시 시도해주세요.";
          break;
        case "TOKEN_FUTURE":
          errorMessage = "CSRF 토큰 시간이 올바르지 않습니다.";
          break;
        case "SIGNATURE_INVALID":
          errorMessage = "CSRF 토큰 서명이 유효하지 않습니다.";
          logDetails.suspiciousActivity = true;
          break;
        case "TOKEN_FORMAT_INVALID":
          errorMessage = "CSRF 토큰 형식이 올바르지 않습니다.";
          logDetails.suspiciousActivity = true;
          break;
      }

      logSecurityEvent(
        "CSRF_TOKEN_VERIFICATION_FAILED",
        {
          ...logDetails,
          providedToken: providedToken.substring(0, 16) + "...",
          error: verification.error,
        },
        req
      );

      return res.status(403).json({
        success: false,
        error: errorMessage,
      });
    }

    // 4. 토큰 사용 정보 로깅 (보안 모니터링)
    if (verification.tokenAge > 50 * 60 * 1000) {
      // 50분 이상 된 토큰
      logger.info("🕒 오래된 CSRF 토큰 사용:", {
        tokenAge: Math.round(verification.tokenAge / 60000) + "분",
        userId: verification.userId,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
    }

    // 검증 성공 - 토큰 정보를 req에 저장
    req.csrfTokenInfo = {
      userId: verification.userId,
      timestamp: verification.timestamp,
      age: verification.tokenAge,
    };

    next();
  } catch (error) {
    logger.error("CSRF 토큰 검증 중 예외 발생:", error);
    logSecurityEvent(
      "CSRF_TOKEN_VALIDATION_ERROR",
      {
        error: error.message,
        stack: error.stack,
      },
      req
    );

    return res.status(500).json({
      success: false,
      error: "보안 검증 중 오류가 발생했습니다.",
    });
  }
};

// CSRF 토큰 설정 엔드포인트용 미들웨어
const setCSRFToken = (req, res, next) => {
  const csrfToken = generateCSRFToken();

  // 쿠키에 CSRF 토큰 설정
  setSecureCookie(res, "_csrf", csrfToken, {
    httpOnly: false, // ✅ HTTPS여도 false 필요 (Double Submit Cookie 패턴)
    sameSite: "lax", // 🔧 크로스사이트 POST 요청에서도 쿠키 전송 허용
    maxAge: 60 * 60 * 1000, // 1시간
  });

  // 응답에 토큰 포함
  req.csrfToken = csrfToken;

  next();
};

/**
 * 8️⃣ WebSocket 보안 검증
 */

// WebSocket Origin 검증 미들웨어
const validateWebSocketOrigin = (allowedOrigins) => {
  return (ws, req, next) => {
    const origin = req.headers.origin;

    if (!origin) {
      logger.error("🚨 WebSocket: Origin 헤더 누락");
      ws.close(1008, "Origin 헤더가 필요합니다.");
      return;
    }

    const isAllowed = allowedOrigins.some((allowedOrigin) => {
      if (!allowedOrigin) return false;

      try {
        // URL 객체로 정확한 비교
        if (allowedOrigin.startsWith("http")) {
          return origin === allowedOrigin;
        } else {
          return origin.includes(allowedOrigin);
        }
      } catch (e) {
        return origin.includes(allowedOrigin);
      }
    });

    if (!isAllowed) {
      logSecurityEvent(
        "WEBSOCKET_ORIGIN_BLOCKED",
        {
          origin: origin,
          allowedOrigins: allowedOrigins,
        },
        req
      );

      ws.close(1008, "허용되지 않은 출처에서의 WebSocket 연결입니다.");
      return;
    }

    next();
  };
};

// WebSocket 인증 검증
const validateWebSocketAuth = () => {
  return (ws, req, next) => {
    const email = req.query.email;
    const sessionId = req.query.sessionId;

    // 최소한의 검증: 이메일이나 세션ID 중 하나는 있어야 함
    if (!email && !sessionId) {
      logger.error("🚨 WebSocket: 인증 정보 누락");
      ws.close(1008, "인증 정보가 필요합니다.");
      return;
    }

    // 이메일 형식 기본 검증
    if (email && !validator.isEmail(email)) {
      logger.error("🚨 WebSocket: 잘못된 이메일 형식", { email });
      ws.close(1008, "올바른 이메일 형식이 아닙니다.");
      return;
    }

    next();
  };
};

// WebSocket Rate Limiting
const webSocketRateLimit = () => {
  const connections = new Map(); // IP별 연결 정보
  const MESSAGE_LIMIT = 60; // 분당 최대 메시지 수
  const CONNECTION_LIMIT = 5; // IP당 최대 동시 연결 수

  return (ws, req, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!connections.has(clientIP)) {
      connections.set(clientIP, {
        connectionCount: 0,
        messageCount: 0,
        lastReset: Date.now(),
      });
    }

    const connectionInfo = connections.get(clientIP);

    // 1분마다 메시지 카운터 리셋
    if (Date.now() - connectionInfo.lastReset > 60000) {
      connectionInfo.messageCount = 0;
      connectionInfo.lastReset = Date.now();
    }

    // 동시 연결 수 확인
    if (connectionInfo.connectionCount >= CONNECTION_LIMIT) {
      logger.error("🚨 WebSocket: 연결 제한 초과", {
        ip: clientIP,
        connections: connectionInfo.connectionCount,
      });
      ws.close(1008, "IP당 최대 연결 수를 초과했습니다.");
      return;
    }

    // 연결 수 증가
    connectionInfo.connectionCount++;

    // WebSocket 메시지 rate limiting
    const originalSend = ws.send;
    ws.send = function (data) {
      connectionInfo.messageCount++;

      if (connectionInfo.messageCount > MESSAGE_LIMIT) {
        logger.error("🚨 WebSocket: 메시지 rate limit 초과", {
          ip: clientIP,
          messageCount: connectionInfo.messageCount,
        });
        ws.close(1008, "메시지 전송 제한을 초과했습니다.");
        return;
      }

      return originalSend.call(this, data);
    };

    // 연결 종료시 카운터 감소
    ws.on("close", () => {
      connectionInfo.connectionCount = Math.max(
        0,
        connectionInfo.connectionCount - 1
      );
    });

    next();
  };
};

// WebSocket 입력 검증
const validateWebSocketMessage = (ws, message) => {
  try {
    const data = JSON.parse(message);

    // XSS 검증
    if (data.message && detectXSSAttempt(data.message)) {
      logSecurityEvent(
        "WEBSOCKET_XSS_ATTEMPT",
        {
          message: data.message.substring(0, 100),
        },
        { ip: ws._socket?.remoteAddress }
      );

      ws.send(
        JSON.stringify({
          type: "security_error",
          error: "XSS 공격이 감지되었습니다.",
        })
      );
      return false;
    }

    // SQL 인젝션 검증
    if (data.message && detectSQLInjectionAttempt(data.message)) {
      logSecurityEvent(
        "WEBSOCKET_SQL_INJECTION_ATTEMPT",
        {
          message: data.message.substring(0, 100),
        },
        { ip: ws._socket?.remoteAddress }
      );

      ws.send(
        JSON.stringify({
          type: "security_error",
          error: "SQL 인젝션 공격이 감지되었습니다.",
        })
      );
      return false;
    }

    // 메시지 크기 제한 (10KB)
    if (message.length > 10240) {
      ws.send(
        JSON.stringify({
          type: "security_error",
          error: "메시지 크기가 너무 큽니다.",
        })
      );
      return false;
    }

    return true;
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "security_error",
        error: "잘못된 메시지 형식입니다.",
      })
    );
    return false;
  }
};

/**
 * 9️⃣ 로깅 및 모니터링
 */
const logSecurityEvent = (type, details, req) => {
  const securityLog = {
    timestamp: new Date().toISOString(),
    type: type,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get ? req.get("User-Agent") : req.headers?.["user-agent"],
    url: req.originalUrl || req.url,
    method: req.method,
    details: details,
  };

  logger.error(`🚨 보안 이벤트 [${type}]:`, securityLog);
};

module.exports = {
  // 입력 정화 함수들
  sanitizeHTML,
  escapeHTML,
  escapeJavaScript,
  sanitizeSQL,
  sanitizeURL,
  sanitizeEmail,
  sanitizeObject,

  // 미들웨어들
  validateAndSanitizeInput,
  setSecurityHeaders,
  detectAndBlockXSS,
  detectAndBlockAttacks,

  // CSRF 방지 (강화된 서명 방식)
  generateCSRFToken,
  verifyCSRFTokenSignature,
  validateCSRFToken,
  setCSRFToken,

  // WebSocket 보안
  validateWebSocketOrigin,
  validateWebSocketAuth,
  webSocketRateLimit,
  validateWebSocketMessage,

  // 출력 안전화
  safeSendJSON,
  safeSendHTML,

  // 쿠키 보안
  setSecureCookie,

  // 유틸리티
  detectXSSAttempt,
  detectSQLInjectionAttempt,
  logSecurityEvent,
};
