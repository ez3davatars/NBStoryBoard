const { app, net } = require('electron'); 
app.whenReady().then(() => { 
  let url = 'file:///E:/nonexistent';
  console.log('Fetching', url);
  net.fetch(url).then(r => console.log('STATUS:', r.status)).catch(e => console.error('ERROR:', e.message)); 
  setTimeout(()=>app.quit(), 1000); 
});
