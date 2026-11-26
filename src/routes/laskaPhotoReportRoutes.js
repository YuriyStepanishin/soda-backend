import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import cloudinary, { ensureCloudinaryConfigured } from '../config/cloudinary.js';
import { getPool } from '../db/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { resolveSalesTenant, validateSalesTenantHeader } from '../middleware/tenant.js';
import { uploadToCloudinary } from '../services/cloudinary.js';

const router = Router();
const pool = getPool('laska');
const pageSize = 12;
const categories = z.enum(['merchandising', 'equipment', 'other']);
const searchText = z.string().trim().max(200).default('');
const calendarDate = z.iso.date().refine(value => !value.startsWith('0000-'));
const reportFilters = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  department: searchText,
  agent: searchText,
  search: searchText,
  category: categories.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).refine(({ from, to }) => !from || !to || from <= to);
const newReport = z.object({
  id: z.uuid(),
  routeId: z.string().refine(value =>
    /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n),
  reportDate: calendarDate,
  category: categories,
  comment: z.string().trim().max(1000).default(''),
  photoLocations: z.string().max(1024).optional(),
});
const mediaType = 'authenticated';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 6, fieldSize: 4096, parts: 12 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'photos'));
    }
    callback(null, true);
  },
}).array('photos', 5);

const scopeParameters = ({ role, representative, department, departments }) => [
  role,
  representative || '',
  (departments?.length ? departments : department ? [department] : []).map(value => value.trim()).filter(Boolean),
];
const scope = (agent, department) => `
  ($1 IN ('admin', 'manager')
   OR ($1 = 'agent' AND $2 <> '' AND lower(btrim(${agent})) = lower(btrim($2)))
   OR ($1 = 'supervisor' AND btrim(${department}) = ANY($3::text[])))`;
const reportScope = scope('agent_name', 'department');
const routesFrom = `
  FROM public.sales_routes r
  LEFT JOIN public.agents a ON lower(btrim(a.ta)) = lower(btrim(r.agent_name))
  WHERE r.tenant_id = 'LASKA'
    AND nullif(btrim(r.store_code), '') IS NOT NULL
    AND nullif(btrim(r.agent_name), '') IS NOT NULL
    AND nullif(btrim(r.store_name), '') IS NOT NULL
    AND ${scope('r.agent_name', 'a.department')}`;

router.use(validateSalesTenantHeader, authenticate, resolveSalesTenant(), (req, res, next) => {
  if (req.salesTenant !== 'laska' || !['admin', 'manager', 'supervisor', 'agent'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Фотозвіт доступний користувачам ЛАСКА.' });
  }
  res.set('Cache-Control', 'no-store');
  next();
});

// On-demand reverse geocoding only when a photo is opened. Cache by approximate GPS
// location and serialize requests to respect the public OSM Nominatim 1 req/s limit.
const locationCache = new Map();
let reverseGeocodeQueue = Promise.resolve();
let lastReverseLookup = 0;
function formatPhotoLocation(address = {}) {
  const locality = address.city || address.town || address.village || address.hamlet
    || address.municipality || address.city_district || address.suburb || address.county || '';
  const street = address.road || address.pedestrian || address.residential || '';
  const building = address.house_number || '';
  const formatted = [street && [street, building].filter(Boolean).join(', '), address.neighbourhood || '']
    .filter(Boolean).join(' · ');
  return { locality: String(locality), address: String(formatted) };
}
router.get('/reverse-location', async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
      || req.query.latitude === undefined || req.query.longitude === undefined) {
    return res.status(400).json({ message: 'Некоректні координати.' });
  }
  const key = latitude.toFixed(4) + ',' + longitude.toFixed(4);
  const cached = locationCache.get(key);
  if (cached && cached.expires > Date.now()) return res.json(cached.value);
  const lookup = async () => {
    const existing = locationCache.get(key);
    if (existing && existing.expires > Date.now()) return existing.value;
    const gap = Date.now() - lastReverseLookup;
    if (gap < 1200) await new Promise(resolve => setTimeout(resolve, 1200 - gap));
    lastReverseLookup = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'uk');
    url.searchParams.set('zoom', '18');
    url.searchParams.set('lat', key.split(',')[0]);
    url.searchParams.set('lon', key.split(',')[1]);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SODA-sales/3.9.5 (https://soda-frontend-omega.vercel.app/)',
        'Referer': 'https://soda-frontend-omega.vercel.app/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error('Geocoder temporarily unavailable');
    const json = await response.json();
    const result = formatPhotoLocation(json.address);
    locationCache.set(key, { value: result, expires: Date.now() + 30 * 86400 * 1000 });
    // Keep memory bounded: evict earliest inserted item.
    if (locationCache.size > 3000) locationCache.delete(locationCache.keys().next().value);
    return result;
  };
  const pending = reverseGeocodeQueue.then(lookup);
  reverseGeocodeQueue = pending.then(() => undefined, () => undefined);
  try {
    return res.json(await pending);
  } catch {
    return res.status(503).json({ message: 'Адресу визначити не вдалося.' });
  }
});

