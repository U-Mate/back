const logger = require("./log");

// 🚫 욕설 및 부적절한 단어 목록
const INAPPROPRIATE_WORDS = [
  // 욕설
  "씨발",
  "시발",
  "개새끼",
  "새끼",
  "병신",
  "지랄",
  "꺼져",
  "죽어",
  "바보",
  "멍청이",
  "똥",
  "개똥",
  "미친",
  "또라이",
  "정신병",
  // 영어 욕설
  "fuck",
  "shit",
  "damn",
  "bitch",
  "asshole",
  "stupid",
  "idiot",
  // 기타 부적절한 표현
  "죽고싶",
  "자살",
  "폭력",
  "때리",
  "죽이",
];

// 🚫 UMate와 무관한 주제들 (블랙리스트)
const IRRELEVANT_TOPICS = [
  // 학문/과학 분야
  "양자역학",
  "물리학",
  "화학",
  "생물학",
  "수학",
  "공학",
  "의학",
  "약학",
  "천문학",
  "지질학",
  "심리학",
  "철학",
  "사회학",
  "경제학",
  "정치학",
  "역사",
  "문학",
  "언어학",
  "미술",
  "음악",
  "체육",
  "교육학",

  // 일상 생활
  "요리",
  "레시피",
  "음식",
  "맛집",
  "여행",
  "관광",
  "숙박",
  "호텔",
  "책",
  "소설",
  "게임",
  "스포츠",
  "운동",
  "건강",
  "패션",
  "뷰티",
  "화장품",
  "헤어",
  "다이어트",
  "운동법",

  // 기타 무관한 주제
  "날씨",
  "점성술",
  "운세",
  "타로",
  "로또",
  "주식",
  "투자",
  "부동산",
  "정치",
  "선거",
  "종교",
  "철학",
  "명상",
  "심리상담",
  "연애",
  "결혼",
  "육아",
  "반려동물",
  "자동차",
  "오토바이",
  "자전거",

  // 다른 회사/브랜드
  "삼성",
  "kt",
  "skt",
  "lg",
  "애플",
  "구글",
  "아마존",
  "넷플릭스",
  "카카오",
  "네이버",
  "쿠팡",
  "배달의민족",

  // 영어 무관 주제
  "quantum",
  "physics",
  "chemistry",
  "biology",
  "mathematics",
  "cooking",
  "recipe",
  "travel",
  "movie",
  "game",
  "sports",
];

// 📋 서비스 관련 키워드 (화이트리스트)
const SERVICE_KEYWORDS = [
  // UMate 브랜드
  "umate",
  "유메이트",
  "유식이",

  // 핵심 통신 서비스
  "요금제",
  "통신",
  "전화",
  "문자",
  "데이터",
  "인터넷",
  "와이파이",
  "wifi",
  "통화",
  "sms",
  "mms",
  "로밍",
  "국제전화",
  "무제한",
  "부가서비스",

  // 요금/결제 관련
  "요금",
  "비용",
  "가격",
  "할인",
  "청구",
  "결제",
  "납부",
  "연체",
  "충전",
  "포인트",
  "적립",
  "혜택",
  "쿠폰",
  "이벤트",
  "프로모션",

  // 고객 서비스
  "가입",
  "신청",
  "해지",
  "해약",
  "변경",
  "이용",
  "사용",
  "개통",
  "문의",
  "상담",
  "고객센터",
  "지원",
  "도움",
  "안내",
  "확인",
  "약정",
  "명의변경",
  "번호이동",

  // 기술 서비스
  "5g",
  "4g",
  "lte",
  "속도",
  "커버리지",
  "기지국",
  "단말기",
  "휴대폰",
  "개인정보",
  "보안",
  "인증",
  "본인확인",

  // 이벤트 및 프로모션 관련
  "이벤트",
  "프로모션",
  "할인",
  "특가",
  "세일",
  "기념",
  "축하",
  "선물",
  "사은품",
  "경품",
  "추첨",
  "당첨",
  "참여",
  "신청",
  "등록",
  "진행",

  // 위약금 및 계약 관련
  "위약금",
  "할인반환금",
  "예상할인반환금",
  "약정",
  "계약",
  "해지",
  "해약",
  "중도해지",
  "조기해지",
  "계약기간",
  "약정기간",
  "만료",
  "갱신",
  "정책",
  "연장",
  "변경",
  "이동",
  "번호이동",
  "명의변경",
  "위약금 안내",
  "위약금 계산",
  "위약금 확인",
  "위약금 문의",
  "위약금 상담",
  "위약금 정보",
  "위약금 조회",
  "위약금 계산기",
  "위약금 예상",
  "위약금 산정",
  "위약금 규정",
  "위약금 기준",
  "위약금 금액",
  "위약금 비용",
  "위약금 납부",
  "위약금 절차",
  "위약금 신청",
  "위약금 처리",
  "위약금 관련",
  "위약금 도움",
  "위약금 지원",
  "위약금 서비스",

  // 매우 일반적인 인사/질문 (최소한 허용)
  "안녕",
  "감사",
  "고마",
  "죄송",
  "미안",
  "도와",
  "추천",

  // 음성에서 자주 사용되는 표현
  "알려",
  "알고",
  "궁금",
  "문의",
  "질문",
  "물어",
  "여쭤",
  "뭐가",
  "뭔가",
  "어떤",
  "어떻게",
  "뭘까",
  "있나",
  "있을까",
  "해줘",
  "해주세요",
  "부탁",
  "원해",
  "하고싶어",
  "싶어요",
];

