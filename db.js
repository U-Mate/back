const mariaDB = require("mysql2/promise");

const db = mariaDB.createPool({
    host : process.env.DB_HOST,
    port : process.env.DB_PORT,
    user : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_SCHEMA
});

// 환경변수 로드가 안 됐을 수 있으니 dotenv를 명시적으로 불러옵니다.
require('dotenv').config();

const host = process.env.DB_HOST;
const port = process.env.DB_PORT;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_SCHEMA;

console.log(host, port, user, password, database);

module.exports = { db };