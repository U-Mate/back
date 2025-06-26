const db = require("./db");
const { randomInt, randomBytes } = require("crypto");

const argon2 = require("@node-rs/argon2");
const nodemailer = require("nodemailer");

const jwtSecret = process.env.JWT_SECRET;

const jwt = require("jsonwebtoken");
const { effectiveness } = require("./verification");
const logger = require("./log");

// 🛡️ XSS 보안 모듈 import
const {
  setSecureCookie,
  sanitizeHTML,
  escapeHTML,
} = require("./xss-protection");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendEmail = async (to, text) => {
  try {
    const info = await transporter.sendMail({
      from: "U:Mate 이메일 인증",
      to,
      subject: "이메일 인증 요청",
      text,
    });

    logger.info("이메일 발송 성공 : ", info.messageId);
  } catch (error) {
    logger.error("이메일 발송 실패 : ", error);
  }
};

// 회원가입
const signUp = async (req, res) => {
  const { name, gender, birthDay, phoneNumber, email, password, phonePlan } =
    req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    if (effectiveness(email, phoneNumber, birthDay, password)) {
      conn.release();
      logger.error("올바르지못한 형식");
      return res
        .status(404)
        .json({ success: false, error: "올바르지못한 형식입니다." });
    }

    const hashPassword = await argon2.hash(password, {
      type: argon2.Algorithm.Argon2id,
      timeCost: Number(process.env.TIME_COST),
      memoryCost: 1 << Number(process.env.MEMORY_COST),
      parallelism: Number(process.env.PARALLELISM),
    });

    const [planRows] = await conn.query(
      "SELECT * FROM PLAN_INFO WHERE ID = ?",
      [phonePlan]
    );
    if (planRows.length === 0) {
      await conn.rollback();
      conn.release();
      logger.error("존재하지 않는 요금제입니다.");
      return res
        .status(404)
        .json({ success: false, error: "존재하지 않는 요금제입니다." });
    }

    const ageGroup = planRows[0].AGE_GROUP;

    const today = new Date();
    const birthDate = new Date(birthDay);
    const age = today.getFullYear() - birthDate.getFullYear();

    switch (ageGroup) {
      case "만12세 이하":
        if (age > 12) {
          await conn.rollback();
          conn.release();
          logger.error(
            "만12세 이하 요금제는 만12세 이하만 가입할 수 있습니다."
          );
          return res.status(404).json({
            success: false,
            error: "만12세 이하 요금제는 만12세 이하만 가입할 수 있습니다.",
          });
        }
        break;
      case "만18세 이하":
        if (age > 18 || age < 12) {
          await conn.rollback();
          conn.release();
          logger.error(
            "만18세 이하 요금제는 만12세 초과 만18세 이하 청소년만 가입할 수 있습니다."
          );
          return res.status(404).json({
            success: false,
            error:
              "만18세 이하 요금제는 만12세 초과 만18세 이하 청소년만 가입할 수 있습니다.",
          });
        }
        break;
      case "만34세 이하":
        if (age > 34 || age < 18) {
          await conn.rollback();
          conn.release();
          logger.error(
            "만34세 이하 요금제는 만18세 초과 만34세 이하 성인만 가입할 수 있습니다."
          );
          return res.status(404).json({
            success: false,
            error:
              "만34세 이하 요금제는 만18세 초과 만34세 이하 성인만 가입할 수 있습니다.",
          });
        }
        break;
      case "만65세 이상":
        if (age < 65) {
          await conn.rollback();
          conn.release();
          logger.error(
            "만65세 이상 요금제는 만65세 이상만 가입할 수 있습니다."
          );
          return res.status(404).json({
            success: false,
            error: "만65세 이상 요금제는 만65세 이상만 가입할 수 있습니다.",
          });
        }
        break;
      default:
        break;
    }

    const membership =
      planRows[0].MONTHLY_FEE >= 74800
        ? `${planRows[0].MONTHLY_FEE >= 95000 ? "V" : ""}VIP`
        : "우수";

    await conn.query(
      "INSERT INTO USER(NAME, GENDER, BIRTHDAY, PHONE_NUMBER, PHONE_PLAN, MEMBERSHIP, EMAIL, PASSWORD) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
      [
        name,
        gender,
        birthDay,
        phoneNumber,
        phonePlan,
        membership,
        email,
        hashPassword,
      ]
    );

    const [rows] = await conn.query("SELECT * FROM PLAN_INFO WHERE ID = ?", [
      phonePlan,
    ]);
    await conn.query("UPDATE PLAN_INFO SET USER_COUNT = ? WHERE ID = ?", [
      rows[0].USER_COUNT + 1,
      phonePlan,
    ]);
    await conn.commit();
    conn.release();
    logger.info(`${email} 회원가입 성공`);
    return res
      .status(200)
      .json({ success: true, message: "회원가입이 완료되었습니다." });
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "회원가입에 실패했습니다." });
  }
};

