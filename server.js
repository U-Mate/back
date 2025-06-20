require('dotenv').config();
const fs = require("fs");
const express = require("express");
const axios = require('axios');
const cookieParser = require('cookie-parser');

const app = express();

const cors = require("cors");
const { signUp, phoneNumberDuplicate, emailAuth, checkAuth } = require('./member');

app.use(
    cors(
        {
            origin : [ process.env.LOCALHOST, process.env.MY_HOST ],
            credentials : true
        }
    )
);

app.post('/signUp', async (req, res) => await signUp(req, res));
app.post('/duplicateCheck', async (req, res) => await phoneNumberDuplicate(req, res));
app.post('/email', async (req, res) => await emailAuth(req, res));
app.post('/checkAuth', async (req, res) => await checkAuth(req, res));