const puppeteer = require('puppeteer');

async function analyzePage() {
    console.log('開始分析網頁...');
    
    const browser = await puppeteer.launch({
        headless: false,
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
        console.log('正在開啟網頁...');
        const page = await browser.newPage();
        
        // 設置視窗大小
        await page.setViewport({
            width: 1920,
            height: 1080
        });

        // 監聽控制台訊息
        page.on('console', msg => console.log('頁面訊息:', msg.text()));
        page.on('pageerror', err => console.log('頁面錯誤:', err.message));
        page.on('requestfailed', request => console.log('請求失敗:', request.url()));

        // 設置更長的超時時間
        page.setDefaultNavigationTimeout(120000);
        page.setDefaultTimeout(120000);

        // 訪問主頁
        console.log('正在訪問主頁...');
        await page.goto('https://www.ntpc.ltc-car.org/', {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 120000
        });

        // 等待頁面完全載入
        console.log('等待頁面載入...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 分析頁面結構
        console.log('分析頁面結構...');
        const pageInfo = await page.evaluate(() => {
            const forms = Array.from(document.forms).map(form => ({
                id: form.id,
                action: form.action,
                method: form.method,
                elements: Array.from(form.elements).map(el => ({
                    type: el.type,
                    name: el.name,
                    id: el.id,
                    value: el.value
                }))
            }));

            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).map(btn => ({
                type: btn.type,
                text: btn.textContent || btn.value,
                id: btn.id,
                name: btn.name,
                class: btn.className
            }));

            const inputs = Array.from(document.querySelectorAll('input')).map(input => ({
                type: input.type,
                name: input.name,
                id: input.id,
                value: input.value,
                placeholder: input.placeholder
            }));

            const links = Array.from(document.querySelectorAll('a')).map(link => ({
                href: link.href,
                text: link.textContent,
                id: link.id,
                class: link.className
            }));

            return {
                title: document.title,
                url: window.location.href,
                forms,
                buttons,
                inputs,
                links
            };
        });

        // 輸出分析結果
        console.log('\n頁面標題:', pageInfo.title);
        console.log('當前URL:', pageInfo.url);
        console.log('\n表單數量:', pageInfo.forms.length);
        console.log('按鈕數量:', pageInfo.buttons.length);
        console.log('輸入框數量:', pageInfo.inputs.length);
        console.log('連結數量:', pageInfo.links.length);

        // 輸出詳細信息
        console.log('\n表單詳情:');
        pageInfo.forms.forEach((form, index) => {
            console.log(`\n表單 ${index + 1}:`);
            console.log('ID:', form.id);
            console.log('Action:', form.action);
            console.log('Method:', form.method);
            console.log('元素:', form.elements);
        });

        console.log('\n按鈕詳情:');
        pageInfo.buttons.forEach((btn, index) => {
            console.log(`\n按鈕 ${index + 1}:`);
            console.log('類型:', btn.type);
            console.log('文字:', btn.text);
            console.log('ID:', btn.id);
            console.log('名稱:', btn.name);
            console.log('類別:', btn.class);
        });

        // 截圖
        console.log('\n正在截圖...');
        await page.screenshot({ path: 'page.png', fullPage: true });
        console.log('截圖已保存為 page.png');

    } catch (error) {
        console.error('分析過程發生錯誤：', error);
    } finally {
        console.log('關閉瀏覽器...');
        await browser.close();
    }
}

analyzePage().catch(console.error); 