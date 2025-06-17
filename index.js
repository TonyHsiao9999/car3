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
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
            ],
            timeout: 120000
        });

        console.log('開啟新頁面...');
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setDefaultNavigationTimeout(120000);
        await page.setDefaultTimeout(120000);
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

        // 設定瀏覽器環境
        await page.evaluateOnNewDocument(() => {
          // 設定時區
          Object.defineProperty(Intl, 'DateTimeFormat', {
            value: function(...args) {
              if (args.length === 0) {
                args = [undefined, { timeZone: 'Asia/Taipei' }];
              }
              return new Intl.DateTimeFormat(...args);
            },
            writable: true,
            configurable: true
          });

          // 設定語言
          Object.defineProperty(navigator, 'language', {
            get: function() {
              return 'zh-TW';
            }
          });

          Object.defineProperty(navigator, 'languages', {
            get: function() {
              return ['zh-TW', 'zh'];
            }
          });

          // 設定螢幕大小
          Object.defineProperty(window.screen, 'width', {
            get: function() {
              return 1920;
            }
          });
          Object.defineProperty(window.screen, 'height', {
            get: function() {
              return 1080;
            }
          });
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
        await page.type('input#IDNumber', ID_NUMBER);
        await page.type('input#password', PASSWORD);
        await page.screenshot({ path: 'after_input_login.png', fullPage: true });
        
        await page.click('a.button-fill');
        await wait(5000);  // 增加等待時間到 5 秒
        await page.screenshot({ path: 'after_click_login.png', fullPage: true });

        // 等待登入成功對話框
        await page.waitForSelector('.dialog-button', { timeout: 10000 });
        await page.click('.dialog-button');
        await page.screenshot({ path: 'after_login_success.png', fullPage: true });

        // 點擊新增預約
        console.log('點擊新增預約按鈕...');
        try {
          await page.waitForSelector('a.link', { timeout: 10000 });
          const links = await page.$$('a.link');
          let found = false;
          for (const link of links) {
            const text = await page.evaluate(el => el.textContent.trim(), link);
            console.log('找到連結：', text);
            if (text === '新增預約') {
              await link.click();
              console.log('已點擊新增預約按鈕');
              found = true;
              break;
            }
          }
          if (!found) {
            throw new Error('找不到新增預約按鈕');
          }
          await wait(5000);  // 增加等待時間到 5 秒
          await page.screenshot({ path: 'after_click_new_booking.png', fullPage: true });
        } catch (e) {
          console.error('點擊新增預約按鈕時發生錯誤：', e);
          await page.screenshot({ path: 'error_click_new_booking.png', fullPage: true });
          throw e;
        }

        // 點擊「預約訂車」按鈕
        console.log('點擊預約訂車按鈕...');
        try {
          await page.waitForSelector('button.button-fill', { timeout: 10000 });
          const buttons = await page.$$('button.button-fill');
          for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent.trim(), button);
            if (text === '預約訂車') {
              await button.click();
              console.log('已點擊預約訂車按鈕');
              break;
            }
          }
          await wait(5000);  // 等待頁面載入
          await page.screenshot({ path: 'after_click_book_car.png', fullPage: true });
        } catch (e) {
          console.error('點擊預約訂車按鈕時發生錯誤：', e);
          await page.screenshot({ path: 'error_click_book_car.png', fullPage: true });
          throw e;
        }

        // 等待頁面完全載入
        console.log('等待頁面完全載入...');
        await page.waitForFunction(
          () => {
            // 檢查頁面是否還在載入中
            const loadingIndicator = document.querySelector('.loading');
            if (loadingIndicator) return false;
            
            // 檢查上車地點選單是否存在且可見
            const select = document.querySelector('select#pickUp_location');
            if (!select) return false;
            
            const style = window.getComputedStyle(select);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0';
          },
          { timeout: 30000 }  // 增加等待時間到 30 秒
        );

        // 等待上車地點下拉選單出現，並截圖
        try {
          await page.waitForSelector('select#pickUp_location', { timeout: 30000 });  // 增加等待時間到 30 秒
          await page.screenshot({ path: 'before_select_location.png', fullPage: true });
        } catch (e) {
          console.error('等待上車地點下拉選單超時，錯誤：', e);
          // 儲存當前 HTML 內容以便調試
          const html = await page.content();
          console.log('頁面 HTML：', html);
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
        const selectedDate = await page.evaluate(() => {
          const select = document.querySelector('select#appointment_date');
          if (select) {
            const options = Array.from(select.options);
            const lastOption = options[options.length - 1];
            
            // 記錄所有日期選項的詳細資訊
            console.log('所有日期選項：', options.map(opt => ({
              value: opt.value,
              text: opt.text,
              disabled: opt.disabled,
              selected: opt.selected
            })));
            
            select.value = lastOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              value: lastOption.value,
              text: lastOption.text
            };
          }
          return null;
        });
        console.log('選擇的預約日期：', selectedDate);
        await wait(2000);
        await page.screenshot({ path: 'after_select_date.png', fullPage: true });

        console.log('選擇預約時間...');
        const selectedTime = await page.evaluate(() => {
          const hourSelect = document.querySelector('select#appointment_hour');
          const minuteSelect = document.querySelector('select#appointment_minutes');
          let hour = '', minute = '';

          if (hourSelect) {
            // 記錄所有小時選項的詳細資訊
            console.log('所有小時選項：', Array.from(hourSelect.options).map(opt => ({
              value: opt.value,
              text: opt.text,
              disabled: opt.disabled,
              selected: opt.selected
            })));
            
            hourSelect.value = '16';
            hour = hourSelect.value;
            hourSelect.dispatchEvent(new Event('change', { bubbles: true }));
            hourSelect.dispatchEvent(new Event('input', { bubbles: true }));
          }

          if (minuteSelect) {
            // 記錄所有分鐘選項的詳細資訊
            console.log('所有分鐘選項：', Array.from(minuteSelect.options).map(opt => ({
              value: opt.value,
              text: opt.text,
              disabled: opt.disabled,
              selected: opt.selected
            })));
            
            minuteSelect.value = '40';
            minute = minuteSelect.value;
            minuteSelect.dispatchEvent(new Event('change', { bubbles: true }));
            minuteSelect.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return { hour, minute };
        });

        console.log('選擇的預約時間：', selectedTime);
        await wait(2000);
        await page.screenshot({ path: 'after_select_time.png', fullPage: true });

        // 選擇其他選項
        console.log('選擇其他選項...');
        await page.evaluate(() => {
          // 記錄所有選項的狀態
          const allSelects = document.querySelectorAll('select');
          console.log('所有下拉選單狀態：', Array.from(allSelects).map(select => ({
            id: select.id,
            value: select.value,
            options: Array.from(select.options).map(opt => ({
              value: opt.value,
              text: opt.text,
              disabled: opt.disabled,
              selected: opt.selected
            }))
          })));
        });

        // 填寫必要選項
        await page.click('.form_item:nth-child(6) .cus_checkbox_type1:nth-child(2) > div');  // 不同意30分
        await page.select('select#accompany_label', '1');  // 陪同1人
        await page.click('.form_item:nth-child(10) .cus_checkbox_type1:nth-child(2) > div');  // 共乘否
        await page.click('.form_item:nth-child(11) .cus_checkbox_type1:nth-child(1) > div');  // 搭輪椅上車是
        await page.click('.form_item:nth-child(12) .cus_checkbox_type1:nth-child(2) > div');  // 大型輪椅否
        await wait(2000);
        await page.screenshot({ path: 'after_select_options.png', fullPage: true });

        // 在送出按鈕之前收集所有資訊
        console.error('=== 系統資訊 ===');
        const debugInfo = await page.evaluate(async () => {
          const data = {
            userAgent: navigator.userAgent,
            formData: {},
            windowSize: {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              outerWidth: window.outerWidth,
              outerHeight: window.outerHeight
            },
            screen: {
              width: screen.width,
              height: screen.height
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: navigator.language
          };

          // 收集所有表單資料
          document.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
              data.formData[el.name || el.id] = el.checked;
            } else {
              data.formData[el.name || el.id] = el.value;
            }
          });

          return data;
        });

        const cookies = await page.cookies();
        debugInfo.cookies = cookies;

        console.error('系統偵錯資訊：', JSON.stringify(debugInfo, null, 2));
        console.error('=== 系統資訊結束 ===');

        // 改進按鈕選擇邏輯
        console.error('等待送出按鈕出現...');
        await page.waitForFunction(
          () => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const submitButton = buttons.find(btn => 
              btn.textContent.includes('送出預約') || 
              btn.textContent.includes('送出') ||
              btn.className.includes('button-fill')
            );
            console.error('找到的按鈕：', submitButton ? {
              text: submitButton.textContent,
              class: submitButton.className,
              type: submitButton.type,
              disabled: submitButton.disabled
            } : '沒有找到按鈕');
            return submitButton;
          },
          { timeout: 30000 }
        );

        // 點擊送出按鈕
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const submitButton = buttons.find(btn => 
            btn.textContent.includes('送出預約') || 
            btn.textContent.includes('送出') ||
            btn.className.includes('button-fill')
          );
          if (submitButton) {
            submitButton.click();
          } else {
            throw new Error('找不到送出按鈕');
          }
        });

        console.log('已點擊送出預約按鈕');
        await wait(2000);  // 等待 2 秒

        // 等待浮動視窗出現
        console.log('等待浮動視窗出現...');
        const dialogContent = await page.waitForFunction(
          () => {
            const dialog = document.querySelector('.dialog') || 
                          document.querySelector('.el-message-box__wrapper') ||
                          document.querySelector('.el-message-box');
            if (dialog) {
              console.log('浮動視窗狀態：', {
                className: dialog.className,
                textContent: dialog.textContent,
                style: window.getComputedStyle(dialog)
              });
              return dialog.textContent;
            }
            return null;
          },
          { timeout: 30000 }
        );

        // 檢查預約結果
        console.log('檢查預約結果...');
        const bookingInfo = {
          '日期': selectedDate.text,
          '時間': `${selectedTime.hour}:${selectedTime.minute}`,
          '執行環境': process.env.NODE_ENV || 'development',
          '時間戳記': new Date().toISOString()
        };
        console.log('預約資訊：', bookingInfo);

        // 等待並檢查浮動視窗內容
        let success = false;
        let attempts = 0;
        const maxAttempts = 5;

        while (!success && attempts < maxAttempts) {
          attempts++;
          console.log(`第 ${attempts} 次檢查...`);
          
          const dialogResult = await page.evaluate(() => {
            // 檢查所有可能的浮動視窗選擇器
            const selectors = [
              '.dialog',
              '.el-message-box__wrapper',
              '.el-message-box',
              '[class*="dialog"]',
              '[class*="modal"]'
            ];
            
            for (const selector of selectors) {
              const dialog = document.querySelector(selector);
              if (dialog) {
                // 清理文字內容，移除多餘的空白和換行
                const content = dialog.textContent.replace(/\s+/g, ' ').trim();
                
                // 分離訊息和按鈕文字
                const parts = content.split(/(確定|關閉|確認|OK|Cancel|關閉)/);
                const message = parts[0].trim();
                const buttonText = parts[1] || '';
                
                return {
                  selector: dialog.className,
                  content: content,
                  message: message,
                  buttonText: buttonText
                };
              }
            }
            return null;
          });

          if (dialogResult) {
            console.log('浮動視窗內容：', dialogResult);
            
            // 檢查成功訊息（考慮不同環境的文字格式）
            if (dialogResult.message.includes('已完成預約') || 
                dialogResult.message.includes('預約成功') ||
                dialogResult.message.includes('預約完成')) {
              console.log(`在 ${dialogResult.selector} 中找到成功訊息`);
              success = true;
              
              // 記錄成功資訊
              const successInfo = {
                '成功訊息': dialogResult.message,
                '日期': selectedDate.text,
                '時間': `${selectedTime.hour}:${selectedTime.minute}`,
                '執行環境': process.env.NODE_ENV || 'development',
                '時間戳記': new Date().toISOString()
              };
              console.log('預約成功資訊：', successInfo);
              
              // 等待頁面更新完成
              await wait(5000);
              
              // 截取成功畫面
              await page.screenshot({ 
                path: 'success.png', 
                fullPage: true 
              });
              
              // 點擊關閉按鈕（考慮不同環境的按鈕選擇器）
              await page.evaluate(() => {
                const buttonSelectors = [
                  '.dialog .button',
                  '.el-message-box__btns .el-button',
                  '[class*="dialog"] [class*="button"]',
                  '[class*="modal"] [class*="button"]'
                ];
                
                for (const selector of buttonSelectors) {
                  const button = document.querySelector(selector);
                  if (button) {
                    button.click();
                    return;
                  }
                }
              });
              
              break;
            } 
            // 檢查錯誤訊息（考慮不同環境的文字格式）
            else if (dialogResult.message.includes('此時段無法預約') || 
                     dialogResult.message.includes('無法預約')) {
              console.log(`在 ${dialogResult.selector} 中找到錯誤訊息`);
              
              // 記錄失敗資訊
              const errorInfo = {
                '錯誤訊息': dialogResult.message,
                '日期': selectedDate.text,
                '時間': `${selectedTime.hour}:${selectedTime.minute}`,
                '執行環境': process.env.NODE_ENV || 'development',
                '時間戳記': new Date().toISOString()
              };
              console.log('預約失敗資訊：', errorInfo);
              
              // 截取失敗畫面
              await page.screenshot({ 
                path: 'error.png', 
                fullPage: true 
              });
              
              // 點擊確定按鈕（考慮不同環境的按鈕選擇器）
              await page.evaluate(() => {
                const buttonSelectors = [
                  '.dialog .button',
                  '.el-message-box__btns .el-button',
                  '[class*="dialog"] [class*="button"]',
                  '[class*="modal"] [class*="button"]'
                ];
                
                for (const selector of buttonSelectors) {
                  const button = document.querySelector(selector);
                  if (button) {
                    button.click();
                    return;
                  }
                }
              });
              
              throw new Error('此時段無法預約');
            }
          }
          
          if (!success) {
            await wait(2000);
          }
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