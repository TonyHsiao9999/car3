require('dotenv').config();
const puppeteer = require('puppeteer');
const cron = require('node-cron');

async function bookCar() {
  console.log('開始執行預約流程...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // 開啟網頁
    await page.goto('https://www.ntpc.ltc-car.org/');
    
    // 輸入身分證字號
    await page.waitForSelector('input#IDNumber');
    await page.type('input#IDNumber', process.env.ID_NUMBER);
    
    // 輸入密碼
    await page.waitForSelector('input#password');
    await page.type('input#password', process.env.PASSWORD);
    
    // 點擊確認按鈕
    await page.click('a.button-fill:nth-child(2)');
    
    // 等待並點擊登入成功確認
    await page.waitForSelector('span.dialog-button');
    await page.click('span.dialog-button');
    
    // 點擊預約連結
    await page.waitForSelector('a.link:nth-child(2)');
    await page.click('a.link:nth-child(2)');
    
    // 選擇上車地點
    await page.waitForSelector('select#pickUp_location');
    await page.select('select#pickUp_location', '3');
    
    // 輸入上車地址
    await page.waitForSelector('input#pickUp_address_text');
    await page.type('input#pickUp_address_text', process.env.PICKUP_LOCATION);
    await page.click('input#pickUp_address_text');
    await page.keyboard.press('ArrowDown');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.click('.location:nth-child(1) > label');
    
    // 選擇下車地點
    await page.waitForSelector('select#getOff_location');
    await page.select('select#getOff_location', '0');
    
    // 選擇下車地址
    await page.waitForSelector('select#getOff_address');
    await page.select('select#getOff_address', '新北市板橋區中正路1巷18號');
    
    // 選擇日期（下週一或下週四）
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dayOfWeek = nextWeek.getDay();
    const dateSelect = await page.waitForSelector('select#appointment_date');
    const options = await dateSelect.$$('option');
    await options[13].click(); // 選擇下週的日期
    
    // 選擇時間
    await page.select('select#appointment_hour', '16');
    await page.select('select#appointment_minutes', '40');
    
    // 不同意30分鐘
    await page.click('.form_item:nth-child(6) .cus_checkbox_type1:nth-child(2) > div');
    
    // 選擇陪同人數
    await page.select('.inner > #accompany_label', '1');
    
    // 選擇不共乘
    await page.click('.form_item:nth-child(10) .cus_checkbox_type1:nth-child(2) > div');
    
    // 選擇搭輪椅上車
    await page.click('.form_item:nth-child(11) .cus_checkbox_type1:nth-child(1) > div');
    
    // 選擇非大型輪椅
    await page.click('.form_item:nth-child(12) .cus_checkbox_type1:nth-child(2) > div');
    
    // 確認預約資訊
    await page.click('.page_bottom > .button');
    
    // 送出預約
    await page.click('button.button-fill:nth-child(2)');
    
    console.log('預約流程完成！');
  } catch (error) {
    console.error('執行過程中發生錯誤：', error);
  } finally {
    await browser.close();
  }
}

// 設定每週一和週四凌晨執行
cron.schedule('0 0 0 * * 1,4', () => {
  console.log('開始執行排程任務...');
  bookCar();
});

console.log('自動化腳本已啟動，等待排程執行...'); 