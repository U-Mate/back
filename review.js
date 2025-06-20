const db = require('./db');
const logger = require('./log');

// 내 리뷰 조회
const getMyReview = async (req, res) => {
    const { userId } = req.params;

    try {
        const [rows] = await db.query('SELECT * FROM PLAN_REVIEW WHERE USER_ID = ?', [userId]);

        return res.status(200).json({success : true, message : "내 리뷰 조회 성공", reviews : rows});
    } catch (error) {
        logger.error(error);
        return res.status(500).json({success : false, error : "리뷰 조회 중 오류가 발생했습니다."});
    }   
}

// 리뷰 작성
const createReview = async (req, res) => {
    const { userId, planId, rating, review } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // 1. 리뷰 평점 검증
        if(rating < 0 || rating > 5){
            await conn.rollback();
            conn.release();
            logger.error("리뷰 평점은 0~5 사이의 값이어야 합니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        // 2. 리뷰 내용 검증
        if(review.length < 10 || review.length > 100){
            await conn.rollback();
            conn.release();
            logger.error("리뷰 내용은 10~100자 사이의 값이어야 합니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }
        
        await conn.query('INSERT INTO PLAN_REVIEW(USER_ID, PLAN_ID, STAR_RATING, REVIEW_CONTENT) VALUES(?, ?, ?, ?)', [userId, planId, rating, review]);
        const [rows] = await conn.query('SELECT * FROM PLAN_INFO WHERE ID = ?', [planId]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            logger.error("존재하지 않는 플랜입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        await conn.query('UPDATE PLAN_INFO SET RECEIVED_STAR_COUNT = ?, REVIEW_USER_COUNT = ? WHERE ID = ?', [rows[0].RECEIVED_STAR_COUNT + rating, rows[0].REVIEW_USER_COUNT + 1, planId]);

        await conn.commit();
        conn.release();
        logger.info(`${userId} 리뷰 작성 성공`);
        return res.status(200).json({success : true, message : "리뷰 작성 성공"});
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "리뷰 작성 중 오류가 발생했습니다."});
    }
}

// 리뷰 수정
const updateReview = async (req, res) => {
    const { reviewId, rating, review } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [reviews] = await conn.query('SELECT * FROM PLAN_REVIEW WHERE REVIEW_ID = ?', [reviewId]);

        if(reviews.length === 0){
            await conn.rollback();
            conn.release();
            logger.error("존재하지 않는 리뷰입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        await conn.query('UPDATE PLAN_REVIEW SET STAR_RATING = ?, REVIEW_CONTENT = ? WHERE REVIEW_ID = ?', [rating, review, reviewId]);

        await conn.query('UPDATE PLAN_INFO SET RECEIVED_STAR_COUNT = ? WHERE ID = ?', [reviews[0].RECEIVED_STAR_COUNT - reviews[0].STAR_RATING + rating, reviews[0].PLAN_ID]);

        await conn.commit();
        conn.release();
        logger.info(`${reviewId} 리뷰 수정 성공`);
        return res.status(200).json({success : true, message : "리뷰 수정 성공"});
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "리뷰 수정 중 오류가 발생했습니다."});
    }
}

// 리뷰 삭제
const deleteReview = async (req, res) => {
    const { reviewId } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {

        const [reviews] = await conn.query('SELECT * FROM PLAN_REVIEW WHERE REVIEW_ID = ?', [reviewId]);

        if(reviews.length === 0){
            await conn.rollback();
            conn.release();
            logger.error("존재하지 않는 리뷰입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        await conn.query('DELETE FROM PLAN_REVIEW WHERE REVIEW_ID = ?', [reviewId]);

        const [rows] = await conn.query('SELECT * FROM PLAN_INFO WHERE ID = ?', [reviews[0].PLAN_ID]);

        if(rows.length === 0){
            await conn.rollback();
            conn.release();
            logger.error("존재하지 않는 리뷰입니다.");
            return res.status(404).json({success : false, error : "비정상적인 접근입니다."});
        }

        await conn.query('UPDATE PLAN_INFO SET RECEIVED_STAR_COUNT = ?, REVIEW_USER_COUNT = ? WHERE ID = ?', [rows[0].RECEIVED_STAR_COUNT - reviews[0].STAR_RATING, rows[0].REVIEW_USER_COUNT - 1, reviews[0].PLAN_ID]);

        await conn.commit();
        conn.release();
        logger.info(`${reviewId} 리뷰 삭제 성공`);
        return res.status(200).json({success : true, message : "리뷰 삭제 성공"});
    } catch (error) {
        await conn.rollback();
        conn.release();
        logger.error(error);
        return res.status(500).json({success : false, error : "리뷰 삭제 중 오류가 발생했습니다."});
    }
}

module.exports = {
    getMyReview,
    createReview,
    updateReview,
    deleteReview
};