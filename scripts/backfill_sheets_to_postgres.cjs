/**
 * Backfill Script: Google Sheets -> Supabase PostgreSQL (Robust & Reconciled)
 * Reads all canonical booking records from Google Sheets (via Edge Gateway / GAS),
 * deduplicates versions, normalizes dates & times, and upserts missing records into Supabase PostgreSQL.
 */

const SUPABASE_URL = 'https://azfkzheypuvfcitckovf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ';
const GATEWAY_URL = 'https://kg-ai-gateway.dmt-kgwork.workers.dev/api';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec';
const SHARED_SECRET = 'kg_booking_secret_token_2026';

function stringToUuid(str) {
  if (!str) return crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;

  let hash1 = 0, hash2 = 0, hash3 = 0, hash4 = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1 + char) | 0;
    hash2 = ((hash2 << 7) - hash2 + char) | 0;
    hash3 = ((hash3 << 11) - hash3 + char) | 0;
    hash4 = ((hash4 << 13) - hash4 + char) | 0;
  }

  const h1 = (Math.abs(hash1).toString(16) + '00000000').substring(0, 8);
  const h2 = (Math.abs(hash2).toString(16) + '0000').substring(0, 4);
  const h3 = '4' + (Math.abs(hash3).toString(16) + '000').substring(0, 3);
  const h4 = '8' + (Math.abs(hash4).toString(16) + '000').substring(0, 3);
  const h5 = (Math.abs(hash1 ^ hash2 ^ hash3 ^ hash4).toString(16) + '000000000000').substring(0, 12);

  return `${h1}-${h2}-${h3}-${h4}-${h5}`;
}

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[\s\.\-\(\)]/g, '');
  if (cleaned.startsWith('+84')) cleaned = '0' + cleaned.substring(3);
  if (cleaned.startsWith('84') && cleaned.length >= 11) cleaned = '0' + cleaned.substring(2);
  return cleaned;
}

