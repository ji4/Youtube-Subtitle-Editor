import express from 'express';
import cors from 'cors';
import { YoutubeTranscript } from 'youtube-transcript';
import getPort from 'get-port';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const DEFAULT_PORT = 3000;

// ANSI 轉義序列顏色代碼
const colors = {
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    underline: '\x1b[4m',
    reset: '\x1b[0m'
};

// 創建可點擊的連結
function createClickableLink(url) {
    // OSC 8 格式：ESC ] 8 ; ; URL ST text ESC \ 
    return `\x1b]8;;${url}\x07${url}\x1b]8;;\x07`;
}

// 啟用 CORS
app.use(cors());

// 提供靜態檔案
app.use(express.static('.'));

// 根路徑處理
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'youtube_subtitle_editor.html'));
});

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

        // 處理字幕時間 - youtube-transcript 可能回傳 offset/duration (毫秒) 或 start/dur (秒)
        const processedSubtitles = transcript.map((item, index) => {
            console.log(`處理第 ${index} 個字幕項目:`, JSON.stringify(item, null, 2));
            
            let start = 0;
            let duration = null;
            
            // youtube-transcript 新版格式：offset/duration 是毫秒
            if (typeof item.offset === 'number') {
                start = item.offset / 1000;
                console.log(`時間來自 item.offset (毫秒):`, item.offset, '=>', start);
            } else if (typeof item.offset === 'string') {
                start = parseFloat(item.offset) / 1000;
                console.log(`時間來自 item.offset (字串毫秒):`, item.offset, '=>', start);
            // 舊版或其他來源可能已經是秒
            } else if (typeof item.start === 'number') {
                start = item.start;
                console.log(`時間來自 item.start (秒):`, start);
            } else if (typeof item.start === 'string') {
                start = parseFloat(item.start);
                console.log(`時間來自 item.start (字串秒):`, start);
            } else {
                console.warn('找不到時間資訊:', Object.keys(item));
                start = index * 3;
            }

            if (typeof item.duration === 'number') {
                duration = item.offset !== undefined ? item.duration / 1000 : item.duration;
            } else if (typeof item.duration === 'string') {
                duration = parseFloat(item.duration);
                if (item.offset !== undefined) duration = duration / 1000;
            } else if (typeof item.dur === 'number') {
                duration = item.dur;
            } else if (typeof item.dur === 'string') {
                duration = parseFloat(item.dur);
            }

            if (typeof item.start === 'number') {
                duration = duration ?? item.dur ?? null;
            }

            // 確保時間是有效的數字
            if (isNaN(start) || start < 0) {
                console.warn('無效的時間值，使用索引計算:', item);
                start = index * 3; // 假設每個字幕間隔3秒
            }
            if (duration !== null && (isNaN(duration) || duration < 0)) {
                duration = null;
            }

            const result = {
                start: start,
                duration,
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

// 代理字幕 URL（繞過 CORS，用於播放器 API 取得的預簽名字幕 URL）
app.get('/api/proxy-captions', async (req, res) => {
    try {
        const captionUrl = req.query.url;
        if (!captionUrl) return res.status(400).json({ error: 'URL 必填' });

        let urlObj;
        try { urlObj = new URL(captionUrl); } catch { return res.status(400).json({ error: '無效的 URL' }); }

        const allowed = ['youtube.com', 'googlevideo.com', 'googleusercontent.com'];
        if (!allowed.some(d => urlObj.hostname.endsWith(d))) {
            return res.status(400).json({ error: '只允許 YouTube URL' });
        }

        console.log('[proxy-captions] 抓取 URL:', captionUrl.slice(0, 120));
        const response = await fetch(captionUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        });
        const text = await response.text();
        console.log('[proxy-captions] 回應長度:', text.length, '| HTTP:', response.status);
        res.set('Content-Type', response.headers.get('content-type') || 'application/json');
        res.send(text);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 自動尋找可用端口並啟動服務器
async function startServer() {
    try {
        const port = await getPort({port: DEFAULT_PORT});
        const url = `http://localhost:${port}`;
        
        app.listen(port, () => {
            console.clear(); // 清除終端機
            console.log(`\n${colors.green}✓ 伺服器已成功啟動！${colors.reset}\n`);
            
            // 使用下劃線和顏色來突出顯示 URL
            console.log(`${colors.blue}在瀏覽器中打開以下網址：${colors.reset}`);
            console.log(`${colors.cyan}${colors.underline}${url}${colors.reset}\n`);
            
            if (port !== DEFAULT_PORT) {
                console.log(`${colors.yellow}注意：由於端口 ${DEFAULT_PORT} 已被占用，改用端口 ${port}${colors.reset}\n`);
            }

            // 添加 Command+點擊 提示
            console.log(`💡 提示：在終端機中使用 ${colors.underline}Command + 雙擊${colors.reset} 可快速選取網址\n`);
        });
    } catch (error) {
        console.error('啟動服務器失敗:', error);
        process.exit(1);
    }
}

startServer();
