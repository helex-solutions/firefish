const { createApp } = require('./app');
const { preload } = require('./lib/compile');

const port = parseInt(process.env.PORT, 10) || 3000;

createApp().listen(port, () => {
  console.log(`Firefish running on http://localhost:${port}/`);
});

if (process.env.FIREFISH_PRELOAD === 'true') {
  preload();
}
