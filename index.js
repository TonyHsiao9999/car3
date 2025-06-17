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
    
    // 設定帳號密碼
    const userId = 'A102574899';
    const userPassword = 'visi319VISI';
    
    console.log(`使用帳號： ${userId}\n`);

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
        
        // 先清空輸入框
        await page.evaluate(() => {
          const idInput = document.querySelector('input[name="IDNumber"]');
          const pwdInput = document.querySelector('input[name="password"]');
          if (idInput) idInput.value = '';
          if (pwdInput) pwdInput.value = '';
        });
        await page.waitForTimeout(1000);
        
        // 使用 type 方法輸入
        console.log('正在輸入身分證字號...\n');
        await page.type('input[name="IDNumber"]', userId, { delay: 100 });
        await page.waitForTimeout(1000);
        
        console.log('正在輸入密碼...\n');
        await page.type('input[name="password"]', userPassword, { delay: 100 });
        await page.waitForTimeout(1000);
        
        // 確認帳號密碼是否確實填入
        const idNumberValue = await page.evaluate(() => {
          const input = document.querySelector('input[name="IDNumber"]');
          return input ? input.value : '';
        });
        const passwordValue = await page.evaluate(() => {
          const input = document.querySelector('input[name="password"]');
          return input ? input.value : '';
        });

        console.log('檢查輸入值：');
        console.log(`身分證字號：${idNumberValue}`);
        console.log(`密碼：${passwordValue}\n`);

        if (idNumberValue !== userId || passwordValue !== userPassword) {
          console.log('帳號密碼未正確填入，重試中...\n');
          // 清空輸入框
          await page.evaluate(() => {
            const idInput = document.querySelector('input[name="IDNumber"]');
            const pwdInput = document.querySelector('input[name="password"]');
            if (idInput) idInput.value = '';
            if (pwdInput) pwdInput.value = '';
          });
          await page.waitForTimeout(1000);

          // 使用 JavaScript 直接設定值
          console.log('使用 JavaScript 直接設定值...\n');
          await page.evaluate((id, pwd) => {
            const idInput = document.querySelector('input[name="IDNumber"]');
            const pwdInput = document.querySelector('input[name="password"]');
            if (idInput) {
              idInput.value = id;
              idInput.dispatchEvent(new Event('input', { bubbles: true }));
              idInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (pwdInput) {
              pwdInput.value = pwd;
              pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
              pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, userId, userPassword);
          
          await page.waitForTimeout(1000);

          // 再次確認
          const retryIdNumberValue = await page.evaluate(() => {
            const input = document.querySelector('input[name="IDNumber"]');
            return input ? input.value : '';
          });
          const retryPasswordValue = await page.evaluate(() => {
            const input = document.querySelector('input[name="password"]');
            return input ? input.value : '';
          });

          console.log('重試後檢查輸入值：');
          console.log(`身分證字號：${retryIdNumberValue}`);
          console.log(`密碼：${retryPasswordValue}\n`);

          if (retryIdNumberValue !== userId || retryPasswordValue !== userPassword) {
            throw new Error('無法正確填入帳號密碼');
          }
        }

        console.log('帳號密碼已確認填入！\n');

        // 點擊民眾登入按鈕
        console.log('準備點擊民眾登入按鈕...\n');
        const loginButton = await page.waitForSelector('a.button-fill.button-large.color_deep_main', { timeout: 10000 });
        if (!loginButton) {
          throw new Error('找不到民眾登入按鈕');
        }

        // 檢查按鈕是否可見和可點擊
        const isVisible = await loginButton.isVisible();
        const isEnabled = await page.evaluate(button => {
          return !button.disabled && !button.classList.contains('disabled');
        }, loginButton);

        console.log(`按鈕狀態：可見=${isVisible}, 可點擊=${isEnabled}\n`);

        if (!isVisible || !isEnabled) {
          throw new Error('民眾登入按鈕不可見或不可點擊');
        }

        // 使用 JavaScript 點擊按鈕
        console.log('使用 JavaScript 點擊按鈕...\n');
        await page.evaluate(button => {
          button.click();
        }, loginButton);

        console.log('已點擊民眾登入按鈕，等待回應...\n');
        await page.waitForTimeout(5000);

        // 檢查是否有錯誤訊息
        const errorMessage = await page.evaluate(() => {
          const errorElement = document.querySelector('.error-message');
          return errorElement ? errorElement.textContent : null;
        });

        if (errorMessage) {
          console.log(`登入錯誤：${errorMessage}\n`);
          throw new Error(`登入失敗：${errorMessage}`);
        }

        // 等待頁面載入完成
        console.log('等待頁面載入完成...\n');
        await page.waitForTimeout(5000);

        // 檢查是否在預約頁面
        const isBookingPage = await page.evaluate(() => {
          return window.location.href.includes('/ntpc/booking');
        });

        if (!isBookingPage) {
          throw new Error('無法進入預約頁面');
        }

        console.log('成功進入預約頁面！\n');

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

        // 等待「確定」按鈕出現（最長 15 秒）
        await page.waitForFunction(() => {
          return Array.from(document.querySelectorAll('span.dialog-button')).some(btn => btn.textContent.trim() === '確定');
        }, { timeout: 15000 });

        // 列印所有 dialog-button 文字
        const dialogButtons = await page.$$eval('span.dialog-button', btns =>
          btns.map(btn => btn.textContent.trim())
        );
        console.log('所有 dialog-button 文字：', dialogButtons);

        // 點擊「確定」按鈕
        let clicked = false;
        for (const btn of await page.$$('span.dialog-button')) {
          const text = await (await btn.getProperty('textContent')).jsonValue();
          if (text.trim() === '確定') {
            await btn.click();
            console.log('已點擊確定按鈕');
            clicked = true;
            break;
          }
        }
        if (!clicked) {
          console.log('沒有找到「確定」按鈕');
        }

    } catch (error) {
        console.error('預約過程發生錯誤：', error);
        throw error;
    } finally {
        await browser.close();
    }
} 