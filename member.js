const db = require('./db');
const { randomInt, randomBytes } = require('crypto');

const argon2  = require("@node-rs/argon2");
const nodemailer = require('nodemailer');

const jwtSecret = process.env.JWT_SECRET;

const jwt = require("jsonwebtoken");
const { effectiveness } = require('./verification');
const logger = require('./log');

const transporter = nodemailer.createTransport({
    host : "smtp.gmail.com",
    port : 587,
    secure : false,
    auth : {
        user : process.env.EMAIL_ID,
        pass : process.env.EMAIL_PASSWORD
    }
});

const sendEmail = async (to, text) => {
    try {
        const info = await transporter.sendMail({
            from : 'U:Mate 이메일 인증',
            to,
            subject : '이메일 인증 요청',
            text
        });

        logger.info("이메일 발송 성공 : ", info.messageId);
    } catch (error) {
        logger.error("이메일 발송 실패 : ", error);
    }
};

// 회원가입
const signUp = async (req, res) => {
    const { name, gender,  birthDay, phoneNumber, email, password, phonePlan} = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        if(effectiveness(email, phoneNumber, birthDay, password)){
            conn.release();
            logger.error("올바르지못한 형식");
            return res.status(404).json({success : false, error : "올바르지못한 형식입니다."});
        }

        const hashPassword = await argon2.hash(password, {
            type : argon2.Algorithm.Argon2id,
            timeCost : Number(process.env.TIME_COST),
            memoryCost : 1 << Number(process.env.MEMORY_COST),
            parallelism : Number(process.env.PARALLELISM)
        });

        const [planRows] = await conn.query('SELECT * FROM PLAN_INFO WHERE ID = ?', [phonePlan]);
        if(planRows.length === 0){
            await conn.rollback();
            conn.release();
            logger.error("존재하지 않는 요금제입니다.");
            return res.status(404).json({success : false, error : "존재하지 않는 요금제입니다."});
        }

        const membership = planRows[0].MONTHLY_FEE >= 74800 ? `${planRows[0].MONTHLY_FEE >= 95000 ? "V" : ""}VIP` : "우수";

        await conn.query('INSERT INTO USER(NAME, GENDER, BIRTHDAY, PHONE_NUMBER, PHONE_PLAN, MEMBERSHIP, EMAIL, PASSWORD) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', [name, gender, birthDay, phoneNumber, phonePlan, membership, email, hashPassword]);

        const [rows] = await conn.query('SELECT * FROM PLAN_INFO WHERE ID = ?', [phonePlan]);
        await conn.query('UPDATE PLAN_INFO SET USER_COUNT = ? WHERE ID = ?', [rows[0].USER_COUNT + 1, phonePlan]);
        await conn.commit();
        conn.release();
        logger.info(`${email} 회원가입 성공`);
        return res.status(200).json({success : true, message : "회원가입이 완료되었습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "회원가입에 실패했습니다."});
    }
}

// 휴대폰 중복확인
const phoneNumberDuplicate = async (req, res) => {
    const { phoneNumber } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM USER WHERE PHONE_NUMBER = ?', [phoneNumber]);

        if(rows.length > 0){
            logger.info(`${phoneNumber}은 이미 존재하는 휴대폰 번호입니다.`);
            return res.status(404).json({ success : false, error : "존재하는 휴대폰 번호입니다."});
        }else{
            logger.info(`${phoneNumber}은 사용가능한 휴대폰 번호입니다.`);
            return res.status(200).json({success : true, message : "사용가능한 휴대폰 번호입니다."});
        }
    } catch (error) {
        logger.error(error);
        return res.status(500).json({success : false, error : "휴대폰 번호 체크에 실패했습니다."});
    }
}

// 이메일 중복확인
const emailDuplicate = async (req, res) => {
    const { email } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);
    } catch (error) {
        
    }

    if(rows.length > 0){
        logger.info(`${email}은 이미 존재하는 이메일입니다.`);
        return res.status(404).json({success : false, error : "이미 존재하는 이메일입니다."});
    }else{
        logger.info(`${email}은 사용가능한 이메일입니다.`);
        return res.status(200).json({success : true, message : "사용가능한 이메일입니다."});
    }
} 