// 🚫 욕설 및 부적절한 내용 필터
const checkInappropriateContent = (message) => {
  const lowerMessage = message.toLowerCase();

  for (const word of INAPPROPRIATE_WORDS) {
    if (lowerMessage.includes(word.toLowerCase())) {
      return {
        isInappropriate: true,
        detectedWord: word,
        reason: "부적절한 언어 사용",
      };
    }
  }

  return { isInappropriate: false };
};

// 🚫 무관한 주제 체크 (블랙리스트)
const checkIrrelevantTopics = (message) => {
  const lowerMessage = message.toLowerCase();
  const detectedIrrelevantTopics = [];

  for (const topic of IRRELEVANT_TOPICS) {
    if (lowerMessage.includes(topic.toLowerCase())) {
      detectedIrrelevantTopics.push(topic);
    }
  }

  return {
    hasIrrelevantTopics: detectedIrrelevantTopics.length > 0,
    detectedTopics: detectedIrrelevantTopics,
  };
};

// 📋 서비스 관련성 체크 (화이트리스트)
const checkServiceRelevance = (message, isAudio = false) => {
  const lowerMessage = message.toLowerCase();

  // 1️⃣ 먼저 무관한 주제가 있는지 체크 (블랙리스트)
  const irrelevantCheck = checkIrrelevantTopics(message);
  if (irrelevantCheck.hasIrrelevantTopics) {
    return {
      isRelevant: false,
      reason: "blacklisted_topic",
      detectedIrrelevantTopics: irrelevantCheck.detectedTopics,
      score: 0,
    };
  }

  // 2️⃣ 서비스 관련 키워드 체크 (화이트리스트)
  let relevanceScore = 0;
  const detectedKeywords = [];

  for (const keyword of SERVICE_KEYWORDS) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      relevanceScore++;
      detectedKeywords.push(keyword);
    }
  }

  // 3️⃣ 음성과 텍스트에 따른 다른 기준 적용 (최대한 완화)
  const messageLength = message.length;
  let threshold;

  if (isAudio) {
    // 🎤 음성의 경우 매우 관대한 기준
    if (messageLength < 15) {
      threshold = 0; // 짧은 음성은 키워드 없어도 OK
    } else if (messageLength < 30) {
      threshold = 1; // 중간 길이도 1개만 요구
    } else {
      threshold = 1; // 긴 경우에도 1개만 요구 (완화)
    }
  } else {
    // 💬 텍스트의 경우도 매우 관대하게 (대폭 완화)
    if (messageLength < 10) {
      threshold = 0; // 짧은 메시지는 키워드 없어도 OK
    } else if (messageLength < 25) {
      threshold = 1; // 중간 메시지도 1개만 요구
    } else {
      threshold = 1; // 긴 메시지도 1개만 요구 (완화)
    }
  }

  return {
    isRelevant: relevanceScore >= threshold,
    score: relevanceScore,
    detectedKeywords: detectedKeywords,
    threshold: threshold,
    reason: relevanceScore < threshold ? "insufficient_keywords" : "passed",
  };
};

