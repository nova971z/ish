// POST/GET /api/instagram — Instagram Business API management.
// Auth : header "x-admin-secret" must match env ADMIN_SECRET.
// Requires env: META_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET.
//
// Actions (via query ?action= or body.action):
//   GET  account         — IG account info (username, followers, etc.)
//   GET  media           — Recent posts (last 25)
//   GET  comments        — Comments on a media (query: media_id)
//   GET  insights        — Account insights (last 30 days)
//   GET  exchange-token  — Exchange short-lived token for long-lived (60 days)
//   POST publish-start   — Create media container (body: image_url, caption)
//   POST publish-finish  — Publish container (body: creation_id)
//   POST reply           — Reply to a comment (body: comment_id, message)

const GRAPH_API = 'https://graph.facebook.com/v21.0';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Auth ──────────────────────────────────────────────────
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return res.status(503).json({ ok: false, error: 'Admin not configured. Set ADMIN_SECRET env var.' });
  }
  const provided = req.headers['x-admin-secret'] || '';
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: 'Invalid admin secret' });
  }

  // ── Env check ─────────────────────────────────────────────
  const accessToken = process.env.META_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!accessToken) {
    return res.status(503).json({ ok: false, error: 'META_ACCESS_TOKEN not configured on Vercel.' });
  }

  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  // ── Helper: call Graph API ────────────────────────────────
  async function graphGet(path, params) {
    const url = new URL(GRAPH_API + path);
    url.searchParams.set('access_token', accessToken);
    if (params) {
      Object.keys(params).forEach(function (k) { url.searchParams.set(k, params[k]); });
    }
    const resp = await fetch(url.toString());
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Graph API error');
    return data;
  }

  async function graphPost(path, body) {
    const url = new URL(GRAPH_API + path);
    url.searchParams.set('access_token', accessToken);
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Graph API error');
    return data;
  }

  // ── Resolve IG User ID (cached in memory per invocation) ──
  async function getIgUserId() {
    // Step 1: get Facebook Pages linked to this token
    const pages = await graphGet('/me/accounts', { fields: 'id,name,instagram_business_account' });
    if (!pages.data || pages.data.length === 0) {
      throw new Error('No Facebook Page found. Link your Instagram Business account to a Facebook Page.');
    }
    // Find the page with an IG business account
    var igUserId = null;
    var pageName = '';
    for (var i = 0; i < pages.data.length; i++) {
      var p = pages.data[i];
      if (p.instagram_business_account && p.instagram_business_account.id) {
        igUserId = p.instagram_business_account.id;
        pageName = p.name || '';
        break;
      }
    }
    if (!igUserId) {
      throw new Error('No Instagram Business account linked to your Facebook Page(s): ' + pages.data.map(function (p) { return p.name; }).join(', '));
    }
    return { igUserId: igUserId, pageName: pageName };
  }

  try {
    // ── GET: exchange-token ───────────────────────────────
    if (action === 'exchange-token') {
      if (!appId || !appSecret) {
        return res.status(503).json({ ok: false, error: 'META_APP_ID and META_APP_SECRET required for token exchange.' });
      }
      const url = GRAPH_API + '/oauth/access_token'
        + '?grant_type=fb_exchange_token'
        + '&client_id=' + encodeURIComponent(appId)
        + '&client_secret=' + encodeURIComponent(appSecret)
        + '&fb_exchange_token=' + encodeURIComponent(accessToken);
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) {
        return res.status(400).json({ ok: false, error: data.error.message || 'Token exchange failed' });
      }
      // Note: The new long-lived token is returned but must be manually set in Vercel env.
      // We do NOT auto-update env vars for security.
      return res.status(200).json({
        ok: true,
        message: 'Long-lived token generated. Copy it and update META_ACCESS_TOKEN on Vercel.',
        token_type: data.token_type || 'bearer',
        expires_in_seconds: data.expires_in || null,
        expires_in_days: data.expires_in ? Math.round(data.expires_in / 86400) : null,
        access_token: data.access_token
      });
    }

    // ── GET: account ──────────────────────────────────────
    if (action === 'account') {
      var ig = await getIgUserId();
      var account = await graphGet('/' + ig.igUserId, {
        fields: 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website'
      });
      return res.status(200).json({
        ok: true,
        page_name: ig.pageName,
        account: account
      });
    }

    // ── GET: media ────────────────────────────────────────
    if (action === 'media') {
      var ig = await getIgUserId();
      var limit = parseInt(req.query && req.query.limit, 10) || 25;
      var media = await graphGet('/' + ig.igUserId + '/media', {
        fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count',
        limit: String(limit)
      });
      return res.status(200).json({
        ok: true,
        media: media.data || [],
        paging: media.paging || null
      });
    }

    // ── GET: comments ─────────────────────────────────────
    if (action === 'comments') {
      var mediaId = (req.query && req.query.media_id) || '';
      if (!mediaId) return res.status(400).json({ ok: false, error: 'media_id required' });
      var comments = await graphGet('/' + mediaId + '/comments', {
        fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}'
      });
      return res.status(200).json({
        ok: true,
        comments: comments.data || []
      });
    }

    // ── GET: insights ─────────────────────────────────────
    if (action === 'insights') {
      var ig = await getIgUserId();
      var period = (req.query && req.query.period) || 'day';
      try {
        var insights = await graphGet('/' + ig.igUserId + '/insights', {
          metric: 'impressions,reach,profile_views',
          period: period
        });
        return res.status(200).json({ ok: true, insights: insights.data || [] });
      } catch (e) {
        // insights may fail if account is too new or not enough data
        return res.status(200).json({
          ok: true,
          insights: [],
          warning: e.message || 'Insights not available yet'
        });
      }
    }

    // ── POST: publish-start ───────────────────────────────
    if (action === 'publish-start') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });
      var body = req.body || {};
      var imageUrl = body.image_url || '';
      var caption = body.caption || '';
      if (!imageUrl) return res.status(400).json({ ok: false, error: 'image_url required' });

      var ig = await getIgUserId();
      // Step 1: Create media container
      var container = await graphPost('/' + ig.igUserId + '/media', {
        image_url: imageUrl,
        caption: caption
      });
      return res.status(200).json({
        ok: true,
        creation_id: container.id,
        message: 'Container created. Call publish-finish to publish.'
      });
    }

    // ── POST: publish-finish ──────────────────────────────
    if (action === 'publish-finish') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });
      var body = req.body || {};
      var creationId = body.creation_id || '';
      if (!creationId) return res.status(400).json({ ok: false, error: 'creation_id required' });

      var ig = await getIgUserId();
      var published = await graphPost('/' + ig.igUserId + '/media_publish', {
        creation_id: creationId
      });
      return res.status(200).json({
        ok: true,
        media_id: published.id,
        message: 'Post published successfully!'
      });
    }

    // ── POST: reply ───────────────────────────────────────
    if (action === 'reply') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });
      var body = req.body || {};
      var commentId = body.comment_id || '';
      var message = body.message || '';
      if (!commentId || !message) {
        return res.status(400).json({ ok: false, error: 'comment_id and message required' });
      }
      var reply = await graphPost('/' + commentId + '/replies', {
        message: message
      });
      return res.status(200).json({ ok: true, reply_id: reply.id });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action: ' + action + '. Valid: account, media, comments, insights, exchange-token, publish-start, publish-finish, reply' });

  } catch (err) {
    console.error('[api/instagram] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
};