// 이메일 인증
const emailAuth = async (req, res) => {
    const { email } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        if(effectiveness(email, undefined, undefined, undefined)){
            conn.release();
            logger.error("올바르지못한 형식");
            return res.status(404).json({success : false, error : "올바르지못한 형식입니다."});
        }

        // 보안 강화장치
        const buf = randomBytes(6); // 48비트 암호학적 난수 생성
        const num = buf.readUIntBE(0, 6) / 2**48;
        const value = Math.floor(num * 1000000);

        const auth = String(value).padStart(6, '0');

        await conn.query('INSERT INTO AUTHENTICATION(EMAIL, AUTH) VALUES(?, ?)', [email, auth]);

        await sendEmail(
            email,
            `이메일 인증을 하시려면 다음을 작성해주세요 : ${auth}`
        );

        await conn.commit();
        conn.release();
        logger.info(`${email} 인증코드 보내기 성공`);
        return res.status(200).json({success : true, message : "인증코드가 전송되었습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "인증코드 전송에 실패했습니다."});
    }
}

// 인증코드 인증
const checkAuth = async (req, res) => {
    const { email, auth } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await conn.query(`
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
            `, [email]);

        if(rows.length === 0 || rows[0].AUTH !== auth){
            await conn.rollback();
            conn.release();
            logger.error(`${email} 인증코드가 일치하지않습니다.`);
            return res.status(404).json({success : false, error : "인증코드 인증 실패"});
        }else{
            await conn.query('UPDATE AUTHENTICATION SET USE_NOT = "Y" WHERE ID = ?', [rows[0].ID]);
            await conn.commit();
            conn.release();
            logger.info(`${email} 인증코드가 일치합니다.`);
            return res.status(200).json({success : true, message : "인증코드 인증 성공"});
        }
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "인증코드 인증 중 오류가 발생했습니다."});
    }
}

// 비밀번호 변경
const passwordChange = async (req, res) => {
    const { email, password, newPassword } = req.body;

    try {
        if(effectiveness(undefined, undefined, undefined, newPassword)){
            logger.error("올바르지못한 형식");
            return res.status(404).json({success : false, error : "올바르지못한 형식입니다."});
        }

        const hashNewPassword = await argon2.hash(newPassword, {
            type : argon2.Algorithm.Argon2id,
            timeCost : Number(process.env.TIME_COST),
            memoryCost : 1 << Number(process.env.MEMORY_COST),
            parallelism : Number(process.env.PARALLELISM)
        });

        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            logger.error("비밀번호 변경에 대한 비정상적인 접근입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        const valid = await argon2.verify(rows[0].PASSWORD, password);

        if(!valid){
            logger.error("비밀번호가 일치하지 않습니다.");
            return res.status(404).json({success : false, error : "일치하지 않습니다."});
        }

        await db.query('UPDATE USER SET PASSWORD = ? WHERE EMAIL = ?', [hashNewPassword, email]);

        logger.info(`${email} 비밀번호 변경 성공`);
        return res.status(200).json({success : true, message : "비밀번호 변경이 완료되었습니다."});
    } catch (error) {
        logger.error(error);
        return res.status(500).json({success : false, error : "비밀번호 변경 중 오류가 발생했습니다."});
    }
}

// 비밀번호 재설정
const passwordReset = async (req, res) => {
    const { email, password } = req.body;

    try {
        if(effectiveness(undefined, undefined, undefined, password)){
            logger.error("올바르지못한 형식");
            return res.status(404).json({success : false, error : "올바르지못한 형식입니다."});
        }

        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            logger.error(`${email} 이메일이 일치하지 않습니다.`);
            return res.status(404).json({success : false, error : "일치하지 않습니다."});
        }

        const hashPassword = await argon2.hash(password, {
            type : argon2.Algorithm.Argon2id,
            timeCost : Number(process.env.TIME_COST),
            memoryCost : 1 << Number(process.env.MEMORY_COST),
            parallelism : Number(process.env.PARALLELISM)
        });

        await db.query('UPDATE USER SET PASSWORD = ? WHERE EMAIL = ?', [hashPassword, email]);
        return res.status(200).json({success : true, message : "비밀번호 재설정 성공"});
    } catch (error) {
        logger.error(error);
        return res.status(500).json({success : false, error : "비밀번호 재설정 중 오류가 발생했습니다."});
    }
}

