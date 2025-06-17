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

async function waitAndClick(page, selector, timeout = 10000) {
    const element = await page.waitForSelector(selector, { timeout });
    if (!element) {
        throw new Error(`找不到元素：${selector}`);
    }
    await element.click();
    await page.waitForTimeout(2000);
}

async function waitAndType(page, selector, text, timeout = 10000) {
    const element = await page.waitForSelector(selector, { timeout });
    if (!element) {
        throw new Error(`找不到元素：${selector}`);
    }
    await element.type(text, { delay: 100 });
    await page.waitForTimeout(1000);
}

async function waitAndSelect(page, selector, value, timeout = 10000) {
    const element = await page.waitForSelector(selector, { timeout });
    if (!element) {
        throw new Error(`找不到元素：${selector}`);
    }
    await page.select(selector, value);
    await page.waitForTimeout(1000);
}

async function bookCar() {
    console.log('\n開始執行預約流程...\n');
    
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
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);

        // 監聽各種錯誤
        page.on('error', err => console.error('頁面錯誤：', err));
        page.on('pageerror', err => console.error('頁面錯誤：', err));
        page.on('requestfailed', request => {
            console.error('請求失敗：', request.url(), request.failure().errorText);
        });
        page.on('console', msg => console.log('頁面訊息:', msg.text()));

        // 1. 連線到網站
        console.log('正在開啟網頁...');
        await page.goto('https://www.ntpc.ltc-car.org/', { 
            waitUntil: 'networkidle0', 
            timeout: 60000 
        });
        await page.waitForTimeout(3000);

        // 2. 點擊「我知道了」
        console.log('點擊「我知道了」按鈕...');
        await retry(async () => {
            await waitAndClick(page, 'a.button-fill.button-large.color_deep_main');
        });

        // 3. 登入流程
        console.log('開始登入流程...');
        await retry(async () => {
            await waitAndType(page, 'input[name="IDNumber"]', ID_NUMBER);
            await waitAndType(page, 'input[name="password"]', PASSWORD);
            await waitAndClick(page, 'a.button-fill.button-large.color_deep_main');
        });

        // 4. 等待並點擊登入成功的確定按鈕
        console.log('等待登入成功確認...');
        await retry(async () => {
            // 等待頁面載入完成
            await page.waitForTimeout(5000);

            // 輸出目前頁面的 HTML 結構
            const pageContent = await page.content();
            console.log('目前頁面內容：', pageContent);

            // 檢查所有 dialog 相關元素
            const dialogElements = await page.evaluate(() => {
                const elements = {
                    dialogs: Array.from(document.querySelectorAll('div.dialog')),
                    dialogTexts: Array.from(document.querySelectorAll('div.dialog-text')),
                    dialogButtons: Array.from(document.querySelectorAll('span.dialog-button')),
                    allButtons: Array.from(document.querySelectorAll('button, a.button-fill, span.dialog-button'))
                };
                return elements;
            });
            console.log('對話框相關元素：', JSON.stringify(dialogElements, null, 2));

            // 檢查是否有錯誤訊息
            const errorMessage = await page.evaluate(() => {
                const errorElement = document.querySelector('.error-message');
                return errorElement ? errorElement.textContent : null;
            });

            if (errorMessage) {
                console.log(`登入錯誤：${errorMessage}`);
                throw new Error(`登入失敗：${errorMessage}`);
            }

            // 檢查目前 URL
            const currentUrl = await page.url();
            console.log('目前 URL：', currentUrl);

            // 檢查頁面標題
            const pageTitle = await page.title();
            console.log('頁面標題：', pageTitle);

            // 檢查是否有任何 JavaScript 錯誤
            const jsErrors = await page.evaluate(() => {
                return window.onerror ? window.onerror.toString() : 'No error handler';
            });
            console.log('JavaScript 錯誤處理器：', jsErrors);

            // 等待登入成功訊息
            try {
                // 先檢查是否有任何 dialog 元素
                const hasDialog = await page.evaluate(() => {
                    return document.querySelector('div.dialog') !== null;
                });
                console.log('是否有對話框：', hasDialog);

                if (hasDialog) {
                    // 如果有對話框，檢查其內容
                    const dialogContent = await page.evaluate(() => {
                        const dialog = document.querySelector('div.dialog');
                        return dialog ? dialog.textContent : 'No dialog content';
                    });
                    console.log('對話框內容：', dialogContent);
                }

                await page.waitForFunction(
                    () => {
                        const dialogText = document.querySelector('div.dialog-text');
                        return dialogText && dialogText.textContent.includes('登入成功');
                    },
                    { timeout: 15000 }
                );
                console.log('找到登入成功訊息');

                // 等待確定按鈕出現
                await page.waitForFunction(
                    () => {
                        const buttons = Array.from(document.querySelectorAll('span.dialog-button'));
                        return buttons.some(btn => btn.textContent.trim() === '確定');
                    },
                    { timeout: 15000 }
                );
                console.log('找到確定按鈕');

                // 點擊確定按鈕
                const confirmButton = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('span.dialog-button'));
                    const confirmBtn = buttons.find(btn => btn.textContent.trim() === '確定');
                    if (confirmBtn) {
                        confirmBtn.click();
                        return true;
                    }
                    return false;
                });

                if (!confirmButton) {
                    throw new Error('無法點擊確定按鈕');
                }
                console.log('已點擊確定按鈕');

                // 等待頁面跳轉
                await page.waitForTimeout(5000);
            } catch (error) {
                console.log('等待登入成功訊息時發生錯誤：', error.message);
                throw error;
            }
        });

        // 5. 點擊「新增預約」
        console.log('點擊新增預約...');
        await retry(async () => {
            await waitAndClick(page, 'a.button-fill.button-large:has-text("新增預約")');
        });

        // 6-7. 設定上車地點
        console.log('設定上車地點...');
        await retry(async () => {
            await waitAndSelect(page, 'select[name="boarding_type"]', '醫療院所');
            await waitAndType(page, 'input[name="boarding_address"]', '亞東紀念醫院');
            await page.waitForTimeout(2000);
            await waitAndClick(page, '.pac-item:first-child');
        });

        // 8. 設定下車地點
        console.log('設定下車地點...');
        await retry(async () => {
            await waitAndSelect(page, 'select[name="alighting_type"]', '住家');
        });

        // 9. 設定預約時間
        console.log('設定預約時間...');
        await retry(async () => {
            const dateSelects = await page.$$('select[name^="booking_date"]');
            await dateSelects[0].select('最後一個選項的值');
            await dateSelects[1].select('16');
            await dateSelects[2].select('40');
        });

        // 10-14. 設定其他選項
        console.log('設定其他選項...');
        await retry(async () => {
            await page.click('input[name="arrival_agreement"][value="不同意"]');
            await waitAndSelect(page, 'select[name="companion_count"]', '1');
            await page.click('input[name="share_ride"][value="否"]');
            await page.click('input[name="wheelchair"][value="是"]');
            await page.click('input[name="large_wheelchair"][value="否"]');
        });

        // 15. 點擊下一步
        console.log('進入確認頁面...');
        await retry(async () => {
            await waitAndClick(page, 'button:has-text("下一步，確認預約資訊")');
        });

        // 16. 送出預約
        console.log('送出預約...');
        await retry(async () => {
            await waitAndClick(page, 'button:has-text("送出預約")');
        });

        // 17. 確認預約成功
        console.log('確認預約結果...');
        await retry(async () => {
            await page.waitForFunction(
                () => document.body.textContent.includes('已完成預約'),
                { timeout: 10000 }
            );
        });

        console.log('預約成功完成！');

    } catch (error) {
        console.error('預約過程發生錯誤：', error);
        throw error;
    } finally {
        await browser.close();
    }
} 