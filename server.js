const express = require('express');
const cors = require('cors');
const { getSubtitles } = require('youtube-captions-scraper');

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

        // 嘗試獲取不同語言的字幕
        const languages = ['zh-TW', 'zh-HK', 'zh-CN', 'zh', 'en'];
        let subtitles = null;

        for (const lang of languages) {
            try {
                const captions = await getSubtitles({
                    videoID: videoId,
                    lang: lang
                });
                
                if (captions && captions.length > 0) {
                    subtitles = captions;
                    break;
                }
            } catch (e) {
                console.warn(`無法獲取 ${lang} 字幕:`, e);
            }
        }

        if (!subtitles || subtitles.length === 0) {
            return res.status(404).json({ error: '找不到字幕' });
        }

        res.json({
            subtitles: subtitles.map(item => ({
                start: item.start,
                text: item.text
            }))
        });
    } catch (error) {
        console.error('獲取字幕失敗:', error);
        res.status(500).json({ error: '獲取字幕失敗' });
    }
});

app.listen(port, () => {
    console.log(`伺服器運行在 http://localhost:${port}`);
}); 