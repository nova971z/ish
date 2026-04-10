// GET /api/health — Health check endpoint

module.exports = function handler(req, res) {
  return res.status(200).json({
    ok: true,
    service: 'Pirates Tools API',
    version: 'v1',
    timestamp: new Date().toISOString(),
    env: {
      stripe: !!process.env.STRIPE_SECRET_KEY,
      firebase: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET
    }
  });
};