// 휴대폰 중복확인
const phoneNumberDuplicate = async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM USER WHERE PHONE_NUMBER = ?", [
      phoneNumber,
    ]);

    if (rows.length > 0) {
      logger.info(`${phoneNumber}은 이미 존재하는 휴대폰 번호입니다.`);
      return res
        .status(404)
        .json({ success: false, error: "존재하는 휴대폰 번호입니다." });
    } else {
      logger.info(`${phoneNumber}은 사용가능한 휴대폰 번호입니다.`);
      return res
        .status(200)
        .json({ success: true, message: "사용가능한 휴대폰 번호입니다." });
    }
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "휴대폰 번호 체크에 실패했습니다." });
  }
};

// 이메일 중복확인
const emailDuplicate = async (req, res) => {
  const { email } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM USER WHERE EMAIL = ?", [
      email,
    ]);

    if (rows.length > 0) {
      logger.info(`${email}은 이미 존재하는 이메일입니다.`);
      return res
        .status(404)
        .json({ success: false, error: "이미 존재하는 이메일입니다." });
    } else {
      logger.info(`${email}은 사용가능한 이메일입니다.`);
      return res
        .status(200)
        .json({ success: true, message: "사용가능한 이메일입니다." });
    }
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "이메일 확인 중 오류가 발생했습니다." });
  }
};

// 이메일 인증
const emailAuth = async (req, res) => {
  const { email } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    if (effectiveness(email, undefined, undefined, undefined)) {
      conn.release();
      logger.error("올바르지못한 형식");
      return res
        .status(404)
        .json({ success: false, error: "올바르지못한 형식입니다." });
    }

    // 보안 강화장치
    const buf = randomBytes(6); // 48비트 암호학적 난수 생성
    const num = buf.readUIntBE(0, 6) / 2 ** 48;
    const value = Math.floor(num * 1000000);

    const auth = String(value).padStart(6, "0");

    await conn.query("INSERT INTO AUTHENTICATION(EMAIL, AUTH) VALUES(?, ?)", [
      email,
      auth,
    ]);

    await sendEmail(
      email,
      `이메일 인증을 하시려면 다음을 작성해주세요 : ${auth}`
    );

    await conn.commit();
    conn.release();
    logger.info(`${email} 인증코드 보내기 성공`);
    return res
      .status(200)
      .json({ success: true, message: "인증코드가 전송되었습니다." });
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "인증코드 전송에 실패했습니다." });
  }
};

// 인증코드 인증
const checkAuth = async (req, res) => {
  const { email, auth } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [rows] = await conn.query(
      `
            SELECT *
            FROM
            (
                SELECT *
                FROM AUTHENTICATION
                WHERE EMAIL = ?
                AND USE_NOT = "N"
                ORDER BY ID DESC
                LIMIT 1
            ) A
            WHERE timestampdiff(minute, A.CREATE_AT, now()) <= 5
            `,
      [email]
    );

    if (rows.length === 0 || rows[0].AUTH !== auth) {
      await conn.rollback();
      conn.release();
      logger.error(`${email} 인증코드가 일치하지않습니다.`);
      return res
        .status(404)
        .json({ success: false, error: "인증코드 인증 실패" });
    } else {
      await conn.query('UPDATE AUTHENTICATION SET USE_NOT = "Y" WHERE ID = ?', [
        rows[0].ID,
      ]);
      await conn.commit();
      conn.release();
      logger.info(`${email} 인증코드가 일치합니다.`);
      return res
        .status(200)
        .json({ success: true, message: "인증코드 인증 성공" });
    }
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "인증코드 인증 중 오류가 발생했습니다." });
  }
};

