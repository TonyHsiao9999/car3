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
    console.log('\n開始執行預約流程...\n');
    console.log(`使用帳號： ${ID_NUMBER}\n`);

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
        await page.setViewport({ width: 1920, height: 1080 });

        // 設定頁面超時
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);

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

        console.log('正在開啟網頁...\n');
        await page.goto('https://www.ntpc.ltc-car.org/', { waitUntil: 'networkidle0', timeout: 60000 });

        // 等待頁面載入完成
        console.log('等待頁面載入完成...\n');
        await page.waitForTimeout(5000);

        // 點擊「我知道了」按鈕
        console.log('嘗試自動點擊「我知道了」按鈕...\n');
        try {
            const iKnowButton = await page.waitForSelector('a.button-fill.button-large.color_deep_main', { timeout: 10000 });
            if (iKnowButton) {
                await iKnowButton.click();
                console.log('已點擊「我知道了」按鈕！\n');
                await page.waitForTimeout(3000);
            }
        } catch (error) {
            console.log('「我知道了」按鈕不存在或無法點擊，繼續執行...\n');
        }

        // 等待登入表單出現
        console.log('等待登入表單出現...\n');
        await page.waitForSelector('input[name="IDNumber"]', { timeout: 10000 });
        await page.waitForSelector('input[name="password"]', { timeout: 10000 });

        // 填入登入表單
        console.log('填入登入表單...\n');
        await page.type('input[name="IDNumber"]', ID_NUMBER);
        await page.type('input[name="password"]', PASSWORD);
        await page.waitForTimeout(1000);

        // 點擊民眾登入按鈕
        console.log('點擊表單內的「民眾登入」按鈕...\n');
        const loginButton = await page.waitForSelector('a.button-fill.button-large.color_deep_main', { timeout: 10000 });
        if (loginButton) {
            await loginButton.click();
            console.log('已點擊民眾登入按鈕！\n');
        }

        // 等待頁面導航
        console.log('等待頁面導航完成...\n');
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {
            console.log('等待頁面導航超時，繼續執行...\n');
        });

        // 等待一段時間讓頁面完全載入
        await page.waitForTimeout(5000);

        // 檢查是否在預約頁面
        let isBookingPage = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (!isBookingPage && retryCount < maxRetries) {
            try {
                // 檢查多個可能的選擇器
                const selectors = [
                    '#pickUp_location',
                    'select[name="pickUp_location"]',
                    'input[name="pickUp_location"]',
                    'form[name="bookingForm"]',
                    '.booking-form'
                ];

                for (const selector of selectors) {
                    const element = await page.$(selector);
                    if (element) {
                        isBookingPage = true;
                        console.log(`找到預約頁面元素：${selector}\n`);
                        break;
                    }
                }

                if (!isBookingPage) {
                    console.log(`第 ${retryCount + 1} 次檢查：不在預約頁面，等待確認按鈕...\n`);
                    
                    // 等待並點擊確認按鈕
                    try {
                        const confirmButton = await page.waitForSelector('a.button-fill.button-large.color_deep_main', { timeout: 10000 });
                        if (confirmButton) {
                            await confirmButton.click();
                            console.log('已點擊確認按鈕！\n');
                            
                            // 等待頁面導航
                            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {
                                console.log('等待頁面導航超時，繼續執行...\n');
                            });
                            
                            // 等待頁面載入
                            await page.waitForTimeout(5000);
                        }
                    } catch (error) {
                        console.log('找不到確認按鈕，繼續執行...\n');
                    }
                }
            } catch (error) {
                console.log(`第 ${retryCount + 1} 次檢查發生錯誤：${error.message}\n`);
            }

            retryCount++;
            if (!isBookingPage && retryCount < maxRetries) {
                console.log(`等待 5 秒後進行第 ${retryCount + 1} 次檢查...\n`);
                await page.waitForTimeout(5000);
            }
        }

        if (!isBookingPage) {
            // 如果仍然不在預約頁面，嘗試重新整理
            console.log('嘗試重新整理頁面...\n');
            await page.reload({ waitUntil: 'networkidle0' });
            await page.waitForTimeout(5000);

            // 再次檢查是否在預約頁面
            try {
                await page.waitForSelector('#pickUp_location', { timeout: 10000 });
                isBookingPage = true;
                console.log('重新整理後成功進入預約頁面！\n');
            } catch (error) {
                console.log('重新整理後仍無法進入預約頁面，請檢查登入狀態。\n');
                throw new Error('無法進入預約頁面');
            }
        } else {
            console.log('成功進入預約頁面！\n');
        }

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