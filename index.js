const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();
const { waitForFunction } = require('puppeteer');

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

async function handleLoginSuccess(page) {
    try {
        // 等待登入成功對話框出現
        await page.waitForFunction(
            () => {
                const dialog = document.querySelector('.el-message-box__wrapper');
                return dialog && dialog.textContent.includes('登入成功');
            },
            { timeout: 10000 }
        );

        // 點擊確定按鈕
        await page.click('.el-message-box__btns .el-button--primary');
        
        console.log('成功處理登入成功對話框');
    } catch (error) {
        console.log('處理登入成功對話框時發生錯誤:', error.message);
    }
}

// 等待函數
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function bookCar() {
    let browser;
    try {
        console.log('啟動瀏覽器...');
        browser = await puppeteer.launch({
            headless: 'new',  // 使用新的無頭模式
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080',
                '--lang=zh-TW,zh;q=0.9,en;q=0.8',
                '--accept-lang=zh-TW,zh;q=0.9,en;q=0.8'
            ]
        });

        console.log('開啟新頁面...');
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        // 設定 User-Agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        // 設定地理位置權限
        const context = browser.defaultBrowserContext();
        await context.overridePermissions('https://www.ntpc.ltc-car.org', ['geolocation']);
        await page.setGeolocation({ 
            latitude: 25.0330, 
            longitude: 121.5654,
            accuracy: 100 
        });

        // 監聽錯誤
        page.on('error', err => {
            console.error('頁面錯誤：', err);
            page.screenshot({ path: 'error.png', fullPage: true });
        });
        page.on('pageerror', err => {
            console.error('頁面錯誤：', err);
            page.screenshot({ path: 'page_error.png', fullPage: true });
        });
        page.on('requestfailed', request => {
            console.error('請求失敗：', request.url(), request.failure().errorText);
            page.screenshot({ path: 'request_failed.png', fullPage: true });
        });

        console.log('前往目標網頁...');
        await page.goto('https://www.ntpc.ltc-car.org/', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        await page.screenshot({ path: 'after_load.png', fullPage: true });

        // 等待並點擊「我知道了」按鈕
        console.log('等待並點擊「我知道了」按鈕...');
        try {
            await page.waitForSelector('.dialog-button', { timeout: 5000 });
            await page.click('.dialog-button');
            await page.screenshot({ path: 'after_dialog.png', fullPage: true });
        } catch (error) {
            console.log('找不到「我知道了」按鈕，繼續執行...');
        }

        // 登入流程
        console.log('開始登入流程...');
        await page.type('input#IDNumber', 'A102574899');
        await page.type('input#password', 'visi319VISI');
        await page.screenshot({ path: 'after_input_login.png', fullPage: true });
        
        await page.click('a.button-fill');
        await wait(2000);
        await page.screenshot({ path: 'after_click_login.png', fullPage: true });

        // 等待登入成功對話框
        await page.waitForSelector('.dialog-button', { timeout: 5000 });
        await page.click('.dialog-button');
        await page.screenshot({ path: 'after_login_success.png', fullPage: true });

        // 點擊新增預約
        await page.click('a.link:nth-child(2)');
        await wait(2000);
        await page.screenshot({ path: 'after_click_new_booking.png', fullPage: true });

        // 等待上車地點下拉選單出現，並截圖
        try {
          // 使用更通用的選擇器
          await page.waitForSelector('select#pickUp_location', {timeout: 15000});
          await page.screenshot({ path: 'before_select_location.png', fullPage: true });
        } catch (e) {
          console.error('等待上車地點下拉選單超時，錯誤：', e);
          await page.screenshot({ path: 'error_wait_location.png', fullPage: true });
          throw e;
        }

        // 選擇上車地點（醫療院所）
        console.log('嘗試選擇上車地點...');
        try {
          // 直接設定選項值
          await page.evaluate(() => {
            const select = document.querySelector('select#pickUp_location');
            if (select) {
              select.value = '1';  // 設定為醫療院所的值
              // 觸發必要的事件
              select.dispatchEvent(new Event('change', { bubbles: true }));
              select.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          
          await wait(1000);
          
          // 截圖確認選擇結果
          await page.screenshot({ path: 'after_location_select.png', fullPage: true });
          
          // 確認是否選擇成功
          const selectedValue = await page.evaluate(() => {
            const select = document.querySelector('select#pickUp_location');
            return select ? select.value : null;
          });
          console.log('選擇的上車地點值:', selectedValue);
          
        } catch (e) {
          console.error('選擇上車地點時發生錯誤：', e);
          await page.screenshot({ path: 'error_location_select.png', fullPage: true });
          throw e;
        }

        // 填入上車地點詳細地址
        console.log('輸入上車地點詳細地址...');
        await page.type('input#pickUp_address_text', '亞東紀念醫院');
        await wait(2000);
        
        // 等待 Google Maps 自動完成結果出現
        console.log('等待 Google Maps 自動完成結果...');
        try {
          await page.waitForSelector('.pac-item', { timeout: 15000 });
          await page.screenshot({ path: 'before_select_google_result.png', fullPage: true });
          
          // 點擊第一個結果
          await page.click('.pac-item:first-child');
          await wait(2000);
          await page.screenshot({ path: 'after_select_google_result.png', fullPage: true });
        } catch (e) {
          console.error('等待 Google Maps 自動完成結果時發生錯誤：', e);
          await page.screenshot({ path: 'error_google_result.png', fullPage: true });
          throw e;
        }

        // 點擊別的地方，確認地址
        await page.click('.location:nth-child(1) > label');
        await wait(2000);
        await page.screenshot({ path: 'after_confirm_address.png', fullPage: true });

        // 選擇下車地點
        console.log('選擇下車地點...');
        await page.evaluate(() => {
          const select = document.querySelector('select#getOff_location');
          if (select) {
            select.value = '0';  // 設定為住家
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        await wait(2000);
        await page.screenshot({ path: 'after_select_dropoff.png', fullPage: true });

        // 選擇下車地址
        console.log('選擇下車地址...');
        await page.evaluate(() => {
          const select = document.querySelector('select#getOff_address');
          if (select) {
            const options = Array.from(select.options);
            const targetOption = options.find(opt => opt.text.includes('新北市板橋區中正路1巷18號'));
            if (targetOption) {
              select.value = targetOption.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              select.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        });
        await wait(2000);
        await page.screenshot({ path: 'after_select_address.png', fullPage: true });

        // 選擇預約日期和時間
        console.log('選擇預約日期...');
        await page.evaluate(() => {
          const select = document.querySelector('select#appointment_date');
          if (select) {
            const options = Array.from(select.options);
            const lastOption = options[options.length - 1];
            select.value = lastOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        await wait(2000);
        await page.screenshot({ path: 'after_select_date.png', fullPage: true });

        console.log('選擇預約時間...');
        await page.evaluate(() => {
          const hourSelect = document.querySelector('select#appointment_hour');
          const minuteSelect = document.querySelector('select#appointment_minutes');
          if (hourSelect) {
            hourSelect.value = '16';
            hourSelect.dispatchEvent(new Event('change', { bubbles: true }));
            hourSelect.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (minuteSelect) {
            minuteSelect.value = '40';
            minuteSelect.dispatchEvent(new Event('change', { bubbles: true }));
            minuteSelect.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        await wait(2000);
        await page.screenshot({ path: 'after_select_time.png', fullPage: true });

        // 選擇其他選項
        await page.click('.form_item:nth-child(6) .cus_checkbox_type1:nth-child(2) > div');  // 不同意30分
        await page.select('select#accompany_label', '1');  // 陪同1人
        await page.click('.form_item:nth-child(10) .cus_checkbox_type1:nth-child(2) > div');  // 共乘否
        await page.click('.form_item:nth-child(11) .cus_checkbox_type1:nth-child(1) > div');  // 搭輪椅上車是
        await page.click('.form_item:nth-child(12) .cus_checkbox_type1:nth-child(2) > div');  // 大型輪椅否
        await wait(2000);
        await page.screenshot({ path: 'after_select_options.png', fullPage: true });

        // 點擊下一步
        await page.click('.page_bottom > .button');
        await wait(5000);  // 增加等待時間到 5 秒
        await page.screenshot({ path: 'after_click_next.png', fullPage: true });

        // 等待頁面載入完成
        await page.waitForFunction(
          () => {
            // 檢查頁面是否還在載入中
            const loadingIndicator = document.querySelector('.loading');
            if (loadingIndicator) return false;
            
            // 檢查送出按鈕是否存在且可點擊
            const button = document.querySelector('button.button-fill:nth-child(2)');
            if (!button) return false;
            
            const style = window.getComputedStyle(button);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   !button.disabled;
          },
          { timeout: 30000 }  // 等待最多 30 秒
        );

        // 再次確認按鈕狀態
        const buttonState = await page.evaluate(() => {
            const button = document.querySelector('button.button-fill:nth-child(2)');
            if (!button) return { exists: false };
            
            const style = window.getComputedStyle(button);
            return {
                exists: true,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                disabled: button.disabled,
                text: button.textContent.trim()
            };
        });

        console.log('送出按鈕狀態：', buttonState);

        if (!buttonState.exists || buttonState.disabled) {
            throw new Error('送出按鈕不可用');
        }

        // 點擊送出預約
        await page.click('button.button-fill:nth-child(2)');
        await wait(5000);  // 增加等待時間到 5 秒
        await page.screenshot({ path: 'after_submit.png', fullPage: true });

        // 檢查預約結果
        console.log('檢查預約結果...');
        
        // 等待並檢查預約結果
        const bookingResult = await page.waitForFunction(
          () => {
            const dialog = document.querySelector('.dialog');
            if (!dialog) return false;
            const dialogText = dialog.textContent;
            return dialogText.includes('已完成預約') || 
                   dialogText.includes('預約成功') || 
                   dialogText.includes('預約完成') || 
                   dialogText.includes('預約已成功') ||
                   dialogText.includes('預約重複');
          },
          { timeout: 60000 }  // 增加等待時間到 60 秒
        );
        
        if (bookingResult) {
          console.log('恭喜預約成功！');
          await page.screenshot({ path: 'booking_success.png', fullPage: true });
          
          // 嘗試點擊確認按鈕
          try {
            const confirmButton = await page.waitForSelector('.dialog-button', { timeout: 5000 });
            if (confirmButton) {
              await confirmButton.click();
            }
          } catch (error) {
            console.log('找不到確認按鈕，繼續執行...');
          }
        } else {
          console.log('預約可能失敗');
          await page.screenshot({ path: 'booking_failed.png', fullPage: true });
        }
    } catch (error) {
        console.error('發生錯誤：', error);
        if (browser) {
            await browser.close();
        }
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
} 