const { respondPreflight, withCors } = require('./_cors');
const AWS = require('aws-sdk');
const { createClient } = require('@supabase/supabase-js');

const rekognition = new AWS.Rekognition({
  region: process.env.REKOGNITION_REGION || 'eu-west-1',
  accessKeyId: process.env.REKOGNITION_ACCESS_KEY_ID,
  secretAccessKey: process.env.REKOGNITION_SECRET_ACCESS_KEY,
});

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Conditional so a missing var fails the guard in the handler with a clear
// error, rather than throwing inside createClient at module load time.
const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

const rateLimit = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 60000;

function checkRateLimit(event) {
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimit.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return null;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return withCors({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }
  return null;
}

// Paginated list+remove for one storage prefix.
// Removed files don't reappear, so we keep listing from offset 0 until empty.
// Safety counter caps the loop so a persistent remove-error can't spin forever.
async function wipeStoragePrefix(prefix) {
  let totalRemoved = 0;
  const pageSize = 100;
  for (let i = 0; i < 200; i++) {
    const { data: files, error: listError } = await supabase.storage
      .from('event-photos')
      .list(prefix, { limit: pageSize });
    if (listError) {
      console.error(`delete-account: list error for ${prefix}:`, listError);
      return totalRemoved;
    }
    if (!files || files.length === 0) return totalRemoved;
    const filePaths = files.map(f => `${prefix}/${f.name}`);
    const { error: removeError } = await supabase.storage
      .from('event-photos')
      .remove(filePaths);
    if (removeError) {
      console.error(`delete-account: remove error for ${prefix}:`, removeError);
      return totalRemoved;
    }
    totalRemoved += filePaths.length;
    if (files.length < pageSize) return totalRemoved;
  }
  console.error(`delete-account: pagination safety limit hit for ${prefix}`);
  return totalRemoved;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondPreflight();
  // 1. Method gate
  if (event.httpMethod !== 'POST') {
    return withCors({ statusCode: 405, body: 'Method not allowed' });
  }

  // 1a. Server config guard.
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('delete-account: missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Server config incomplete' }) });
  }

  // 2. Rate limit — 3/min/IP. This is the most destructive endpoint we have.
  const rateLimited = checkRateLimit(event);
  if (rateLimited) return rateLimited;

  try {
    // 3. Parse body.
    const { accessToken, confirm } = JSON.parse(event.body);
    if (!accessToken) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) });
    }

    // 4. Server-side counterpart to the two-tap confirmation modal.
    if (confirm !== true) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Confirmation required' }) });
    }

    // 5. JWT verification.
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return withCors({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) });
    }

    // 6. Discover owned events.
    //    NOTE: `events` has no user_id column — host_email is the only owner link
    //    that exists in the schema, so ownership here is necessarily email-based.
    //    ILIKE metacharacters are escaped first: '_' is legal in an email
    //    local-part and would otherwise match any single character.
    const escapedEmail = user.email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: ownedEvents, error: eventsError } = await supabase
      .from('events')
      .select('id, cover_photo_url')
      .ilike('host_email', escapedEmail);

    if (eventsError) {
      console.error('delete-account: events lookup error:', eventsError);
      return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Failed to load account data' }) });
    }

    const events = ownedEvents || [];
    const eventIds = events.map((e) => e.id);

    // 7. Rekognition FIRST — biometric data goes before any storage or DB writes.
    //    Abort the whole op on any AWS error other than ResourceNotFoundException
    //    so the caller can retry without orphaning DB/storage state.
    let rekognitionDeleted = 0;
    let rekognitionAbsent = 0;
    for (const id of eventIds) {
      const collectionId = `eventsnap-${id}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      try {
        await rekognition.deleteCollection({ CollectionId: collectionId }).promise();
        rekognitionDeleted++;
      } catch (err) {
        if (err.code === 'ResourceNotFoundException') {
          rekognitionAbsent++;
        } else {
          console.error('delete-account: Rekognition deleteCollection error:', err);
          return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Failed to delete account (Rekognition)' }) });
        }
      }
    }

    let reelsDeleted = 0;
    let photosDeleted = 0;
    let consentsDeleted = 0;
    let eventsDeleted = 0;
    let filesDeleted = 0;

    if (eventIds.length > 0) {
      // 8. Reels.
      const { data: deletedReels, error: reelsError } = await supabase
        .from('reels')
        .delete()
        .in('event_id', eventIds)
        .select('id');
      if (reelsError) console.error('delete-account: reels delete error:', reelsError);
      reelsDeleted = deletedReels?.length || 0;

      // 9. Storage files — log+continue on individual prefix failures.
      for (const ev of events) {
        filesDeleted += await wipeStoragePrefix(`${ev.id}/photos`);
        filesDeleted += await wipeStoragePrefix(`${ev.id}/videos`);
        filesDeleted += await wipeStoragePrefix(`selfies/${ev.id}`);

        // Cover photo lives under the shared 'covers/' prefix, not per-event.
        // Parse the storage path out of the public URL using the same marker
        // reject-photo.js and delete-event.js already rely on.
        if (ev.cover_photo_url) {
          const marker = '/object/public/event-photos/';
          const idx = ev.cover_photo_url.indexOf(marker);
          if (idx !== -1) {
            const coverPath = ev.cover_photo_url.substring(idx + marker.length);
            try {
              const { error: coverRemoveError } = await supabase.storage
                .from('event-photos')
                .remove([coverPath]);
              if (coverRemoveError) {
                console.error('delete-account: cover remove error:', coverRemoveError);
              } else {
                filesDeleted += 1;
              }
            } catch (err) {
              console.error('delete-account: cover remove exception:', err);
            }
          }
        }
      }

      // 10. Photo rows.
      const { data: deletedPhotos, error: photosError } = await supabase
        .from('photos')
        .delete()
        .in('event_id', eventIds)
        .select('id');
      if (photosError) console.error('delete-account: photos delete error:', photosError);
      photosDeleted = deletedPhotos?.length || 0;

      // 11. Face tagging consents — biometric consent records tied to these events.
      const { data: deletedConsents, error: consentError } = await supabase
        .from('face_tagging_consents')
        .delete()
        .in('event_id', eventIds)
        .select('id');
      if (consentError) console.error('delete-account: consent delete error:', consentError);
      consentsDeleted = deletedConsents?.length || 0;

      // 12. Event rows.
      const { data: deletedEvents, error: eventDeleteError } = await supabase
        .from('events')
        .delete()
        .in('id', eventIds)
        .select('id');
      if (eventDeleteError) console.error('delete-account: events delete error:', eventDeleteError);
      eventsDeleted = deletedEvents?.length || 0;
    }

    // 13. Payments — deleted BEFORE admin.deleteUser so an FK on user_id
    //     without ON DELETE CASCADE cannot block the auth deletion.
    let paymentsDeleted = 0;
    try {
      const { data: deletedPayments, error: paymentsError } = await supabase
        .from('payments')
        .delete()
        .eq('user_id', user.id)
        .select('id');
      if (paymentsError) console.error('delete-account: payments delete error:', paymentsError);
      paymentsDeleted = deletedPayments?.length || 0;
    } catch (err) {
      console.error('delete-account: payments delete exception:', err);
    }

    // 14. Ambassadors — this table is keyed by email, not user_id
    //     (see check-ambassador.js), so it is matched on the escaped email.
    let ambassadorsDeleted = 0;
    try {
      const { data: deletedAmbassadors, error: ambassadorError } = await supabase
        .from('ambassadors')
        .delete()
        .ilike('email', escapedEmail)
        .select('id');
      if (ambassadorError) console.error('delete-account: ambassadors delete error:', ambassadorError);
      ambassadorsDeleted = deletedAmbassadors?.length || 0;
    } catch (err) {
      console.error('delete-account: ambassadors delete exception:', err);
    }

    // 15. Profile row (profiles.id === auth.users.id).
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);
    if (profileError) console.error('delete-account: profile delete error:', profileError);

    // 16. TODO(v1.1): photographer_accounts are intentionally NOT deleted here.
    //     They are a separate credential system (own id + email + password_hash,
    //     with no foreign key to auth.users), so the only possible association is
    //     an email match — which could destroy an unrelated pro account that
    //     happens to share the address. Deferred by product decision for v1.0.
    //     We only COUNT and WARN so affected accounts can be identified later.
    let photographerAccountsSkipped = 0;
    try {
      const { data: proAccounts } = await supabase
        .from('photographer_accounts')
        .select('id')
        .ilike('email', escapedEmail);
      photographerAccountsSkipped = proAccounts?.length || 0;
      if (photographerAccountsSkipped > 0) {
        console.warn(
          `delete-account: SKIPPED ${photographerAccountsSkipped} photographer_accounts row(s) ` +
          `matching deleted user ${user.id} — retained by design for v1.0, review for v1.1.`
        );
      }
    } catch (err) {
      console.error('delete-account: photographer_accounts lookup error:', err);
    }

    // 17. Auth user LAST. If this fails, the account survives and every step
    //     above is idempotent, so the caller can simply retry. Running it first
    //     would invalidate the access token mid-operation and orphan everything.
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      console.error('delete-account: admin.deleteUser error:', deleteUserError);
      return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Failed to delete account' }) });
    }

    // 18. Success — per-table counts for auditing.
    return withCors({
      statusCode: 200,
      body: JSON.stringify({
        deleted: true,
        events: eventsDeleted,
        photos: photosDeleted,
        reels: reelsDeleted,
        consents: consentsDeleted,
        payments: paymentsDeleted,
        ambassadors: ambassadorsDeleted,
        files: filesDeleted,
        rekognition: { deleted: rekognitionDeleted, absent: rekognitionAbsent },
        photographerAccountsSkipped,
      }),
    });
  } catch (err) {
    console.error('delete-account error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
