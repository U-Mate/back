const { db } = require("./db");

const saveChatHistory = async (email, messageType, message, audioData = null, contextInfo = null) => {
    try {
        const [rows] = await db.query(`
            INSERT INTO CHAT_HISTORY (EMAIL, MESSAGE_TYPE, MESSAGE, AUDIO_DATA, CONTEXT_INFO) 
            VALUES (?, ?, ?, ?, ?)
        `, [email, messageType, message, audioData, contextInfo]);

        console.log("💾 채팅 히스토리 저장 완료");
        return true;
    } catch (error) {
        console.error("❌ 채팅 히스토리 저장 오류:", error);
        return false;
    }
}

const loadChatHistory = async (email) => {
    try {
        const [rows] = await db.query(`
            SELECT *
            FROM CHAT_HISTORY
            WHERE EMAIL = ?
            ORDER BY ID ASC
            LIMIT 20
        `, [email]);

        console.log(`📖 채팅 히스토리 로드 완료: ${email} (${rows.length}개 메시지)`);
        return rows;
    } catch (error) {
        console.error("❌ 채팅 히스토리 로드 오류:", error);
        return [];
    }
}

const loadPreviousChatToOpenAI = async (openaiWs, email, history = null) => {
    try {
        console.log(`유저 정보 수집 시작 : ${email}`);
        if(email){
            const [userRows] = await db.query(`
                SELECT *
                FROM USER
                WHERE EMAIL = ?
                `, [email]);
            
            if (userRows.length > 0) {
                const user = userRows[0];
                openaiWs.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: `사용자 정보: 이름 - ${user.NAME}, 이메일 - ${user.EMAIL}, 성별 - ${user.GENDER}, 생년월일 - ${user.BIRTHDAY}, 지금 사용 중인 요금제 - ${user.PHONE_PLAN}`
                            }
                        ]
                    },
                }));
        
                console.log(`유저 정보 수집 완료 : ${user.NAME} (${user.EMAIL})`);
            } else {
                console.log(`유저 정보 없음: ${email}`);
            }
        }else{
            console.log(`유저 정보 수집 완료 : 게스트`);
        }
    } catch (error) {
        console.error('❌ 유저 정보 수집 오류:', error);
    }
    
    try {
        console.log(`📚 이전 대화를 OpenAI conversation에 로드 시작: ${email}`);

        const chatHistory = email ? await loadChatHistory(email) : history;

        if(chatHistory && chatHistory.length > 0){
            console.log(`📖 ${chatHistory.length}개의 이전 메시지를 OpenAI에 추가`);
            chatHistory.forEach(msg => {
                const isUser = msg.MESSAGE_TYPE === 'user';
                const content = [];
                
                // 텍스트 메시지가 있는 경우
                if (msg.MESSAGE) {
                    content.push({
                        type: isUser ? 'input_text' : 'text',
                        text: msg.MESSAGE
                    });
                }
                
                // 오디오 데이터가 있는 경우
                if (msg.AUDIO_DATA) {
                    content.push({
                        type: isUser ? 'input_audio' : 'audio',
                        audio: msg.AUDIO_DATA
                    });
                }
                
                openaiWs.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: isUser ? 'user' : 'assistant',
                        content: content
                    }
                }));
            });
            console.log(`✅ 이전 대화 로드 완료: OpenAI가 이제 ${chatHistory.length}개 메시지의 컨텍스트를 기억함`);
        }else{
            console.log(`📝 새로운 세션: 로드할 이전 대화가 없음`);
        }
    } catch (error) {
        console.error('❌ 이전 대화 로드 오류:', error);
    }
}

const setUpContext = async (email) => {
    const context = [];
    if(email){
        try {
            const [userRows] = await db.query(`
                SELECT *
                FROM USER
                WHERE EMAIL = ?
            `, [email]);

            if (userRows.length > 0) {
                const user = userRows[0];
                context.push(`사용자 정보: ${user.NAME} (${user.EMAIL})`);
                if (user.GENDER) context.push(`성별: ${user.GENDER}`);
                if (user.BIRTHDAY) context.push(`생년월일: ${user.BIRTHDAY}`);
                if (user.PHONE_PLAN) context.push(`현재 요금제: ${user.PHONE_PLAN}`);
            }
        } catch (error) {
            console.error('❌ 사용자 컨텍스트 구성 오류:', error);
        }
    }
    return context.join('\n');
}

module.exports = {
    saveChatHistory,
    loadChatHistory,
    loadPreviousChatToOpenAI,
    setUpContext
};