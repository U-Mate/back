require('dotenv').config();
const fs = require("fs");
const express = require("express");
const expressWs = require('express-ws');
const WebSocket = require('ws');
const axios = require('axios');
const cookieParser = require('cookie-parser');

const app = express();
expressWs(app);

const cors = require("cors");
const { signUp, phoneNumberDuplicate, emailAuth, checkAuth } = require('./member');
const { realtime, connections } = require('./chatbot');

app.use(
    cors(
        {
            origin : [ process.env.LOCALHOST, process.env.MY_HOST ],
            credentials : true
        }
    )
);

app.use(express.json());


// 회원가입 관련 라우터
app.post('/signUp', async (req, res) => await signUp(req, res));
app.post('/duplicateCheck', async (req, res) => await phoneNumberDuplicate(req, res));
app.post('/email', async (req, res) => await emailAuth(req, res));
app.post('/checkAuth', async (req, res) => await checkAuth(req, res));

// chat bot 관련 라우터
app.ws('/realtime-chat', (clientWs, req) => {
    console.log('🔗 WebSocket 연결 요청 받음:', req.url);
    console.log('🔍 요청 헤더:', req.headers);
    realtime(clientWs, req);
  });

app.get('/realtime-chat/connections', (req, res) => connections(req, res));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});