import db from './db';
import { randomInt, randomBytes } from 'crypto';

const argon2  = require("@node-rs/argon2");
const nodemailer = require('nodemailer');

const jwtSecret = process.env.JWT_SECRET;

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

        console.log("이메일 발송 성공 : ", info.messageId);
    } catch (error) {
        console.error("이메일 발송 실패 : ", error);
    }
};

// 회원가입
const signUp = async (req, res) => {
    const { name, gender,  birthDay, phoneNumber, email, password, phonePlan} = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        if(effectiveness(email, birthDay, password)){
            conn.release();
            console.error("올바르지못한 형식");
            return res.status(404).json({message : "올바르지못한 형식입니다."});
        }

        const hashPassword = await argon2.hash(password, {
            type : argon2.Algorithm.Argon2id,
            timeCost : Number(process.env.TIME_COST),
            memoryCost : 1 << Number(process.env.MEMORY_COST),
            parallelism : Number(process.env.PARALLELISM)
        });

        await conn.query('INSERT INTO USER(NAME, GENDER, BIRTHDAY, PHONE_NUMBER, PHONE_PLAN, EMAIL, PASSWORD) VALUES(?, ?, ?, ?, ?, ?)', [name, gender, birthDay, phoneNumber, phonePlan, email, hashPassword]);

        await conn.commit();
        conn.release();
        console.log(`${email} 회원가입 성공`);
        return res.status(200).json({message : "회원가입이 완료되었습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        console.error(error);
        return res.status(500).json({error : "회원가입에 실패했습니다."});
    }
}

// 휴대폰 중복확인
const phoneNumberDuplicate = async (req, res) => {
    const { phoneNumber } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM USER WHERE PHONE_NUMBER = ?', [phoneNumber]);

        if(rows.length > 0){
            console.log(`${phoneNumber}은 이미 존재하는 휴대폰 번호입니다.`);
            return res.status(404).json({ success : false, message : "존재하는 휴대폰 번호입니다."});
        }else{
            console.log(`${phoneNumber}은 사용가능한 휴대폰 번호입니다.`);
            return res.status(200).json({success : true, message : "사용가능한 휴대폰 번호입니다."});
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({success : false, error : "휴대포 번호 체크에 실패했습니다."});
    }
}

// 이메일 인증
const emailAuth = async (req, res) => {
    const { email } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        if(effectiveness(email)){
            conn.release();
            console.error("올바르지못한 형식");
            return res.status(404).json({message : "올바르지못한 형식입니다."});
        }

        // 보안 강화장치
        const x = randomInt(0, 10000);

        const buf = randomBytes(6); // 48비트 암호학적 난수 생성
        const num = buf.readUIntBE(0, 6) / 2**48;
        const value = Math.floor(num * 10000);

        const auth = String(value).padStart(4, '0');

        await conn.query('INSERT INTO AUTHENTICATION(EMAIL, AUTH) VALUES(?, ?)', [email, auth]);

        await sendEmail(
            email,
            `이메일 인증을 하시려면 다음을 작성해주세요 : ${auth}`
        );

        await conn.commit();
        conn.release();
        console.log(`${email} 인증코드 보내기 성공`);
        return res.status(200).json({message : "인증코드가 전송되었습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        console.error(error);
        return res.status(500).json({error : "인증코드 전송에 실패했습니다."});
    }
}

// 인증코드 인증
const checkAuth = async (req, res) => {
    const { email, auth } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await conn.query('SELECT * FROM AUTHENTICATION WHERE EMAIL = ? AND USE_NOT = "N" AND timestampdiff(minute, CREATE_AT, now()) <= 5 ORDER BY ID DESC LIMIT 1', [email]);

        if(rows.length === 0 || rows[0].AUTH !== auth){
            await conn.rollback();
            conn.release();
            console.error(`${email} 인증코드가 일치하지않습니다.`);
            return res.status(404).json({message : "인증코드 인증 실패"});
        }else{
            await conn.query('UPDATE AUTHENTICATION SET USE_NOT = "Y" WHERE ID = ?', [rows[0].ID]);
            await conn.commit();
            conn.release();
            console.log(`${email} 인증코드가 일치합니다.`);
            return res.status(200).json({message : "인증코드 인증 성공"});
        }
    } catch (error) {
        await conn.rollback();
        conn.release();
        console.error(error);
        return res.status(500).json({error : "인증코드 인증 중 오류가 발생했습니다."});
    }
}

// 비밀번호 변경
const passwordChange = async (req, res) => {
    const { email, password, newPassword } = req.body;

    try {
        const hashNewPassword = await argon2.hash(newPassword, {
            type : argon2.Algorithm.Argon2id,
            timeCost : Number(process.env.TIME_COST),
            memoryCost : 1 << Number(process.env.MEMORY_COST),
            parallelism : Number(process.env.PARALLELISM)
        });

        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            console.error("비밀번호 변경에 대한 비정상적인 접근입니다.");
            return res.status(404).json({success : false, message : "비정상적인 접근입니다."});
        }

        const valid = await argon2.verify(rows[0].PASSWORD, password);

        if(!valid){
            console.error("비밀번호가 일치하지 않습니다.");
            return res.status(404).json({success : false, message : "일치하지 않습니다."});
        }

        await db.query('UPDATE USER SET PASSWORD = ? WHERE EMAIL = ?', [hashNewPassword, email]);

        console.log(`${email} 비밀번호 변경 성공`);
        return res.status(200).json({message : "비밀번호 변경이 완료되었습니다."});
    } catch (error) {
        console.error(error);
        return res.status(500).json({error : "비밀번호 변경 중 오류가 발생했습니다."});
    }
}

