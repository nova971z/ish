// GET /api/health — Health check endpoint.
// Reports which env vars are configured (never leaks values).

module.exports = function handler(req, res) {
  return res.status(200).json({
    ok: true,
    service: 'Pirates Tools API',
    version: 'v1',
    timestamp: new Date().toISOString(),
    env: {
      // Stripe
      stripe: !!process.env.STRIPE_SECRET_KEY,
      webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      // Firebase
      firebase: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      // Resend (transactional email)
      resendApiKey: !!process.env.RESEND_API_KEY,
      resendFrom: !!process.env.RESEND_FROM,
      resendAudience: !!process.env.RESEND_AUDIENCE_ID,
      ownerEmail: !!process.env.OWNER_EMAIL,
      // Admin
      adminSecret: !!process.env.ADMIN_SECRET
    }
  });
};