// 비밀번호 변경
const passwordChange = async (req, res) => {
  const { email, password, newPassword } = req.body;

  try {
    if (effectiveness(undefined, undefined, undefined, newPassword)) {
      logger.error("올바르지못한 형식");
      return res
        .status(404)
        .json({ success: false, error: "올바르지못한 형식입니다." });
    }

    const hashNewPassword = await argon2.hash(newPassword, {
      type: argon2.Algorithm.Argon2id,
      timeCost: Number(process.env.TIME_COST),
      memoryCost: 1 << Number(process.env.MEMORY_COST),
      parallelism: Number(process.env.PARALLELISM),
    });

    const [rows] = await db.query("SELECT * FROM USER WHERE EMAIL = ?", [
      email,
    ]);

    if (rows.length === 0) {
      logger.error("비밀번호 변경에 대한 비정상적인 접근입니다.");
      return res
        .status(404)
        .json({ success: false, error: "비정상적인 접근입니다." });
    }

    const valid = await argon2.verify(rows[0].PASSWORD, password);

    if (!valid) {
      logger.error("비밀번호가 일치하지 않습니다.");
      return res
        .status(404)
        .json({ success: false, error: "일치하지 않습니다." });
    }

    await db.query(
      "UPDATE USER SET PASSWORD = ?, FAIL_CNT = 0 WHERE EMAIL = ?",
      [hashNewPassword, email]
    );

    logger.info(`${email} 비밀번호 변경 성공`);
    return res
      .status(200)
      .json({ success: true, message: "비밀번호 변경이 완료되었습니다." });
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "비밀번호 변경 중 오류가 발생했습니다." });
  }
};

// 비밀번호 재설정
const passwordReset = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (effectiveness(undefined, undefined, undefined, password)) {
      logger.error("올바르지못한 형식");
      return res
        .status(404)
        .json({ success: false, error: "올바르지못한 형식입니다." });
    }

    const [rows] = await db.query("SELECT * FROM USER WHERE EMAIL = ?", [
      email,
    ]);

    if (rows.length === 0) {
      logger.error(`${email} 이메일이 일치하지 않습니다.`);
      return res
        .status(404)
        .json({ success: false, error: "일치하지 않습니다." });
    }

    const hashPassword = await argon2.hash(password, {
      type: argon2.Algorithm.Argon2id,
      timeCost: Number(process.env.TIME_COST),
      memoryCost: 1 << Number(process.env.MEMORY_COST),
      parallelism: Number(process.env.PARALLELISM),
    });

    await db.query(
      "UPDATE USER SET PASSWORD = ?, FAIL_CNT = 0 WHERE EMAIL = ?",
      [hashPassword, email]
    );
    logger.info(`${email} 비밀번호 재설정 성공`);
    return res
      .status(200)
      .json({ success: true, message: "비밀번호 재설정 성공" });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      success: false,
      error: "비밀번호 재설정 중 오류가 발생했습니다.",
    });
  }
};

// 비밀번호 확인
const passwordCheck = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM USER WHERE EMAIL = ?", [
      email,
    ]);

    if (rows.length === 0) {
      logger.error("비밀번호 확인에 대한 비정상적인 접근입니다.");
      return res
        .status(404)
        .json({ success: false, error: "비정상적인 접근입니다." });
    }

    const valid = await argon2.verify(rows[0].PASSWORD, password);

    if (!valid) {
      logger.error("비밀번호가 일치하지 않습니다.");
      return res
        .status(404)
        .json({ success: false, error: "일치하지 않습니다." });
    }

    logger.info(`${email} 비밀번호 확인 성공`);
    return res
      .status(200)
      .json({ success: true, message: "비밀번호 확인 성공" });
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "비밀번호 확인 중 오류가 발생했습니다." });
  }
};