function toPgDate(ddmmyyyy) {
  if (!ddmmyyyy || typeof ddmmyyyy !== 'string') return new Date().toISOString().split('T')[0];
  const str = ddmmyyyy.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const parts = str.split('/');
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${y}-${m}-${d}`;
  }
  if (parts.length === 2) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = new Date().getFullYear();
    return `${y}-${m}-${d}`;
  }
  return str;
}

function toPgTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '18:00:00';
  const str = timeStr.trim().toLowerCase();
  
  const m1 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m1) {
    const h = parseInt(m1[1], 10);
    const m = parseInt(m1[2], 10);
    const s = m1[3] ? parseInt(m1[3], 10) : 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60) {
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
  }

  const m2 = str.match(/(\d{1,2})h(\d{2})?/i);
  if (m2) {
    const h = parseInt(m2[1], 10);
    const m = m2[2] ? parseInt(m2[2], 10) : 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
    }
  }

  const m3 = str.match(/^(\d{1,2})$/);
  if (m3) {
    const h = parseInt(m3[1], 10);
    if (h >= 0 && h < 24) {
      return String(h).padStart(2, '0') + ':00:00';
    }
  }

  const m4 = str.match(/(\d{1,2})[:h](\d{2})/);
  if (m4) {
    const h = parseInt(m4[1], 10);
    const m = parseInt(m4[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
    }
  }

  return '18:00:00';
}

async function fetchGASHistory() {
  console.log('[1/4] Fetching history from Google Sheets via Edge Gateway...');
  let res;
  try {
    res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-secret': SHARED_SECRET,
        'x-source': 'kg_booking_client'
      },
      body: JSON.stringify({ action: 'getHistory' })
    });
    if (!res.ok) throw new Error(`Gateway returned HTTP ${res.status}`);
  } catch (err) {
    console.warn(`Gateway failed (${err.message}). Trying direct GAS...`);
    res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getHistory' })
    });
  }

  const json = await res.json();
  if (!json.ok || !Array.isArray(json.data)) {
    throw new Error(`Failed to get history: ${json.message || 'Invalid format'}`);
  }
  console.log(`✓ Fetched ${json.data.length} raw records from Google Sheets.`);
  return json.data;
}

async function fetchAllPgBookings() {
  console.log('[2/4] Fetching existing records from Supabase PostgreSQL...');
  const rows = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,customer_phone,booking_date&offset=${offset}&limit=${limit}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) {
      throw new Error(`Postgres error ${res.status}: ${await res.text()}`);
    }
    const batch = await res.json();
    if (Array.isArray(batch) && batch.length > 0) {
      rows.push(...batch);
      offset += batch.length;
      if (batch.length < limit) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`✓ Fetched ${rows.length} existing records from Supabase PostgreSQL.`);
  return rows;
}

async function backfill() {
  const gasRecords = await fetchGASHistory();
  const pgRecords = await fetchAllPgBookings();

  const existingPgIds = new Set(pgRecords.map(r => r.id));

  // 1. Deduplicate GAS records by ID, retaining the latest version/timestamp
  const uniqueGasMap = new Map();
  for (const item of gasRecords) {
    if (!item || !item.id) continue;
    const existing = uniqueGasMap.get(item.id);
    if (!existing) {
      uniqueGasMap.set(item.id, item);
    } else {
      const existingVer = Number(existing.version) || 1;
      const itemVer = Number(item.version) || 1;
      const existingTime = new Date(existing.timestamp || 0).getTime();
      const itemTime = new Date(item.timestamp || 0).getTime();
      if (itemVer > existingVer || (itemVer === existingVer && itemTime > existingTime)) {
        uniqueGasMap.set(item.id, item);
      }
    }
  }
  console.log(`✓ Deduplicated to ${uniqueGasMap.size} unique canonical bookings in Google Sheets.`);

  console.log('[3/4] Analyzing missing records...');
  const toUpsert = [];
  const processedUuids = new Set();

  for (const [gasId, item] of uniqueGasMap.entries()) {
    const uuid = stringToUuid(gasId);
    if (existingPgIds.has(uuid) || processedUuids.has(uuid)) {
      continue;
    }
    processedUuids.add(uuid);

    const pc = item.parsedCustomer || {};
    const payload = {
      id: uuid,
      customer_name: pc.name || 'Khách hàng',
      customer_phone: pc.phone || '',
      normalized_phone: cleanPhoneNumber(pc.phone || ''),
      booking_date: toPgDate(pc.date),
      start_time: toPgTime(pc.time),
      guest_count: parseInt(pc.pax || '1') || 1,
      table_id: pc.tables || null,
      status: pc.type || 'Ăn thường',
      note: pc.note || '',
      ordered_items: item.menuItems || [],
      total_amount: Number(item.totalAmount) || 0,
      deposit_amount: Number(item.depositAmount) || 0,
      is_deposited: !!item.isDeposited,
      transfer_image: item.transferImage || '',
      bill_url: item.billUrl || '',
      staff: item.staff || { name: 'Admin', phone: '' },
      version: Number(item.version) || 1,
      idempotency_key: null,
      created_at: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString()
    };
    toUpsert.push(payload);
  }

  console.log(`✓ Found ${toUpsert.length} missing records that need backfilling into PostgreSQL.`);
  if (toUpsert.length === 0) {
    console.log('🎉 Supabase PostgreSQL is already 100% up to date with Google Sheets!');
    return;
  }

  console.log('[4/4] Inserting missing records into Supabase in batches of 50...');
  const batchSize = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates, return=minimal'
      },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`\nBatch ${Math.floor(i / batchSize) + 1} failed (${res.status}): ${errText}`);
      // Fallback: try individual inserts for this batch so one bad row doesn't drop 49 good rows
      console.log(`  Retrying ${batch.length} items individually...`);
      for (const singleItem of batch) {
        const singleRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?on_conflict=id`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates, return=minimal'
          },
          body: JSON.stringify(singleItem)
        });
        if (singleRes.ok) {
          successCount++;
        } else {
          failCount++;
          console.error(`    Single item failed (${singleItem.id}, ${singleItem.customer_name}): ${await singleRes.text()}`);
        }
      }
    } else {
      successCount += batch.length;
      process.stdout.write(`  Synced: ${successCount}/${toUpsert.length} records...\r`);
    }
  }

  console.log(`\n🎉 Backfill complete! Successfully upserted: ${successCount}, Failed: ${failCount}`);
  
  // Verify final count
  const verifyRecords = await fetchAllPgBookings();
  console.log(`📊 Final Supabase PostgreSQL Record Count: ${verifyRecords.length}`);
}

backfill().catch(err => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
