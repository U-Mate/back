const logger = require("./log");

// 정규표현식
const effectiveness = (email, phoneNumber, birthDay, password) => {
    // 1. 아이디: 영문 소문자 + 숫자 조합, 5~20자, 특수문자 제외
    const idRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    // 2. 휴대폰 번호: 10~11자리 숫자, 특수문자 제외
    const phoneNumberRegex = /^\d{10,11}$/;

    // 3. 생년월일: 8자리 숫자, yyyymmdd 형식, 유효한 날짜 검증
    const birthDayRegex = /^\d{8}$/;

    // 4. 비밀번호: 영문 대문자 + 소문자 + 숫자 + 특수문자 각각 1개 이상 포함, 12~20자
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,20}$/;

    if(!email && !phoneNumber && !birthDay && !password){
        logger.error("데이터가 비어있음");
        return true;
    }

    if(email && !idRegex.test(email)){
        logger.error("이메일 형식이 올바르지 않음");
        return true;
    }

    if(phoneNumber && !phoneNumberRegex.test(phoneNumber)){
        logger.error("휴대폰 번호 형식이 올바르지 않음");
        return true;
    }

    if(birthDay && !birthDayRegex.test(birthDay)){
        logger.error("생년월일 형식이 올바르지 않음");
        return true;
    }

    if(birthDay && birthDayRegex.test(birthDay)) {
        const year = parseInt(birthDay.substring(0, 4));
        const month = parseInt(birthDay.substring(4, 6));
        const day = parseInt(birthDay.substring(6, 8));
        
        // 년도 검증 (1900년 ~ 현재년도)
        const currentYear = new Date().getFullYear();
        if(year < 1900 || year > currentYear) {
            logger.error("생년월일 년도가 올바르지 않음");
            return true;
        }
        
        // 월 검증 (1~12)
        if(month < 1 || month > 12) {
            logger.error("생년월일 월이 올바르지 않음");
            return true;
        }
        
        // 일 검증 (각 월의 유효한 일수)
        const daysInMonth = new Date(year, month, 0).getDate();
        if(day < 1 || day > daysInMonth) {
            logger.error("생년월일 일이 올바르지 않음");
            return true;
        }
    }

    if(password && !passwordRegex.test(password)){
        logger.error("비밀번현 형식이 올바르지 않음");
        return true;
    }
    return false;
}

module.exports = {
    effectiveness
};