// 휴대폰 번호 확인
const phoneNumberCheck = async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM USER WHERE PHONE_NUMBER = ?", [
      phoneNumber,
    ]);

    if (rows.length > 0) {
      const email = rows[0].EMAIL;
      // 이메일 마스킹: @ 앞 3자리 이후부터 *로 처리
      let maskedEmail = email;
      const atIdx = email.indexOf("@");
      if (atIdx > 3) {
        maskedEmail =
          email.slice(0, 3) + "*".repeat(atIdx - 3) + email.slice(atIdx);
      } else if (atIdx !== -1) {
        maskedEmail = email.slice(0, atIdx) + email.slice(atIdx); // 3자리 이하일 땐 그대로
      }

      logger.info(`${phoneNumber} 휴대폰 번호 확인 성공`);
      return res.status(200).json({
        success: true,
        message: `등록된 이메일 : ${maskedEmail}`,
      });
    } else {
      return res
        .status(404)
        .json({ success: false, error: "존재하지 않는 휴대폰 번호입니다." });
    }
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      success: false,
      error: "휴대폰 번호 확인 중 오류가 발생했습니다.",
    });
  }
};

// 회원탈퇴
const withDrawal = async (req, res) => {
  const { email, password } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [rows] = await conn.query("SELECT * FROM USER WHERE EMAIL = ?", [
      email,
    ]);

    if (rows.length === 0) {
      await conn.rollback();
      conn.release();
      logger.error("회원탈퇴에 대한 비정상적인 접근입니다.");
      return res
        .status(404)
        .json({ success: false, error: "비정상적인 접근입니다." });
    }

    const valid = await argon2.verify(rows[0].PASSWORD, password);

    if (!valid) {
      await conn.rollback();
      conn.release();
      logger.error("비밀번호가 일치하지 않습니다.");
      return res
        .status(404)
        .json({ success: false, error: "일치하지 않습니다." });
    }
    const birthDay = new Date(rows[0].BIRTHDAY.getFullYear(), 0, 1, 0, 0, 0);

    await conn.query(
      'UPDATE USER SET EMAIL = "", PASSWORD = "", NAME = "", GENDER = "", BIRTHDAY = ?, PHONE_NUMBER = 0, PHONE_PLAN = 0, FAIL_CNT = 0 WHERE EMAIL = ?',
      [birthDay, email]
    );

    await conn.query("DELETE FROM TOKEN WHERE EMAIL = ?", [email]);

    // 🛡️ 보안 강화된 쿠키 삭제 (회원탈퇴)
    setSecureCookie(res, "token", "", {
      sameSite: "none",
      maxAge: 0, // 즉시 만료
    });

    await conn.commit();
    conn.release();
    logger.info(`${email} 회원탈퇴 성공`);
    return res
      .status(200)
      .json({ success: true, message: "회원탈퇴가 완료되었습니다." });
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "회원탈퇴 중 오류가 발생했습니다." });
  }
};

