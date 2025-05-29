const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();
const port = 3000;

// 啟用 CORS
app.use(cors());

// 提供靜態檔案
app.use(express.static('.'));

// 獲取字幕的 API 端點
app.get('/api/subtitles', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        if (!videoId) {
            return res.status(400).json({ error: '請提供影片 ID' });
        }

        console.log('開始獲取字幕，影片ID:', videoId);

        // 嘗試獲取字幕
        let transcript = null;
        
        try {
            console.log('嘗試獲取字幕...');
            transcript = await YoutubeTranscript.fetchTranscript(videoId);
            
            if (transcript && transcript.length > 0) {
                console.log(`成功獲取字幕，共 ${transcript.length} 條`);
                console.log('原始字幕格式範例:', JSON.stringify(transcript.slice(0, 2), null, 2));
            }
        } catch (e) {
            console.warn('無法獲取字幕:', e.message);
        }

        if (!transcript || transcript.length === 0) {
            console.log('沒有找到任何字幕');
            return res.status(404).json({ error: '找不到字幕' });
        }

        // 處理字幕時間 - youtube-transcript 標準格式: {start: number, dur: number, text: string}
        const processedSubtitles = transcript.map((item, index) => {
            console.log(`處理第 ${index} 個字幕項目:`, JSON.stringify(item, null, 2));
            
            let start = 0;
            
            // youtube-transcript 的標準格式
            if (typeof item.start === 'number') {
                start = item.start;
                console.log(`時間來自 item.start (數字):`, start);
            } else if (typeof item.start === 'string') {
                start = parseFloat(item.start);
                console.log(`時間來自 item.start (字串):`, start);
            } else if (typeof item.offset === 'number') {
                start = item.offset;
                console.log(`時間來自 item.offset:`, start);
            } else {
                console.warn('找不到時間資訊:', Object.keys(item));
                start = index * 3; // 假設每個字幕間隔3秒
            }

            // 確保時間是有效的數字
            if (isNaN(start) || start < 0) {
                console.warn('無效的時間值，使用索引計算:', item);
                start = index * 3; // 假設每個字幕間隔3秒
            }

            const result = {
                start: start,
                text: item.text
            };
            console.log('處理結果:', result);
            return result;
        });

        console.log('最終處理後字幕範例:', processedSubtitles.slice(0, 3));

        res.json({
            subtitles: processedSubtitles
        });
    } catch (error) {
        console.error('獲取字幕失敗:', error);
        res.status(500).json({ error: `獲取字幕失敗: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`伺服器運行在 http://localhost:${port}`);
}); 