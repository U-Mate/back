// 1)요즘제 리스트 조회(리뷰포함)
// 2)요금제 상세 정보 조회(리뷰포함)
// 3)요금제 필터링 조회
// 4)요금제 변경
// 5) 연령대별 추천 요금제 조회

const db = require("./db");

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
    return res.json({ success: true, data: plans });
  } catch (err) {
    console.error(err);
    await conn.rollback();
    conn.release();
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch plan list." });
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
      return res.status(404).json({ success: false, error: "Plan not found." });
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
    return res.json({ success: true, data: { plan, benefits, reviews } });
  } catch (err) {
    console.error(err);
    await conn.rollback();
    conn.release();
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch plan detail." });
  }
};

//  3) 요금제 필터링 조회

const filterPlans = async (req, res) => {
  const { ageGroup, minFee, maxFee, dataType, benefitIds } = req.body;
  const benefitIdArr = benefitIds
    ? benefitIds
        .split(",")
        .map((id) => Number(id))
        .filter(Boolean)
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
        p.SHARE_DATA,
        p.AGE_GROUP
      FROM ChatBot.PLAN_INFO p
    `;
    const params = [];
    const whereClauses = [];

    // 연령대 필터
    if (ageGroup && ageGroup !== "전체대상" && ageGroup !== "상관없음") {
      whereClauses.push("p.AGE_GROUP = ?");
      params.push(ageGroup);
    }
    // 요금 범위 필터
    if (minFee != null) {
      whereClauses.push("p.MONTHLY_FEE >= ?");
      params.push(Number(minFee));
    }
    if (maxFee != null) {
      whereClauses.push("p.MONTHLY_FEE <= ?");
      params.push(Number(maxFee));
    }
    // 데이터 조건 필터
    if (dataType && dataType !== "상관없음") {
      whereClauses.push("p.DATA_INFO = ?");
      params.push(dataType);
    }
    // 혜택 필터
    if (benefitIdArr.length) {
      sql += ` JOIN ChatBot.PLAN_BENEFIT pb ON pb.PLAN_ID = p.ID `;
      const placeholders = benefitIdArr.map(() => "?").join(",");
      whereClauses.push(`pb.BENEFIT_ID IN (${placeholders})`);
      params.push(...benefitIdArr);
    }

    if (whereClauses.length) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }

    // 선택된 모든 혜택을 포함할 것
    if (benefitIdArr.length) {
      sql += " GROUP BY p.ID HAVING COUNT(DISTINCT pb.BENEFIT_ID) = ?";
      params.push(benefitIdArr.length);
    }

    const [plans] = await conn.query(sql, params);
    await conn.commit();
    conn.release();
    return res.json({ success: true, data: plans });
  } catch (err) {
    console.error(err);
    await conn.rollback();
    conn.release();
    return res
      .status(500)
      .json({ success: false, error: "Failed to filter plans." });
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
      return res.status(404).json({ success: false, error: "User not found." });
    }
    const oldPlanId = userRows[0].PHONE_PLAN;

    // USER 테이블 업데이트
    await conn.query(`UPDATE USER SET PHONE_PLAN = ? WHERE ID = ?`, [
      newPlanId,
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
    return res.json({ success: true, message: "Plan changed successfully." });
  } catch (err) {
    console.error(err);
    await conn.rollback();
    conn.release();
    return res
      .status(500)
      .json({ success: false, error: "Failed to change plan." });
  }
};

//  5) 연령대별 추천 요금제 조회

const recommendPlansByAge = async (req, res) => {
  const { userId, birthday } = req.body;
  if (!userId || !birthday) {
    return res
      .status(400)
      .json({ success: false, error: "userId와 birthday를 모두 보내주세요." });
  }

  // 1) 나이 계산 (만 나이)
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  // 2) 앞자리(10의 자리) 구하기 (70 이상은 70대)
  let decade = Math.floor(age / 10) * 10;
  if (decade >= 70) decade = 70;

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // 3) 연령대에 속한 사용자들의 리뷰로 집계: 평균 별점 내림차순 상위 5개
    let sql = `
      SELECT
        pr.PLAN_ID,
        ROUND(AVG(pr.STAR_RATING), 1)          AS avg_rating,
        COUNT(pr.REVIEW_ID)                    AS review_count
      FROM ChatBot.PLAN_REVIEW pr
      JOIN ChatBot.USER              u  ON pr.USER_ID = u.ID
      WHERE
    `;
    const params = [];

    if (decade === 70) {
      sql += ` TIMESTAMPDIFF(YEAR, u.BIRTHDAY, CURDATE()) >= ? `;
      params.push(70);
    } else {
      sql += ` TIMESTAMPDIFF(YEAR, u.BIRTHDAY, CURDATE()) BETWEEN ? AND ? `;
      params.push(decade, decade + 9);
    }

    sql += `
      GROUP BY pr.PLAN_ID
      ORDER BY avg_rating DESC, review_count DESC
      LIMIT 5
    `;

    const [rows] = await conn.query(sql, params);

    await conn.commit();
    conn.release();
    const planIds = rows.map((r) => r.PLAN_ID);
    return res.json({ success: true, data: planIds });
  } catch (err) {
    console.error(err);
    await conn.rollback();
    conn.release();
    return res
      .status(500)
      .json({ success: false, error: "Failed to recommend plans." });
  }
};

module.exports = {
  getPlanList,
  getPlanDetail,
  filterPlans,
  changeUserPlan,
  recommendPlansByAge,
};