// 로그인
const login = async (req, res) => {
  const { id, password } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [rows] = await conn.query(
      "SELECT * FROM USER WHERE EMAIL = ? OR PHONE_NUMBER = ?",
      [id, id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      conn.release();
      logger.error(`${id} 아이디가 일치하지않습니다.`);
      return res
        .status(404)
        .json({ success: false, error: "로그인에 실패했습니다." });
    } else {
      const email = rows[0].EMAIL;
      if (rows[0].FAIL_CNT >= 5) {
        await conn.rollback();
        conn.release();
        logger.error(`${id} 비밀번호 5회 실패로 인해 로그인에 실패했습니다.`);
        return res.status(404).json({
          success: false,
          error:
            "비밀번호 5회 이상 실패했습니다.\n비밀번호 재설정 후 다시 시도해주세요.",
        });
      }

      const valid = await argon2.verify(rows[0].PASSWORD, password);

      if (!valid) {
        await conn.query("UPDATE USER SET FAIL_CNT = ? WHERE EMAIL = ?", [
          rows[0].FAIL_CNT + 1,
          email,
        ]);
        await conn.commit();
        conn.release();
        logger.error(`${id} 패스워드가 일치하지않습니다.`);
        return res
          .status(404)
          .json({ success: false, error: "로그인에 실패했습니다." });
      }

      await conn.query("UPDATE USER SET FAIL_CNT = ? WHERE EMAIL = ?", [
        0,
        email,
      ]);

      const token = jwt.sign(
        {
          email,
          id: rows[0].ID,
          name: rows[0].NAME,
          plan: rows[0].PHONE_PLAN,
          membership: rows[0].MEMBERSHIP,
          birthDay: rows[0].BIRTHDAY,
        },
        jwtSecret,
        { expiresIn: "30m" }
      );

      await conn.query(
        "INSERT INTO TOKEN(EMAIL, TOKEN) VALUES(?, ?) ON DUPLICATE KEY UPDATE TOKEN = ?",
        [email, token, token]
      );

      // 🛡️ 보안 강화된 쿠키 설정
      setSecureCookie(res, "token", token, {
        sameSite: "none", // CORS 환경을 위해 none 유지
      });

      // 응답 데이터 구성
      const responseData = {
        success: true,
        authenticated: true,
        user: req.user,
        message: "토큰 상태 확인 성공",
      };

      await conn.commit();
      conn.release();

      logger.info(`${email} 로그인 성공`);
      return res.status(200).json({
        ...responseData,
        success: true,
        message: `${rows[0].NAME}님 환영합니다.`,
      });
    }
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "로그인 중 오류가 발생했습니다." });
  }
};

// 로그아웃 (JWT 기반)
const logout = async (req, res) => {
  const { email } = req.body;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [rows] = await conn.query("SELECT * FROM TOKEN WHERE EMAIL = ?", [
      email,
    ]);

    if (rows.length === 0) {
      await conn.rollback();
      conn.release();
      logger.error(`${email} 로그아웃에 대한 비정상적인 접근입니다.`);
      return res
        .status(404)
        .json({ success: false, error: "비정상적인 접근입니다." });
    }

    await conn.query("DELETE FROM TOKEN WHERE EMAIL = ?", [email]);

    // 🛡️ 보안 강화된 쿠키 삭제 (로그아웃)
    setSecureCookie(res, "token", "", {
      sameSite: "none",
      maxAge: 0, // 즉시 만료
    });

    await conn.commit();
    conn.release();
    logger.info(`${email} 로그아웃 성공`);
    return res
      .status(200)
      .json({ success: true, message: "로그아웃에 성공했습니다." });
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "로그아웃 중 오류가 발생했습니다." });
  }
};

// 토큰 상태 확인 (authenticateToken에서 이미 갱신 처리됨)
const tokenCheck = async (req, res) => {
  try {
    // authenticateToken 미들웨어에서 이미 토큰 검증 및 갱신 완료
    logger.info(`${req.user.email} 토큰 상태 확인 성공`);

    // 응답 데이터 구성
    const responseData = {
      success: true,
      authenticated: true,
      user: req.user,
      message: "토큰 상태 확인 성공",
    };

    // 🔄 토큰이 자동 갱신되었다면 클라이언트에게 알림
    if (req.tokenRefreshed) {
      responseData._tokenRefreshed = true;
      responseData._newTokenMessage = "인증 토큰이 자동으로 갱신되었습니다.";
    }

    return res.status(200).json(responseData);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      success: false,
      error: "토큰 상태 확인 중 오류가 발생했습니다.",
    });
  }
};

