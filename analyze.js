const puppeteer = require('puppeteer');

async function analyzeLogin() {
    const browser = await puppeteer.launch({
        headless: false,  // 設為 false 以便觀察
        defaultViewport: null,
        args: ['--start-maximized']
    });

    try {
        const page = await browser.newPage();
        
        // 啟用請求攔截
        await page.setRequestInterception(true);
        page.on('request', request => {
            console.log('請求:', request.method(), request.url());
            request.continue();
        });
        
        page.on('response', response => {
            console.log('回應:', response.status(), response.url());
        });
        
        // 監聽 console 訊息
        page.on('console', msg => console.log('頁面訊息:', msg.text()));
        
        // 訪問網站
        console.log('正在訪問網站...');
        await page.goto('https://www.ntpc.ltc-car.org/', { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        // 等待並點擊「我知道了」按鈕
        console.log('等待「我知道了」按鈕...');
        await page.waitForSelector('a.button-fill.button-large.color_deep_main', { visible: true });
        await page.click('a.button-fill.button-large.color_deep_main');
        
        // 等待登入表單出現
        console.log('等待登入表單...');
        await page.waitForSelector('input[name="IDNumber"]', { visible: true });
        
        // 分析登入表單
        const formElements = await page.evaluate(() => {
            const elements = document.querySelectorAll('input, select, textarea');
            return Array.from(elements).map(el => ({
                type: el.type,
                name: el.name,
                id: el.id,
                class: el.className,
                placeholder: el.placeholder,
                isVisible: el.offsetParent !== null
            }));
        });
        
        console.log('登入表單元素:', JSON.stringify(formElements, null, 2));
        
        // 輸入登入資訊
        console.log('輸入登入資訊...');
        await page.type('input[name="IDNumber"]', 'A102574899');
        await page.type('input[name="password"]', 'visi319VISI');
        
        // 分析登入按鈕
        const loginButton = await page.evaluate(() => {
            const btn = document.querySelector('a.button-fill.button-large.color_deep_main');
            return {
                exists: !!btn,
                text: btn ? btn.textContent : null,
                disabled: btn ? btn.disabled : null,
                visible: btn ? btn.offsetParent !== null : null,
                classes: btn ? btn.className : null
            };
        });
        
        console.log('登入按鈕狀態:', JSON.stringify(loginButton, null, 2));
        
        // 點擊登入按鈕
        console.log('點擊登入按鈕...');
        await page.click('a.button-fill.button-large.color_deep_main');
        
        // 等待可能的回應
        console.log('等待登入回應...');
        await page.waitForTimeout(5000);
        
        // 分析頁面狀態
        const pageState = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                hasError: !!document.querySelector('.error-message'),
                hasDialog: !!document.querySelector('.dialog'),
                dialogText: document.querySelector('.dialog-text')?.textContent,
                formExists: !!document.querySelector('input[name="IDNumber"]')
            };
        });
        
        console.log('頁面狀態:', JSON.stringify(pageState, null, 2));
        
        // 等待使用者手動關閉
        console.log('分析完成，請手動關閉瀏覽器...');
        await new Promise(() => {});
        
    } catch (error) {
        console.error('分析過程中發生錯誤：', error);
    } finally {
        await browser.close();
    }
}

analyzeLogin(); 