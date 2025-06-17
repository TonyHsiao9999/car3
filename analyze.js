const puppeteer = require('puppeteer');

async function analyzePage() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    try {
        const page = await browser.newPage();
        
        // 訪問網站
        console.log('正在訪問網站...');
        await page.goto('https://www.ntpc.ltc-car.org/');
        
        // 等待頁面載入
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 自動點擊「我知道了」按鈕
        console.log('嘗試自動點擊「我知道了」按鈕...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('a.button.button-fill.button-large.color_deep_main'));
            const knowBtn = btns.find(btn => btn.textContent.trim() === '我知道了');
            if (knowBtn) knowBtn.click();
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 分析所有按鈕和連結
        console.log('\n=== 分析所有按鈕和連結 ===');
        const buttonsAndLinks = await page.evaluate(() => {
            const elements = document.querySelectorAll('a, button');
            return Array.from(elements).map(el => ({
                text: el.textContent.trim(),
                href: el.href,
                class: el.className,
                id: el.id,
                type: el.tagName.toLowerCase(),
                isVisible: el.offsetParent !== null
            }));
        });
        
        console.log('找到的按鈕和連結：');
        buttonsAndLinks.forEach(el => {
            if (el.isVisible) {
                console.log(`- ${el.type}: ${el.text}`);
                console.log(`  類別: ${el.class}`);
                console.log(`  ID: ${el.id}`);
                console.log(`  連結: ${el.href}`);
                console.log('---');
            }
        });
        
        // 點擊民眾登入按鈕
        console.log('\n=== 點擊民眾登入按鈕 ===');
        await page.evaluate(() => {
            const btn = document.querySelector('a.button.button-fill.button-large.color_deep_main');
            if (btn && btn.textContent.trim() === '民眾登入') btn.click();
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 等待登入表單出現
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 分析登入表單
        console.log('\n=== 分析登入表單 ===');
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
        
        console.log('找到的表單元素：');
        formElements.forEach(el => {
            if (el.isVisible) {
                console.log(`- 類型: ${el.type}`);
                console.log(`  名稱: ${el.name}`);
                console.log(`  ID: ${el.id}`);
                console.log(`  類別: ${el.class}`);
                console.log(`  提示文字: ${el.placeholder}`);
                console.log('---');
            }
        });
        
        // 分析確認按鈕
        console.log('\n=== 分析確認按鈕 ===');
        const confirmButtons = await page.evaluate(() => {
            const elements = document.querySelectorAll('a.button-fill.button-large.color_deep_main');
            return Array.from(elements).map(el => ({
                text: el.textContent.trim(),
                class: el.className,
                id: el.id,
                isVisible: el.offsetParent !== null
            }));
        });
        
        console.log('找到的確認按鈕：');
        confirmButtons.forEach(btn => {
            if (btn.isVisible) {
                console.log(`- 文字: ${btn.text}`);
                console.log(`  類別: ${btn.class}`);
                console.log(`  ID: ${btn.id}`);
                console.log('---');
            }
        });
        
        // 等待使用者手動關閉瀏覽器
        console.log('\n請手動關閉瀏覽器以結束分析...');
        await new Promise(() => {});
        
    } catch (error) {
        console.error('分析過程中發生錯誤：', error);
    } finally {
        await browser.close();
    }
}

analyzePage(); 