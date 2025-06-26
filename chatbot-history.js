const db = require("./db");
const logger = require("./log");

const saveChatHistory = async (
  email,
  messageType,
  message,
  audioData = null,
  contextInfo = null
) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    await conn.query(
      `
            INSERT INTO CHAT_HISTORY (EMAIL, MESSAGE_TYPE, MESSAGE, AUDIO_DATA, CONTEXT_INFO) 
            VALUES (?, ?, ?, ?, ?)
        `,
      [email, messageType, message, audioData, contextInfo]
    );

    await conn.commit();
    conn.release();
    return true;
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error("❌ 채팅 히스토리 저장 오류:", error);
    return false;
  }
};

const loadChatHistory = async (email) => {
  try {
    const [rows] = await db.query(
      `
            SELECT * 
            FROM (
              SELECT *
              FROM CHAT_HISTORY
              WHERE EMAIL = ?
              ORDER BY ID DESC
              LIMIT 20
            ) A
            ORDER BY A.ID ASC
        `,
      [email]
    );

    return rows;
  } catch (error) {
    logger.error("❌ 채팅 히스토리 로드 오류:", error);
    return [];
  }
};

const loadServiceInfo = async () => {
  try {
    // 모든 서비스 정보 로드
    const [plans] = await db.query("SELECT * FROM PLAN_INFO");

    // ✅ Promise.all()을 사용하여 모든 비동기 작업을 기다림
    const services = await Promise.all(
      plans.map(async (plan) => {
        const [benefits] = await db.query(
          `
                    SELECT C.*
                    from PLAN_INFO A
                    JOIN PLAN_BENEFIT B ON A.ID=B.PLAN_ID
                    JOIN BENEFIT_INFO C ON B.BENEFIT_ID=C.BENEFIT_ID
                    where A.ID=?
                `,
          [plan.ID]
        );

        const [reviews] = await db.query(
          `
                    SELECT B.*, C.BIRTHDAY
                    from PLAN_INFO A
                    JOIN PLAN_REVIEW B ON A.ID=B.PLAN_ID
                    JOIN USER C ON B.USER_ID=C.ID
                    where A.ID=?
                `,
          [plan.ID]
        );

        return { ...plan, benefits, reviews };
      })
    );

    const [events] = await db.query("SELECT * FROM EVENT WHERE YN = 1");

    // 서비스 정보 텍스트 생성
    let serviceInfo = "\n\n=== UMate 서비스 정보 ===\n\n";

    // 서비스 정보
    serviceInfo += "📋 제공 서비스 목록:\n";

    services.forEach((service) => {
      serviceInfo += `• 요금제 정보: ${service.NAME}\n`;
      serviceInfo += `  - 가격: ${service.MONTHLY_FEE}원\n`;
      serviceInfo += `  - 음성통화: ${service.CALL_INFO} ${
        service.CALL_INFO_DETAIL || ""
      }\n`;
      serviceInfo += `  - 문자메시지: ${service.SMS_INFO}\n`;
      serviceInfo += `  - 데이터: ${service.DATA_INFO} ${
        service.DATA_INFO_DETAIL || ""
      }\n`;
      if (service.SHARE_DATA) {
        serviceInfo += `  - 공유 데이터: ${service.SHARE_DATA}\n`;
      }
      serviceInfo += `  - 이용 가능 연령: ${service.AGE_GROUP}\n`;
      serviceInfo += `  - 사용자 수: ${service.USER_COUNT}명\n`;

      // 평점 계산 (0으로 나누기 방지)
      const avgRating =
        service.REVIEW_USER_COUNT > 0
          ? (service.RECEIVED_STAR_COUNT / service.REVIEW_USER_COUNT).toFixed(1)
          : "평점 없음";
      serviceInfo += `  - 리뷰 평점: ${avgRating}\n`;

      serviceInfo += `  - 리뷰: \n`;
      for (const review of service.reviews) {
        const today = new Date();
        const birthDate = new Date(review.BIRTHDAY);
        const age = today.getFullYear() - birthDate.getFullYear();

        const ageGroup = Math.floor(age / 10) * 10;

        serviceInfo += `    • ${review.STAR_RATING}점\n`;
        serviceInfo += `      - 연령 : ${ageGroup}대\n`;
        serviceInfo += `      - 내용 : ${review.REVIEW_CONTENT}\n`;
        serviceInfo += `      - 최종 수정일 : ${review.UPDATED_AT}\n`;
      }

      serviceInfo += `  - 혜택: \n`;
      let benefitInfo = "";
      for (const benefit of service.benefits) {
        if (benefit.TYPE !== benefitInfo) {
          benefitInfo = benefit.TYPE;
          serviceInfo += `    • ${benefitInfo}\n`;
        }
        serviceInfo += `      - ${benefit.NAME}\n`;
      }
      serviceInfo += `\n`; // 요금제 간 구분을 위한 줄바꿈
    });

    for (const event of events) {
      serviceInfo += `• 이벤트 이름: ${event.TITLE}\n`;
      serviceInfo += `  - 이벤트 내용: ${event.CONTENT}\n`;
      serviceInfo += `  - 이벤트 특징: ${event.FEATURE}\n`;
      serviceInfo += `  - 이벤트 혜택: ${event.BENEFIT}\n`;
    }

    serviceInfo += "=== 서비스 정보 끝 ===\n\n";

    return serviceInfo;
  } catch (error) {
    logger.error("❌ 서비스 정보 로드 오류:", error);
    return "\n\n※ 현재 서비스 정보를 불러올 수 없습니다.\n\n";
  }
};

