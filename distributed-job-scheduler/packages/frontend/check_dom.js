import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html', 'utf-8');

const dom = new JSDOM(html, {
  url: 'http://localhost:5173/login',
  runScripts: 'dangerously',
  resources: 'usable'
});

dom.window.console.log = (...args) => console.log('[LOG]', ...args);
dom.window.console.error = (...args) => console.error('[ERROR]', ...args);

setTimeout(() => {
  console.log('App HTML after 3 seconds:');
  console.log(dom.window.document.getElementById('root').innerHTML);
}, 3000);