// 비밀번호 재설정
const passwordReset = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            console.error(`${email} 이메일이 일치하지 않습니다.`);
            return res.status(404).json({success : false, message : "일치하지 않습니다."});
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
        console.error(error);
        return res.status(500).json({error : "비밀번호 재설정 중 오류가 발생했습니다."});
    }
}

// 비밀번호 확인
const passwordCheck = async (req, res) => {
    const { email, password } = req.body;

    try {

        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            console.error("비밀번호 확인에 대한 비정상적인 접근입니다.");
            return res.status(404).json({success : false, message : "비정상적인 접근입니다."});
        }

        const valid = await argon2.verify(rows[0].PASSWORD, password);

        if(!valid){
            console.error("비밀번호가 일치하지 않습니다.");
            return res.status(404).json({success : false, message : "일치하지 않습니다."});
        }

        return res.status(200).json({success : true, message : "비밀번호 확인 성공"});
    } catch (error) {
        console.error(error);
        return res.status(500).json({error : "비밀번호 확인 중 오류가 발생했습니다."});
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
            return res.status(200).json({
                success: true,
                message: `등록된 이메일 : ${maskedEmail}`
            });
        }else{
            return res.status(404).json({success : false, message : "존재하지 않는 휴대폰 번호입니다."});
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({error : "휴대폰 번호 확인 중 오류가 발생했습니다."});
    }
}

// 회원탈퇴
const withDrawal = async (req, res) => {
    const { email, password } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {

        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            console.error("회원탈퇴에 대한 비정상적인 접근입니다.");
            return res.status(404).json({success : false, message : "비정상적인 접근입니다."});
        }

        const valid = await argon2.verify(rows[0].PASSWORD, password);

        if(!valid){
            await conn.rollback();
            conn.release();
            console.error("비밀번호가 일치하지 않습니다.");
            return res.status(404).json({success : false, message : "일치하지 않습니다."});
        }
        await db.query('DELETE FROM USER WHERE EMAIL = ?', [email]);
        await db.query('DELETE FROM TOKEN WHERE EMAIL = ?', [email]);

        res.clearCookie('token', {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 0
        });

        await conn.commit();
        conn.release();
        console.log(`${email} 회원탈퇴 성공`);
        return res.status(200).json({success : true, message : "회원탈퇴가 완료되었습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        console.error(error);
        return res.status(500).json({error : "회원탈퇴 중 오류가 발생했습니다."});
    }
}

// 로그인
const login = async (req, res) => {
    const { email, password } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await db.query('SELECT * FROM USER WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            console.error(`${email} 아이디가 일치하지않습니다.`);
            return res.status(404).json({success : false, message : "로그인에 실패했습니다."});
        }else{
            if(rows[0].FAIL_CNT >= 5){
                await conn.rollback();
                conn.release();
                console.error(`${email} 비밀번호 5회 실패로 인해 로그인에 실패했습니다.`);
                return res.status(404).json({success : false, message : "비밀번호 5회 이상 실패했습니다.\n비밀번호 재설정 후 다시 시도해주세요."});
            }

            const valid = await argon2.verify(rows[0].PASSWORD, password);

            if(!valid){
                await db.query('UPDATE USER SET FAIL_CNT = ? WHERE EMAIL = ?', [rows[0].FAIL_CNT + 1, email]);
                await conn.commit();
                conn.release();
                console.error(`${email} 패스워드가 일치하지않습니다.`);
                return res.status(404).json({success : false, message : "로그인에 실패했습니다."});
            }

            await db.query('UPDATE USER SET FAIL_CNT = ? WHERE EMAIL = ?', [0, email]);

            const token = jwt.sign({email}, jwtSecret, {expiresIn : '30m'});

            await db.query('INSERT INTO TOKEN(EMAIL, TOKEN) VALUES(?, ?) ON DUPLICATE KEY UPDATE TOKEN = ?', [email, token, token]);

            res.cookie('token', token, {
                httpOnly : true,
                secure : true,
                sameSite : 'none',
                path : '/',
                maxAge : 30 * 60 * 1000
            });

            await conn.commit();
            conn.release();

            console.log(`${email} 로그인 성공`);
            return res.status(200).json({success : true, name : rows[0].NAME, plan : rows[0].PHONE_PLAN, birthDay : rows[0].BIRTHDAY, message : "로그인에 성공했습니다."});
        }
    } catch (error) {
        await conn.rollback();
        conn.release();
        console.error(error);
        return res.status(500).json({error : "로그인 중 오류가 발생했습니다."});
    }
}