const loadPreviousChatToOpenAI = async (openaiWs, email, history = null) => {
  try {
    if (email) {
      const [userRows] = await db.query(
        `
                SELECT *, B.NAME AS PLAN_NAME
                FROM USER A
                JOIN PLAN_INFO B ON A.PHONE_PLAN = B.ID
                WHERE EMAIL = ?
                `,
        [email]
      );

      if (userRows.length > 0) {
        const user = userRows[0];

        // 🔥 서비스 정보도 함께 로드
        const serviceInfo = await loadServiceInfo();

        // 유저 정보 + 서비스 정보를 함께 전송
        openaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `사용자 정보: 이름 - ${user.NAME}, 이메일 - ${user.EMAIL}, 성별 - ${user.GENDER}, 생년월일 - ${user.BIRTHDAY}, 지금 사용 중인 요금제 - ${user.PLAN_NAME}

${serviceInfo}

위 사용자 정보와 서비스 정보를 참고하여 사용자에게 맞춤형 답변을 제공해주세요.`,
                },
              ],
            },
          })
        );
      } else {
        // 유저 정보가 없어도 서비스 정보는 제공
        const serviceInfo = await loadServiceInfo();

        openaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `게스트 사용자입니다.

${serviceInfo}

위 서비스 정보를 참고하여 답변을 제공해주세요.`,
                },
              ],
            },
          })
        );
      }
    } else {
      // 게스트 사용자에게도 서비스 정보 제공
      const serviceInfo = await loadServiceInfo();

      openaiWs.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `게스트 사용자입니다.

${serviceInfo}

위 서비스 정보를 참고하여 답변을 제공해주세요.`,
              },
            ],
          },
        })
      );
    }
  } catch (error) {
    logger.error("❌ 유저 정보 수집 오류:", error);
  }

  try {
    // 🔥 회원: DB에서 로드, 비회원: sessionStorage에서 온 history 사용
    const chatHistory = email ? await loadChatHistory(email) : history;

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach((msg) => {
        const isUser = msg.MESSAGE_TYPE === "user";
        const content = [];

        // 텍스트 메시지가 있는 경우
        if (msg.MESSAGE) {
          content.push({
            type: isUser ? "input_text" : "text",
            text: msg.MESSAGE,
            time: msg.CREATED_AT,
          });
        }

        // 오디오 데이터가 있는 경우
        if (msg.AUDIO_DATA) {
          content.push({
            type: isUser ? "input_audio" : "audio",
            audio: msg.AUDIO_DATA,
            time: msg.CREATED_AT,
          });
        }

        // 빈 content 방지
        if (content.length > 0) {
          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: isUser ? "user" : "assistant",
                content: content,
              },
            })
          );
        }
      });
    }
  } catch (error) {
    logger.error("❌ 이전 대화 로드 오류:", error);
  }
};

const setUpContext = async (email) => {
  const context = [];
  if (email) {
    try {
      const [userRows] = await db.query(
        `
                SELECT *
                FROM USER
                WHERE EMAIL = ?
            `,
        [email]
      );

      if (userRows.length > 0) {
        const user = userRows[0];
        context.push(`사용자 정보: ${user.NAME} (${user.EMAIL})`);
        if (user.GENDER) context.push(`성별: ${user.GENDER}`);
        if (user.BIRTHDAY) context.push(`생년월일: ${user.BIRTHDAY}`);
        if (user.PHONE_PLAN) context.push(`현재 요금제: ${user.PHONE_PLAN}`);
      }
    } catch (error) {
      logger.error("❌ 사용자 컨텍스트 구성 오류:", error);
    }
  }
  return context.join("\n");
};

const resetHistory = async (req, res) => {
  const { email } = req.body;
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    await conn.query("DELETE FROM CHAT_HISTORY WHERE EMAIL = ?", [email]);

    await conn.commit();
    conn.release();
    logger.info("✅ 채팅 히스토리 초기화 완료");
    return res.status(200).json({ message: "채팅 히스토리 초기화 완료" });
  } catch (error) {
    await conn.rollback();
    conn.release();
    logger.error("❌ 채팅 히스토리 초기화 오류:", error);
    return res.status(500).json({ message: "채팅 히스토리 초기화 실패" });
  }
};

module.exports = {
  saveChatHistory,
  loadChatHistory,
  loadPreviousChatToOpenAI,
  setUpContext,
  resetHistory,
};
