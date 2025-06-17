const puppeteer = require('puppeteer');

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

async function main() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // 啟用請求攔截
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.url().includes('login') || request.url().includes('auth')) {
                console.log('登入請求:', {
                    url: request.url(),
                    method: request.method(),
                    headers: request.headers(),
                    postData: request.postData()
                });
            }
            request.continue();
        });

        page.on('response', response => {
            if (response.url().includes('login') || response.url().includes('auth')) {
                console.log('登入回應:', {
                    url: response.url(),
                    status: response.status(),
                    headers: response.headers()
                });
            }
        });

        // 訪問網站
        console.log('正在訪問網站...');
        await page.goto('https://www.ntpc.ltc-car.org/', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // 登入前檢查
        console.log('=== 登入前檢查 ===');
        await debugLoginEnvironment(page);

        // 等待並點擊「我知道了」按鈕
        try {
            await page.waitForSelector('.dialog-button', { timeout: 5000 });
            await page.click('.dialog-button');
        } catch (error) {
            console.log('找不到「我知道了」按鈕，繼續執行...');
        }

        // 輸入登入資訊
        await page.type('input#IDNumber', process.env.ID_NUMBER);
        await page.type('input#password', process.env.PASSWORD);
        await page.click('a.button-fill');

        // 等待可能的回應
        await page.waitForTimeout(5000);

        // 登入後檢查
        console.log('=== 登入後檢查 ===');
        await debugLoginEnvironment(page);

    } catch (error) {
        console.error('發生錯誤：', error);
    } finally {
        await browser.close();
    }
}

main().catch(console.error); 