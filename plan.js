//요즘제 리스트 조회(리뷰포함)
//요금제 상세 정보 조회(리뷰포함)
//요금제 필터링 조회

const db = require("./db");

// 1) 전체 요금제 리스트 조회

const 요금제리스트 = async (req, res) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const [rows] = await conn.query(`
      SELECT
        p.ID               AS PLAN_ID,
        p.NAME             AS PLAN_NAME,
        p.MONTHLY_FEE,
        p.CALL_INFO,
        p.CALL_INFO_DETAIL,
        p.SMS_INFO,
        p.DATA_INFO,
        p.DATA_INFO_DETAIL,
        p.SHARE_DATA,
        p.AGE_GROUP,
        p.USER_COUNT,
        p.RECEIVED_STAR_COUNT,
        p.REVIEW_USER_COUNT
      FROM ChatBot.PLAN_INFO p
      ORDER BY p.ID
    `);

    await conn.commit();
    conn.release();
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    await conn.rollback();
    conn.release();
    return res
      .status(500)
      .json({ success: false, error: "요금제 리스트 조회에 실패했습니다." });
  }
};

//  2) 요금제 상세 정보 조회

const 요금제상세조회 = async (req, res) => {
  const { planId } = req.params;
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // 기본 정보 조회
    const [[plan]] = await conn.query(
      `SELECT
         p.ID               AS PLAN_ID,
         p.NAME             AS PLAN_NAME,
         p.MONTHLY_FEE,
         p.CALL_INFO,
         p.CALL_INFO_DETAIL,
         p.SMS_INFO,
         p.DATA_INFO,
         p.DATA_INFO_DETAIL,
         p.SHARE_DATA,
         p.AGE_GROUP,
         p.USER_COUNT,
         p.RECEIVED_STAR_COUNT,
         p.REVIEW_USER_COUNT
       FROM ChatBot.PLAN_INFO p
       WHERE p.ID = ?`,
      [planId]
    );
    if (!plan) {
      conn.release();
      return res
        .status(404)
        .json({ success: false, error: "존재하지 않는 요금제입니다." });
    }

    // 혜택 목록 조회
    const [benefits] = await conn.query(
      `
      SELECT
        bi.BENEFIT_ID,
        bi.NAME,
        bi.TYPE
      FROM ChatBot.PLAN_BENEFIT pb
      JOIN ChatBot.BENEFIT_INFO bi
        ON pb.BENEFIT_ID = bi.BENEFIT_ID
      WHERE pb.PLAN_ID = ?
      ORDER BY pb.ID
    `,
      [planId]
    );

    // 리뷰 목록 조회
    const [reviews] = await conn.query(
      `
      SELECT
        REVIEW_ID,
        USER_ID,
        STAR_RATING,
        REVIEW_CONTENT,
        CREATED_AT
      FROM ChatBot.PLAN_REVIEW
      WHERE PLAN_ID = ?
      ORDER BY CREATED_AT DESC
    `,
      [planId]
    );

    await conn.commit();
    conn.release();
    return res.json({ success: true, data: { plan, benefits, reviews } });
  } catch (err) {
    console.error(err);
    await conn.rollback();
    conn.release();
    return res
      .status(500)
      .json({ success: false, error: "요금제 상세 조회에 실패했습니다." });
  }
};

module.exports = {
  요금제리스트,
  요금제상세조회,
};