// 토큰 검증 (자동 갱신 포함)
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    logger.error("토큰이 없습니다.");
    return res.status(401).json({ success: false, error: "토큰이 없습니다." });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (error) {
    logger.error(error);
    return res
      .status(401)
      .json({ success: false, message: "토큰 검증에 실패했습니다." });
  }

  try {
    const [rows] = await db.query(
      "SELECT * FROM TOKEN WHERE EMAIL = ? AND TOKEN = ?",
      [decoded.email, token]
    );

    if (rows.length === 0) {
      // 🛡️ 보안 강화된 쿠키 삭제 (중복 로그인 감지)
      setSecureCookie(res, "token", "", {
        sameSite: "none",
        maxAge: 0, // 즉시 만료
      });
      logger.error("중복 로그인 제거");
      return res.status(401).json({
        success: false,
        error:
          "다른 곳에서 로그인을 시도했습니다.\n안전을 위해 로그아웃 처리되었습니다.",
      });
    }

    try {
      const newPayload = {
        email: decoded.email,
        id: decoded.id,
        name: decoded.name,
        plan: decoded.plan,
        membership: decoded.membership,
        birthDay: decoded.birthDay,
      };

      const newToken = jwt.sign(newPayload, jwtSecret, { expiresIn: "30m" });

      // DB에 새 토큰 저장
      await db.query("UPDATE TOKEN SET TOKEN = ? WHERE EMAIL = ?", [
        newToken,
        decoded.email,
      ]);

      // 🛡️ 새 토큰을 쿠키에 설정
      setSecureCookie(res, "token", newToken, {
        sameSite: "none",
      });

      logger.info(`🔄 JWT 토큰 자동 갱신 완료: ${decoded.email}`);
    } catch (refreshError) {
      logger.error("JWT 토큰 자동 갱신 실패:", refreshError);
      // 갱신에 실패해도 기존 토큰이 아직 유효하므로 요청 계속 처리
    }

    req.user = decoded;
    next();
  } catch (error) {
    // 🛡️ 보안 강화된 쿠키 삭제 (토큰 검증 오류)
    setSecureCookie(res, "token", "", {
      sameSite: "none",
      maxAge: 0, // 즉시 만료
    });
    logger.error(error);
    return res.status(500).json({
      success: false,
      error:
        "토큰 검증 중 오류가 발생했습니다.\n안전을 위해 로그아웃 처리되었습니다.",
    });
  }
};

// 유저 상세 정보 조회
const getUserInfo = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM USER WHERE EMAIL = ?", [
      email,
    ]);

    if (rows.length === 0) {
      logger.error("비정상적인 접근입니다.");
      return res
        .status(404)
        .json({ success: false, error: "비정상적인 접근입니다." });
    }

    const valid = await argon2.verify(rows[0].PASSWORD, password);

    if (!valid) {
      logger.error("비밀번호가 일치하지 않습니다.");
      return res
        .status(404)
        .json({ success: false, error: "일치하지 않습니다." });
    }

    logger.info(`${email} 유저 정보 조회 성공`);

    // 응답 데이터 구성
    const responseData = {
      success: true,
      name: rows[0].NAME,
      gender: rows[0].GENDER,
      birthDay: rows[0].BIRTHDAY,
      phoneNumber: rows[0].PHONE_NUMBER,
      phonePlan: rows[0].PHONE_PLAN,
      email: rows[0].EMAIL,
      message: "유저 정보 조회 성공",
    };

    // 🔄 토큰이 자동 갱신되었다면 클라이언트에게 알림
    if (req.tokenRefreshed) {
      responseData._tokenRefreshed = true;
      responseData._newTokenMessage = "인증 토큰이 자동으로 갱신되었습니다.";
    }

    return res.status(200).json(responseData);
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ success: false, error: "비밀번호 확인 중 오류가 발생했습니다." });
  }
};

module.exports = {
  signUp,
  phoneNumberDuplicate,
  emailDuplicate,
  emailAuth,
  checkAuth,
  passwordChange,
  passwordReset,
  passwordCheck,
  phoneNumberCheck,
  withDrawal,
  login,
  logout,
  tokenCheck,
  authenticateToken,
  getUserInfo,
};
