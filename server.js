require('dotenv').config();
const fs = require("fs");
const https = require("https");
const express = require("express");
const expressWs = require('express-ws');
const cookieParser = require('cookie-parser');

const app = express();
const cors = require("cors");

const { signUp, phoneNumberDuplicate, emailAuth, checkAuth, getUserInfo, tokenCheck, logout, login, withDrawal, passwordChange, passwordReset, passwordCheck, phoneNumberCheck, authenticateToken } = require('./member');
const { realtime, connections } = require('./chatbot');
const { getMyReview, createReview, updateReview, deleteReview } = require('./review');
const { getPlanList, getPlanDetail, filterPlans, changeUserPlan, recommendPlansByAge } = require('./plan');
const logger = require('./log');

app.use(express.json());
app.use(cookieParser());

app.use(
    cors(
        {
            origin : [ process.env.LOCALHOST, process.env.MY_HOST ],
            credentials : true
        }
    )
);

const options = {
    key : fs.readFileSync(process.env.HTTPS_KEY),
    cert : fs.readFileSync(process.env.HTTPS_CERT),
    ca : fs.readFileSync(process.env.HTTPS_CA),
};

// HTTPS 서버 생성
const server = https.createServer(options, app);

// WebSocket을 HTTPS 서버에 연결
expressWs(app, server);

// chat bot
app.ws('/realtime-chat', (clientWs, req) => realtime(clientWs, req));

app.get('/realtime-chat/connections', (req, res) => connections(req, res));

/**
 * 유저 관련
 */

// 회원가입
app.post('/signUp', async (req, res) => await signUp(req, res));

// 휴대폰 중복확인
app.post('/duplicateCheck', async (req, res) => await phoneNumberDuplicate(req, res));

// 이메일 인증
app.post('/email', async (req, res) => await emailAuth(req, res));

// 이메일 인증 확인
app.post('/checkAuth', async (req, res) => await checkAuth(req, res));

// 비밀번호 변경
app.post('/passwordChange', async (req, res) => await passwordChange(req, res));

// 비밀번호 초기화
app.post('/passwordReset', async (req, res) => await passwordReset(req, res));

// 비밀번호 확인
app.post('/passwordCheck', async (req, res) => await passwordCheck(req, res));

// 휴대폰 번호 확인
app.post('/phoneNumberCheck', async (req, res) => await phoneNumberCheck(req, res));

// 회원탈퇴
app.post('/withDrawal', async (req, res) => await withDrawal(req, res));

// 로그인
app.post('/login', async (req, res) => await login(req, res));

// 로그아웃
app.post('/logout', async (req, res) => await logout(req, res));

// 토큰 체크(검증 및 갱신)
app.get('/tokenCheck', authenticateToken, async (req, res) => await tokenCheck(req, res));

// 유저 정보 조회
app.post('/userInfo', async (req, res) => await getUserInfo(req, res));


/**
 * 리뷰 관련
 */

// 내 리뷰 조회
app.get('/myReview/:userId', async (req, res) => await getMyReview(req, res));

// 리뷰 작성
app.post('/createReview', async (req, res) => await createReview(req, res));

// 리뷰 수정
app.post('/updateReview', async (req, res) => await updateReview(req, res));

// 리뷰 삭제
app.post('/deleteReview', async (req, res) => await deleteReview(req, res));


/*
 * 요금제 관련
 * 
 */

// 전체 요금제 조회
app.get('/planList', async (req, res) => await getPlanList(req, res));

// 요금제 상세 정보 조회
app.get('/planDetail/:planId', async (req, res) => await getPlanDetail(req, res));

// 요금제 필터링 조회
app.post('/filterPlans', async (req, res) => await filterPlans(req, res));

// 요금제 변경
app.post('/changeUserPlan', async (req, res) => await changeUserPlan(req, res));

// 요금제 추천
app.post('/recommendPlansByAge', async (req, res) => await recommendPlansByAge(req, res));

server.listen(process.env.PORT, () => logger.info("서버가 연결되었습니다."));