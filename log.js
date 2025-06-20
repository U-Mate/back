require('dotenv').config();

const fs = require("fs");
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logDir = path.join(__dirname, 'logs');
// ensure log directory exists (async)
fs.promises.mkdir(logDir, { recursive: true })
  .catch(err => console.error(`Failed to create log directory ${logDir}`, err));

const transport = new DailyRotateFile({
    dirname : logDir,
    filename : '%DATE%.log',
    datePattern : 'YYYY-MM-DD',
    zippedArchive : false,
    maxSize : '20m',
    maxFiles : '14d'
});

const logger = winston.createLogger({
    level : 'info',
    format : winston.format.combine(
        winston.format.timestamp({ format : 'YYYY-MM-DD HH:mm:ss'}),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level} : ${message}`)
    ),

    transports : [
        transport,
        new winston.transports.Console()
    ]
});

module.exports = logger;