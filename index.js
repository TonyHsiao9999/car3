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
    await new Promise(resolve => setTimeout(resolve, 2000));
}

async function waitAndType(page, selector, text, timeout = 10000) {
    const element = await page.waitForSelector(selector, { timeout });
    if (!element) {
        throw new Error(`找不到元素：${selector}`);
    }
    await element.type(text, { delay: 100 });
    await new Promise(resolve => setTimeout(resolve, 1000));
}

async function waitAndSelect(page, selector, value, timeout = 10000) {
    const element = await page.waitForSelector(selector, { timeout });
    if (!element) {
        throw new Error(`找不到元素：${selector}`);
    }
    await page.select(selector, value);
    await new Promise(resolve => setTimeout(resolve, 1000));
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
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 2. 點擊「我知道了」按鈕
        console.log('點擊「我知道了」按鈕...');
        await retry(async () => {
            // 等待按鈕出現
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 尋找並點擊「我知道了」按鈕
            const knowButton = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('a.button-fill'));
                const button = buttons.find(btn => btn.textContent.trim() === '我知道了');
                if (button) {
                    button.click();
                    return true;
                }
                return false;
            });
            
            if (!knowButton) {
                throw new Error('找不到「我知道了」按鈕');
            }
            
            // 等待按鈕點擊後的效果
            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        // 3. 登入流程
        console.log('開始登入流程...');
        await retry(async () => {
            // 等待登入表單出現
            console.log('等待登入表單...');
            await page.waitForSelector('input[type="text"]', { visible: true });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 輸入登入資訊
            console.log('輸入登入資訊...');
            const inputs = await page.$$('input[type="text"], input[type="password"]');
            await inputs[0].type(ID_NUMBER, { delay: 100 });
            await inputs[1].type(PASSWORD, { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 點擊「民眾登入」按鈕
            console.log('點擊「民眾登入」按鈕...');
            const loginButton = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('a.button-fill.button-large.color_deep_main'));
                const loginBtn = buttons.find(btn => btn.textContent.trim() === '民眾登入');
                if (loginBtn) {
                    loginBtn.click();
                    return true;
                }
                return false;
            });
            
            if (!loginButton) {
                throw new Error('找不到「民眾登入」按鈕');
            }
            
            // 等待登入成功訊息
            console.log('等待登入成功訊息...');
            let loginSuccess = false;
            try {
                await page.waitForFunction(
                    () => {
                        const dialogText = document.querySelector('.dialog-text');
                        return dialogText && dialogText.textContent.includes('登入成功');
                    },
                    { timeout: 15000 }
                );
                loginSuccess = true;
                // 點擊確定按鈕
                console.log('點擊確定按鈕...');
                const confirmButton = await page.waitForSelector('.dialog-button', { visible: true });
                if (confirmButton) {
                    await confirmButton.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            } catch (error) {
                console.log('等待登入成功訊息時發生錯誤：', error.message);
            }
            // 無論成功或失敗都截圖
            await page.screenshot({ path: 'login_result.png', fullPage: true });
            // 印出所有 dialog-text 或錯誤訊息
            const dialogs = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.dialog-text')).map(e => e.textContent.trim());
            });
            if (dialogs.length > 0) {
                console.log('畫面上所有 dialog-text：', dialogs);
            } else {
                console.log('畫面上沒有 dialog-text');
            }
            if (!loginSuccess) {
                throw new Error('登入失敗：無法確認登入狀態');
            }
        });

        // 4. 預約流程
        console.log('開始預約流程...');
        await retry(async () => {
            // 點擊「新增預約」按鈕
            console.log('點擊「新增預約」按鈕...');
            const addReservationButton = await page.waitForSelector('a.button-fill.button-large.color_deep_main', { visible: true });
            if (!addReservationButton) {
                throw new Error('找不到「新增預約」按鈕');
            }
            await addReservationButton.click();
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 選擇上車地點
            console.log('選擇上車地點...');
            await page.select('select[name="pickupType"]', '醫療院所');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 輸入並選擇醫院
            console.log('輸入醫院名稱...');
            await page.type('input[name="pickupLocation"]', '亞東紀念醫院', { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 點擊第一個搜尋結果
            const firstResult = await page.waitForSelector('.pac-item', { visible: true });
            if (!firstResult) {
                throw new Error('找不到醫院搜尋結果');
            }
            await firstResult.click();
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 選擇下車地點
            console.log('選擇下車地點...');
            await page.select('select[name="dropoffType"]', '住家');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 選擇預約日期和時間
            console.log('選擇預約日期和時間...');
            const dateSelect = await page.$('select[name="date"]');
            const dateOptions = await dateSelect.$$('option');
            await dateOptions[dateOptions.length - 1].click();
            await new Promise(resolve => setTimeout(resolve, 1000));

            await page.select('select[name="hour"]', '16');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.select('select[name="minute"]', '40');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 選擇其他選項
            console.log('選擇其他選項...');
            await page.select('select[name="arrivalTime"]', '不同意');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.select('select[name="companions"]', '1人(免費)');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.select('select[name="sharing"]', '否');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.select('select[name="wheelchair"]', '是');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.select('select[name="largeWheelchair"]', '否');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 點擊下一步按鈕
            console.log('點擊下一步按鈕...');
            const nextButton = await page.waitForSelector('a.button-fill.button-large.color_deep_main', { visible: true });
            if (!nextButton) {
                throw new Error('找不到下一步按鈕');
            }
            await nextButton.click();
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 點擊送出預約按鈕
            console.log('點擊送出預約按鈕...');
            const submitButton = await page.waitForSelector('a.button-fill.button-large.color_deep_main', { visible: true });
            if (!submitButton) {
                throw new Error('找不到送出預約按鈕');
            }
            await submitButton.click();
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 確認預約完成
            const successMessage = await page.evaluate(() => {
                const dialogText = document.querySelector('div.dialog-text');
                return dialogText ? dialogText.textContent : null;
            });

            if (!successMessage || !successMessage.includes('已完成預約')) {
                throw new Error('無法確認預約是否成功');
            }
        });

        console.log('預約成功完成！');

    } catch (error) {
        console.error('預約過程發生錯誤：', error);
        throw error;
    } finally {
        await browser.close();
    }
} 