// 로그아웃
const logout = async (req, res) => {
    const { email } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await db.query('SELECT * FROM TOKEN WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            console.error(`${email} 로그아웃에 대한 비정상적인 접근입니다.`);
            return res.status(404).json({success : false, message : "비정상적인 접근입니다."});
        }

        await db.query('DELETE FROM TOKEN WHERE EMAIL = ?', [email]);

        res.clearCookie('token', {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 0
        });

        await conn.commit();
        conn.release();
        console.log(`${email} 로그아웃 성공`);
        return res.status(200).json({success : true, message : "로그아웃에 성공했습니다."});
    } catch (error) {
        await conn.rollback();
        conn.release();
        console.error(error);
        return res.status(500).json({error : "로그아웃 중 오류가 발생했습니다."});
    }
}

// 토큰 갱신
const tokenCheck = async (req, res) => {
    const email = { email : req.user.email };

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [rows] = await db.query('SELECT * FROM TOKEN WHERE EMAIL = ?', [email]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            console.error(`토큰 확인에 대한 비정상적인 접근입니다.`);
            return res.status(404).json({success : false, message : "비정상적인 접근입니다."});
        }

        const newToken = jwt.sign(email, jwtSecret, {expiresIn : '30m'});

        await db.query('UPDATE TOKEN SET TOKEN = ? WHERE EMAIL = ?', [newToken, email.email]);

        res.cookie('token', newToken, {
            httpOnly : true,
            secure : true,
            sameSite : 'none',
            path : '/',
            maxAge : 30 * 60 * 1000
        });

        await conn.commit();
        conn.release();

        console.log(`${email.email} 토큰 갱신 성공`);
        return res.status(200).json({ authenticated : true, user : req.user });
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
        console.error(error);
        return res.status(500).json({error : "토큰 갱신 중 오류가 발생했습니다.\n안전을 위해 로그아웃 처리되었습니다."});
    }
}

// 토큰 검증
const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token;

    if(!token){
        console.error("토큰이 없습니다.");
        return res.status(401).json({success : false, message : "토큰이 없습니다."});
    }

    let decoded;

    try {
        decoded = jwt.verify(token, jwtSecret);
    }catch(error){
        console.error(error);
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
            console.error("중복 로그인 제거");
            return res.status(401).json({success : false, message : "다른 곳에서 로그인을 시도했습니다.\n안전을 위해 로그아웃 처리되었습니다."});
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
        console.error(error);
        return res.status(500).json({error : "토큰 검증 중 오류가 발생했습니다.\n안전을 위해 로그아웃 처리되었습니다."});
    }
}

export { signUp, phoneNumberDuplicate, emailAuth, checkAuth };

// 정규표현식
const effectiveness = (email, birthDay, password) => {
    // 1. 아이디: 영문 소문자 + 숫자 조합, 5~20자, 특수문자 제외
    const idRegex = /^(?=.*[a-z])(?=.*\d)[a-z\d]{5,20}$/;

    // 3. 비밀번호: 영문 대/소문자 + 숫자 + 특수문자 포함, 8~20자
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

    if(email){
        if(!idRegex.test(email)){
            return true;
        }
    }

    if(password){
        if(!passwordRegex.test(password)){
            return true;
        }
    }
    return false;
}