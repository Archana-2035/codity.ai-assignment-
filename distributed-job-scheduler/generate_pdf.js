const { chromium } = require('./packages/e2e/node_modules/playwright');
const fs = require('fs');
const marked = require('marked');

(async () => {
  const md = fs.readFileSync('C:/Users/archa/.gemini/antigravity/brain/00af8422-4c60-47e5-ba6b-a831611912c6/submission_report.md', 'utf8');
  const html = marked.parse(md);
  const content = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; padding: 40px; }
      pre { background: #f6f8fa; padding: 16px; border-radius: 6px; }
      img { max-width: 100%; height: auto; margin-bottom: 20px; }
      blockquote { border-left: 4px solid #dfe2e5; color: #6a737d; padding-left: 16px; }
    </style>
  </head>
  <body>
    ${html}
  </body>
  </html>
  `;
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(content, { waitUntil: 'networkidle' });
  await page.pdf({ path: 'C:/Users/archa/.gemini/antigravity/brain/00af8422-4c60-47e5-ba6b-a831611912c6/submission_report.pdf', format: 'A4', printBackground: true });
  await browser.close();
  console.log('PDF Generated successfully!');
})();