// 🔍 종합 메시지 필터
const filterMessage = (message, isAudio = false) => {
  // 1. 부적절한 내용 체크
  const inappropriateCheck = checkInappropriateContent(message);
  if (inappropriateCheck.isInappropriate) {
    return {
      allowed: false,
      reason: inappropriateCheck.reason,
      type: "inappropriate",
      detectedWord: inappropriateCheck.detectedWord,
      response: `죄송합니다. 질문을 정확히 이해하지 못했습니다. 😅\n\n통신 서비스와 관련된 질문을 다시 말씀해 주시면 더 정확한 답변을 드릴 수 있어요!\n\n예:\n "요금제 추천해주세요", "데이터 사용량 확인하고 싶어요" 등`,
    };
  }

  // 2. 서비스 관련성 체크 (블랙리스트 + 화이트리스트)
  const relevanceCheck = checkServiceRelevance(message, isAudio);
  if (!relevanceCheck.isRelevant) {
    // 블랙리스트에 걸린 경우
    if (relevanceCheck.reason === "blacklisted_topic") {
      return {
        allowed: false,
        reason: "서비스와 무관한 주제",
        type: "blacklisted",
        detectedTopics: relevanceCheck.detectedIrrelevantTopics,
        response: `죄송합니다. 저는 UMate 통신 서비스 전문 AI입니다. 😊\n\n**요금제, 통신 서비스, 데이터, 할인 혜택** 등 UMate 관련 질문만 답변드릴 수 있어요!\n\n🔹 "어떤 요금제가 좋을까요?"\n🔹 "데이터 무제한 요금제 있나요?"\n🔹 "할인 혜택 알려주세요"\n\n이런 질문들을 해주시면 정확한 답변을 드릴게요! 💪`,
      };
    }
    // 키워드 부족으로 걸린 경우
    else {
      return {
        allowed: false,
        reason: "서비스 키워드 부족",
        type: "insufficient_keywords",
        score: relevanceCheck.score,
        threshold: relevanceCheck.threshold,
        response: `죄송합니다. 질문을 정확히 이해하지 못했습니다. 😅\n\n더 구체적인 **통신 서비스** 관련 질문을 해주시면 도움을 드릴 수 있어요!\n\n예시:\n🔹 "무제한 요금제 추천해주세요"\n🔹 "현재 요금제 변경하고 싶어요"\n🔹 "데이터 사용량 확인 방법은?"`,
      };
    }
  }

  return {
    allowed: true,
    relevanceScore: relevanceCheck.score,
    detectedKeywords: relevanceCheck.detectedKeywords,
  };
};

// 📊 필터링 통계 (나중에 확장 가능)
const getFilterStats = () => {
  return {
    inappropriateWords: INAPPROPRIATE_WORDS.length,
    serviceKeywords: SERVICE_KEYWORDS.length,
    lastUpdated: new Date().toISOString(),
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
  checkIrrelevantTopics,

  // 📊 통계 및 관리
  getFilterStats,

  // 🔧 키워드 관리 (확장용)
  addInappropriateWord,
  addServiceKeyword,
  removeInappropriateWord,
  removeServiceKeyword,

  // 📋 키워드 리스트 조회 (읽기 전용)
  getInappropriateWords: () => [...INAPPROPRIATE_WORDS],
  getServiceKeywords: () => [...SERVICE_KEYWORDS],
  getIrrelevantTopics: () => [...IRRELEVANT_TOPICS],
};
