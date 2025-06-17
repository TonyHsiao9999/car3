const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();

// 檢查必要的環境變數
if (!process.env.CAR_BOOKING_ID || !process.env.CAR_BOOKING_PASSWORD) {
    console.error('錯誤：缺少必要的環境變數 CAR_BOOKING_ID 或 CAR_BOOKING_PASSWORD');
    process.exit(1);
}

// 將環境變數轉換為字串
const ID_NUMBER = String(process.env.CAR_BOOKING_ID);
const PASSWORD = String(process.env.CAR_BOOKING_PASSWORD);

// 設定重試次數和延遲
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

// 設定排程任務
console.log('設定排程任務...');
cron.schedule('0 0 * * 1,4', async () => {
    console.log('開始執行預約任務...');
    try {
        await bookCar();
    } catch (error) {
        console.error('排程任務執行失敗：', error);
    }
});

// 如果直接執行腳本，立即執行一次
if (require.main === module) {
    console.log('立即執行預約任務...');
    bookCar().catch(error => {
        console.error('立即執行失敗：', error);
        process.exit(1);
    });
}

async function retry(fn, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`操作失敗，${RETRY_DELAY/1000}秒後重試... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
}

async function bookCar() {
    console.log('開始執行預約流程...');
    console.log('使用帳號：', ID_NUMBER);
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        ignoreHTTPSErrors: true,
        timeout: 60000
    });

    try {
        const page = await browser.newPage();
        
        // 設定頁面超時
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);

        // 設定視窗大小
        await page.setViewport({
            width: 1920,
            height: 1080
        });

        // 監聽頁面錯誤
        page.on('error', err => {
            console.error('頁面錯誤：', err);
        });

        page.on('pageerror', err => {
            console.error('頁面錯誤：', err);
        });

        // 監聽請求失敗
        page.on('requestfailed', request => {
            console.error('請求失敗：', request.url(), request.failure().errorText);
        });

        // 監聽控制台訊息
        page.on('console', msg => {
            console.log('頁面訊息:', msg.text());
        });

        console.log('正在開啟網頁...');
        await retry(async () => {
            await page.goto('https://www.ntpc.ltc-car.org/', {
                waitUntil: 'networkidle0',
                timeout: 60000
            });
        });

        // 等待頁面載入完成
        console.log('等待頁面載入完成...');
        await page.waitForTimeout(5000);

        // 點擊「我知道了」按鈕
        console.log('嘗試點擊「我知道了」按鈕...');
        try {
            await retry(async () => {
                const button = await page.waitForSelector('a.button-fill:nth-child(2)', { 
                    timeout: 5000,
                    visible: true 
                });
                
                if (button) {
                    await button.click();
                    console.log('已點擊「我知道了」按鈕！');
                }
            });
        } catch (error) {
            console.log('找不到「我知道了」按鈕，繼續執行...');
        }

        // 等待頁面載入完成
        console.log('等待頁面載入完成...');
        await page.waitForTimeout(5000);

        // 輸入身分證字號
        console.log('輸入身分證字號...');
        await retry(async () => {
            const idInput = await page.waitForSelector('#IDNumber', { 
                timeout: 60000,
                visible: true 
            });
            
            if (idInput) {
                await idInput.type(ID_NUMBER, { delay: 100 });
                console.log('已輸入身分證字號');
            } else {
                throw new Error('找不到身分證字號輸入框');
            }
        });

        // 輸入密碼
        console.log('輸入密碼...');
        await retry(async () => {
            const passwordInput = await page.waitForSelector('#password', { 
                timeout: 60000,
                visible: true 
            });
            
            if (passwordInput) {
                await passwordInput.type(PASSWORD, { delay: 100 });
                console.log('已輸入密碼');
            } else {
                throw new Error('找不到密碼輸入框');
            }
        });

        // 點擊登入按鈕
        console.log('點擊登入按鈕...');
        await retry(async () => {
            const loginButton = await page.waitForSelector('a.link:nth-child(2)', { 
                timeout: 60000,
                visible: true 
            });
            
            if (loginButton) {
                await loginButton.click();
                console.log('已點擊登入按鈕');
            } else {
                throw new Error('找不到登入按鈕');
            }
        });

        // 等待登入成功
        console.log('等待登入成功...');
        await page.waitForTimeout(5000);

        // 點擊確認按鈕（如果存在）
        try {
            await retry(async () => {
                const confirmButton = await page.waitForSelector('a.button-fill:nth-child(2)', { timeout: 5000 });
                if (confirmButton) {
                    await confirmButton.click();
                    console.log('已點擊確認按鈕！');
                }
            });
        } catch (error) {
            console.log('找不到確認按鈕，繼續執行...');
        }

        // 等待頁面載入完成
        await page.waitForTimeout(5000);

        // 點擊預約連結
        console.log('點擊預約連結...');
        await retry(async () => {
            const bookingLink = await page.waitForSelector('a[href*="booking"]', { timeout: 60000 });
            if (bookingLink) {
                await bookingLink.click();
                console.log('已點擊預約連結！');
            } else {
                throw new Error('找不到預約連結');
            }
        });

        // 等待預約頁面載入
        console.log('等待預約頁面載入...');
        await page.waitForTimeout(5000);

        // 選擇上車地點
        console.log('選擇上車地點...');
        await retry(async () => {
            const locationSelect = await page.waitForSelector('#pickUp_location', { timeout: 60000 });
            if (locationSelect) {
                await locationSelect.select('2'); // 選擇第二個選項
                console.log('已選擇上車地點');
            } else {
                throw new Error('找不到上車地點選擇器');
            }
        });

        // 輸入地址
        console.log('輸入地址...');
        await retry(async () => {
            const addressInput = await page.waitForSelector('#pickUp_address', { timeout: 60000 });
            if (addressInput) {
                await addressInput.type('亞東紀念醫院', { delay: 100 });
                console.log('已輸入地址');
            } else {
                throw new Error('找不到地址輸入框');
            }
        });

        // 等待 Google 自動完成框
        console.log('等待 Google 自動完成框出現...');
        try {
            await page.waitForSelector('.pac-container', { timeout: 5000 });
            console.log('找到 Google 自動完成框！');
            
            // 選擇第一個建議
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
        } catch (error) {
            console.log('未找到 Google 自動完成框，繼續執行...');
        }

        // 選擇時間
        console.log('選擇時間...');
        await retry(async () => {
            const timeSelect = await page.waitForSelector('#pickUp_time', { timeout: 60000 });
            if (timeSelect) {
                await timeSelect.select('14:00'); // 選擇下午 2 點
                console.log('已選擇時間');
            } else {
                throw new Error('找不到時間選擇器');
            }
        });

        // 點擊確認按鈕
        console.log('點擊確認按鈕...');
        await retry(async () => {
            const confirmButton = await page.waitForSelector('a.button-fill:nth-child(2)', { timeout: 60000 });
            if (confirmButton) {
                await confirmButton.click();
                console.log('已點擊確認按鈕');
            } else {
                throw new Error('找不到確認按鈕');
            }
        });

        // 等待預約成功訊息
        await retry(async () => {
            await page.waitForSelector('.success-message', { timeout: 60000 });
        });

        console.log('預約成功！');

    } catch (error) {
        console.error('預約過程發生錯誤：', error);
        throw error;
    } finally {
        await browser.close();
    }
} 