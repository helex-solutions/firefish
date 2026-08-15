const { createApp } = require('./app');

const port = parseInt(process.env.PORT, 10) || 3000;

createApp().listen(port, () => {
  console.log(`Firefish running on http://localhost:${port}/`);
});
