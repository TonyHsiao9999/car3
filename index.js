const puppeteer = require('puppeteer');
const chromium = require('chrome-aws-lambda');
const cron = require('node-cron');

// 載入環境變數
require('dotenv').config();

// 檢查必要的環境變數
if (!process.env.CAR_BOOKING_ID || !process.env.CAR_BOOKING_PASSWORD) {
    console.error('錯誤：缺少必要的環境變數 CAR_BOOKING_ID 或 CAR_BOOKING_PASSWORD');
    process.exit(1);
}

// 將環境變數轉換為字串
const ID_NUMBER = String(process.env.CAR_BOOKING_ID);
const PASSWORD = String(process.env.CAR_BOOKING_PASSWORD);

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
            '--disable-blink-features=AutomationControlled'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });
    
    try {
        const page = await browser.newPage();
        
        // 注入地理位置模擬
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
        
        // 設定地理位置
        await page.setGeolocation({
            latitude: 25.0330,
            longitude: 121.5654
        });
        
        // 設定更寬鬆的內容安全策略
        await page.setBypassCSP(true);
        
        // 設定更長的超時時間
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(30000);
        
        // 監聽 console 訊息
        page.on('console', msg => console.log('頁面訊息:', msg.text()));
        
        // 監聽頁面錯誤
        page.on('pageerror', error => {
            console.log('頁面錯誤:', error.message);
        });
        
        // 前往網站
        console.log('正在開啟網頁...');
        await page.goto('https://www.ntpc.ltc-car.org', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        // 等待 Vue 應用程式載入
        console.log('等待 Vue 應用程式載入...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 直接點擊「我知道了」按鈕
        console.log('點擊「我知道了」按鈕...');
        try {
            await page.waitForSelector('span.dialog-button', { visible: true, timeout: 2000 });
            await page.evaluate(() => {
                const button = document.querySelector('span.dialog-button');
                if (button) {
                    button.scrollIntoView();
                    button.click();
                }
            });
            console.log('已點擊「我知道了」按鈕！');
        } catch (error) {
            console.log('找不到「我知道了」按鈕，繼續執行...');
        }
        
        // 等待頁面載入完成
        console.log('等待頁面載入完成...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 輸入身分證字號
        console.log('輸入身分證字號...');
        await page.waitForSelector('input#IDNumber');
        await page.type('input#IDNumber', process.env.CAR_BOOKING_ID, { delay: 100 });
        
        // 輸入密碼
        console.log('輸入密碼...');
        await page.waitForSelector('input#password');
        await page.type('input#password', process.env.CAR_BOOKING_PASSWORD, { delay: 100 });
        
        // 點擊登入按鈕
        console.log('點擊登入按鈕...');
        await page.waitForSelector('a.button-fill:nth-child(2)', { visible: true });
        await page.evaluate(() => {
            const button = document.querySelector('a.button-fill:nth-child(2)');
            if (button) {
                button.scrollIntoView();
                button.click();
            }
        });
        
        // 等待登入成功
        console.log('等待登入成功...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 點擊成功確認按鈕
        console.log('點擊成功確認按鈕...');
        try {
            await page.waitForSelector('span.dialog-button', { visible: true, timeout: 2000 });
            await page.evaluate(() => {
                const button = document.querySelector('span.dialog-button');
                if (button) {
                    button.scrollIntoView();
                    button.click();
                }
            });
            console.log('已點擊成功確認按鈕！');
        } catch (error) {
            console.log('找不到成功確認按鈕，繼續執行...');
        }
        
        // 等待頁面載入
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 點擊預約連結
        console.log('點擊預約連結...');
        try {
            await page.waitForSelector('a.link:nth-child(2)', { visible: true });
            await page.evaluate(() => {
                const link = document.querySelector('a.link:nth-child(2)');
                if (link) {
                    link.scrollIntoView();
                    link.click();
                }
            });
            console.log('已點擊預約連結！');
        } catch (error) {
            console.log('找不到預約連結，嘗試其他方式...');
            // 嘗試點擊其他可能的預約連結
            const bookingSelectors = [
                'a[href*="booking"]',
                'a:contains("預約")',
                'a:contains("訂車")',
                'a:contains("叫車")'
            ];
            
            for (const selector of bookingSelectors) {
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 2000 });
                    await page.evaluate((sel) => {
                        const link = document.querySelector(sel);
                        if (link) {
                            link.scrollIntoView();
                            link.click();
                        }
                    }, selector);
                    console.log(`已點擊預約連結 (${selector})！`);
                    break;
                } catch (error) {
                    console.log(`無法點擊 ${selector}，嘗試下一個...`);
                }
            }
        }
        
        // 等待預約頁面載入
        console.log('等待預約頁面載入...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 選擇上車地點
        console.log('等待上車地點選擇器...');
        await page.waitForSelector('select#pickUp_location', { timeout: 60000 });
        console.log('找到上車地點選擇器！');
        
        // 等待一下確保下拉選單已完全載入
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 選擇「醫療院所」選項
        try {
            await page.evaluate(() => {
                const select = document.querySelector('select#pickUp_location');
                if (select) {
                    // 先展開下拉選單
                    select.click();
                    
                    // 等待一下讓選項出現
                    setTimeout(() => {
                        // 選擇「醫療院所」選項（index 2）
                        select.selectedIndex = 2;
                        
                        // 觸發 change 事件
                        const event = new Event('change', { bubbles: true });
                        select.dispatchEvent(event);
                        
                        // 觸發 input 事件
                        const inputEvent = new Event('input', { bubbles: true });
                        select.dispatchEvent(inputEvent);
                    }, 500);
                } else {
                    console.error('找不到上車地點選擇器');
                }
            });
            
            // 等待一下讓選擇生效
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 確認選擇是否成功
            const selectedValue = await page.evaluate(() => {
                const select = document.querySelector('select#pickUp_location');
                return select ? select.value : null;
            });
            console.log('選擇的上車地點值：', selectedValue);
            
            // 等待地址輸入框出現
            console.log('等待地址輸入框出現...');
            await page.waitForSelector('input#pickUp_address_text', { visible: true, timeout: 60000 });
            console.log('找到地址輸入框！');
            
            // 輸入上車地址
            await page.evaluate(() => {
                const input = document.querySelector('input#pickUp_address_text');
                if (input) {
                    input.value = '亞東紀念醫院';
                    // 觸發 input 事件
                    const event = new Event('input', { bubbles: true });
                    input.dispatchEvent(event);
                } else {
                    console.error('找不到地址輸入框');
                }
            });
            
            // 等待一下讓地址輸入生效
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 點擊地址輸入框
            await page.evaluate(() => {
                const input = document.querySelector('input#pickUp_address_text');
                if (input) {
                    input.focus();
                    input.click();
                } else {
                    console.error('找不到地址輸入框');
                }
            });
            
            // 等待 Google 自動完成框出現
            console.log('等待 Google 自動完成框出現...');
            await page.waitForSelector('.pac-container', { visible: true, timeout: 10000 }).catch(() => {
                console.log('未找到 Google 自動完成框，繼續執行...');
            });
            
            // 等待一下確保自動完成選項已載入
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 按下向下鍵選擇第一個選項
            await page.keyboard.press('ArrowDown');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.keyboard.press('Enter');
            
            // 等待一下讓選擇生效
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 點擊其他地方以確認選擇
            await page.evaluate(() => {
                const label = document.querySelector('.location:nth-child(1) > label');
                if (label) {
                    label.scrollIntoView();
                    label.click();
                } else {
                    console.error('找不到地址選項');
                }
            });
            
        } catch (error) {
            console.error('選擇上車地點時發生錯誤：', error);
            throw error;
        }
        
        // 選擇下車地點
        await page.waitForSelector('select#getOff_location');
        await page.select('select#getOff_location', '0');
        
        // 選擇下車地址
        await page.waitForSelector('select#getOff_address');
        await page.select('select#getOff_address', '新北市板橋區中正路1巷18號');
        
        // 選擇預約日期
        console.log('等待日期選擇器...');
        await page.waitForSelector('select#appointment_date', { timeout: 60000 });
        console.log('找到日期選擇器！');
        
        // 等待一下確保下拉選單已完全載入
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 選擇最後一個日期選項
        await page.evaluate(() => {
            const select = document.querySelector('select#appointment_date');
            if (select) {
                // 選擇最後一個選項
                select.selectedIndex = select.options.length - 1;
                
                // 觸發 change 事件
                const event = new Event('change', { bubbles: true });
                select.dispatchEvent(event);
            } else {
                console.error('找不到日期選擇器');
            }
        });
        
        // 等待一下讓選擇生效
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 選擇預約時間（16:40）
        console.log('等待時間選擇器...');
        await page.waitForSelector('select#appointment_hour', { timeout: 60000 });
        await page.waitForSelector('select#appointment_minutes', { timeout: 60000 });
        console.log('找到時間選擇器！');
        
        // 選擇小時（16）
        await page.evaluate(() => {
            const select = document.querySelector('select#appointment_hour');
            if (select) {
                select.value = '16';
                const event = new Event('change', { bubbles: true });
                select.dispatchEvent(event);
            } else {
                console.error('找不到小時選擇器');
            }
        });
        
        // 選擇分鐘（40）
        await page.evaluate(() => {
            const select = document.querySelector('select#appointment_minutes');
            if (select) {
                select.value = '40';
                const event = new Event('change', { bubbles: true });
                select.dispatchEvent(event);
            } else {
                console.error('找不到分鐘選擇器');
            }
        });
        
        // 等待一下讓選擇生效
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 不同意30分鐘
        await page.waitForSelector('.form_item:nth-child(6) .cus_checkbox_type1:nth-child(2) > div', { visible: true });
        await page.evaluate(() => {
            const checkbox = document.querySelector('.form_item:nth-child(6) .cus_checkbox_type1:nth-child(2) > div');
            if (checkbox) {
                checkbox.scrollIntoView();
                checkbox.click();
            }
        });
        
        // 選擇陪同人數
        await page.select('.inner > #accompany_label', '1');
        
        // 選擇不共乘
        await page.waitForSelector('.form_item:nth-child(10) .cus_checkbox_type1:nth-child(2) > div', { visible: true });
        await page.evaluate(() => {
            const checkbox = document.querySelector('.form_item:nth-child(10) .cus_checkbox_type1:nth-child(2) > div');
            if (checkbox) {
                checkbox.scrollIntoView();
                checkbox.click();
            }
        });
        
        // 選擇搭輪椅上車
        await page.waitForSelector('.form_item:nth-child(11) .cus_checkbox_type1:nth-child(1) > div', { visible: true });
        await page.evaluate(() => {
            const checkbox = document.querySelector('.form_item:nth-child(11) .cus_checkbox_type1:nth-child(1) > div');
            if (checkbox) {
                checkbox.scrollIntoView();
                checkbox.click();
            }
        });
        
        // 選擇不是大型輪椅
        await page.waitForSelector('.form_item:nth-child(12) .cus_checkbox_type1:nth-child(2) > div', { visible: true });
        await page.evaluate(() => {
            const checkbox = document.querySelector('.form_item:nth-child(12) .cus_checkbox_type1:nth-child(2) > div');
            if (checkbox) {
                checkbox.scrollIntoView();
                checkbox.click();
            }
        });
        
        // 點擊確認預約資訊
        await page.waitForSelector('.page_bottom > .button', { visible: true });
        await page.evaluate(() => {
            const button = document.querySelector('.page_bottom > .button');
            if (button) {
                button.scrollIntoView();
                button.click();
            }
        });
        
        // 點擊送出預約
        await page.waitForSelector('button.button-fill:nth-child(2)', { visible: true });
        await page.evaluate(() => {
            const button = document.querySelector('button.button-fill:nth-child(2)');
            if (button) {
                button.scrollIntoView();
                button.click();
            }
        });
        
    } catch (error) {
        console.error('執行過程中發生錯誤：', error);
        throw error;
    } finally {
        // 不要關閉瀏覽器，讓使用者可以看到結果
        // await browser.close();
    }
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