const https = require('https');
https.get('https://frontend-production-4af7.up.railway.app/assets/index-CTp8bKeH.js', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/https:\/\/backend-production[^"']+/);
    console.log('Match:', match ? JSON.stringify(match[0]) : 'Not found');
  });
});
