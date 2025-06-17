const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();
const { waitForFunction } = require('puppeteer');
const fs = require('fs');
const path = require('path');

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

// 創建日誌目錄
const logDir = '/tmp/logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 創建日誌檔案
const logFile = path.join(logDir, `booking-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

// 自定義日誌函數
function log(message, type = 'info', force = false) {
    // 如果不是強制輸出，且不是錯誤，則跳過
    if (!force && type !== 'error') {
        return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.log(logMessage);
}

// 錯誤處理函數
function handleError(error, context = '') {
    const errorMessage = `錯誤發生在 ${context}: ${error.message}`;
    log(errorMessage, 'error', true);
}

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

// 統一的延遲函數
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function debugLoginEnvironment(page) {
    console.log('=== 開始環境檢查 ===');

    // 1. 檢查網路環境
    const networkState = await page.evaluate(() => {
        return {
            isHttps: window.location.protocol === 'https:',
            domain: window.location.hostname,
            isSecureContext: window.isSecureContext,
            isInIframe: window.self !== window.top,
            url: window.location.href
        };
    });
    console.log('網路環境:', JSON.stringify(networkState, null, 2));

    // 2. 檢查瀏覽器設定
    const browserState = await page.evaluate(() => {
        return {
            cookieEnabled: navigator.cookieEnabled,
            userAgent: navigator.userAgent,
            isSecureContext: window.isSecureContext,
            isHttps: window.location.protocol === 'https:',
            language: navigator.language,
            platform: navigator.platform
        };
    });
    console.log('瀏覽器狀態:', JSON.stringify(browserState, null, 2));

    // 3. 檢查 cookies 設定
    const cookieSettings = await page.evaluate(() => {
        return {
            documentCookie: document.cookie,
            cookieEnabled: navigator.cookieEnabled,
            isSecureContext: window.isSecureContext,
            isHttps: window.location.protocol === 'https:'
        };
    });
    console.log('Cookie 設定:', JSON.stringify(cookieSettings, null, 2));

    // 4. 檢查網站的 Cookie 政策
    const cookiePolicy = await page.evaluate(() => {
        return {
            hasCookiePolicy: !!document.querySelector('[class*="cookie-policy"], [class*="cookie-notice"]'),
            hasCookieConsent: !!document.querySelector('[class*="cookie-consent"], [class*="cookie-accept"]'),
            cookieScripts: Array.from(document.querySelectorAll('script')).filter(script => 
                script.textContent.includes('cookie') || 
                script.textContent.includes('Cookie')
            ).length
        };
    });
    console.log('Cookie 政策:', JSON.stringify(cookiePolicy, null, 2));

    // 5. 檢查登入表單狀態
    const formState = await page.evaluate(() => {
        const form = document.querySelector('form');
        return {
            exists: !!form,
            action: form?.action,
            method: form?.method,
            inputs: Array.from(document.querySelectorAll('input')).map(input => ({
                type: input.type,
                name: input.name,
                id: input.id,
                value: input.value,
                required: input.required
            }))
        };
    });
    console.log('登入表單狀態:', JSON.stringify(formState, null, 2));

    // 6. 檢查 Local Storage 和 Session Storage
    const storageState = await page.evaluate(() => {
        return {
            localStorage: Object.keys(localStorage).reduce((acc, key) => {
                acc[key] = localStorage.getItem(key);
                return acc;
            }, {}),
            sessionStorage: Object.keys(sessionStorage).reduce((acc, key) => {
                acc[key] = sessionStorage.getItem(key);
                return acc;
            }, {})
        };
    });
    console.log('儲存狀態:', JSON.stringify(storageState, null, 2));

    // 7. 檢查頁面中的 JavaScript 變數
    const jsVariables = await page.evaluate(() => {
        return {
            windowKeys: Object.keys(window).filter(key => 
                key.includes('token') || 
                key.includes('auth') || 
                key.includes('user') || 
                key.includes('session')
            ),
            hasAuthObject: !!window.auth,
            hasUserObject: !!window.user,
            hasSessionObject: !!window.session
        };
    });
    console.log('JavaScript 變數:', JSON.stringify(jsVariables, null, 2));

    // 8. 檢查頁面中的隱藏欄位
    const hiddenFields = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="hidden"]')).map(input => ({
            name: input.name,
            id: input.id,
            value: input.value
        }));
    });
    console.log('隱藏欄位:', JSON.stringify(hiddenFields, null, 2));

    // 9. 檢查頁面內容
    const pageContent = await page.content();
    console.log('頁面內容 (前500字元):', pageContent.substring(0, 500) + '...');

    // 10. 檢查頁面中的 JavaScript
    const pageScripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script')).map(script => ({
            src: script.src,
            type: script.type,
            content: script.textContent.substring(0, 100) + '...'
        }));
    });
    console.log('頁面中的 JavaScript:', JSON.stringify(pageScripts, null, 2));

    console.log('=== 環境檢查結束 ===');
}

async function waitForDialog(page, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            log(`嘗試等待對話框 (第 ${i + 1} 次)...`, 'info', true);
            
            // 等待頁面加載完成
            await page.waitForFunction(() => {
                return document.readyState === 'complete';
            }, { timeout: 30000 });
            
            // 檢查多個可能的選擇器
            const selectors = [
                '.dialog-button',
                '.dialog .button',
                '.dialog-button.button',
                'button:contains("我知道了")',
                '[class*="dialog"] button',
                '[class*="modal"] button',
                '.dialog-content button',
                '.modal-content button',
                'button.button-fill',
                'button.button',
                'button[type="button"]',
                'button:not([disabled])'
            ];
            
            // 先檢查頁面內容
            const pageContent = await page.content();
            log('頁面內容檢查: ' + pageContent.substring(0, 500), 'info', true);
            
            // 嘗試點擊所有可能的按鈕
            for (const selector of selectors) {
                try {
                    log(`嘗試選擇器: ${selector}`, 'info', true);
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        log(`找到 ${elements.length} 個按鈕: ${selector}`, 'info', true);
                        for (const element of elements) {
                            try {
                                const isVisible = await element.isVisible();
                                if (isVisible) {
                                    log(`點擊可見按鈕: ${selector}`, 'info', true);
                                    await element.click();
                                    return true;
                                }
                            } catch (e) {
                                log(`點擊按鈕失敗: ${e.message}`, 'info', true);
                            }
                        }
                    }
                } catch (e) {
                    log(`選擇器 ${selector} 未找到`, 'info', true);
                }
            }
            
            // 如果沒有找到按鈕，等待一段時間後重試
            log('等待 10 秒後重試...', 'info', true);
            await delay(10000);
            
        } catch (error) {
            log(`第 ${i + 1} 次等待對話框失敗: ${error.message}`, 'error', true);
            if (i < maxRetries - 1) {
                log('等待 10 秒後重試...', 'info', true);
                await delay(10000);
            }
        }
    }
    return false;
}

// 添加記憶體管理
const MEMORY_LIMIT = 512 * 1024 * 1024; // 512MB
let lastMemoryCheck = Date.now();

function checkMemoryUsage() {
    const now = Date.now();
    if (now - lastMemoryCheck > 60000) { // 每分鐘檢查一次
        const used = process.memoryUsage();
        log(`記憶體使用情況: ${Math.round(used.heapUsed / 1024 / 1024)}MB`, 'info', true);
        
        if (used.heapUsed > MEMORY_LIMIT) {
            log('記憶體使用過高，準備重啟...', 'warn', true);
            process.exit(1);
        }
        lastMemoryCheck = now;
    }
}

// 添加全局錯誤處理
process.on('uncaughtException', (error) => {
    log(`未捕獲的異常: ${error.message}`, 'error', true);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`未處理的 Promise 拒絕: ${reason}`, 'error', true);
    process.exit(1);
});

// 添加優雅退出處理
process.on('SIGTERM', async () => {
    log('收到 SIGTERM 信號，準備優雅退出...', 'info', true);
    try {
        if (global.browser) {
            await global.browser.close();
        }
    } catch (error) {
        log(`關閉瀏覽器時發生錯誤: ${error.message}`, 'error', true);
    }
    process.exit(0);
});

async function bookCar() {
    let browser;
    try {
        // 定期檢查記憶體使用
        const memoryCheckInterval = setInterval(checkMemoryUsage, 60000);
        
        log('=== 開始執行預約任務 ===', 'info', true);
        log('環境變數檢查:');
        log(`- ID_NUMBER: ${process.env.ID_NUMBER ? '已設置' : '未設置'}`);
        log(`- CAR_BOOKING_PASSWORD: ${process.env.CAR_BOOKING_PASSWORD ? '已設置' : '未設置'}`);
        log(`- PICKUP_LOCATION: ${process.env.PICKUP_LOCATION ? '已設置' : '未設置'}`);
        log(`- DROP_OFF_ADDRESS: ${process.env.DROP_OFF_ADDRESS ? '已設置' : '未設置'}`);
        
        log('啟動瀏覽器...', 'info', true);
        browser = await puppeteer.launch({
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
                '--disable-site-isolation-trials'
            ],
            ignoreHTTPSErrors: true,
            defaultViewport: {
                width: 1920,
                height: 1080
            },
            timeout: 120000
        });
        log('瀏覽器啟動成功', 'info', true);

        try {
            log('開啟新頁面...');
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
              // 設定基本環境
              const env = {
                language: 'zh-TW',
                timeZone: 'Asia/Taipei',
                screenWidth: 1920,
                screenHeight: 1080
              };

              // 設定時區
              if (!Intl._original_DateTimeFormat) {
                Intl._original_DateTimeFormat = Intl.DateTimeFormat;
              }
              Intl.DateTimeFormat = function(...args) {
                if (args.length === 0) {
                  args = [undefined, { timeZone: env.timeZone }];
                }
                return new Intl._original_DateTimeFormat(...args);
              };

              // 設定語言
              Object.defineProperty(navigator, 'language', { get: () => env.language });
              Object.defineProperty(navigator, 'languages', { get: () => [env.language, 'zh'] });

              // 設定螢幕大小
              Object.defineProperty(window.screen, 'width', { get: () => env.screenWidth });
              Object.defineProperty(window.screen, 'height', { get: () => env.screenHeight });
            });

            // 設置 Cookie 相關的設定
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            });

            // 啟用 Cookie
            const client = await page.target().createCDPSession();
            await client.send('Network.enable');
            await client.send('Network.setCookies', {
                cookies: [{
                    name: 'cookieconsent_status',
                    value: 'dismiss',
                    domain: '.ntpc.ltc-car.org',
                    path: '/'
                }]
            });

            // 監聽錯誤
            page.on('error', err => {
                log(`頁面錯誤: ${err.message}`, 'error', true);
            });
            page.on('pageerror', err => {
                log(`頁面 JavaScript 錯誤: ${err.message}`, 'error', true);
            });
            page.on('requestfailed', request => {
                log(`請求失敗: ${request.url()} ${request.failure().errorText}`, 'error', true);
            });

            // 啟用請求攔截
            await page.setRequestInterception(true);
            page.on('request', request => {
                // 只記錄登入相關的請求
                if (request.url().includes('login') || request.url().includes('auth')) {
                    log(`登入請求: ${request.method()} ${request.url()}`, 'info', true);
                }
                request.continue();
            });

            page.on('response', response => {
                // 只記錄錯誤回應和登入相關的回應
                if (response.status() >= 400 || 
                    response.url().includes('login') || 
                    response.url().includes('auth')) {
                    log(`回應: ${response.status()} ${response.url()}`, 'info', true);
                }
            });

            log('前往目標網頁...');
            await page.goto('https://www.ntpc.ltc-car.org/', {
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 60000
            });

            // 等待頁面完全加載
            await page.waitForFunction(() => {
                return document.readyState === 'complete';
            }, { timeout: 30000 });

            // 等待可能的初始加載動畫
            await delay(5000);

            // 登入前檢查
            log('=== 登入前檢查 ===');
            await debugLoginEnvironment(page);

            // 等待並點擊「我知道了」按鈕
            log('等待並點擊「我知道了」按鈕...');
            try {
              const dialogFound = await waitForDialog(page);
              if (!dialogFound) {
                log('未找到對話框，嘗試繼續執行...');
                // 嘗試直接點擊頁面中心
                await page.mouse.click(page.viewport().width / 2, page.viewport().height / 2);
              }
            } catch (error) {
              log('處理對話框時發生錯誤:', error.message);
              log('繼續執行...');
            }

            // 登入流程
            log('開始登入流程...');
            await page.type('input#IDNumber', ID_NUMBER);
            await page.type('input#password', PASSWORD);
            
            await page.click('a.button-fill');
            await delay(5000);  // 增加等待時間到 5 秒

            // 登入後檢查
            log('=== 登入後檢查 ===');
            await debugLoginEnvironment(page);

            // 等待登入成功對話框
            await page.waitForSelector('.dialog-button', { timeout: 10000 });
            await page.click('.dialog-button');
            await page.screenshot({ path: 'after_login_success.png', fullPage: true });

            // 登入後立即截圖並轉為 Base64
            const loginScreenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
            log('登入後畫面截圖（Base64）：');
            log(loginScreenshot);
            log('登入後 cookies：', await page.cookies());

            // 記錄當前 URL 和頁面標題
            const loginPageUrl = await page.url();
            const loginPageTitle = await page.title();
            log('登入後頁面資訊：', {
              url: loginPageUrl,
              title: loginPageTitle,
              html: await page.content()
            });

            // 點擊新增預約
            log('點擊新增預約按鈕...');
            try {
              await page.waitForSelector('a.link', { timeout: 10000 });
              const links = await page.$$('a.link');
              let found = false;
              for (const link of links) {
                const text = await page.evaluate(el => el.textContent.trim(), link);
                log('找到連結：', text);
                if (text === '新增預約') {
                  await link.click();
                  log('已點擊新增預約按鈕');
                  found = true;
                  break;
                }
              }
              if (!found) {
                throw new Error('找不到新增預約按鈕');
              }
              await delay(5000);  // 增加等待時間到 5 秒
              await page.screenshot({ path: 'after_click_new_booking.png', fullPage: true });
            } catch (e) {
              log('點擊新增預約按鈕時發生錯誤：', e);
              await page.screenshot({ path: 'error_click_new_booking.png', fullPage: true });
              throw e;
            }

            // 點擊「預約訂車」按鈕
            log('點擊預約訂車按鈕...');
            try {
              await page.waitForSelector('button.button-fill', { timeout: 10000 });
              const buttons = await page.$$('button.button-fill');
              for (const button of buttons) {
                const text = await page.evaluate(el => el.textContent.trim(), button);
                if (text === '預約訂車') {
                  await button.click();
                  log('已點擊預約訂車按鈕');
                  break;
                }
              }
              await delay(5000);  // 等待頁面載入
              await page.screenshot({ path: 'after_click_book_car.png', fullPage: true });
            } catch (e) {
              log('點擊預約訂車按鈕時發生錯誤：', e);
              await page.screenshot({ path: 'error_click_book_car.png', fullPage: true });
              throw e;
            }

            // 等待頁面完全載入
            log('等待頁面完全載入...');
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
              log('等待上車地點下拉選單超時，錯誤：', e);
              // 儲存當前 HTML 內容以便調試
              const html = await page.content();
              log('頁面 HTML：', html);
              await page.screenshot({ path: 'error_wait_location.png', fullPage: true });
              throw e;
            }

            // 選擇上車地點（醫療院所）
            log('嘗試選擇上車地點...');
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
              
              await delay(1000);
              
              // 截圖確認選擇結果
              await page.screenshot({ path: 'after_location_select.png', fullPage: true });
              
              // 確認是否選擇成功
              const selectedValue = await page.evaluate(() => {
                const select = document.querySelector('select#pickUp_location');
                return select ? select.value : null;
              });
              log('選擇的上車地點值:', selectedValue);
              
            } catch (e) {
              log('選擇上車地點時發生錯誤：', e);
              await page.screenshot({ path: 'error_location_select.png', fullPage: true });
              throw e;
            }

            // 填入上車地點詳細地址
            log('輸入上車地點詳細地址...');
            await page.type('input#pickUp_address_text', '亞東紀念醫院');
            await delay(2000);
            
            // 等待 Google Maps 自動完成結果出現
            log('等待 Google Maps 自動完成結果...');
            try {
              await page.waitForSelector('.pac-item', { timeout: 15000 });
              await page.screenshot({ path: 'before_select_google_result.png', fullPage: true });
              
              // 點擊第一個結果
              await page.click('.pac-item:first-child');
              await delay(2000);
              await page.screenshot({ path: 'after_select_google_result.png', fullPage: true });
            } catch (e) {
              log('等待 Google Maps 自動完成結果時發生錯誤：', e);
              await page.screenshot({ path: 'error_google_result.png', fullPage: true });
              throw e;
            }

            // 點擊別的地方，確認地址
            await page.click('.location:nth-child(1) > label');
            await delay(2000);
            await page.screenshot({ path: 'after_confirm_address.png', fullPage: true });

            // 選擇下車地點
            log('選擇下車地點...');
            await page.evaluate(() => {
              const select = document.querySelector('select#getOff_location');
              if (select) {
                select.value = '0';  // 設定為住家
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
            await delay(2000);
            await page.screenshot({ path: 'after_select_dropoff.png', fullPage: true });

            // 選擇下車地址
            log('選擇下車地址...');
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
            await delay(2000);
            await page.screenshot({ path: 'after_select_address.png', fullPage: true });

            // 選擇預約日期和時間
            log('選擇預約日期...');
            const selectedDate = await page.evaluate(() => {
              const select = document.querySelector('select#appointment_date');
              if (select) {
                const options = Array.from(select.options);
                const lastOption = options[options.length - 1];
                
                // 記錄所有日期選項的詳細資訊
                log('所有日期選項：', options.map(opt => ({
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
            log('選擇的預約日期：', selectedDate);
            await delay(2000);
            await page.screenshot({ path: 'after_select_date.png', fullPage: true });

            log('選擇預約時間...');
            const selectedTime = await page.evaluate(() => {
              const hourSelect = document.querySelector('select#appointment_hour');
              const minuteSelect = document.querySelector('select#appointment_minutes');
              let hour = '', minute = '';

              if (hourSelect) {
                // 記錄所有小時選項的詳細資訊
                log('所有小時選項：', Array.from(hourSelect.options).map(opt => ({
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
                log('所有分鐘選項：', Array.from(minuteSelect.options).map(opt => ({
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

            log('選擇的預約時間：', selectedTime);
            await delay(2000);
            await page.screenshot({ path: 'after_select_time.png', fullPage: true });

            // 選擇其他選項
            log('選擇其他選項...');
            await page.evaluate(() => {
              // 記錄所有選項的狀態
              const allSelects = document.querySelectorAll('select');
              log('所有下拉選單狀態：', Array.from(allSelects).map(select => ({
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
            await delay(2000);
            await page.screenshot({ path: 'after_select_options.png', fullPage: true });

            // 在送出按鈕之前收集所有資訊
            log('=== 系統資訊 ===');
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

            log('系統偵錯資訊：', JSON.stringify(debugInfo, null, 2));
            log('=== 系統資訊結束 ===');

            // 改進按鈕選擇邏輯，使用更輕量的方式
            log('等待送出按鈕出現...');
            const buttonInfo = await page.evaluate(() => {
              const findButton = () => {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                  if (btn.textContent.includes('送出預約') || 
                      btn.textContent.includes('送出') ||
                      btn.className.includes('button-fill')) {
                    return {
                      found: true,
                      text: btn.textContent,
                      class: btn.className,
                      type: btn.type,
                      disabled: btn.disabled
                    };
                  }
                }
                return { found: false };
              };

              const result = findButton();
              log('按鈕狀態：', result);
              return result;
            });

            if (!buttonInfo.found) {
              throw new Error('找不到送出按鈕');
            }

            // 點擊送出按鈕
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const btn of buttons) {
                if (btn.textContent.includes('送出預約') || 
                    btn.textContent.includes('送出') ||
                    btn.className.includes('button-fill')) {
                  btn.click();
                  return;
                }
              }
            });

            // 送出後 log 當前網址
            const currentUrl = await page.url();
            log('送出後當前網址：', currentUrl);

            log('已點擊送出預約按鈕');
            await delay(2000);  // 等待 2 秒

            // 等待浮動視窗出現，timeout 提升到 60 秒，並每 2 秒 log 一次狀態
            log('等待浮動視窗出現...');
            let foundDialog = null;
            const start = Date.now();
            while (Date.now() - start < 60000) { // 最多等 60 秒
              foundDialog = await page.evaluate(() => {
                const dialog = document.querySelector('.dialog') || 
                              document.querySelector('.el-message-box__wrapper') ||
                              document.querySelector('.el-message-box') ||
                              document.querySelector('.modal');
                if (dialog) {
                  return {
                    className: dialog.className,
                    textContent: dialog.textContent,
                    style: window.getComputedStyle(dialog)
                  };
                }
                return null;
              });
              if (foundDialog) {
                log('偵測到浮動視窗：', foundDialog);
                break;
              } else {
                const allDialogs = await page.evaluate(() => {
                  return Array.from(document.querySelectorAll('.dialog, .el-message-box__wrapper, .el-message-box, .modal')).map(d => ({
                    className: d.className,
                    textContent: d.textContent
                  }));
                });
                log('目前頁面所有 dialog/modal 元素：', allDialogs);
              }
              await delay(2000);
            }
            if (!foundDialog) {
              throw new Error('60 秒內未偵測到浮動視窗');
            }

            // 檢查預約結果
            log('檢查預約結果...');
            const bookingInfo = {
              '日期': selectedDate.text,
              '時間': `${selectedTime.hour}:${selectedTime.minute}`,
              '執行環境': process.env.NODE_ENV || 'development',
              '時間戳記': new Date().toISOString()
            };
            log('預約資訊：', bookingInfo);

            // 等待並檢查浮動視窗內容
            let success = false;
            let attempts = 0;
            const maxAttempts = 5;

            while (!success && attempts < maxAttempts) {
              attempts++;
              log(`第 ${attempts} 次檢查...`);
              
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
                log('浮動視窗內容：', dialogResult);
                
                // 檢查成功訊息（考慮不同環境的文字格式）
                if (dialogResult.message.includes('已完成預約') || 
                    dialogResult.message.includes('預約成功') ||
                    dialogResult.message.includes('預約完成')) {
                  log(`在 ${dialogResult.selector} 中找到成功訊息`);
                  success = true;
                  
                  // 記錄成功資訊
                  const successInfo = {
                    '成功訊息': dialogResult.message,
                    '日期': selectedDate.text,
                    '時間': `${selectedTime.hour}:${selectedTime.minute}`,
                    '執行環境': process.env.NODE_ENV || 'development',
                    '時間戳記': new Date().toISOString()
                  };
                  log('預約成功資訊：', successInfo);
                  
                  // 等待頁面更新完成
                  await delay(5000);
                  
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
                  log(`在 ${dialogResult.selector} 中找到錯誤訊息`);
                  
                  // 記錄失敗資訊
                  const errorInfo = {
                    '錯誤訊息': dialogResult.message,
                    '日期': selectedDate.text,
                    '時間': `${selectedTime.hour}:${selectedTime.minute}`,
                    '執行環境': process.env.NODE_ENV || 'development',
                    '時間戳記': new Date().toISOString()
                  };
                  log('預約失敗資訊：', errorInfo);
                  
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
                await delay(2000);
              }
            }
        } catch (error) {
            handleError(error, 'bookCar');
            throw error;
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (error) {
                    log(`關閉瀏覽器時發生錯誤: ${error.message}`, 'error', true);
                }
            }
            // 在函數結束時清理
            clearInterval(memoryCheckInterval);
        }
    } catch (error) {
        log(`預約過程發生錯誤: ${error.message}`, 'error', true);
        throw error;
    }
}

// 主程式
async function main() {
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    while (retryCount < MAX_RETRIES) {
        try {
            log('=== 開始執行預約任務 ===', 'info', true);
            await bookCar();
            break;
        } catch (error) {
            retryCount++;
            log(`執行失敗 (第 ${retryCount} 次): ${error.message}`, 'error', true);
            
            if (retryCount < MAX_RETRIES) {
                const waitTime = Math.min(1000 * Math.pow(2, retryCount), 30000);
                log(`等待 ${waitTime/1000} 秒後重試...`, 'info', true);
                await delay(waitTime);
            } else {
                log('達到最大重試次數，程式終止', 'error', true);
                process.exit(1);
            }
        }
    }
}

// 啟動程式
main().catch(error => {
    log(`程式執行失敗: ${error.message}`, 'error', true);
    process.exit(1);
}); 