// 비밀번호 확인
const passwordCheck = async (req, res) => {
    const { email, password } = req.body;

    try {

        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            logger.error("비밀번호 확인에 대한 비정상적인 접근입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        const valid = await argon2.verify(rows[0].PASSWORD, password);

        if(!valid){
            logger.error("비밀번호가 일치하지 않습니다.");
            return res.status(404).json({success : false, error : "일치하지 않습니다."});
        }

        return res.status(200).json({success : true, message : "비밀번호 확인 성공"});
    } catch (error) {
        logger.error(error);
        return res.status(500).json({success : false, error : "비밀번호 확인 중 오류가 발생했습니다."});
    }
}

// 휴대폰 번호 확인
const phoneNumberCheck = async (req, res) => {
    const { phoneNumber } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM USER WHERE PHONE_NUMBER = ?', [phoneNumber]);

        if(rows.length > 0){
            const email = rows[0].EMAIL;
            // 이메일 마스킹: @ 앞 3자리 이후부터 *로 처리
            let maskedEmail = email;
            const atIdx = email.indexOf('@');
            if (atIdx > 3) {
                maskedEmail = email.slice(0, 3) + '*'.repeat(atIdx - 3) + email.slice(atIdx);
            } else if (atIdx !== -1) {
                maskedEmail = email.slice(0, atIdx) + email.slice(atIdx); // 3자리 이하일 땐 그대로
            }

            logger.info(`${phoneNumber} 휴대폰 번호 확인 성공`);
            return res.status(200).json({
                success: true,
                message: `등록된 이메일 : ${maskedEmail}`
            });
        }else{
            return res.status(404).json({success : false, error : "존재하지 않는 휴대폰 번호입니다."});
        }
    } catch (error) {
        logger.error(error);
        return res.status(500).json({success : false, error : "휴대폰 번호 확인 중 오류가 발생했습니다."});
    }
}

// 회원탈퇴
const withDrawal = async (req, res) => {
    const { email, password } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {

        const [rows] = await conn.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            logger.error("회원탈퇴에 대한 비정상적인 접근입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        const valid = await argon2.verify(rows[0].PASSWORD, password);

        if(!valid){
            await conn.rollback();
            conn.release();
            logger.error("비밀번호가 일치하지 않습니다.");
            return res.status(404).json({success : false, error : "일치하지 않습니다."});
        }
        const birthDay = new Date(rows[0].BIRTHDAY.getFullYear(), 0, 1, 0, 0, 0);

        await conn.query('UPDATE USER SET EMAIL = "", PASSWORD = "", NAME = "", GENDER = "", BIRTHDAY = ?, PHONE_NUMBER = 0, PHONE_PLAN = 0, FAIL_CNT = 0 WHERE EMAIL = ?', [birthDay, email]);
        
        await conn.query('DELETE FROM TOKEN WHERE EMAIL = ?', [email]);

        res.clearCookie('token', {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 0
        });

        await conn.commit();
        conn.release();
        logger.info(`${email} 회원탈퇴 성공`);
        return res.status(200).json({success : true, message : "회원탈퇴가 완료되었습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "회원탈퇴 중 오류가 발생했습니다."});
    }
}

// 로그인
const login = async (req, res) => {
    const { id, password } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await conn.query('SELECT * FROM USER WHERE EMAIL = ? OR PHONE_NUMBER = ?', [id, id]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            logger.error(`${id} 아이디가 일치하지않습니다.`);
            return res.status(404).json({success : false, error : "로그인에 실패했습니다."});
        }else{
            const email = rows[0].EMAIL;
            if(rows[0].FAIL_CNT >= 5){
                await conn.rollback();
                conn.release();
                logger.error(`${id} 비밀번호 5회 실패로 인해 로그인에 실패했습니다.`);
                return res.status(404).json({success : false, error : "비밀번호 5회 이상 실패했습니다.\n비밀번호 재설정 후 다시 시도해주세요."});
            }

            const valid = await argon2.verify(rows[0].PASSWORD, password);

            if(!valid){
                await conn.query('UPDATE USER SET FAIL_CNT = ? WHERE EMAIL = ?', [rows[0].FAIL_CNT + 1, email]);
                await conn.commit();
                conn.release();
                logger.error(`${id} 패스워드가 일치하지않습니다.`);
                return res.status(404).json({success : false, error : "로그인에 실패했습니다."});
            }

            await conn.query('UPDATE USER SET FAIL_CNT = ? WHERE EMAIL = ?', [0, email]);

            const token = jwt.sign({ email, id : rows[0].ID, name : rows[0].NAME, plan : rows[0].PHONE_PLAN, membership : rows[0].MEMBERSHIP, birthDay : rows[0].BIRTHDAY }, jwtSecret, {expiresIn : '30m'});

            await conn.query('INSERT INTO TOKEN(EMAIL, TOKEN) VALUES(?, ?) ON DUPLICATE KEY UPDATE TOKEN = ?', [email, token, token]);

            res.cookie('token', token, {
                httpOnly : true,
                secure : true,
                sameSite : 'none',
                path : '/',
                maxAge : 30 * 60 * 1000
            });

            await conn.commit();
            conn.release();

            logger.info(`${email} 로그인 성공`);
            return res.status(200).json({success : true, message : "로그인에 성공했습니다."});
        }
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "로그인 중 오류가 발생했습니다."});
    }
}