router.get('/stores', async (req, res) => {
  const search = searchText.safeParse(req.query.search);
  const department = searchText.safeParse(req.query.department);
  const agent = searchText.safeParse(req.query.agent);
  if (!department.success || !agent.success || !search.success) return res.status(400).json({ message: 'Некоректний пошук торгової точки.' });
  const { rows } = await pool.query(
    `SELECT id::text, store_code, store_name, agent_name, department
     FROM (
       SELECT DISTINCT ON (r.store_code, r.agent_name) r.id, r.store_code, r.store_name,
              r.agent_name, COALESCE(a.department, '') AS department
       ${routesFrom}
         AND strpos(lower(concat_ws(' ', r.store_name, r.store_code, r.agent_name)), lower($4)) > 0
         AND ($5 = '' OR btrim(a.department) = $5)
         AND ($6 = '' OR btrim(r.agent_name) = $6)
       ORDER BY r.store_code, r.agent_name, r.updated_at DESC NULLS LAST, r.id DESC, a.department
     ) stores
     ORDER BY store_name, store_code, agent_name
     LIMIT 30`,
    [...scopeParameters(req.user), search.data, department.data, agent.data],
  );
  res.json({ rows });
});

router.get('/filters', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT btrim(department) AS department, btrim(agent_name) AS agent_name FROM (
       SELECT COALESCE(a.department, '') AS department, r.agent_name
       ${routesFrom}
       UNION
       SELECT department, agent_name FROM public.laska_photo_reports WHERE ${reportScope}
     ) available ORDER BY department, agent_name`,
    scopeParameters(req.user),
  );
  res.json({ rows });
});

const filteredReports = `FROM public.laska_photo_reports
    WHERE ${reportScope}
      AND ($4::date IS NULL OR report_date >= $4)
      AND ($5::date IS NULL OR report_date <= $5)
      AND ($6 = '' OR btrim(department) = $6)
      AND ($7 = '' OR btrim(agent_name) = $7)
      AND ($8 = '' OR strpos(lower(concat_ws(' ', store_name, store_code)), lower($8)) > 0)
      AND ($9::text IS NULL OR category = $9)`;

// Paginate trading points rather than reports: photos for one store never split across pages.
router.get('/grouped', async (req, res) => {
  const filters = reportFilters.safeParse(req.query);
  if (!filters.success) return res.status(400).json({ message: 'Перевірте дати й параметри фільтра.' });
  const { from, to, department, agent, search, category, page } = filters.data;
  const params = [...scopeParameters(req.user), from, to, department, agent, search, category];
  try {
    const { rows: keys } = await pool.query(
      `SELECT store_code, report_date::text AS latest ${filteredReports}
       GROUP BY store_code, report_date ORDER BY latest DESC, store_code
       LIMIT $10 OFFSET $11`,
      [...params, pageSize + 1, (page - 1) * pageSize],
    );
    const selected = keys.slice(0, pageSize);
    if (!selected.length) return res.json({ rows: [], hasNext: false });
    const codes = selected.map(row => row.store_code);
    const dates = selected.map(row => String(row.latest).slice(0, 10));
    const { rows } = await pool.query(
      `SELECT id, report_date::text, department, agent_name, store_code, store_name,
              category, comment, photos
       ${filteredReports} AND (store_code, report_date) IN (
         SELECT code, day::date FROM unnest($10::text[], $11::text[]) AS selected(code, day)
       )
       ORDER BY report_date DESC, created_at DESC, id DESC`,
      [...params, codes, dates],
    );
    if (rows.length) ensureCloudinaryConfigured();
    res.json({
      rows: rows.map(({ photos, ...report }) => ({
        ...report,
        photos: photos.map(({ publicId, format, version, latitude = null, longitude = null }) => ({
          url: cloudinary.url(publicId, { secure: true, type: mediaType, sign_url: true, format, version }),
          latitude, longitude,
        })),
      })),
      hasNext: keys.length > pageSize,
    });
  } catch (error) {
    console.error('LASKA grouped photo gallery:', error);
    res.status(500).json({ message: 'Не вдалося завантажити фотографії торгових точок.' });
  }
});

router.get('/', async (req, res) => {
  const filters = reportFilters.safeParse(req.query);
  if (!filters.success) return res.status(400).json({ message: 'Перевірте дати й параметри фільтра.' });
  const { from, to, department, agent, search, category, page } = filters.data;
  const { rows } = await pool.query(
    `SELECT id, report_date::text, department, agent_name, store_code, store_name, category, comment, photos
       ${filteredReports}
      ORDER BY report_date DESC, created_at DESC, id DESC
      LIMIT $10 OFFSET $11`,
    [...scopeParameters(req.user), from, to, department, agent, search, category, pageSize + 1, (page - 1) * pageSize],
  );
  if (rows.length) ensureCloudinaryConfigured();
  res.json({
    rows: rows.slice(0, pageSize).map(({ photos, ...report }) => ({
      ...report,
      photos: photos.map(({ publicId, format, version, latitude = null, longitude = null }) => ({
        url: cloudinary.url(publicId, { secure: true, type: mediaType, sign_url: true, format, version }),
        latitude, longitude,
      })),
    })),
    hasNext: rows.length > pageSize,
  });
});


router.get('/stats', async (req, res) => {
  const filters = reportFilters.safeParse(req.query);
  if (!filters.success) return res.status(400).json({ message: 'Перевірте дати й параметри фільтра.' });
  const { from, to, department, agent, search, category } = filters.data;
  const { rows: [stats] } = await pool.query(
    `SELECT count(DISTINCT store_code)::int AS "storeCount",
            COALESCE(sum(jsonb_array_length(photos)), 0)::int AS "photoCount"
       ${filteredReports}`,
    [...scopeParameters(req.user), from, to, department, agent, search, category],
  );
  res.json(stats);
});

router.delete('/:id/photos/:index', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !/^\d+$/.test(req.params.index)) {
    return res.status(400).json({ message: 'Некоректний ідентифікатор фото.' });
  }
  const index = Number(req.params.index);
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: [report] } = await client.query(
      `SELECT id, photos FROM public.laska_photo_reports
        WHERE id = $4 AND ${reportScope}
        FOR UPDATE`,
      [...scopeParameters(req.user), req.params.id],
    );
    if (!report) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Фотозвіт не знайдено.' });
    }
    const photos = report.photos;
    if (!Number.isSafeInteger(index) || index < 0 || index >= photos.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Фото вже видалено або не знайдено.' });
    }
    const [removed] = photos.splice(index, 1);
    ensureCloudinaryConfigured();
    const result = await cloudinary.uploader.destroy(removed.publicId, { type: mediaType, invalidate: true });
    if (!['ok', 'not found'].includes(result.result)) throw new Error('Cloudinary delete failed');
    if (photos.length) {
      await client.query('UPDATE public.laska_photo_reports SET photos = $2::jsonb WHERE id = $1', [report.id, JSON.stringify(photos)]);
    } else {
      await client.query('DELETE FROM public.laska_photo_reports WHERE id = $1', [report.id]);
    }
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    req.log?.error({ code: error.code, reportId: req.params.id }, 'Photo delete failed');
    return res.status(503).json({ message: 'Не вдалося видалити фото. Спробуйте ще раз.' });
  } finally {
    client?.release();
  }
});

router.post('/', (req, res, next) => {
  upload(req, res, error => {
    if (error) return res.status(400).json({ message: 'Додайте до п’яти фото JPG, PNG або WebP розміром до 5 МБ кожне.' });
    next();
  });
}, async (req, res) => {
  const parsed = newReport.safeParse(req.body);
  if (!parsed.success || !req.files?.length) {
    return res.status(400).json({ message: 'Виберіть торгову точку, дату, категорію та фото JPG, PNG або WebP.' });
  }
  const { id, routeId, reportDate, category, comment } = parsed.data;
  let photoLocations = [];
  try {
    photoLocations = parsed.data.photoLocations ? JSON.parse(parsed.data.photoLocations) : [];
    if (!Array.isArray(photoLocations) || photoLocations.length > 5 || photoLocations.some(location =>
      location == null || typeof location !== 'object' ||
      (location.latitude != null && (typeof location.latitude !== 'number' || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90)) ||
      (location.longitude != null && (typeof location.longitude !== 'number' || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180))
    )) throw new Error('invalid GPS');
    if (photoLocations.length !== req.files.length || photoLocations.some(location => location.latitude == null || location.longitude == null)) throw new Error('GPS required for every photo');
  } catch { return res.status(400).json({ message: 'Геолокація обов’язкова для кожного фото. Увімкніть GPS і зробіть фото повторно.' }); }
  const { email } = req.user;
  const publicIds = [];
  let committing = false;
  let connectionError;
  let client;
  try {
    // Preflight uses the pool without holding a transaction during Cloudinary uploads.
    const { rows: [existing] } = await pool.query(
      'SELECT created_by FROM public.laska_photo_reports WHERE id = $1', [id],
    );
    if (existing) return existing.created_by === email
      ? res.json({ id })
      : res.status(409).json({ message: 'Цей ідентифікатор фотозвіту вже використано.' });
    const { rows: [store] } = await pool.query(
      `SELECT r.store_code, r.store_name, r.agent_name, COALESCE(a.department, '') AS department
       ${routesFrom} AND r.id = $4 ORDER BY a.department LIMIT 1`,
      [...scopeParameters(req.user), routeId],
    );
    if (!store) return res.status(403).json({ message: 'Торгова точка недоступна. Виберіть точку зі списку.' });

    const folder = process.env.CLOUDINARY_FOLDER || 'soda-reports';
    const photos = [];
    for (const [index, file] of req.files.entries()) {
      const publicId = `${folder}/laska/${id}/${randomUUID()}`;
      publicIds.push(publicId);
      const asset = await uploadToCloudinary(file, {
        folder: undefined, public_id: publicId, type: mediaType,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        overwrite: false, timeout: 15000, disable_promise: true,
      });
      photos.push({ publicId: asset.public_id, format: asset.format, version: asset.version,
        latitude: photoLocations[index]?.latitude ?? null,
        longitude: photoLocations[index]?.longitude ?? null });
    }

    // Keep the database transaction short. The advisory lock makes retries idempotent.
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
    const { rows: [duplicate] } = await client.query(
      'SELECT created_by FROM public.laska_photo_reports WHERE id = $1', [id],
    );
    if (duplicate) {
      await client.query('ROLLBACK');
      // These uploads belong to this request, not to the existing report.
      const cleanup = await Promise.allSettled(publicIds.map(publicId =>
        cloudinary.uploader.destroy(publicId, { type: mediaType, timeout: 10000 })));
      if (cleanup.some(result => result.status === 'rejected')) {
        req.log?.warn({ reportId: id }, 'Could not clean up duplicate photo uploads');
      }
      return duplicate.created_by === email ? res.json({ id })
        : res.status(409).json({ message: 'Цей ідентифікатор фотозвіту вже використано.' });
    }
    await client.query(
      `INSERT INTO public.laska_photo_reports
         (id, created_by, report_date, department, agent_name, store_code, store_name, category, comment, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [id, email, reportDate, store.department, store.agent_name, store.store_code,
        store.store_name, category, comment, JSON.stringify(photos)],
    );
    committing = true;
    await client.query('COMMIT');
    return res.status(201).json({ id });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(rollbackError => { connectionError = rollbackError; });
    // A lost response to COMMIT can leave a valid report in Neon.
    if (!committing) {
      const cleanup = await Promise.allSettled(publicIds.map(publicId =>
        cloudinary.uploader.destroy(publicId, { type: mediaType, timeout: 10000 }),
      ));
      if (cleanup.some(result => result.status === 'rejected')) {
        req.log?.warn({ reportId: id }, 'Could not clean up all photo report uploads');
      }
    }
    req.log?.error({ reportId: id, code: error.code, status: error.http_code }, 'Photo report creation failed');
    const badPhoto = [400, 415].includes(error.http_code);
    return res.status(badPhoto ? 400 : 503).json({
      message: badPhoto ? 'Cloudinary не прийняв одне з фото.' : 'Не вдалося зберегти фотозвіт. Спробуйте ще раз.',
    });
  } finally {
    if (client) client.release(connectionError);
  }
});

export default router;
