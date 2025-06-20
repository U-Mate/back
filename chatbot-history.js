const { db } = require("./db");

const saveChatHistory = async (email, messageType, message, audioData = null, contextInfo = null) => {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        await conn.query(`
            INSERT INTO CHAT_HISTORY (EMAIL, MESSAGE_TYPE, MESSAGE, AUDIO_DATA, CONTEXT_INFO) 
            VALUES (?, ?, ?, ?, ?)
        `, [email, messageType, message, audioData, contextInfo]);

        await conn.commit();
        conn.release();
        console.log("💾 채팅 히스토리 저장 완료");
        return true;
    } catch (error) {
        await conn.rollback();
        conn.release();
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

const loadServiceInfo = async () => {
    try {
        // 모든 서비스 정보 로드
        const [plans] = await db.query("SELECT * FROM PLAN_INFO");

        // ✅ Promise.all()을 사용하여 모든 비동기 작업을 기다림
        const services = await Promise.all(
            plans.map(async (plan) => {
                const [benefits] = await db.query(`
                    SELECT c.*
                    from PLAN_INFO a
                    join PLAN_BENEFIT b on a.ID=b.PLAN_ID
                    join BENEFIT_INFO c on b.BENEFIT_ID=c.BENEFIT_ID
                    where a.ID=?
                `, [plan.ID]);

                return { ...plan, benefits };
            })
        );

        console.log(`✅ 모든 서비스 정보 로드 완료: ${services.length}개 요금제`);

        // 서비스 정보 텍스트 생성
        let serviceInfo = "\n\n=== UMate 서비스 정보 ===\n\n";
        
        // 서비스 정보
        serviceInfo += "📋 제공 서비스 목록:\n";
        
        services.forEach(service => {
            serviceInfo += `• 요금제 정보: ${service.NAME}\n`;
            serviceInfo += `  - 가격: ${service.MONTHLY_FEE}원\n`;
            serviceInfo += `  - 음성통화: ${service.CALL_INFO} ${service.CALL_INFO_DETAIL || ''}\n`;
            serviceInfo += `  - 문자메시지: ${service.SMS_INFO}\n`;
            serviceInfo += `  - 데이터: ${service.DATA_INFO} ${service.DATA_INFO_DETAIL || ''}\n`;
            if(service.SHARE_DATA){
                serviceInfo += `  - 공유 데이터: ${service.SHARE_DATA}\n`;
            }
            serviceInfo += `  - 이용 가능 연령: ${service.AGE_GROUP}\n`;
            serviceInfo += `  - 사용자 수: ${service.USER_COUNT}명\n`;
            
            // 평점 계산 (0으로 나누기 방지)
            const avgRating = service.REVIEW_USER_COUNT > 0 
                ? (service.RECEIVED_STAR_COUNT / service.REVIEW_USER_COUNT).toFixed(1)
                : '평점 없음';
            serviceInfo += `  - 리뷰 평점: ${avgRating}\n`;
            
            serviceInfo += `  - 혜택: \n`;
            let benefitInfo = "";
            for(const benefit of service.benefits){
                if(benefit.TYPE !== benefitInfo){
                    benefitInfo = benefit.TYPE;
                    serviceInfo += `    • ${benefitInfo}\n`;
                }
                serviceInfo += `      - ${benefit.NAME}\n`;
            }
            serviceInfo += `\n`; // 요금제 간 구분을 위한 줄바꿈
        });

        serviceInfo += "=== 서비스 정보 끝 ===\n\n";
        
        console.log(`📝 서비스 정보 텍스트 생성 완료: ${serviceInfo.length}자`);
        
        return serviceInfo;
        
    } catch (error) {
        console.error('❌ 서비스 정보 로드 오류:', error);
        return "\n\n※ 현재 서비스 정보를 불러올 수 없습니다.\n\n";
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
                
                // 🔥 서비스 정보도 함께 로드
                const serviceInfo = await loadServiceInfo();
                console.log(serviceInfo);
                
                // 유저 정보 + 서비스 정보를 함께 전송
                openaiWs.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: `사용자 정보: 이름 - ${user.NAME}, 이메일 - ${user.EMAIL}, 성별 - ${user.GENDER}, 생년월일 - ${user.BIRTHDAY}, 지금 사용 중인 요금제 - ${user.PHONE_PLAN}

${serviceInfo}

위 사용자 정보와 서비스 정보를 참고하여 사용자에게 맞춤형 답변을 제공해주세요.`
                            }
                        ]
                    },
                }));
        
                console.log(`✅ 유저 정보 + 서비스 정보 수집 완료 : ${user.NAME} (${user.EMAIL})`);
            } else {
                console.log(`유저 정보 없음: ${email}`);
                
                // 유저 정보가 없어도 서비스 정보는 제공
                const serviceInfo = await loadServiceInfo();
                console.log(serviceInfo);

                openaiWs.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: `게스트 사용자입니다.

${serviceInfo}

위 서비스 정보를 참고하여 답변을 제공해주세요.`
                            }
                        ]
                    },
                }));
                
                console.log(`✅ 게스트 사용자용 서비스 정보 제공 완료`);
            }
        }else{
            console.log(`유저 정보 수집 완료 : 게스트`);
            
            // 게스트 사용자에게도 서비스 정보 제공
            const serviceInfo = await loadServiceInfo();
            console.log(serviceInfo);

            openaiWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: `게스트 사용자입니다.

${serviceInfo}

위 서비스 정보를 참고하여 답변을 제공해주세요.`
                        }
                    ]
                },
            }));
            
            console.log(`✅ 게스트 사용자용 서비스 정보 제공 완료`);
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