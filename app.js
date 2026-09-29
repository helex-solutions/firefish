const express = require('express');
const path = require('path');
const cors = require('cors');

const sushiRouter = require('./routes/sushi');
const gofshRouter = require('./routes/gofsh');

/** Build the Firefish Express app (no `listen` — see index.js). */
function createApp() {
  const app = express();
  app.use(express.json({ type: ['application/json', 'application/fhir+json'], limit: '1000mb' }));
  app.use(express.text({ type: ['application/fsh'], limit: '1000mb' }));
  app.use(cors());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'firefish', version: require('./package.json').version });
  });

  // FSH ⇄ FHIR, versioned by path: /{r4,r4b,r5}/sushi, /{r4,r4b,r5}/gofsh
  app.use(sushiRouter);
  app.use(gofshRouter);

  return app;
}

module.exports = { createApp };
