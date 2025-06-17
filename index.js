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

        // 自動點擊「我知道了」按鈕
        console.log('嘗試自動點擊「我知道了」按鈕...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('a.button.button-fill.button-large.color_deep_main'));
            const knowBtn = btns.find(btn => btn.textContent.trim() === '我知道了');
            if (knowBtn) knowBtn.click();
        });
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 直接填入登入表單
        console.log('填入登入表單...');
        await page.type('input[name="IDNumber"]', ID_NUMBER);
        await page.type('input[name="password"]', PASSWORD);

        // 點擊表單內的「民眾登入」按鈕
        console.log('點擊表單內的「民眾登入」按鈕...');
        await page.evaluate(() => {
            const btn = document.querySelector('a.button.button-fill.button-large.color_deep_main');
            if (btn && btn.textContent.trim() === '民眾登入') btn.click();
        });
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 等待頁面載入完成
        console.log('等待頁面載入完成...');
        await page.waitForTimeout(5000);

        // 檢查是否在預約頁面
        let isBookingPage = await page.evaluate(() => {
            return document.querySelector('#pickUp_location') !== null ||
                   document.querySelector('select[name="pickUp_location"]') !== null ||
                   document.querySelector('input[name="pickUp_location"]') !== null;
        });

        if (!isBookingPage) {
            console.log('不在預約頁面，嘗試點擊民眾登入按鈕...');
            
            // 等待按鈕出現並可點擊
            await page.waitForSelector('a.link.panel-close.user_login', {
                visible: true,
                timeout: 5000
            }).catch(() => console.log('等待民眾登入按鈕超時'));
            
            // 確保按鈕可見且可點擊
            const isButtonClickable = await page.evaluate(() => {
                const button = document.querySelector('a.link.panel-close.user_login');
                if (!button) return false;
                
                const style = window.getComputedStyle(button);
                return style.display !== 'none' && 
                       style.visibility !== 'hidden' && 
                       style.opacity !== '0' &&
                       !button.disabled;
            });
            
            if (isButtonClickable) {
                // 使用 JavaScript 點擊按鈕
                await page.evaluate(() => {
                    const button = document.querySelector('a.link.panel-close.user_login');
                    if (button) button.click();
                });
                console.log('已點擊民眾登入按鈕！');
                
                // 等待頁面導航完成
                await page.waitForNavigation({ 
                    waitUntil: 'networkidle0',
                    timeout: 30000 
                }).catch(() => console.log('等待頁面導航超時，繼續執行...'));
                
                // 等待一段時間讓頁面完全載入
                await page.waitForTimeout(5000);
                
                // 等待並輸入帳號密碼
                console.log('等待帳號密碼輸入框出現...');
                await page.waitForSelector('input[name="IDNumber"]', {
                    visible: true,
                    timeout: 5000
                }).catch(() => console.log('等待帳號輸入框超時'));
                
                await page.waitForSelector('input[name="password"]', {
                    visible: true,
                    timeout: 5000
                }).catch(() => console.log('等待密碼輸入框超時'));
                
                // 輸入帳號密碼
                await page.type('input[name="IDNumber"]', ID_NUMBER);
                await page.type('input[name="password"]', PASSWORD);
                console.log('已輸入帳號密碼！');
                
                // 等待並點擊確認按鈕
                console.log('等待確認按鈕出現...');
                await page.waitForSelector('a.button-fill.button-large.color_deep_main', {
                    visible: true,
                    timeout: 5000
                }).catch(() => console.log('等待確認按鈕超時'));
                
                // 確保確認按鈕可見且可點擊
                const isConfirmButtonClickable = await page.evaluate(() => {
                    const button = document.querySelector('a.button-fill.button-large.color_deep_main');
                    if (!button) return false;
                    
                    const style = window.getComputedStyle(button);
                    return style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0' &&
                           !button.disabled;
                });
                
                if (isConfirmButtonClickable) {
                    // 使用 JavaScript 點擊確認按鈕
                    await page.evaluate(() => {
                        const button = document.querySelector('a.button-fill.button-large.color_deep_main');
                        if (button) button.click();
                    });
                    console.log('已點擊確認按鈕！');
                    
                    // 等待頁面導航完成
                    await page.waitForNavigation({ 
                        waitUntil: 'networkidle0',
                        timeout: 30000 
                    }).catch(() => console.log('等待頁面導航超時，繼續執行...'));
                    
                    // 等待一段時間讓頁面完全載入
                    await page.waitForTimeout(5000);
                    
                    // 再次檢查是否在預約頁面
                    isBookingPage = await page.evaluate(() => {
                        return document.querySelector('#pickUp_location') !== null ||
                               document.querySelector('select[name="pickUp_location"]') !== null ||
                               document.querySelector('input[name="pickUp_location"]') !== null;
                    });
                    
                    if (isBookingPage) {
                        console.log('成功進入預約頁面！');
                        return;
                    }
                } else {
                    console.log('確認按鈕不可點擊');
                }
            } else {
                console.log('民眾登入按鈕不可點擊');
            }
        }

        // 點擊預約連結
        console.log('點擊預約連結...');
        await retry(async () => {
            // 先列出所有連結
            const links = await page.$$('a');
            console.log('找到連結數量：', links.length);
            
            for (const link of links) {
                const text = await page.evaluate(el => el.textContent.trim(), link);
                const href = await page.evaluate(el => el.href, link);
                const className = await page.evaluate(el => el.className, link);
                console.log('連結文字：', text);
                console.log('連結 href：', href);
                console.log('連結 class：', className);
            }

            // 使用 JavaScript 尋找包含特定文字的連結
            const bookingLink = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const keywords = ['預約', '訂車', '叫車', '預約叫車', '預約訂車'];
                
                // 先嘗試找完全匹配的
                for (const link of links) {
                    const text = link.textContent.trim();
                    if (keywords.some(keyword => text === keyword)) {
                        return { found: true, text };
                    }
                }
                
                // 再嘗試找包含關鍵字的
                for (const link of links) {
                    const text = link.textContent.trim();
                    if (keywords.some(keyword => text.includes(keyword))) {
                        return { found: true, text };
                    }
                }
                
                return { found: false };
            });

            if (bookingLink.found) {
                console.log('找到預約連結，文字：', bookingLink.text);
                
                // 使用 XPath 找到對應的連結
                const xpath = `//a[contains(text(), '${bookingLink.text}')]`;
                const [link] = await page.$x(xpath);
                
                if (link) {
                    await link.click();
                    console.log('已點擊預約連結！');
                    return;
                }
            }

            // 如果上述方法都失敗，嘗試直接點擊第一個按鈕
            console.log('嘗試點擊第一個按鈕...');
            const firstButton = await page.$('a.button-fill.button-large.color_deep_main');
            if (firstButton) {
                await firstButton.click();
                console.log('已點擊第一個按鈕！');
                
                // 等待頁面導航完成
                await page.waitForNavigation({ 
                    waitUntil: 'networkidle0',
                    timeout: 30000 
                }).catch(() => console.log('等待頁面導航超時，繼續執行...'));
                
                // 等待一段時間讓頁面完全載入
                await page.waitForTimeout(5000);
                
                // 檢查是否在預約頁面
                isBookingPage = await page.evaluate(() => {
                    return document.querySelector('#pickUp_location') !== null ||
                           document.querySelector('select[name="pickUp_location"]') !== null ||
                           document.querySelector('input[name="pickUp_location"]') !== null;
                });
                
                if (!isBookingPage) {
                    console.log('不在預約頁面，嘗試點擊民眾登入按鈕...');
                    
                    // 等待按鈕出現並可點擊
                    await page.waitForSelector('a.link.panel-close.user_login', {
                        visible: true,
                        timeout: 5000
                    }).catch(() => console.log('等待民眾登入按鈕超時'));
                    
                    // 確保按鈕可見且可點擊
                    const isButtonClickable = await page.evaluate(() => {
                        const button = document.querySelector('a.link.panel-close.user_login');
                        if (!button) return false;
                        
                        const style = window.getComputedStyle(button);
                        return style.display !== 'none' && 
                               style.visibility !== 'hidden' && 
                               style.opacity !== '0' &&
                               !button.disabled;
                    });
                    
                    if (isButtonClickable) {
                        // 使用 JavaScript 點擊按鈕
                        await page.evaluate(() => {
                            const button = document.querySelector('a.link.panel-close.user_login');
                            if (button) button.click();
                        });
                        console.log('已點擊民眾登入按鈕！');
                        
                        // 等待頁面導航完成
                        await page.waitForNavigation({ 
                            waitUntil: 'networkidle0',
                            timeout: 30000 
                        }).catch(() => console.log('等待頁面導航超時，繼續執行...'));
                        
                        // 等待一段時間讓頁面完全載入
                        await page.waitForTimeout(5000);
                        
                        // 等待並輸入帳號密碼
                        console.log('等待帳號密碼輸入框出現...');
                        await page.waitForSelector('input[name="IDNumber"]', {
                            visible: true,
                            timeout: 5000
                        }).catch(() => console.log('等待帳號輸入框超時'));
                        
                        await page.waitForSelector('input[name="password"]', {
                            visible: true,
                            timeout: 5000
                        }).catch(() => console.log('等待密碼輸入框超時'));
                        
                        // 輸入帳號密碼
                        await page.type('input[name="IDNumber"]', ID_NUMBER);
                        await page.type('input[name="password"]', PASSWORD);
                        console.log('已輸入帳號密碼！');
                        
                        // 等待並點擊確認按鈕
                        console.log('等待確認按鈕出現...');
                        await page.waitForSelector('a.button-fill.button-large.color_deep_main', {
                            visible: true,
                            timeout: 5000
                        }).catch(() => console.log('等待確認按鈕超時'));
                        
                        // 確保確認按鈕可見且可點擊
                        const isConfirmButtonClickable = await page.evaluate(() => {
                            const button = document.querySelector('a.button-fill.button-large.color_deep_main');
                            if (!button) return false;
                            
                            const style = window.getComputedStyle(button);
                            return style.display !== 'none' && 
                                   style.visibility !== 'hidden' && 
                                   style.opacity !== '0' &&
                                   !button.disabled;
                        });
                        
                        if (isConfirmButtonClickable) {
                            // 使用 JavaScript 點擊確認按鈕
                            await page.evaluate(() => {
                                const button = document.querySelector('a.button-fill.button-large.color_deep_main');
                                if (button) button.click();
                            });
                            console.log('已點擊確認按鈕！');
                            
                            // 等待頁面導航完成
                            await page.waitForNavigation({ 
                                waitUntil: 'networkidle0',
                                timeout: 30000 
                            }).catch(() => console.log('等待頁面導航超時，繼續執行...'));
                            
                            // 等待一段時間讓頁面完全載入
                            await page.waitForTimeout(5000);
                            
                            // 再次檢查是否在預約頁面
                            isBookingPage = await page.evaluate(() => {
                                return document.querySelector('#pickUp_location') !== null ||
                                       document.querySelector('select[name="pickUp_location"]') !== null ||
                                       document.querySelector('input[name="pickUp_location"]') !== null;
                            });
                            
                            if (isBookingPage) {
                                console.log('成功進入預約頁面！');
                                return;
                            }
                        } else {
                            console.log('確認按鈕不可點擊');
                        }
                    } else {
                        console.log('民眾登入按鈕不可點擊');
                    }
                }
                
                return;
            }

            throw new Error('找不到預約連結');
        });

        // 等待預約頁面載入
        console.log('等待預約頁面載入...');
        await page.waitForTimeout(5000); // 先等待 5 秒
        
        // 檢查是否在預約頁面
        isBookingPage = await page.evaluate(() => {
            return document.querySelector('#pickUp_location') !== null ||
                   document.querySelector('select[name="pickUp_location"]') !== null ||
                   document.querySelector('input[name="pickUp_location"]') !== null;
        });
        
        if (!isBookingPage) {
            // 如果不在預約頁面，嘗試重新整理頁面
            console.log('不在預約頁面，嘗試重新整理頁面...');
            await page.reload({ waitUntil: 'networkidle0' });
            await page.waitForTimeout(5000);
            
            // 再次檢查是否在預約頁面
            isBookingPage = await page.evaluate(() => {
                return document.querySelector('#pickUp_location') !== null ||
                       document.querySelector('select[name="pickUp_location"]') !== null ||
                       document.querySelector('input[name="pickUp_location"]') !== null;
            });
            
            if (!isBookingPage) {
                throw new Error('無法進入預約頁面');
            }
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