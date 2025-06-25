// 1)요즘제 리스트 조회(리뷰포함)
// 2)요금제 상세 정보 조회(리뷰포함)
// 3)요금제 필터링 조회
// 4)요금제 변경
// 5)연령대별 맞춤 요금제 조회

const db = require("./db");
const logger = require("./log");
const { effectiveness } = require("./verification");

//  1) 전체 요금제 리스트 조회
const getPlanList = async (req, res) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const [plans] = await conn.query(`
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
    logger.info(`전체 요금제 리스트 조회 성공`);
    return res.json({ success: true, data: plans });
  } catch (err) {
    await conn.rollback();
    conn.release();

    logger.error(err);

    return res.status(500).json({
      success: false,
      error: "요금제 리스트를 가져오는데 실패했습니다.",
    });
  }
};

//  2) 요금제 상세 정보 조회
const getPlanDetail = async (req, res) => {
  const { planId } = req.params;

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // 기본 정보 조회
    const [plans] = await conn.query(
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
    const plan = plans[0];
    if (!plan) {
      conn.release();

      logger.error(`${planId} 요금제를 찾지 못 했습니다.`);
      return res
        .status(404)
        .json({ success: false, error: "해당 요금제를 찾지 못 했습니다." });
    }

    // 혜택 목록 조회
    const [benefits] = await conn.query(
      `SELECT
         bi.BENEFIT_ID,
         bi.NAME,
         bi.TYPE
       FROM ChatBot.PLAN_BENEFIT pb
       JOIN ChatBot.BENEFIT_INFO bi
         ON pb.BENEFIT_ID = bi.BENEFIT_ID
       WHERE pb.PLAN_ID = ?
       ORDER BY pb.ID`,
      [planId]
    );

    // 리뷰 목록 조회
    const [reviews] = await conn.query(
      `SELECT
         REVIEW_ID,
         USER_ID,
         STAR_RATING,
         REVIEW_CONTENT,
         CREATED_AT,
         UPDATED_AT
       FROM ChatBot.PLAN_REVIEW
       WHERE PLAN_ID = ?
       ORDER BY CREATED_AT DESC`,
      [planId]
    );

    await conn.commit();
    conn.release();

    logger.info(`${planId} 요금제 상세 정보 조회 성공`);
    return res.json({ success: true, data: { plan, benefits, reviews }, message : "요금제 상세 정보 조회 성공" });

  } catch (err) {
    logger.error(err);

    await conn.rollback();
    conn.release();

    logger.error("요금제 상세 정보 조회 중 오류가 발생했습니다.");

    return res.status(500).json({
      success: false,
      error: "요금제 상세 정보 조회 중 오류가 발생했습니다.",
    });
  }
};

//  3) 요금제 필터링 조회
const filterPlans = async (req, res) => {
  const { ageGroup, minFee, maxFee, dataType, benefitIds } = req.body;
  const benefitIdArr = benefitIds
    ? benefitIds.split(",").map(Number).filter(Boolean)
    : [];
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    let sql = `
      SELECT
        p.ID               AS PLAN_ID,
        p.NAME             AS PLAN_NAME,
        p.MONTHLY_FEE,
        p.CALL_INFO,
        p.DATA_INFO,
        p.DATA_INFO_DETAIL,
        p.SHARE_DATA,
        p.AGE_GROUP
      FROM ChatBot.PLAN_INFO p
    `;
    const params = [];
    const whereClauses = [];
    /* ------------ ① 연령대 ------------ */
    if (ageGroup && ageGroup !== "전체대상" && ageGroup !== "상관없음") {
      whereClauses.push("p.AGE_GROUP = ?");
      params.push(ageGroup);
    }
    /* ------------ ② 요금 범위 ------------ */
    if (minFee != null) {
      whereClauses.push("p.MONTHLY_FEE >= ?");
      params.push(Number(minFee));
    }
    if (maxFee != null) {
      whereClauses.push("p.MONTHLY_FEE <= ?");
      params.push(Number(maxFee));
    }
    /* ------------ ③ 데이터 조건 ------------ */
    if (dataType && dataType !== "상관없어요") {
      if (dataType === "완전 무제한") {
        // DATA_INFO 가 정확히 "데이터 무제한"
        whereClauses.push("p.DATA_INFO = ?");
        params.push("데이터 무제한");
      } else if (dataType === "다쓰면 무제한") {
        // DATA_INFO_DETAIL 이 null 이 아니거나 '+' 로 시작
        whereClauses.push(
          "(p.DATA_INFO_DETAIL IS NOT NULL AND p.DATA_INFO_DETAIL <> '' AND p.DATA_INFO_DETAIL LIKE '+%')"
        );
        // LIKE 패턴 자체에 ? 를 쓰면 '%' 를 붙여야 하지만, 여기서는 상수라 파라미터가 없습니다.
      }
    }
    /* ------------ ④ 혜택 ------------ */
    if (benefitIdArr.length) {
      sql += ` JOIN ChatBot.PLAN_BENEFIT pb ON pb.PLAN_ID = p.ID `;
      const placeholders = benefitIdArr.map(() => "?").join(",");
      whereClauses.push(`pb.BENEFIT_ID IN (${placeholders})`);
      params.push(...benefitIdArr);
    }
    /* ------------ ⑤ WHERE & GROUP BY ------------ */
    if (whereClauses.length) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    if (benefitIdArr.length) {
      sql += " GROUP BY p.ID HAVING COUNT(DISTINCT pb.BENEFIT_ID) = ?";
      params.push(benefitIdArr.length);
    }
    /* ------------ ⑥ 실행 ------------ */
    const [plans] = await conn.query(sql, params);
    await conn.commit();
    conn.release();
    logger.info(`${plans.length}개의 요금제 필터링 조회 성공`);
    return res.json({
      success: true,
      data: plans,
      message: `${plans.length}개의 요금제 필터링 조회 성공`,
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    logger.error(err);
    return res.status(500).json({
      success: false,
      error: "요금제 필터링에 실패했습니다.",
    });
  }
};

//  4) 요금제 변경
const changeUserPlan = async (req, res) => {
  const { userId, newPlanId } = req.body;
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    // 현재 사용 중인 요금제 조회
    const [userRows] = await conn.query(
      `SELECT PHONE_PLAN FROM USER WHERE ID = ?`,
      [userId]
    );
    if (!userRows.length) {
      conn.release();
      logger.error(`${userId} 유저를 찾을 수 없습니다.`);
      return res
        .status(404)
        .json({ success: false, error: "유저를 찾을 수 없습니다." });
    }

    const [planRows] = await conn.query('SELECT * FROM PLAN_INFO WHERE ID = ?', [newPlanId]);
    if(planRows.length === 0){
      conn.release();
      logger.error("존재하지 않는 요금제입니다.");
      return res.status(404).json({success : false, error : "존재하지 않는 요금제입니다."});
    }

    const membership = planRows[0].MONTHLY_FEE >= 74800 ? `${planRows[0].MONTHLY_FEE >= 95000 ? "V" : ""}VIP` : "우수";

    const oldPlanId = userRows[0].PHONE_PLAN;

    // USER 테이블 업데이트
    await conn.query(`UPDATE USER SET PHONE_PLAN = ?, MEMBERSHIP = ? WHERE ID = ?`, [
      newPlanId,
      membership,
      userId,
    ]);

    // PLAN_INFO에서 기존 요금제 USER_COUNT 감소
    if (oldPlanId) {
      await conn.query(
        `UPDATE PLAN_INFO SET USER_COUNT = USER_COUNT - 1 WHERE ID = ? AND USER_COUNT > 0`,
        [oldPlanId]
      );
    }

    // PLAN_INFO에서 변경 요금제 USER_COUNT 증가
    await conn.query(
      `UPDATE PLAN_INFO SET USER_COUNT = USER_COUNT + 1 WHERE ID = ?`,
      [newPlanId]
    );

    await conn.commit();
    conn.release();

    logger.info(`${userId} 요금제 변경 성공`);
    return res.json({ success: true, message: "요금제 변경에 성공했습니다." });
  } catch (err) {
    await conn.rollback();
    conn.release();
    logger.error(err);
    return res
      .status(500)
      .json({ success: false, error: "요금제 변경이 실패했습니다." });
  }
};

// 5) 연령대별 맞춤 요금제 조회
const recommendPlansByAge = async (req, res) => {
  const { birthday } = req.body;

  if (!birthday) {
    logger.error("맞춤 요금제에 대한 비정상적인 접근입니다.");
    return res.status(400).json({
      success: false,
      error: "비정상적인 접근입니다.",
    });
  }

  if(effectiveness(undefined, undefined, birthday, undefined)){
    logger.error("생년월일 형식이 올바르지 않습니다.");
    return res.status(400).json({
      success: false,
      error: "생년월일 형식이 올바르지 않습니다.",
    });
  }

  const birthYear = new Date(birthday.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")).getFullYear();
  const thisYear = new Date().getFullYear();
  const age = thisYear - birthYear;
  let ageGroup = Math.floor(age / 10) * 10;
  if (ageGroup >= 70) ageGroup = 70;

  //연령대별 DATE 범위 구하기
  const startYear = thisYear - ageGroup - 9;
  const endYear = thisYear - ageGroup;

  const startDate = `${startYear}-01-01`;
  const endDate = `${endYear}-12-31`;

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    let sql = `
      SELECT
        pi.ID                        AS planId,
        pi.NAME                      AS name,
        pi.MONTHLY_FEE               AS monthlyFee,
        pi.DATA_INFO                 AS dataInfo,
        pi.SHARE_DATA                AS shareData,
        ROUND(AVG(pr.STAR_RATING),1) AS avgRating,
        COUNT(pr.REVIEW_ID)          AS reviewCount
      FROM ChatBot.PLAN_REVIEW pr
      JOIN ChatBot.USER       u  ON u.ID  = pr.USER_ID
      JOIN ChatBot.PLAN_INFO  pi ON pi.ID = pr.PLAN_ID
      WHERE
    `;

    const params = [];

    if (ageGroup === 70) {
      sql += ` u.BIRTHDAY <= ? `;
      params.push(endDate);
    } else {
      sql += ` u.BIRTHDAY BETWEEN ? AND ? `;
      params.push(startDate, endDate);
    }

    sql += `
      GROUP BY pi.ID, pi.NAME, pi.MONTHLY_FEE, pi.DATA_INFO, pi.SHARE_DATA
      ORDER BY avgRating DESC, reviewCount DESC
      LIMIT 5
    `;

    const [rows] = await conn.query(sql, params);

    await conn.commit();
    conn.release();
    logger.info(`${ageGroup} 연령대별 맞춤 요금제 조회 성공`);
    return res.json({ success: true, data: rows });
  } catch (err) {
    await conn.rollback();
    conn.release();
    logger.error(err);
    return res.status(500).json({
      success: false,
      error: "맞춤 요금제 찾기에 실패했습니다.",
    });
  }
};

module.exports = {
  getPlanList,
  getPlanDetail,
  filterPlans,
  changeUserPlan,
  recommendPlansByAge,
};
