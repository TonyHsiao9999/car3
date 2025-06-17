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
            '--window-size=1920x1080',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--no-first-run',
            '--no-default-browser-check',
            '--no-experiments',
            '--no-pings',
            '--no-zygote',
            '--single-process'
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

        // 設定使用者代理
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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

        // 模擬地理位置
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'geolocation', {
                get: () => ({
                    getCurrentPosition: (success) => {
                        success({
                            coords: {
                                latitude: 25.0330,
                                longitude: 121.5654,
                                accuracy: 100,
                                altitude: null,
                                altitudeAccuracy: null,
                                heading: null,
                                speed: null
                            },
                            timestamp: Date.now()
                        });
                    },
                    watchPosition: () => {},
                    clearWatch: () => {}
                })
            });
        });

        console.log('正在開啟網頁...');
        await retry(async () => {
            await page.goto('https://www.taiwantaxi.com.tw/memberLogin.aspx', {
                waitUntil: 'networkidle0',
                timeout: 60000
            });
        });

        // 等待頁面完全載入
        console.log('等待頁面載入完成...');
        await page.waitForTimeout(5000);

        // 嘗試點擊「我知道了」按鈕
        console.log('嘗試點擊「我知道了」按鈕...');
        try {
            await retry(async () => {
                const button = await page.waitForSelector('button.btn-primary', { timeout: 5000 });
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
            await page.waitForSelector('input[name="ctl00$ContentPlaceHolder1$txtID"]', { timeout: 60000 });
            await page.type('input[name="ctl00$ContentPlaceHolder1$txtID"]', ID_NUMBER, { delay: 100 });
        });

        // 輸入密碼
        console.log('輸入密碼...');
        await retry(async () => {
            await page.waitForSelector('input[name="ctl00$ContentPlaceHolder1$txtPassword"]', { timeout: 60000 });
            await page.type('input[name="ctl00$ContentPlaceHolder1$txtPassword"]', PASSWORD, { delay: 100 });
        });

        // 點擊登入按鈕
        console.log('點擊登入按鈕...');
        await retry(async () => {
            await page.waitForSelector('input[name="ctl00$ContentPlaceHolder1$btnLogin"]', { timeout: 60000 });
            await page.click('input[name="ctl00$ContentPlaceHolder1$btnLogin"]');
        });

        // 等待登入成功
        console.log('等待登入成功...');
        await page.waitForTimeout(5000);

        // 檢查是否有錯誤訊息
        const errorMessage = await page.evaluate(() => {
            const errorElement = document.querySelector('.alert-danger');
            return errorElement ? errorElement.textContent : null;
        });

        if (errorMessage) {
            throw new Error(`登入失敗：${errorMessage}`);
        }

        // 點擊成功確認按鈕（如果存在）
        try {
            await retry(async () => {
                const confirmButton = await page.waitForSelector('input[name="ctl00$ContentPlaceHolder1$btnConfirm"]', { timeout: 5000 });
                if (confirmButton) {
                    await confirmButton.click();
                    console.log('已點擊成功確認按鈕！');
                }
            });
        } catch (error) {
            console.log('找不到成功確認按鈕，繼續執行...');
        }

        // 等待頁面載入完成
        await page.waitForTimeout(5000);

        // 點擊預約連結
        console.log('點擊預約連結...');
        await retry(async () => {
            await page.waitForSelector('a[href*="booking"]', { timeout: 60000 });
            await page.click('a[href*="booking"]');
        });
        console.log('已點擊預約連結！');
        
        // 等待預約頁面載入
        console.log('等待預約頁面載入...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 選擇上車地點
        console.log('等待上車地點選擇器...');
        await retry(async () => {
            await page.waitForSelector('select[name="ctl00$ContentPlaceHolder1$ddlPickupLocation"]', { timeout: 60000 });
        });
        console.log('找到上車地點選擇器！');
        
        // 選擇上車地點
        await retry(async () => {
            await page.evaluate(() => {
                const select = document.querySelector('select[name="ctl00$ContentPlaceHolder1$ddlPickupLocation"]');
                if (select) {
                    select.value = '2';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
        console.log('選擇的上車地點值：', await page.evaluate(() => {
            const select = document.querySelector('select[name="ctl00$ContentPlaceHolder1$ddlPickupLocation"]');
            return select ? select.value : '未找到選擇器';
        }));
        
        // 等待地址輸入框
        console.log('等待地址輸入框出現...');
        await retry(async () => {
            await page.waitForSelector('input[name="ctl00$ContentPlaceHolder1$txtPickupAddress"]', { timeout: 60000 });
        });
        console.log('找到地址輸入框！');
        
        // 輸入地址
        await retry(async () => {
            await page.evaluate(() => {
                const input = document.querySelector('input[name="ctl00$ContentPlaceHolder1$txtPickupAddress"]');
                if (input) {
                    input.value = '亞東紀念醫院';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
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
        
        // 等待日期選擇器
        console.log('等待日期選擇器...');
        await retry(async () => {
            await page.waitForSelector('input[name="ctl00$ContentPlaceHolder1$txtPickupDate"]', { timeout: 60000 });
        });
        console.log('找到日期選擇器！');
        
        // 等待時間選擇器
        console.log('等待時間選擇器...');
        await retry(async () => {
            await page.waitForSelector('select[name="ctl00$ContentPlaceHolder1$ddlPickupTime"]', { timeout: 60000 });
        });
        console.log('找到時間選擇器！');
        
        // 選擇時間
        await retry(async () => {
            await page.evaluate(() => {
                const select = document.querySelector('select[name="ctl00$ContentPlaceHolder1$ddlPickupTime"]');
                if (select) {
                    select.value = '14:00';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
        
        // 點擊確認按鈕
        await retry(async () => {
            await page.waitForSelector('input[name="ctl00$ContentPlaceHolder1$btnConfirm"]', { timeout: 60000 });
            await page.evaluate(() => {
                const button = document.querySelector('input[name="ctl00$ContentPlaceHolder1$btnConfirm"]');
                if (button) {
                    button.click();
                }
            });
        });
        
        // 等待預約成功訊息
        await retry(async () => {
            await page.waitForSelector('.alert-success', { timeout: 60000 });
        });
        
        console.log('預約成功！');
        
    } catch (error) {
        console.error('預約過程發生錯誤：', error);
        throw error;
    } finally {
        await browser.close();
    }
} 