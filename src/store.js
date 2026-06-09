import { supabase } from './services/supabase.js';
import { API_BASE } from './config.js';

// ─── Utilities ────────────────────────────────────────────────────────────────
const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

// ─── Events ───────────────────────────────────────────────────────────────────

export const createEvent = async ({ title, subtitle, date, host, host_password, event_slug, cover_photo_url, status, max_photos, max_guests, expires_at, plan, photographer_id, hostEmail }) => {
  const code = generateCode();

  let hashedPassword = null;
  if (host_password) {
    const res = await fetch(`${API_BASE}/.netlify/functions/hash-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: host_password }),
    });
    const result = await res.json();
    hashedPassword = result.hash;
  }

  const payload = {
    id: code,
    title,
    subtitle: subtitle || null,
    date,
    host: host || null,
    host_password: hashedPassword,
    event_slug: event_slug || null,
    cover_photo_url: cover_photo_url || null,
    status: status || 'active',
    max_photos: max_photos || 100,
    max_guests: max_guests || 50,
    expires_at: expires_at || null,
    plan: plan || 'free',
    photographer_id: photographer_id || null,
    host_email: hostEmail || null,
  };
  const { data, error } = await supabase.from('events').insert(payload).select('id').single();
  if (data?.id && hostEmail) {
    fetch(`${API_BASE}/.netlify/functions/check-ambassador`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: hostEmail, eventId: data.id }),
    }).catch(() => {});
  }
  return { data, error };
};

export const getEvent = async (code) => {
  const { data, error } = await supabase.from('events_public').select('id, title, subtitle, date, host, plan, created_at, event_slug, cover_photo_url, status, max_photos, max_guests, expires_at, brand_color, slideshow_transition, face_tagging_enabled, highlight_reel_url, photographer_id, moderation_enabled, slideshow_photo_ids, theme').eq('id', code).single();
  return { data, error };
};

export const getEventBySlug = async (slug) => {
  const { data, error } = await supabase.from('events_public').select('id, title, subtitle, date, host, plan, created_at, event_slug, cover_photo_url, status, max_photos, max_guests, expires_at, brand_color, slideshow_transition, face_tagging_enabled, highlight_reel_url, photographer_id, moderation_enabled, slideshow_photo_ids, theme').eq('event_slug', slug).single();
  return { data, error };
};

// ─── Photos ───────────────────────────────────────────────────────────────────

export const addPhoto = async ({ event_id, file_url, guest_name, media_type, taken_at, moderation_status }) => {
  const payload = {
    event_id,
    image_url: file_url,
    uploader_name: guest_name || 'Guest',
    media_type: media_type || 'photo',
    taken_at: taken_at || new Date().toISOString(),
    moderation_status: moderation_status || 'approved',
  };
  const { data, error } = await supabase.from('photos').insert(payload).select().single();
  return { data, error };
};

export const getPhotos = async (eventId) => {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('event_id', eventId)
    .eq('moderation_status', 'approved')
    .order('taken_at', { ascending: true })
    .order('created_at', { ascending: true });
  return { data: data || [], error };
};

export const getPhotoCount = async (eventId) => {
  const { count, error } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);
  return { count: count || 0, error };
};

// ─── Event Updates ────────────────────────────────────────────────────────────

export const updateEvent = async (eventCode, fields) => {
  const { data, error } = await supabase
    .from('events')
    .update(fields)
    .eq('id', eventCode)
    .select()
    .single();
  return { data, error };
};

// ─── Moderation ───────────────────────────────────────────────────────────────

export const getPendingPhotos = async (eventId) => {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('event_id', eventId)
    .eq('moderation_status', 'pending')
    .order('created_at', { ascending: true });
  return { data: data || [], error };
};

export const approvePhoto = async (photoId) => {
  const { data, error } = await supabase
    .from('photos')
    .update({ moderation_status: 'approved' })
    .eq('id', photoId);
  return { data, error };
};

export const deletePhoto = async (photoId, filePath) => {
  if (filePath) {
    await supabase.storage.from('event-photos').remove([filePath]);
  }
  const { error } = await supabase.from('photos').delete().eq('id', photoId);
  return { error };
};

// ─── Stats ────────────────────────────────────────────────────────────────────

export const getUniqueGuestCount = async (eventId) => {
  const { data, error } = await supabase
    .from('photos')
    .select('uploader_name')
    .eq('event_id', eventId);
  if (error || !data) return { count: 0, error };
  const unique = new Set(data.map((r) => r.uploader_name).filter(Boolean));
  return { count: unique.size, error: null };
};

export const getAllPhotosCount = async (eventId) => {
  const { count, error } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);
  return { count: count || 0, error };
};

// ─── Analytics ────────────────────────────────────────────────────────────────

export const getUploadsPerDay = async (eventId) => {
  const { data, error } = await supabase
    .from('photos')
    .select('created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error || !data) return { data: [], error };

  const counts = {};
  data.forEach((row) => {
    const day = new Date(row.created_at).toISOString().split('T')[0];
    counts[day] = (counts[day] || 0) + 1;
  });

  const chartData = Object.entries(counts).map(([date, count]) => ({ date, count }));
  return { data: chartData, error: null };
};

export const getTopUploaders = async (eventId) => {
  const { data, error } = await supabase
    .from('photos')
    .select('uploader_name')
    .eq('event_id', eventId);
  if (error || !data) return { data: [], error };

  const counts = {};
  data.forEach((row) => {
    const name = row.uploader_name || 'Guest';
    counts[name] = (counts[name] || 0) + 1;
  });

  const sorted = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { data: sorted, error: null };
};

export const getLastUploadTime = async (eventId) => {
  const { data, error } = await supabase
    .from('photos')
    .select('created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return { data: data?.created_at || null, error };
};

// ─── Storage ──────────────────────────────────────────────────────────────────

export const uploadFile = async (eventId, file) => {
  const isVideo = file.type.startsWith('video/');
  const folder = isVideo ? 'videos' : 'photos';
  const ext = file.name.split('.').pop();
  const fileName = `${eventId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from('event-photos')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) return { publicUrl: null, error };

  const { data: urlData } = supabase.storage.from('event-photos').getPublicUrl(fileName);
  return { publicUrl: urlData.publicUrl, error: null };
};

export const getReels = async (eventId) => {
  const { data, error } = await supabase
    .from('reels')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
};

export { supabase };
