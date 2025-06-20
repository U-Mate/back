const logger = require("./log");

// 🚫 욕설 및 부적절한 단어 목록
const INAPPROPRIATE_WORDS = [
    // 욕설
    '씨발', '시발', '개새끼', '새끼', '병신', '지랄', '꺼져', '죽어',
    '바보', '멍청이', '똥', '개똥', '미친', '또라이', '정신병',
    // 영어 욕설
    'fuck', 'shit', 'damn', 'bitch', 'asshole', 'stupid', 'idiot',
    // 기타 부적절한 표현
    '죽고싶', '자살', '폭력', '때리', '죽이'
];

// 📋 서비스 관련 키워드
const SERVICE_KEYWORDS = [
    // 통신 서비스
    '요금제', '통신', '전화', '문자', '데이터', '인터넷', '와이파이', 'wifi',
    '통화', 'sms', 'mms', '로밍', '충전', '결제', '청구', '요금',
    '할인', '혜택', '포인트', '쿠폰', '이벤트', '프로모션',
    // 고객 서비스
    '문의', '상담', '신청', '가입', '해지', '변경', '이용', '사용',
    '서비스', '고객', '지원', '도움', '안내', '정보', '확인',
    // 일반적인 인사/질문
    '안녕', '감사', '고마', '죄송', '미안', '실례', '문의',
    '궁금', '알고싶', '어떻게', '언제', '어디서', '무엇', '왜'
];

// 🚫 욕설 및 부적절한 내용 필터
const checkInappropriateContent = (message) => {
    const lowerMessage = message.toLowerCase();
    
    for (const word of INAPPROPRIATE_WORDS) {
        if (lowerMessage.includes(word.toLowerCase())) {
            return {
                isInappropriate: true,
                detectedWord: word,
                reason: '부적절한 언어 사용'
            };
        }
    }
    
    return { isInappropriate: false };
};

// 📋 서비스 관련성 체크
const checkServiceRelevance = (message) => {
    const lowerMessage = message.toLowerCase();
    let relevanceScore = 0;
    const detectedKeywords = [];
    
    for (const keyword of SERVICE_KEYWORDS) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
            relevanceScore++;
            detectedKeywords.push(keyword);
        }
    }
    
    // 짧은 메시지는 관련성 기준을 낮춤
    const messageLength = message.length;
    const threshold = messageLength < 10 ? 1 : 2;
    
    return {
        isRelevant: relevanceScore >= threshold,
        score: relevanceScore,
        detectedKeywords: detectedKeywords,
        threshold: threshold
    };
};

// 🔍 종합 메시지 필터
const filterMessage = (message) => {
    logger.info(`🔍 메시지 필터링 시작: "${message}"`);
    
    // 1. 부적절한 내용 체크
    const inappropriateCheck = checkInappropriateContent(message);
    if (inappropriateCheck.isInappropriate) {
        logger.info(`🚫 부적절한 내용 감지: ${inappropriateCheck.detectedWord}`);
        return {
            allowed: false,
            reason: inappropriateCheck.reason,
            type: 'inappropriate',
            detectedWord: inappropriateCheck.detectedWord,
            response: `죄송합니다. 질문을 정확히 이해하지 못했습니다. 😅\n\n통신 서비스와 관련된 질문을 다시 말씀해 주시면 더 정확한 답변을 드릴 수 있어요!\n\n예: "요금제 추천해주세요", "데이터 사용량 확인하고 싶어요" 등`
        };
    }
    
    // 2. 서비스 관련성 체크
    const relevanceCheck = checkServiceRelevance(message);
    if (!relevanceCheck.isRelevant) {
        logger.info(`📋 서비스 무관 메시지: 점수 ${relevanceCheck.score}/${relevanceCheck.threshold}`);
        return {
            allowed: false,
            reason: '서비스와 무관한 내용',
            type: 'irrelevant',
            score: relevanceCheck.score,
            threshold: relevanceCheck.threshold,
            response: `죄송합니다. 질문을 정확히 이해하지 못했습니다. 😅\n\n통신 서비스와 관련된 질문을 다시 말씀해 주시면 더 정확한 답변을 드릴 수 있어요!\n\n예: "요금제 추천해주세요", "데이터 사용량 확인하고 싶어요" 등`
        };
    }
    
    logger.info(`✅ 메시지 필터링 통과: 관련성 점수 ${relevanceCheck.score}`);
    return {
        allowed: true,
        relevanceScore: relevanceCheck.score,
        detectedKeywords: relevanceCheck.detectedKeywords
    };
};

// 📊 필터링 통계 (나중에 확장 가능)
const getFilterStats = () => {
    return {
        inappropriateWords: INAPPROPRIATE_WORDS.length,
        serviceKeywords: SERVICE_KEYWORDS.length,
        lastUpdated: new Date().toISOString()
    };
};

// 🔧 키워드 관리 함수들 (나중에 확장 가능)
const addInappropriateWord = (word) => {
    if (!INAPPROPRIATE_WORDS.includes(word)) {
        INAPPROPRIATE_WORDS.push(word);
        logger.info(`🚫 부적절한 단어 추가: ${word}`);
        return true;
    }
    return false;
};

const addServiceKeyword = (keyword) => {
    if (!SERVICE_KEYWORDS.includes(keyword)) {
        SERVICE_KEYWORDS.push(keyword);
        logger.info(`📋 서비스 키워드 추가: ${keyword}`);
        return true;
    }
    return false;
};

const removeInappropriateWord = (word) => {
    const index = INAPPROPRIATE_WORDS.indexOf(word);
    if (index > -1) {
        INAPPROPRIATE_WORDS.splice(index, 1);
        logger.info(`🚫 부적절한 단어 제거: ${word}`);
        return true;
    }
    return false;
};

const removeServiceKeyword = (keyword) => {
    const index = SERVICE_KEYWORDS.indexOf(keyword);
    if (index > -1) {
        SERVICE_KEYWORDS.splice(index, 1);
        logger.info(`📋 서비스 키워드 제거: ${keyword}`);
        return true;
    }
    return false;
};

module.exports = {
    // 🔥 핵심 필터링 함수들
    filterMessage,
    checkInappropriateContent,
    checkServiceRelevance,
    
    // 📊 통계 및 관리
    getFilterStats,
    
    // 🔧 키워드 관리 (확장용)
    addInappropriateWord,
    addServiceKeyword,
    removeInappropriateWord,
    removeServiceKeyword,
    
    // 📋 키워드 리스트 조회 (읽기 전용)
    getInappropriateWords: () => [...INAPPROPRIATE_WORDS],
    getServiceKeywords: () => [...SERVICE_KEYWORDS]
}; 