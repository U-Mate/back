import db from './db';
import { randomInt, randomBytes } from 'crypto';

const argon2  = require("@node-rs/argon2");
const nodemailer = require('nodemailer');

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