// 로그아웃
const logout = async (req, res) => {
    const { email } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await conn.query('SELECT * FROM TOKEN WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            logger.error(`${email} 로그아웃에 대한 비정상적인 접근입니다.`);
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        await conn.query('DELETE FROM TOKEN WHERE EMAIL = ?', [email]);

        res.clearCookie('token', {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 0
        });

        await conn.commit();
        conn.release();
        logger.info(`${email} 로그아웃 성공`);
        return res.status(200).json({success : true, message : "로그아웃에 성공했습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "로그아웃 중 오류가 발생했습니다."});
    }
}

// 토큰 갱신
const tokenCheck = async (req, res) => {
    const payload = { email : req.user.email, id : req.user.id, name : req.user.name, plan : req.user.plan, membership : req.user.membership, birthDay : req.user.birthDay };

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await conn.query('SELECT * FROM TOKEN WHERE EMAIL = ?', [payload.email]);

        if(rows.length === 0){
            res.clearCookie('token', {
                httpOnly : true,
                secure : true,
                sameSite : 'none',
                path : '/',
                maxAge : 0
            });
            await conn.rollback();
            conn.release();
            logger.error(`토큰 확인에 대한 비정상적인 접근입니다.`);
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        const newToken = jwt.sign(payload, jwtSecret, {expiresIn : '30m'});

        await conn.query('UPDATE TOKEN SET TOKEN = ? WHERE EMAIL = ?', [newToken, payload.email]);

        res.cookie('token', newToken, {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 30 * 60 * 1000
        });

        await conn.commit();
        conn.release();

        logger.info(`${payload.email} 토큰 갱신 성공`);
        return res.status(200).json({ success : true, authenticated : true, user : req.user });
    } catch (error) {
        res.clearCookie('token', {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 0
        });
        await conn.rollback();
        conn.release(); 
        logger.error(error);
        return res.status(500).json({success : false, error : "토큰 갱신 중 오류가 발생했습니다.\n안전을 위해 로그아웃 처리되었습니다."});
    }
}

// 토큰 검증
const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token;

    if(!token){
        logger.error("토큰이 없습니다.");
        return res.status(401).json({success : false, error : "토큰이 없습니다."});
    }

    let decoded;

    try {
        decoded = jwt.verify(token, jwtSecret);
    }catch(error){
        logger.error(error);
        return res.status(401).json({success : false, message : "토큰 검증에 실패했습니다."});
    }

    try {
        const [rows] = await db.query('SELECT * FROM TOKEN WHERE EMAIL = ? AND TOKEN = ?', [decoded.email, token]);

        if(rows.length === 0){
            res.clearCookie('token', {
                httpOnly : true,
                secure : true,
                sameSite : 'none',
                path : '/',
                maxAge : 0
            });
            logger.error("중복 로그인 제거");
            return res.status(401).json({success : false, error : "다른 곳에서 로그인을 시도했습니다.\n안전을 위해 로그아웃 처리되었습니다."});
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.clearCookie('token', {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 0
        });
        logger.error(error);
        return res.status(500).json({success : false, error : "토큰 검증 중 오류가 발생했습니다.\n안전을 위해 로그아웃 처리되었습니다."});
    }
}

// 유저 상세 정보 조회
const getUserInfo = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            logger.error("비정상적인 접근입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        const valid = await argon2.verify(rows[0].PASSWORD, password);

        if(!valid){
            logger.error("비밀번호가 일치하지 않습니다.");
            return res.status(404).json({success : false, error : "일치하지 않습니다."});
        }
        
        logger.info(`${email} 유저 정보 조회 성공`);
        return res.status(200).json({success : true, name : rows[0].NAME, gender : rows[0].GENDER, birthDay : rows[0].BIRTHDAY, phoneNumber : rows[0].PHONE_NUMBER, phonePlan : rows[0].PHONE_PLAN, email : rows[0].EMAIL, message : "유저 정보 조회 성공"});
    } catch (error) {
        logger.error(error);
        return res.status(500).json({success : false, error : "비밀번호 확인 중 오류가 발생했습니다."});
    }
}

module.exports = { signUp, phoneNumberDuplicate, emailDuplicate, emailAuth, checkAuth, passwordChange, passwordReset, passwordCheck, phoneNumberCheck, withDrawal, login, logout, tokenCheck, authenticateToken, getUserInfo };