// env.ts
import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });

// server.ts
import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import path4 from "path";

// db.ts
import pg from "pg";
import fs from "fs";
import path from "path";
var { Pool } = pg;
var RAW_CONNECTION_STRING = process.env.DATABASE_URL;
function normalizeConnectionString(url) {
  if (!url) return void 0;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("channel_binding");
    return parsed.toString();
  } catch {
    return url;
  }
}
var CONNECTION_STRING = normalizeConnectionString(RAW_CONNECTION_STRING);
var USE_SSL = /sslmode=(require|verify)/.test(RAW_CONNECTION_STRING || "");
var STATE_ID = "mariana-kitchen";
var pool = CONNECTION_STRING ? new Pool({
  connectionString: CONNECTION_STRING,
  max: 10,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 1e4,
  keepAlive: true,
  ssl: USE_SSL ? { rejectUnauthorized: false } : void 0
}) : null;
if (pool) {
  pool.on("error", (err) => {
    console.error("\u26A0\uFE0F  Conex\xE3o ociosa do Postgres caiu (o pool vai reconectar):", err.message);
  });
}
var DEFAULT_STATE = {
  user: {
    name: "Mari",
    email: "mari@ourlittlekitchen.app",
    calorieGoal: 1850,
    macros: {
      proteinGrams: 115,
      carbsGrams: 200,
      fatGrams: 50
    },
    waterGoalMl: 2200,
    currentWeightKg: 58.5,
    targetWeightKg: 57,
    heightCm: 164
  },
  todayLogs: [],
  historyLogs: [],
  marmitas: [],
  recipes: [],
  weeklyPlan: {
    segunda: [],
    terca: [],
    quarta: [],
    quinta: [],
    sexta: [],
    sabado: [],
    domingo: []
  },
  customFoods: [],
  lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
};
function readSeedState() {
  const seedFile = path.resolve(process.cwd(), "data", "mariana_kitchen_data.json");
  try {
    if (fs.existsSync(seedFile)) {
      return JSON.parse(fs.readFileSync(seedFile, "utf-8"));
    }
  } catch (err) {
    console.warn("\u26A0\uFE0F  N\xE3o foi poss\xEDvel ler o arquivo de seed, usando estado padr\xE3o.", err);
  }
  return DEFAULT_STATE;
}
var initialized = false;
async function initDatabase() {
  if (!pool) {
    throw new Error("DATABASE_URL n\xE3o configurada");
  }
  const schemaPath = path.resolve(process.cwd(), "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  await pool.query(schema);
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
          ALTER TABLE products ADD COLUMN IF NOT EXISTS sugars_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS added_sugars_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS saturated_fat_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS trans_fat_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients TEXT;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS provenance JSONB;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS nutrition_source TEXT;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS household_measure TEXT;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS per_portion JSONB;

          -- Permite produtos cadastrados exclusivamente por foto de tabela nutricional (sem c\xF3digo de barras)
          ALTER TABLE products ALTER COLUMN barcode DROP NOT NULL;
          ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;

          ALTER TABLE products DROP CONSTRAINT IF EXISTS products_data_source_check;
          ALTER TABLE products ADD CONSTRAINT products_data_source_check
            CHECK (data_source IN ('Open Food Facts', 'FatSecret', 'Manual', 'R\xF3tulo', 'IA Gemini', 'TACO/TBCA', 'Banco Local'));

          ALTER TABLE products DROP CONSTRAINT IF EXISTS products_verification_status_check;
          ALTER TABLE products ADD CONSTRAINT products_verification_status_check
            CHECK (verification_status IN ('pending', 'verified', 'rejected', 'user_confirmed'));
        END IF;
      END $$;
    `);
  } catch (err) {
    console.warn("Aviso ao aplicar extens\xF5es na tabela products:", err?.message || err);
  }
  const existing = await pool.query("SELECT 1 FROM app_state WHERE id = $1", [STATE_ID]);
  if (existing.rowCount === 0) {
    const seed = readSeedState();
    await pool.query(
      `INSERT INTO app_state (id, data, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [STATE_ID, JSON.stringify(seed), seed.lastUpdated || (/* @__PURE__ */ new Date()).toISOString()]
    );
    console.log("\u{1F331} Estado inicial gravado no Postgres (Neon).");
  }
  initialized = true;
}
async function getAppState() {
  if (!pool) throw new Error("DATABASE_URL n\xE3o configurada");
  const { rows } = await pool.query(
    "SELECT data FROM app_state WHERE id = $1",
    [STATE_ID]
  );
  return rows.length ? rows[0].data : null;
}
async function saveAppState(data) {
  if (!pool) throw new Error("DATABASE_URL n\xE3o configurada");
  const lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  const payload = {
    ...data,
    lastUpdated
  };
  await pool.query(
    `INSERT INTO app_state (id, data, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
    [STATE_ID, JSON.stringify(payload), lastUpdated]
  );
  return lastUpdated;
}
async function getDatabaseStatus() {
  if (!pool) {
    return {
      connected: false,
      error: "DATABASE_URL n\xE3o configurada"
    };
  }
  const startedAt = Date.now();
  try {
    const { rows } = await pool.query(
      `SELECT current_database() AS database,
              current_user AS username,
              version() AS version,
              (SELECT count(*)::int FROM app_state) AS state_rows`
    );
    const row = rows[0];
    return {
      connected: true,
      latencyMs: Date.now() - startedAt,
      database: row.database,
      username: row.username,
      serverVersion: String(row.version).split(",")[0],
      stateRows: row.state_rows,
      initialized
    };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - startedAt,
      error: err.message || String(err)
    };
  }
}
async function closeDatabase() {
  if (pool) {
    await pool.end();
  }
}

// src/api.ts
import { Router } from "express";
import crypto from "crypto";
import fs2 from "fs";
import path2 from "path";
var apiRouter = Router();
var SESSION_COOKIE = "olk_session";
var SESSION_DAYS = 30;
var UPLOAD_ROOT = path2.resolve(process.cwd(), "data", "uploads");
var asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};
var json = (res, status, body) => res.status(status).json(body);
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPin(pin, stored) {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`
  );
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
async function findProfileById(id) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, pin_hash, auth_user_id FROM profiles WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}
async function findProfileBySession(token) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.email, p.role, p.pin_hash, p.auth_user_id
     FROM profile_sessions s
     JOIN profiles p ON p.id = s.profile_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()`,
    [sha256(token)]
  );
  return rows[0] || null;
}
async function spaceIdsFor(profileId) {
  const { rows } = await pool.query(
    `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1`,
    [profileId]
  );
  return rows.map((r) => r.kitchen_space_id);
}
async function isAdmin(profileId, spaceId) {
  const { rows } = await pool.query(
    `SELECT profile_is_space_admin($1, $2) AS ok`,
    [profileId, spaceId]
  );
  return Boolean(rows[0]?.ok);
}
async function primarySpaceId(profileId) {
  const { rows } = await pool.query(
    `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1 ORDER BY joined_at LIMIT 1`,
    [profileId]
  );
  return rows[0]?.kitchen_space_id || null;
}
function profileIdOf(req) {
  return req.profileId;
}
function isDevProfileHeaderAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_PROFILE_HEADER !== "false";
}
var PUBLIC_PATHS = /* @__PURE__ */ new Set(["/auth/profiles", "/auth/login", "/auth/logout"]);
apiRouter.use(async (req, res, next) => {
  try {
    if (PUBLIC_PATHS.has(req.path)) return next();
    let profile = null;
    const sessionToken = parseCookies(req)[SESSION_COOKIE];
    if (sessionToken) profile = await findProfileBySession(sessionToken);
    if (!profile && isDevProfileHeaderAllowed()) {
      const headerId = req.header("X-Profile-ID");
      if (headerId) profile = await findProfileById(headerId);
    }
    if (!profile) {
      const authUserId = req.header("X-Auth-User-ID");
      if (authUserId && isDevProfileHeaderAllowed()) {
        const { rows } = await pool.query(
          `SELECT id, name, email, role, pin_hash, auth_user_id
           FROM profiles WHERE auth_user_id = $1`,
          [authUserId]
        );
        profile = rows[0] || null;
      }
    }
    if (!profile && process.env.SINGLE_USER_PROFILE_ID) {
      profile = await findProfileById(process.env.SINGLE_USER_PROFILE_ID);
    }
    if (!profile) {
      return json(res, 401, { error: "N\xE3o autenticado. Fa\xE7a login para continuar." });
    }
    const spaces = await spaceIdsFor(profile.id);
    if (!spaces.length) {
      return json(res, 403, { error: "Perfil sem espa\xE7o compartilhado." });
    }
    req.profile = profile;
    req.profileId = profile.id;
    req.profileRole = profile.role;
    req.spaceIds = spaces;
    next();
  } catch (err) {
    next(err);
  }
});
apiRouter.get(
  "/auth/profiles",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.email, p.role,
              CASE WHEN p.pin_hash IS NULL THEN true ELSE false END AS needs_pin_setup
       FROM profiles p
       ORDER BY CASE p.role WHEN 'admin' THEN 0 ELSE 1 END, p.name`
    );
    json(res, 200, rows);
  })
);
apiRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { profile_id, pin, setup_code } = req.body || {};
    if (!profile_id || !pin) {
      return json(res, 400, { error: "Perfil e PIN s\xE3o obrigat\xF3rios." });
    }
    if (String(pin).length < 4) {
      return json(res, 400, { error: "O PIN deve ter pelo menos 4 caracteres." });
    }
    const profile = await findProfileById(profile_id);
    if (!profile) return json(res, 404, { error: "Perfil n\xE3o encontrado." });
    if (profile.pin_hash) {
      if (!verifyPin(String(pin), profile.pin_hash)) {
        return json(res, 401, { error: "PIN incorreto." });
      }
    } else {
      const expectedCode = process.env.OLK_SETUP_CODE;
      if (expectedCode && setup_code !== expectedCode) {
        return json(res, 403, { error: "C\xF3digo de configura\xE7\xE3o inv\xE1lido." });
      }
      await pool.query(`UPDATE profiles SET pin_hash = $2 WHERE id = $1`, [
        profile.id,
        hashPin(String(pin))
      ]);
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1e3);
    await pool.query(
      `INSERT INTO profile_sessions (profile_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [profile.id, sha256(token), req.header("user-agent") || null, req.ip || null, expires]
    );
    setSessionCookie(res, token);
    const spaces = await spaceIdsFor(profile.id);
    json(res, 200, {
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role
      },
      spaces,
      expiresAt: expires.toISOString()
    });
  })
);
apiRouter.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      await pool.query(
        `UPDATE profile_sessions SET revoked_at = now() WHERE token_hash = $1`,
        [sha256(token)]
      );
    }
    clearSessionCookie(res);
    json(res, 200, { success: true });
  })
);
apiRouter.get(
  "/auth/me",
  asyncHandler(async (req, res) => {
    const profile = req.profile;
    const spaces = await pool.query(
      `SELECT s.id, s.name, s.slug, m.role_in_space
       FROM kitchen_spaces s
       JOIN memberships m ON m.kitchen_space_id = s.id
       WHERE m.profile_id = $1
       ORDER BY s.name`,
      [profile.id]
    );
    json(res, 200, {
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role
      },
      spaces: spaces.rows
    });
  })
);
apiRouter.post(
  "/auth/change-pin",
  asyncHandler(async (req, res) => {
    const { current_pin, new_pin } = req.body || {};
    const profile = req.profile;
    if (!new_pin || String(new_pin).length < 4) {
      return json(res, 400, { error: "O novo PIN deve ter pelo menos 4 caracteres." });
    }
    if (profile.pin_hash && !verifyPin(String(current_pin || ""), profile.pin_hash)) {
      return json(res, 401, { error: "PIN atual incorreto." });
    }
    await pool.query(`UPDATE profiles SET pin_hash = $2 WHERE id = $1`, [
      profile.id,
      hashPin(String(new_pin))
    ]);
    json(res, 200, { success: true });
  })
);
apiRouter.get(
  "/spaces",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.slug, m.role_in_space
       FROM kitchen_spaces s
       JOIN memberships m ON m.kitchen_space_id = s.id
       WHERE m.profile_id = $1
       ORDER BY s.name`,
      [profileIdOf(req)]
    );
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/profiles",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.email, p.role, m.role_in_space
       FROM profiles p
       JOIN memberships m ON m.profile_id = p.id
       WHERE m.kitchen_space_id = ANY($1::uuid[])
       ORDER BY p.name`,
      [req.spaceIds]
    );
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g,
              water_goal_ml, current_weight_kg, target_weight_kg, height_cm, diet_preference
       FROM profiles WHERE id = $1`,
      [profileIdOf(req)]
    );
    if (!rows.length) return json(res, 404, { error: "Perfil n\xE3o encontrado" });
    json(res, 200, rows[0]);
  })
);
apiRouter.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const allowed = [
      "name",
      "calorie_goal",
      "protein_goal_g",
      "carbs_goal_g",
      "fat_goal_g",
      "water_goal_ml",
      "current_weight_kg",
      "target_weight_kg",
      "height_cm",
      "diet_preference"
    ];
    const fields = [];
    const values = [profileIdOf(req)];
    let i = 2;
    for (const key of allowed) {
      if (req.body?.[key] !== void 0) {
        fields.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: "Nenhum campo edit\xE1vel enviado." });
    const { rows } = await pool.query(
      `UPDATE profiles SET ${fields.join(", ")} WHERE id = $1
       RETURNING id, name, email, role, calorie_goal, protein_goal_g, carbs_goal_g,
                 fat_goal_g, water_goal_ml, current_weight_kg, target_weight_kg,
                 height_cm, diet_preference`,
      values
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.patch(
  "/profiles/:id",
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const actorId = profileIdOf(req);
    const target = await findProfileById(targetId);
    if (!target) return json(res, 404, { error: "Perfil n\xE3o encontrado" });
    const shared = await pool.query(
      `SELECT 1 FROM memberships a
       JOIN memberships b ON a.kitchen_space_id = b.kitchen_space_id
       WHERE a.profile_id = $1 AND b.profile_id = $2 LIMIT 1`,
      [actorId, targetId]
    );
    if (!shared.rowCount) return json(res, 403, { error: "Perfil fora do seu espa\xE7o." });
    const admin = await isAdmin(actorId, await primarySpaceId(actorId));
    if (actorId !== targetId && !admin) {
      return json(res, 403, { error: "Somente administradores editam outros perfis." });
    }
    if (req.body?.role !== void 0) {
      if (!admin) return json(res, 403, { error: "Somente admin altera pap\xE9is." });
      if (!["admin", "user"].includes(req.body.role)) {
        return json(res, 400, { error: "Papel inv\xE1lido." });
      }
    }
    const fields = [];
    const values = [targetId];
    let i = 2;
    for (const key of ["name", "role", "diet_preference", "calorie_goal"]) {
      if (req.body?.[key] !== void 0) {
        fields.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: "Nada para atualizar." });
    const { rows } = await pool.query(
      `UPDATE profiles SET ${fields.join(", ")} WHERE id = $1
       RETURNING id, name, email, role, diet_preference, calorie_goal`,
      values
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/foods",
  asyncHandler(async (req, res) => {
    const { search, category, source, include_deleted } = req.query;
    let sql = `SELECT f.*, p.name AS created_by_name
               FROM foods f
               LEFT JOIN profiles p ON p.id = f.created_by
               WHERE f.kitchen_space_id = ANY($1::uuid[])`;
    const params = [req.spaceIds];
    let i = 2;
    if (include_deleted !== "true") sql += ` AND f.deleted_at IS NULL`;
    if (search) {
      sql += ` AND (f.name ILIKE $${i} OR COALESCE(f.brand,'') ILIKE $${i} OR COALESCE(f.alternative_name,'') ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }
    if (category) {
      sql += ` AND f.category = $${i++}`;
      params.push(category);
    }
    if (source) {
      sql += ` AND f.nutrition_source = $${i++}`;
      params.push(source);
    }
    sql += ` ORDER BY f.name`;
    const { rows } = await pool.query(sql, params);
    json(res, 200, rows);
  })
);
apiRouter.post(
  "/foods",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.category || !b.data_origin) {
      return json(res, 400, {
        error: "Nome, categoria e origem dos dados s\xE3o obrigat\xF3rios"
      });
    }
    const spaceId = await primarySpaceId(profileIdOf(req));
    const existing = await pool.query(
      `SELECT id, name FROM foods
       WHERE kitchen_space_id = $1
         AND deleted_at IS NULL
         AND lower(btrim(name)) = lower(btrim($2))
         AND prep_state = $3
         AND lower(btrim(COALESCE(brand,''))) = lower(btrim(COALESCE($4,'')))
       LIMIT 1`,
      [spaceId, b.name, b.prep_state || "cru", b.brand || ""]
    );
    if (existing.rowCount) {
      return json(res, 409, {
        error: "J\xE1 existe um alimento com este nome, marca e estado de preparo neste espa\xE7o.",
        food: existing.rows[0]
      });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO foods (
           kitchen_space_id, created_by, name, alternative_name, brand, category, description,
           prep_state, reference_unit, calories_per_100g, protein_per_100g, carbs_per_100g,
           fat_total_per_100g, fat_saturated_per_100g, fiber_per_100g, sugars_per_100g,
           sodium_per_100g, nutrition_source, data_origin, verification_status, external_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
         ) RETURNING *`,
        [
          spaceId,
          profileIdOf(req),
          b.name,
          b.alternative_name || null,
          b.brand || null,
          b.category,
          b.description || null,
          b.prep_state || "cru",
          b.reference_unit || "100g",
          b.calories_per_100g ?? null,
          b.protein_per_100g ?? null,
          b.carbs_per_100g ?? null,
          b.fat_total_per_100g ?? null,
          b.fat_saturated_per_100g ?? null,
          b.fiber_per_100g ?? null,
          b.sugars_per_100g ?? null,
          b.sodium_per_100g ?? null,
          b.nutrition_source || "Manual",
          b.data_origin,
          b.verification_status || "pending",
          b.external_id || null
        ]
      );
      await pool.query(`SELECT emit_sync_event($1,'foods',$2,'insert',$3)`, [
        spaceId,
        rows[0].id,
        JSON.stringify({ name: rows[0].name })
      ]);
      json(res, 201, rows[0]);
    } catch (err) {
      if (err.code === "23505") {
        return json(res, 409, { error: "Alimento duplicado neste espa\xE7o." });
      }
      throw err;
    }
  })
);
apiRouter.get(
  "/foods/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT f.*, p.name AS created_by_name
       FROM foods f
       LEFT JOIN profiles p ON p.id = f.created_by
       WHERE f.id = $1 AND f.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: "Alimento n\xE3o encontrado" });
    json(res, 200, rows[0]);
  })
);
apiRouter.put(
  "/foods/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM foods WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Alimento n\xE3o encontrado" });
    const food = current.rows[0];
    if (!req.spaceIds.includes(food.kitchen_space_id)) {
      return json(res, 403, { error: "Alimento de outro espa\xE7o." });
    }
    const admin = await isAdmin(actor, food.kitchen_space_id);
    if (!admin && food.created_by !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para editar este alimento." });
    }
    const fields = [];
    const values = [req.params.id];
    let i = 2;
    const settable = [
      "name",
      "alternative_name",
      "brand",
      "category",
      "description",
      "prep_state",
      "reference_unit",
      "calories_per_100g",
      "protein_per_100g",
      "carbs_per_100g",
      "fat_total_per_100g",
      "fat_saturated_per_100g",
      "fiber_per_100g",
      "sugars_per_100g",
      "sodium_per_100g",
      "nutrition_source",
      "data_origin",
      "verification_status"
    ];
    for (const key of settable) {
      if (b[key] !== void 0) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: "Nada para atualizar." });
    fields.push(`updated_by = $${i++}`);
    values.push(actor);
    const { rows } = await pool.query(
      `UPDATE foods SET ${fields.join(", ")}
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    if (!rows.length) return json(res, 404, { error: "Alimento n\xE3o encontrado" });
    await pool.query(`SELECT emit_sync_event($1,'foods',$2,'update',NULL)`, [
      food.kitchen_space_id,
      food.id
    ]);
    json(res, 200, rows[0]);
  })
);
apiRouter.delete(
  "/foods/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM foods WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Alimento n\xE3o encontrado" });
    const food = current.rows[0];
    if (!await isAdmin(actor, food.kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora exclui alimentos." });
    }
    const { rows } = await pool.query(
      `UPDATE foods SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: "Alimento j\xE1 exclu\xEDdo" });
    await pool.query(`SELECT emit_sync_event($1,'foods',$2,'delete',NULL)`, [
      food.kitchen_space_id,
      food.id
    ]);
    json(res, 200, { success: true, message: "Exclus\xE3o l\xF3gica realizada. Pode ser restaurado." });
  })
);
apiRouter.post(
  "/foods/:id/restore",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM foods WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Alimento n\xE3o encontrado" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora restaura alimentos." });
    }
    const { rows } = await pool.query(
      `UPDATE foods SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/foods/:id/history",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT h.*, p.name AS changed_by_name
       FROM food_nutrition_history h
       LEFT JOIN profiles p ON p.id = h.changed_by
       WHERE h.food_id = $1
         AND h.food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY($2::uuid[]))
       ORDER BY h.changed_at DESC`,
      [req.params.id, req.spaceIds]
    );
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/household-measures",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(`SELECT * FROM household_measures ORDER BY name`);
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/foods/:id/conversions",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.*, h.name AS measure_name, h.short_label
       FROM food_household_conversions c
       JOIN household_measures h ON h.id = c.household_measure_id
       WHERE c.food_id = $1
         AND c.food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY($2::uuid[]))`,
      [req.params.id, req.spaceIds]
    );
    json(res, 200, rows);
  })
);
apiRouter.post(
  "/foods/:id/conversions",
  asyncHandler(async (req, res) => {
    const { household_measure_id, grams, milliliters, estimation_method, conversion_origin } = req.body || {};
    if (!household_measure_id || grams == null) {
      return json(res, 400, { error: "Medida e gramas s\xE3o obrigat\xF3rios." });
    }
    const food = await pool.query(
      `SELECT id FROM foods WHERE id = $1 AND kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!food.rowCount) return json(res, 404, { error: "Alimento n\xE3o encontrado." });
    const { rows } = await pool.query(
      `INSERT INTO food_household_conversions
         (food_id, household_measure_id, grams, milliliters, estimation_method, conversion_origin)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.params.id,
        household_measure_id,
        grams,
        milliliters ?? null,
        estimation_method || null,
        conversion_origin || null
      ]
    );
    json(res, 201, rows[0]);
  })
);
function isValidBarcode(code) {
  return /^\d{8}$|^\d{12,14}$/.test(code);
}
async function lookupOpenFoodFacts(code) {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_pt,brands,manufacturers,categories,quantity,serving_size,serving_quantity,image_front_url,nutriments,last_modified_t`,
      { headers: { "User-Agent": "OurLittleKitchen/1.0 (personal nutrition app)" } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const n = p.nutriments || {};
    return {
      barcode: p.code || code,
      commercial_name: p.product_name_pt || p.product_name || null,
      brand: p.brands || null,
      manufacturer: p.manufacturers || null,
      category: p.categories || null,
      package_size: p.quantity || null,
      serving_quantity: p.serving_quantity ?? null,
      serving_unit: p.serving_size || null,
      image_path: p.image_front_url || null,
      calories_per_100: n["energy-kcal_100g"] ?? null,
      protein_per_100: n.proteins_100g ?? null,
      carbs_per_100: n.carbohydrates_100g ?? null,
      fat_per_100: n.fat_100g ?? null,
      fiber_per_100: n.fiber_100g ?? null,
      sodium_per_100: n.sodium_100g ?? null,
      data_source: "Open Food Facts",
      last_modified: p.last_modified_t || null
    };
  } catch (err) {
    console.error("Open Food Facts lookup falhou:", err);
    return null;
  }
}
apiRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const { search, barcode, include_deleted } = req.query;
    let sql = `SELECT p.*, pr.name AS created_by_name
               FROM products p
               LEFT JOIN profiles pr ON pr.id = p.created_by
               WHERE p.kitchen_space_id = ANY($1::uuid[])`;
    const params = [req.spaceIds];
    let i = 2;
    if (include_deleted !== "true") sql += ` AND p.deleted_at IS NULL`;
    if (barcode) {
      sql += ` AND p.barcode = $${i++}`;
      params.push(barcode);
    }
    if (search) {
      sql += ` AND (p.commercial_name ILIKE $${i} OR COALESCE(p.brand,'') ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }
    sql += ` ORDER BY p.commercial_name`;
    const { rows } = await pool.query(sql, params);
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/products/lookup/:code",
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || "").trim();
    if (!isValidBarcode(code)) {
      return json(res, 400, { error: "C\xF3digo de barras inv\xE1lido (EAN-8, UPC-A, EAN-13)." });
    }
    const local = await pool.query(
      `SELECT * FROM products
       WHERE barcode = $1 AND deleted_at IS NULL
         AND kitchen_space_id = ANY($2::uuid[])
       LIMIT 1`,
      [code, req.spaceIds]
    );
    if (local.rowCount) {
      return json(res, 200, { found: true, local: true, product: local.rows[0] });
    }
    const external = await lookupOpenFoodFacts(code);
    if (!external) {
      return json(res, 200, {
        found: false,
        local: false,
        external: false,
        barcode: code,
        message: "Produto n\xE3o encontrado. Cadastre manualmente."
      });
    }
    return json(res, 200, {
      found: false,
      local: false,
      external: true,
      barcode: code,
      candidate: external,
      requires_confirmation: true
    });
  })
);
apiRouter.post(
  "/products",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const barcode = String(b.barcode || "").trim();
    if (!barcode || !b.commercial_name || !b.data_source) {
      return json(res, 400, {
        error: "C\xF3digo de barras, nome comercial e origem s\xE3o obrigat\xF3rios."
      });
    }
    if (!isValidBarcode(barcode)) {
      return json(res, 400, { error: "C\xF3digo de barras inv\xE1lido (EAN-8, UPC-A, EAN-13)." });
    }
    if (b.data_source === "Open Food Facts" && (b.calories_per_100 == null || !b.commercial_name)) {
      return json(res, 422, {
        error: "Dados externos incompletos. Confirme ou complete antes de salvar."
      });
    }
    const existing = await pool.query(`SELECT id, commercial_name FROM products WHERE barcode = $1`, [
      barcode
    ]);
    if (existing.rowCount) {
      return json(res, 409, {
        error: "Produto com este c\xF3digo de barras j\xE1 existe.",
        product: existing.rows[0]
      });
    }
    const spaceId = await primarySpaceId(profileIdOf(req));
    try {
      const { rows } = await pool.query(
        `INSERT INTO products (
           kitchen_space_id, created_by, barcode, commercial_name, brand, manufacturer,
           category, description, image_path, package_size, serving_quantity, serving_unit,
           calories_per_serving, calories_per_100, protein_per_100, carbs_per_100,
           fat_per_100, fiber_per_100, sodium_per_100, data_source, verification_status,
           external_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
         ) RETURNING *`,
        [
          spaceId,
          profileIdOf(req),
          barcode,
          b.commercial_name,
          b.brand || null,
          b.manufacturer || null,
          b.category || null,
          b.description || null,
          b.image_path || null,
          b.package_size || null,
          b.serving_quantity ?? null,
          b.serving_unit || null,
          b.calories_per_serving ?? null,
          b.calories_per_100 ?? null,
          b.protein_per_100 ?? null,
          b.carbs_per_100 ?? null,
          b.fat_per_100 ?? null,
          b.fiber_per_100 ?? null,
          b.sodium_per_100 ?? null,
          b.data_source,
          b.verification_status || (b.data_source === "Open Food Facts" ? "verified" : "pending"),
          b.external_id || null
        ]
      );
      await pool.query(`SELECT emit_sync_event($1,'products',$2,'insert',NULL)`, [
        spaceId,
        rows[0].id
      ]);
      json(res, 201, rows[0]);
    } catch (err) {
      if (err.code === "23505") {
        return json(res, 409, { error: "C\xF3digo de barras j\xE1 cadastrado." });
      }
      throw err;
    }
  })
);
apiRouter.put(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const before = await pool.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (!before.rowCount) return json(res, 404, { error: "Produto n\xE3o encontrado" });
    const prev = before.rows[0];
    if (!req.spaceIds.includes(prev.kitchen_space_id)) {
      return json(res, 403, { error: "Produto de outro espa\xE7o." });
    }
    const admin = await isAdmin(actor, prev.kitchen_space_id);
    if (!admin && prev.created_by !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para editar este produto." });
    }
    const fields = [];
    const values = [req.params.id];
    let i = 2;
    const settable = [
      "commercial_name",
      "brand",
      "manufacturer",
      "category",
      "description",
      "image_path",
      "package_size",
      "serving_quantity",
      "serving_unit",
      "calories_per_serving",
      "calories_per_100",
      "protein_per_100",
      "carbs_per_100",
      "fat_per_100",
      "fiber_per_100",
      "sodium_per_100",
      "data_source",
      "verification_status"
    ];
    for (const key of settable) {
      if (b[key] !== void 0) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: "Nada para atualizar." });
    fields.push(`updated_by = $${i++}`);
    values.push(actor);
    fields.push(`last_updated_at = now()`);
    const { rows } = await pool.query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );
    const nutrKeys = [
      "calories_per_100",
      "protein_per_100",
      "carbs_per_100",
      "fat_per_100",
      "fiber_per_100",
      "sodium_per_100"
    ];
    const prevNutr = {};
    const newNutr = {};
    for (const key of nutrKeys) {
      if (String(prev[key]) !== String(rows[0][key])) {
        prevNutr[key] = prev[key];
        newNutr[key] = rows[0][key];
      }
    }
    if (Object.keys(prevNutr).length) {
      await pool.query(
        `INSERT INTO product_nutrition_history
           (product_id, changed_by, previous_values, new_values, change_reason, data_source)
         VALUES ($1,$2,$3,$4,'atualizacao_nutricional',$5)`,
        [req.params.id, actor, JSON.stringify(prevNutr), JSON.stringify(newNutr), rows[0].data_source]
      );
    }
    await pool.query(`SELECT emit_sync_event($1,'products',$2,'update',NULL)`, [
      prev.kitchen_space_id,
      prev.id
    ]);
    json(res, 200, rows[0]);
  })
);
apiRouter.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const before = await pool.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (!before.rowCount) return json(res, 404, { error: "Produto n\xE3o encontrado" });
    if (!await isAdmin(actor, before.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora exclui produtos." });
    }
    const { rows } = await pool.query(
      `UPDATE products SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: "Produto j\xE1 exclu\xEDdo" });
    await pool.query(`SELECT emit_sync_event($1,'products',$2,'delete',NULL)`, [
      before.rows[0].kitchen_space_id,
      req.params.id
    ]);
    json(res, 200, { success: true });
  })
);
apiRouter.post(
  "/products/:id/restore",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const before = await pool.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (!before.rowCount) return json(res, 404, { error: "Produto n\xE3o encontrado" });
    if (!await isAdmin(actor, before.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora restaura produtos." });
    }
    const { rows } = await pool.query(
      `UPDATE products SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/products/:id/history",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT h.*, p.name AS changed_by_name
       FROM product_nutrition_history h
       LEFT JOIN profiles p ON p.id = h.changed_by
       WHERE h.product_id = $1
         AND h.product_id IN (SELECT id FROM products WHERE kitchen_space_id = ANY($2::uuid[]))
       ORDER BY h.changed_at DESC`,
      [req.params.id, req.spaceIds]
    );
    json(res, 200, rows);
  })
);
async function insertRecipeIngredients(client, recipeId, ingredients) {
  for (const ing of ingredients) {
    const weight = ing.weight_grams ?? ing.grams ?? 0;
    let calc = {};
    if (ing.food_id || ing.product_id) {
      const { rows } = await client.query(
        `SELECT calc_recipe_ingredient($1,$2,$3) AS c`,
        [ing.food_id || null, ing.product_id || null, weight]
      );
      calc = rows[0]?.c || {};
    }
    await client.query(
      `INSERT INTO recipe_ingredients
         (recipe_id, food_id, product_id, quantity, unit, weight_grams,
          calories, protein, carbs, fat, fiber)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        recipeId,
        ing.food_id || null,
        ing.product_id || null,
        ing.quantity ?? weight ?? 1,
        ing.unit || "g",
        weight,
        ing.calories ?? calc.calories ?? null,
        ing.protein ?? calc.protein ?? null,
        ing.carbs ?? calc.carbs ?? null,
        ing.fat ?? calc.fat ?? null,
        ing.fiber ?? calc.fiber ?? null
      ]
    );
  }
}
apiRouter.get(
  "/recipes",
  asyncHandler(async (req, res) => {
    const { status, include_deleted } = req.query;
    let sql = `SELECT r.*, p.name AS author_name
               FROM recipes r
               LEFT JOIN profiles p ON p.id = r.author_id
               WHERE r.kitchen_space_id = ANY($1::uuid[])`;
    const params = [req.spaceIds];
    let i = 2;
    if (include_deleted !== "true") sql += ` AND r.deleted_at IS NULL`;
    if (status) {
      sql += ` AND r.status = $${i++}`;
      params.push(status);
    }
    sql += ` ORDER BY r.title`;
    const { rows } = await pool.query(sql, params);
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/recipes/:id",
  asyncHandler(async (req, res) => {
    const recipe = await pool.query(
      `SELECT r.*, p.name AS author_name
       FROM recipes r
       LEFT JOIN profiles p ON p.id = r.author_id
       WHERE r.id = $1 AND r.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!recipe.rowCount) return json(res, 404, { error: "Receita n\xE3o encontrada" });
    const ingredients = await pool.query(
      `SELECT ri.*, f.name AS food_name, pr.commercial_name AS product_name
       FROM recipe_ingredients ri
       LEFT JOIN foods f ON f.id = ri.food_id
       LEFT JOIN products pr ON pr.id = ri.product_id
       WHERE ri.recipe_id = $1 ORDER BY ri.created_at`,
      [req.params.id]
    );
    json(res, 200, { ...recipe.rows[0], ingredients: ingredients.rows });
  })
);
apiRouter.post(
  "/recipes",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.title) return json(res, 400, { error: "T\xEDtulo \xE9 obrigat\xF3rio" });
    const actor = profileIdOf(req);
    const spaceId = await primarySpaceId(actor);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO recipes (
           kitchen_space_id, author_id, title, description, photo_path, instructions,
           servings, prep_time_minutes, status, is_favorite, carinho_tip, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          spaceId,
          b.author_id || actor,
          b.title,
          b.description || null,
          b.photo_path || null,
          Array.isArray(b.instructions) ? b.instructions.join("\n") : b.instructions || null,
          b.servings || 1,
          b.prep_time_minutes ?? null,
          b.status || "sugerida",
          b.is_favorite ?? false,
          b.carinho_tip || null,
          b.external_id || null
        ]
      );
      const recipe = rows[0];
      if (Array.isArray(b.ingredients)) {
        for (const ing of b.ingredients) {
          const weight = ing.weight_grams ?? ing.grams ?? 0;
          let calc = {};
          if (ing.food_id || ing.product_id) {
            const c = await client.query(
              `SELECT calc_recipe_ingredient($1,$2,$3) AS c`,
              [ing.food_id || null, ing.product_id || null, weight]
            );
            calc = c.rows[0]?.c || {};
          }
          await client.query(
            `INSERT INTO recipe_ingredients
               (recipe_id, food_id, product_id, quantity, unit, weight_grams,
                calories, protein, carbs, fat, fiber)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              recipe.id,
              ing.food_id || null,
              ing.product_id || null,
              ing.quantity ?? weight ?? 1,
              ing.unit || "g",
              weight,
              ing.calories ?? calc.calories ?? null,
              ing.protein ?? calc.protein ?? null,
              ing.carbs ?? calc.carbs ?? null,
              ing.fat ?? calc.fat ?? null,
              ing.fiber ?? calc.fiber ?? null
            ]
          );
        }
      }
      await client.query("COMMIT");
      await pool.query(`SELECT emit_sync_event($1,'recipes',$2,'insert',NULL)`, [
        spaceId,
        recipe.id
      ]);
      json(res, 201, recipe);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);
apiRouter.put(
  "/recipes/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Receita n\xE3o encontrada" });
    const recipe = current.rows[0];
    if (!req.spaceIds.includes(recipe.kitchen_space_id)) {
      return json(res, 403, { error: "Receita de outro espa\xE7o." });
    }
    const admin = await isAdmin(actor, recipe.kitchen_space_id);
    if (!admin && recipe.author_id !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para editar esta receita." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fields = [];
      const values = [req.params.id];
      let i = 2;
      const settable = [
        "title",
        "description",
        "photo_path",
        "instructions",
        "servings",
        "prep_time_minutes",
        "status",
        "is_favorite",
        "carinho_tip"
      ];
      for (const key of settable) {
        if (b[key] !== void 0) {
          fields.push(`${key} = $${i++}`);
          values.push(key === "instructions" && Array.isArray(b[key]) ? b[key].join("\n") : b[key]);
        }
      }
      if (!fields.length && !Array.isArray(b.ingredients)) {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "Nada para atualizar." });
      }
      fields.push(`updated_by = $${i++}`);
      values.push(actor);
      const { rows } = await client.query(
        `UPDATE recipes SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
        values
      );
      if (Array.isArray(b.ingredients)) {
        await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [req.params.id]);
        await insertRecipeIngredients(client, req.params.id, b.ingredients);
      }
      await client.query("COMMIT");
      await pool.query(`SELECT emit_sync_event($1,'recipes',$2,'update',NULL)`, [
        recipe.kitchen_space_id,
        recipe.id
      ]);
      json(res, 200, rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);
apiRouter.post(
  "/recipes/:id/approve",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Receita n\xE3o encontrada" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora aprova receitas." });
    }
    const { rows } = await pool.query(
      `UPDATE recipes SET status = 'aprovada', updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.delete(
  "/recipes/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Receita n\xE3o encontrada" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora exclui receitas." });
    }
    const { rows } = await pool.query(
      `UPDATE recipes SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: "Receita j\xE1 exclu\xEDda" });
    await pool.query(`SELECT emit_sync_event($1,'recipes',$2,'delete',NULL)`, [
      current.rows[0].kitchen_space_id,
      req.params.id
    ]);
    json(res, 200, { success: true });
  })
);
apiRouter.post(
  "/recipes/:id/restore",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Receita n\xE3o encontrada" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora restaura receitas." });
    }
    const { rows } = await pool.query(
      `UPDATE recipes SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/marmitas",
  asyncHandler(async (req, res) => {
    const { status, include_deleted } = req.query;
    let sql = `SELECT m.*, p.name AS prepared_by_name, r.name AS recipient_name
               FROM marmitas m
               LEFT JOIN profiles p ON p.id = m.prepared_by
               LEFT JOIN profiles r ON r.id = m.recipient_id
               WHERE m.kitchen_space_id = ANY($1::uuid[])`;
    const params = [req.spaceIds];
    let i = 2;
    if (include_deleted !== "true") sql += ` AND m.deleted_at IS NULL`;
    if (status) {
      sql += ` AND m.status = $${i++}`;
      params.push(status);
    }
    sql += ` ORDER BY m.prep_date DESC NULLS LAST, m.created_at DESC`;
    const { rows } = await pool.query(sql, params);
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/marmitas/:id",
  asyncHandler(async (req, res) => {
    const marmita = await pool.query(
      `SELECT m.*, p.name AS prepared_by_name, r.name AS recipient_name
       FROM marmitas m
       LEFT JOIN profiles p ON p.id = m.prepared_by
       LEFT JOIN profiles r ON r.id = m.recipient_id
       WHERE m.id = $1 AND m.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!marmita.rowCount) return json(res, 404, { error: "Marmita n\xE3o encontrada" });
    const items = await pool.query(
      `SELECT mi.*, f.name AS food_name
       FROM marmita_items mi
       LEFT JOIN foods f ON f.id = mi.food_id
       WHERE mi.marmita_id = $1 ORDER BY mi.created_at`,
      [req.params.id]
    );
    json(res, 200, { ...marmita.rows[0], items: items.rows });
  })
);
async function insertMarmitaItems(client, marmitaId, items) {
  for (const it of items) {
    const weight = it.weight_grams ?? 0;
    let calc = {};
    if (it.food_id) {
      const { rows } = await client.query(
        `SELECT calc_food_portion(
           $2,
           f.calories_per_100g, f.protein_per_100g, f.carbs_per_100g,
           f.fat_total_per_100g, f.fiber_per_100g, f.sugars_per_100g, f.sodium_per_100g
         ) AS c
         FROM foods f WHERE f.id = $1`,
        [it.food_id, weight]
      );
      calc = rows[0]?.c || {};
    }
    await client.query(
      `INSERT INTO marmita_items
         (marmita_id, food_id, weight_grams, calories, protein, carbs, fat, fiber)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        marmitaId,
        it.food_id || null,
        weight,
        it.calories ?? calc.calories ?? null,
        it.protein ?? calc.protein ?? null,
        it.carbs ?? calc.carbs ?? null,
        it.fat ?? calc.fat ?? null,
        it.fiber ?? calc.fiber ?? null
      ]
    );
  }
}
apiRouter.post(
  "/marmitas",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) return json(res, 400, { error: "Nome \xE9 obrigat\xF3rio" });
    const actor = profileIdOf(req);
    const spaceId = await primarySpaceId(actor);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO marmitas (
           kitchen_space_id, prepared_by, recipient_id, name, description, photo_path,
           prep_date, expiry_date, status, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          spaceId,
          b.prepared_by || actor,
          b.recipient_id || null,
          b.name,
          b.description || null,
          b.photo_path || null,
          b.prep_date || null,
          b.expiry_date || null,
          b.status || "preparada",
          b.external_id || null
        ]
      );
      const marmita = rows[0];
      if (Array.isArray(b.items)) await insertMarmitaItems(client, marmita.id, b.items);
      await client.query("COMMIT");
      await pool.query(`SELECT emit_sync_event($1,'marmitas',$2,'insert',NULL)`, [
        spaceId,
        marmita.id
      ]);
      const totals = await pool.query(`SELECT * FROM marmitas WHERE id = $1`, [marmita.id]);
      json(res, 201, totals.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);
apiRouter.put(
  "/marmitas/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Marmita n\xE3o encontrada" });
    const marmita = current.rows[0];
    if (!req.spaceIds.includes(marmita.kitchen_space_id)) {
      return json(res, 403, { error: "Marmita de outro espa\xE7o." });
    }
    const admin = await isAdmin(actor, marmita.kitchen_space_id);
    if (!admin && !(marmita.prepared_by === actor && marmita.status !== "publicada")) {
      return json(res, 403, {
        error: "Marmitas publicadas s\xF3 podem ser alteradas pela administradora."
      });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fields = [];
      const values = [req.params.id];
      let i = 2;
      const settable = [
        "name",
        "description",
        "photo_path",
        "prep_date",
        "expiry_date",
        "status",
        "recipient_id"
      ];
      for (const key of settable) {
        if (b[key] !== void 0) {
          fields.push(`${key} = $${i++}`);
          values.push(b[key]);
        }
      }
      if (!fields.length && !Array.isArray(b.items)) {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "Nada para atualizar." });
      }
      fields.push(`updated_by = $${i++}`);
      values.push(actor);
      const { rows } = await client.query(
        `UPDATE marmitas SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
        values
      );
      if (Array.isArray(b.items)) {
        await client.query(`DELETE FROM marmita_items WHERE marmita_id = $1`, [req.params.id]);
        await insertMarmitaItems(client, req.params.id, b.items);
      }
      await client.query("COMMIT");
      await pool.query(`SELECT emit_sync_event($1,'marmitas',$2,'update',NULL)`, [
        marmita.kitchen_space_id,
        marmita.id
      ]);
      const totals = await pool.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
      json(res, 200, totals.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);
apiRouter.post(
  "/marmitas/:id/publish",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Marmita n\xE3o encontrada" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora publica marmitas." });
    }
    const { rows } = await pool.query(
      `UPDATE marmitas SET status = 'publicada', updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.delete(
  "/marmitas/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Marmita n\xE3o encontrada" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora exclui marmitas." });
    }
    const { rows } = await pool.query(
      `UPDATE marmitas SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: "Marmita j\xE1 exclu\xEDda" });
    await pool.query(`SELECT emit_sync_event($1,'marmitas',$2,'delete',NULL)`, [
      current.rows[0].kitchen_space_id,
      req.params.id
    ]);
    json(res, 200, { success: true });
  })
);
apiRouter.post(
  "/marmitas/:id/restore",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Marmita n\xE3o encontrada" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora restaura marmitas." });
    }
    const { rows } = await pool.query(
      `UPDATE marmitas SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/meals",
  asyncHandler(async (req, res) => {
    const { date, meal_type, user_id, include_deleted } = req.query;
    let sql = `SELECT m.*, p.name AS user_name
               FROM meals m
               LEFT JOIN profiles p ON p.id = m.user_id
               WHERE m.kitchen_space_id = ANY($1::uuid[])`;
    const params = [req.spaceIds];
    let i = 2;
    if (include_deleted !== "true") sql += ` AND m.deleted_at IS NULL`;
    if (date) {
      sql += ` AND m.meal_date = $${i++}`;
      params.push(date);
    }
    if (meal_type) {
      sql += ` AND m.meal_type = $${i++}`;
      params.push(meal_type);
    }
    if (user_id) {
      sql += ` AND m.user_id = $${i++}`;
      params.push(user_id);
    }
    sql += ` ORDER BY m.created_at DESC`;
    const { rows } = await pool.query(sql, params);
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/meals/:id",
  asyncHandler(async (req, res) => {
    const meal = await pool.query(
      `SELECT m.*, p.name AS user_name
       FROM meals m LEFT JOIN profiles p ON p.id = m.user_id
       WHERE m.id = $1 AND m.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!meal.rowCount) return json(res, 404, { error: "Refei\xE7\xE3o n\xE3o encontrada" });
    const items = await pool.query(
      `SELECT mi.*, f.name AS food_name, pr.commercial_name AS product_name
       FROM meal_items mi
       LEFT JOIN foods f ON f.id = mi.food_id
       LEFT JOIN products pr ON pr.id = mi.product_id
       WHERE mi.meal_id = $1 ORDER BY mi.created_at`,
      [req.params.id]
    );
    json(res, 200, { ...meal.rows[0], items: items.rows });
  })
);
async function insertMealItems(client, mealId, items) {
  for (const it of items) {
    const weight = it.weight_grams ?? 0;
    let calc = {};
    if (it.food_id) {
      const { rows } = await client.query(
        `SELECT calc_food_portion(
           $2,
           f.calories_per_100g, f.protein_per_100g, f.carbs_per_100g,
           f.fat_total_per_100g, f.fiber_per_100g, f.sugars_per_100g, f.sodium_per_100g
         ) AS c
         FROM foods f WHERE f.id = $1`,
        [it.food_id, weight]
      );
      calc = rows[0]?.c || {};
    } else if (it.product_id) {
      const { rows } = await client.query(
        `SELECT calc_food_portion(
           $2, p.calories_per_100, p.protein_per_100, p.carbs_per_100,
           p.fat_per_100, p.fiber_per_100, NULL, p.sodium_per_100
         ) AS c
         FROM products p WHERE p.id = $1`,
        [it.product_id, weight]
      );
      calc = rows[0]?.c || {};
    }
    await client.query(
      `INSERT INTO meal_items
         (meal_id, food_id, product_id, weight_grams, calories, protein, carbs, fat, fiber, source, verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        mealId,
        it.food_id || null,
        it.product_id || null,
        weight,
        it.calories ?? calc.calories ?? null,
        it.protein ?? calc.protein ?? null,
        it.carbs ?? calc.carbs ?? null,
        it.fat ?? calc.fat ?? null,
        it.fiber ?? calc.fiber ?? null,
        it.source || "manual",
        it.verified ?? false
      ]
    );
  }
}
apiRouter.post(
  "/meals",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.meal_date || !b.meal_type || !b.identification_method) {
      return json(res, 400, {
        error: "Data, tipo e m\xE9todo de identifica\xE7\xE3o s\xE3o obrigat\xF3rios."
      });
    }
    const actor = profileIdOf(req);
    const spaceId = await primarySpaceId(actor);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO meals (
           kitchen_space_id, user_id, meal_date, meal_type, title, photo_path,
           identification_method, confidence_level, confidence_notes, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          spaceId,
          b.user_id || actor,
          b.meal_date,
          b.meal_type,
          b.title || null,
          b.photo_path || null,
          b.identification_method,
          b.confidence_level ?? null,
          b.confidence_notes || null,
          b.external_id || null
        ]
      );
      const meal = rows[0];
      if (Array.isArray(b.items)) await insertMealItems(client, meal.id, b.items);
      await client.query("COMMIT");
      await pool.query(`SELECT emit_sync_event($1,'meals',$2,'insert',NULL)`, [spaceId, meal.id]);
      const totals = await pool.query(`SELECT * FROM meals WHERE id = $1`, [meal.id]);
      json(res, 201, totals.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);
apiRouter.put(
  "/meals/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Refei\xE7\xE3o n\xE3o encontrada" });
    const meal = current.rows[0];
    if (!req.spaceIds.includes(meal.kitchen_space_id)) {
      return json(res, 403, { error: "Refei\xE7\xE3o de outro espa\xE7o." });
    }
    const admin = await isAdmin(actor, meal.kitchen_space_id);
    if (!admin && meal.user_id !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para editar esta refei\xE7\xE3o." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fields = [];
      const values = [req.params.id];
      let i = 2;
      for (const key of [
        "meal_date",
        "meal_type",
        "title",
        "photo_path",
        "identification_method",
        "confidence_level",
        "confidence_notes"
      ]) {
        if (b[key] !== void 0) {
          fields.push(`${key} = $${i++}`);
          values.push(b[key]);
        }
      }
      if (!fields.length && !Array.isArray(b.items)) {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "Nada para atualizar." });
      }
      fields.push(`updated_by = $${i++}`);
      values.push(actor);
      const { rows } = await client.query(
        `UPDATE meals SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
        values
      );
      if (Array.isArray(b.items)) {
        await client.query(`DELETE FROM meal_items WHERE meal_id = $1`, [req.params.id]);
        await insertMealItems(client, req.params.id, b.items);
      }
      await client.query("COMMIT");
      await pool.query(`SELECT emit_sync_event($1,'meals',$2,'update',NULL)`, [
        meal.kitchen_space_id,
        meal.id
      ]);
      const totals = await pool.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
      json(res, 200, totals.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);
apiRouter.delete(
  "/meals/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Refei\xE7\xE3o n\xE3o encontrada" });
    const meal = current.rows[0];
    const admin = await isAdmin(actor, meal.kitchen_space_id);
    if (!admin && meal.user_id !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para excluir esta refei\xE7\xE3o." });
    }
    const { rows } = await pool.query(
      `UPDATE meals SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: "Refei\xE7\xE3o j\xE1 exclu\xEDda" });
    await pool.query(`SELECT emit_sync_event($1,'meals',$2,'delete',NULL)`, [
      meal.kitchen_space_id,
      req.params.id
    ]);
    json(res, 200, { success: true });
  })
);
apiRouter.post(
  "/meals/:id/restore",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Refei\xE7\xE3o n\xE3o encontrada" });
    const admin = await isAdmin(actor, current.rows[0].kitchen_space_id);
    if (!admin && current.rows[0].user_id !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para restaurar esta refei\xE7\xE3o." });
    }
    const { rows } = await pool.query(
      `UPDATE meals SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    let sql = `SELECT o.*, p.name AS requester_name, r.title AS recipe_title
               FROM orders o
               LEFT JOIN profiles p ON p.id = o.requester_id
               LEFT JOIN recipes r ON r.id = o.recipe_id
               WHERE o.kitchen_space_id = ANY($1::uuid[])`;
    const params = [req.spaceIds];
    let i = 2;
    if (status) {
      sql += ` AND o.status = $${i++}`;
      params.push(status);
    }
    sql += ` ORDER BY o.created_at DESC`;
    const { rows } = await pool.query(sql, params);
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const order = await pool.query(
      `SELECT o.*, p.name AS requester_name
       FROM orders o LEFT JOIN profiles p ON p.id = o.requester_id
       WHERE o.id = $1 AND o.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!order.rowCount) return json(res, 404, { error: "Pedido n\xE3o encontrado" });
    const history = await pool.query(
      `SELECT h.*, p.name AS changed_by_name
       FROM order_status_history h
       LEFT JOIN profiles p ON p.id = h.changed_by
       WHERE h.order_id = $1 ORDER BY h.changed_at`,
      [req.params.id]
    );
    json(res, 200, { ...order.rows[0], history: history.rows });
  })
);
apiRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.description) return json(res, 400, { error: "Descri\xE7\xE3o \xE9 obrigat\xF3ria" });
    const actor = profileIdOf(req);
    const spaceId = await primarySpaceId(actor);
    const { rows } = await pool.query(
      `INSERT INTO orders (
         kitchen_space_id, requester_id, description, reference_photo_path,
         desired_ingredients, recipe_id, observations, external_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        spaceId,
        b.requester_id || actor,
        b.description,
        b.reference_photo_path || null,
        b.desired_ingredients || null,
        b.recipe_id || null,
        b.observations || null,
        b.external_id || null
      ]
    );
    await pool.query(`SELECT emit_sync_event($1,'orders',$2,'insert',NULL)`, [spaceId, rows[0].id]);
    json(res, 201, rows[0]);
  })
);
var ORDER_TRANSITIONS = {
  pendente: ["em_preparacao", "cancelada"],
  em_preparacao: ["concluida", "cancelada"],
  concluida: [],
  cancelada: []
};
apiRouter.put(
  "/orders/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!status) return json(res, 400, { error: "Status \xE9 obrigat\xF3rio" });
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Pedido n\xE3o encontrado" });
    const order = current.rows[0];
    if (!req.spaceIds.includes(order.kitchen_space_id)) {
      return json(res, 403, { error: "Pedido de outro espa\xE7o." });
    }
    const admin = await isAdmin(actor, order.kitchen_space_id);
    if (!admin && order.requester_id !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para alterar este pedido." });
    }
    const allowed = ORDER_TRANSITIONS[order.status] || [];
    if (!admin && !allowed.includes(status)) {
      return json(res, 422, {
        error: `Transi\xE7\xE3o inv\xE1lida de ${order.status} para ${status}.`
      });
    }
    const { rows } = await pool.query(
      `UPDATE orders SET status = $2, updated_by = $3,
              completed_at = CASE WHEN $2 = 'concluida' THEN now() ELSE completed_at END
       WHERE id = $1 RETURNING *`,
      [req.params.id, status, actor]
    );
    await pool.query(`SELECT emit_sync_event($1,'orders',$2,'update',NULL)`, [
      order.kitchen_space_id,
      order.id
    ]);
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/orders/:id/history",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT h.*, p.name AS changed_by_name
       FROM order_status_history h
       LEFT JOIN profiles p ON p.id = h.changed_by
       WHERE h.order_id = $1
         AND h.order_id IN (SELECT id FROM orders WHERE kitchen_space_id = ANY($2::uuid[]))
       ORDER BY h.changed_at`,
      [req.params.id, req.spaceIds]
    );
    json(res, 200, rows);
  })
);
apiRouter.delete(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Pedido n\xE3o encontrado" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora exclui pedidos." });
    }
    await pool.query(`DELETE FROM orders WHERE id = $1`, [req.params.id]);
    json(res, 200, { success: true });
  })
);
apiRouter.get(
  "/shopping-lists",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sl.*, p.name AS created_by_name
       FROM shopping_lists sl
       LEFT JOIN profiles p ON p.id = sl.created_by
       WHERE sl.kitchen_space_id = ANY($1::uuid[])
       ORDER BY sl.created_at DESC`,
      [req.spaceIds]
    );
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/shopping-lists/:id",
  asyncHandler(async (req, res) => {
    const list = await pool.query(
      `SELECT * FROM shopping_lists
       WHERE id = $1 AND kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!list.rowCount) return json(res, 404, { error: "Lista n\xE3o encontrada" });
    const items = await pool.query(
      `SELECT sli.*, f.name AS food_name, pr.commercial_name AS product_name
       FROM shopping_list_items sli
       LEFT JOIN foods f ON f.id = sli.food_id
       LEFT JOIN products pr ON pr.id = sli.product_id
       WHERE sli.shopping_list_id = $1 ORDER BY sli.created_at`,
      [req.params.id]
    );
    json(res, 200, { ...list.rows[0], items: items.rows });
  })
);
apiRouter.post(
  "/shopping-lists",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) return json(res, 400, { error: "Nome \xE9 obrigat\xF3rio" });
    const actor = profileIdOf(req);
    const spaceId = await primarySpaceId(actor);
    const { rows } = await pool.query(
      `INSERT INTO shopping_lists (kitchen_space_id, created_by, name, week_start_date, external_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [spaceId, b.created_by || actor, b.name, b.week_start_date || null, b.external_id || null]
    );
    await pool.query(`SELECT emit_sync_event($1,'shopping_lists',$2,'insert',NULL)`, [
      spaceId,
      rows[0].id
    ]);
    json(res, 201, rows[0]);
  })
);
apiRouter.put(
  "/shopping-lists/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const current = await pool.query(`SELECT * FROM shopping_lists WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Lista n\xE3o encontrada" });
    if (!req.spaceIds.includes(current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Lista de outro espa\xE7o." });
    }
    const fields = [];
    const values = [req.params.id];
    let i = 2;
    for (const key of ["name", "week_start_date"]) {
      if (b[key] !== void 0) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: "Nada para atualizar." });
    const { rows } = await pool.query(
      `UPDATE shopping_lists SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.delete(
  "/shopping-lists/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM shopping_lists WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "Lista n\xE3o encontrada" });
    if (!await isAdmin(actor, current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: "Somente a administradora exclui listas." });
    }
    await pool.query(`DELETE FROM shopping_lists WHERE id = $1`, [req.params.id]);
    json(res, 200, { success: true });
  })
);
apiRouter.post(
  "/shopping-lists/:id/items",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (b.quantity == null || !b.unit) {
      return json(res, 400, { error: "Quantidade e unidade s\xE3o obrigat\xF3rias." });
    }
    const list = await pool.query(
      `SELECT id FROM shopping_lists WHERE id = $1 AND kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!list.rowCount) return json(res, 404, { error: "Lista n\xE3o encontrada." });
    const { rows } = await pool.query(
      `INSERT INTO shopping_list_items
         (shopping_list_id, food_id, product_id, quantity, unit, linked_recipe_id, linked_marmita_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.params.id,
        b.food_id || null,
        b.product_id || null,
        b.quantity,
        b.unit,
        b.linked_recipe_id || null,
        b.linked_marmita_id || null
      ]
    );
    json(res, 201, rows[0]);
  })
);
apiRouter.patch(
  "/shopping-lists/items/:id/purchase",
  asyncHandler(async (req, res) => {
    const purchased = Boolean(req.body?.is_purchased);
    const { rows } = await pool.query(
      `UPDATE shopping_list_items SET is_purchased = $2,
              purchased_at = CASE WHEN $2 THEN now() ELSE NULL END
       WHERE id = $1
         AND shopping_list_id IN (
           SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY($3::uuid[])
         )
       RETURNING *`,
      [req.params.id, purchased, req.spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: "Item n\xE3o encontrado" });
    json(res, 200, rows[0]);
  })
);
apiRouter.delete(
  "/shopping-lists/items/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `DELETE FROM shopping_list_items
       WHERE id = $1
         AND shopping_list_id IN (
           SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY($2::uuid[])
         )
       RETURNING id`,
      [req.params.id, req.spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: "Item n\xE3o encontrado" });
    json(res, 200, { success: true });
  })
);
apiRouter.get(
  "/image-analyses",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ia.*, p.name AS user_name
       FROM image_analyses ia
       LEFT JOIN profiles p ON p.id = ia.user_id
       WHERE ia.kitchen_space_id = ANY($1::uuid[])
       ORDER BY ia.analysis_date DESC`,
      [req.spaceIds]
    );
    json(res, 200, rows);
  })
);
apiRouter.get(
  "/image-analyses/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ia.*, p.name AS user_name
       FROM image_analyses ia
       LEFT JOIN profiles p ON p.id = ia.user_id
       WHERE ia.id = $1 AND ia.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, req.spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: "An\xE1lise n\xE3o encontrada" });
    json(res, 200, rows[0]);
  })
);
apiRouter.post(
  "/image-analyses",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.original_photo_path) {
      return json(res, 400, { error: "Caminho da foto original \xE9 obrigat\xF3rio" });
    }
    const actor = profileIdOf(req);
    const spaceId = await primarySpaceId(actor);
    const { rows } = await pool.query(
      `INSERT INTO image_analyses (
         kitchen_space_id, user_id, original_photo_path, identified_ingredients,
         estimated_quantities, estimated_nutrition, confidence_level, ai_model,
         status, user_corrections, final_result, meal_id, external_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        spaceId,
        b.user_id || actor,
        b.original_photo_path,
        b.identified_ingredients ? JSON.stringify(b.identified_ingredients) : null,
        b.estimated_quantities ? JSON.stringify(b.estimated_quantities) : null,
        b.estimated_nutrition ? JSON.stringify(b.estimated_nutrition) : null,
        b.confidence_level ?? null,
        b.ai_model || null,
        b.status || "pendente",
        b.user_corrections ? JSON.stringify(b.user_corrections) : null,
        b.final_result ? JSON.stringify(b.final_result) : null,
        b.meal_id || null,
        b.external_id || null
      ]
    );
    json(res, 201, rows[0]);
  })
);
apiRouter.put(
  "/image-analyses/:id",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool.query(`SELECT * FROM image_analyses WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: "An\xE1lise n\xE3o encontrada" });
    const analysis = current.rows[0];
    if (!req.spaceIds.includes(analysis.kitchen_space_id)) {
      return json(res, 403, { error: "An\xE1lise de outro espa\xE7o." });
    }
    const admin = await isAdmin(actor, analysis.kitchen_space_id);
    if (!admin && analysis.user_id !== actor) {
      return json(res, 403, { error: "Sem permiss\xE3o para editar esta an\xE1lise." });
    }
    const fields = [];
    const values = [req.params.id];
    let i = 2;
    const jsonFields = ["identified_ingredients", "estimated_quantities", "estimated_nutrition", "user_corrections", "final_result"];
    for (const key of jsonFields) {
      if (b[key] !== void 0) {
        fields.push(`${key} = $${i++}::jsonb`);
        values.push(b[key] === null ? null : JSON.stringify(b[key]));
      }
    }
    for (const key of ["confidence_level", "ai_model", "status", "meal_id"]) {
      if (b[key] !== void 0) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: "Nada para atualizar." });
    const { rows } = await pool.query(
      `UPDATE image_analyses SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );
    json(res, 200, rows[0]);
  })
);
apiRouter.get(
  "/calc/food-portion",
  asyncHandler(async (req, res) => {
    const grams = Number(req.query.grams);
    if (!Number.isFinite(grams)) return json(res, 400, { error: "grams inv\xE1lido" });
    const num2 = (v) => v === void 0 || v === "" || v === null ? null : Number(v);
    const { rows } = await pool.query(
      `SELECT calc_food_portion($1::numeric, $2::numeric, $3::numeric, $4::numeric,
                                $5::numeric, $6::numeric, $7::numeric, $8::numeric) AS resultado`,
      [
        grams,
        num2(req.query.kcal100),
        num2(req.query.protein100),
        num2(req.query.carbs100),
        num2(req.query.fat100),
        num2(req.query.fiber100),
        num2(req.query.sugars100),
        num2(req.query.sodium100)
      ]
    );
    json(res, 200, rows[0].resultado);
  })
);
apiRouter.post(
  "/calc/portion",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const grams = Number(b.grams);
    if (!Number.isFinite(grams)) return json(res, 400, { error: "grams inv\xE1lido" });
    const num2 = (v) => v === void 0 || v === null ? null : Number(v);
    const { rows } = await pool.query(
      `SELECT calc_food_portion($1::numeric, $2::numeric, $3::numeric, $4::numeric,
                                $5::numeric, $6::numeric, $7::numeric, $8::numeric) AS resultado`,
      [
        grams,
        num2(b.calories_per_100g),
        num2(b.protein_per_100g),
        num2(b.carbs_per_100g),
        num2(b.fat_total_per_100g),
        num2(b.fiber_per_100g),
        num2(b.sugars_per_100g),
        num2(b.sodium_per_100g)
      ]
    );
    json(res, 200, rows[0].resultado);
  })
);
var BUCKETS = /* @__PURE__ */ new Set([
  "food-photos",
  "product-photos",
  "label-photos",
  "recipe-photos",
  "marmita-photos",
  "meal-photos"
]);
function ensureUploadDir() {
  fs2.mkdirSync(UPLOAD_ROOT, { recursive: true });
}
function extensionFor(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  return map[mimeType] || "bin";
}
apiRouter.post(
  "/uploads",
  asyncHandler(async (req, res) => {
    const { bucket, file_name, mime_type, data_base64 } = req.body || {};
    if (!bucket || !BUCKETS.has(bucket)) {
      return json(res, 400, { error: "Bucket inv\xE1lido." });
    }
    if (!data_base64) return json(res, 400, { error: "Conte\xFAdo da imagem \xE9 obrigat\xF3rio." });
    const mime = mime_type || "image/jpeg";
    if (!mime.startsWith("image/")) return json(res, 400, { error: "Arquivo precisa ser imagem." });
    const clean = String(data_base64).replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(clean, "base64");
    if (!buffer.length) return json(res, 400, { error: "Imagem vazia." });
    if (buffer.length > 20 * 1024 * 1024) {
      return json(res, 413, { error: "Imagem maior que 20MB." });
    }
    ensureUploadDir();
    const id = crypto.randomUUID();
    const fileName = `${id}.${extensionFor(mime)}`;
    const diskPath = path2.join(UPLOAD_ROOT, fileName);
    fs2.writeFileSync(diskPath, buffer);
    const { rows } = await pool.query(
      `INSERT INTO storage_files
         (bucket, file_path, file_name, mime_type, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [bucket, fileName, file_name || fileName, mime, buffer.length, profileIdOf(req)]
    );
    json(res, 201, {
      id: rows[0].id,
      bucket,
      path: `/api/files/${rows[0].id}`,
      file_name: rows[0].file_name,
      mime_type: mime,
      size_bytes: buffer.length
    });
  })
);
apiRouter.get(
  "/files/:id",
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const { rows } = await pool.query(
      `SELECT sf.*
       FROM storage_files sf
       WHERE sf.id = $1
         AND (
           sf.uploaded_by IS NULL
           OR EXISTS (
             SELECT 1
             FROM memberships mine
             JOIN memberships owner ON owner.kitchen_space_id = mine.kitchen_space_id
             WHERE mine.profile_id = $2
               AND owner.profile_id = sf.uploaded_by
           )
         )`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: "Arquivo n\xE3o encontrado" });
    const file = rows[0];
    const diskPath = path2.join(UPLOAD_ROOT, file.file_path);
    if (!fs2.existsSync(diskPath)) return json(res, 404, { error: "Arquivo f\xEDsico ausente" });
    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    fs2.createReadStream(diskPath).pipe(res);
  })
);
apiRouter.delete(
  "/files/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM storage_files WHERE id = $1`, [req.params.id]);
    if (!rows.length) return json(res, 404, { error: "Arquivo n\xE3o encontrado" });
    const file = rows[0];
    const actor = profileIdOf(req);
    if (file.uploaded_by !== actor) {
      const admin = await isAdmin(actor, await primarySpaceId(actor));
      if (!admin) return json(res, 403, { error: "Sem permiss\xE3o." });
    }
    const diskPath = path2.join(UPLOAD_ROOT, file.file_path);
    if (fs2.existsSync(diskPath)) fs2.unlinkSync(diskPath);
    await pool.query(`DELETE FROM storage_files WHERE id = $1`, [req.params.id]);
    json(res, 200, { success: true });
  })
);
apiRouter.get(
  "/sync/status",
  asyncHandler(async (req, res) => {
    const spaces = req.spaceIds;
    const state = await pool.query(`SELECT updated_at FROM app_state WHERE id = 'mariana-kitchen'`);
    const latest = await pool.query(
      `SELECT COALESCE(max(id), 0) AS last_event_id, count(*)::int AS events
       FROM sync_events WHERE kitchen_space_id = ANY($1::uuid[])`,
      [spaces]
    );
    const counts = {};
    for (const table of [
      "foods",
      "products",
      "recipes",
      "marmitas",
      "meals",
      "orders",
      "shopping_lists",
      "image_analyses"
    ]) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS c FROM ${table}
         WHERE kitchen_space_id = ANY($1::uuid[])`,
        [spaces]
      );
      counts[table] = rows[0].c;
    }
    json(res, 200, {
      ok: true,
      lastUpdated: state.rows[0]?.updated_at || null,
      lastEventId: Number(latest.rows[0]?.last_event_id || 0),
      events: latest.rows[0]?.events || 0,
      counts
    });
  })
);
apiRouter.get(
  "/sync/events",
  asyncHandler(async (req, res) => {
    const after = Number(req.query.after || 0);
    const { rows } = await pool.query(
      `SELECT * FROM sync_events
       WHERE kitchen_space_id = ANY($1::uuid[]) AND id > $2
       ORDER BY id ASC LIMIT 200`,
      [req.spaceIds, after]
    );
    json(res, 200, { events: rows, lastEventId: rows.length ? Number(rows[rows.length - 1].id) : after });
  })
);
apiRouter.get(
  "/data/status",
  asyncHandler(async (req, res) => {
    const spaces = req.spaceIds;
    const counts = {};
    for (const table of [
      "foods",
      "products",
      "recipes",
      "marmitas",
      "meals",
      "orders",
      "shopping_lists",
      "image_analyses",
      "storage_files"
    ]) {
      const { rows } = await pool.query(`SELECT count(*)::int AS c FROM ${table}`);
      counts[table] = rows[0].c;
    }
    json(res, 200, { ok: true, spaces, counts });
  })
);
apiRouter.use((err, _req, res, _next) => {
  console.error("Erro na API:", err);
  if (res.headersSent) return;
  json(res, err.status || 500, {
    error: err.message || "Erro interno na API",
    code: err.code || void 0
  });
});
var api_default = apiRouter;

// src/normalize.ts
var num = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
var per100 = (value, portionGrams) => {
  const v = num(value);
  if (v === null || !portionGrams) return null;
  return v / portionGrams * 100;
};
var cleanText = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
function prepState(value) {
  const allowed = ["cru", "cozido", "grelhado", "assado", "refogado", "frito", "no_vapor"];
  return allowed.includes(value) ? value : "cru";
}
function nutritionSource(value) {
  const map = {
    TACO: "TACO",
    TBCA: "TBCA",
    USDA: "USDA",
    "Open Food Facts": "Open Food Facts",
    "R\xF3tulo OCR": "R\xF3tulo",
    "R\xF3tulo": "R\xF3tulo",
    IA: "Manual",
    Manual: "Manual"
  };
  return map[value] || "Manual";
}
function productDataSource(value) {
  const map = {
    "Open Food Facts": "Open Food Facts",
    "FatSecret": "FatSecret",
    "R\xF3tulo OCR": "R\xF3tulo",
    "R\xF3tulo": "R\xF3tulo",
    "IA Gemini": "IA Gemini",
    "IA": "IA Gemini",
    "Banco Local": "Banco Local",
    "TACO/TBCA": "TACO/TBCA",
    Manual: "Manual"
  };
  return map[value] || "Manual";
}
async function findSpace(profileId) {
  const { rows } = await pool.query(
    `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1 ORDER BY joined_at LIMIT 1`,
    [profileId]
  );
  return rows[0]?.kitchen_space_id || null;
}
async function findFoodByName(client, spaceId, name) {
  if (!name) return null;
  const { rows } = await client.query(
    `SELECT id FROM foods
     WHERE kitchen_space_id = $1 AND deleted_at IS NULL
       AND lower(btrim(name)) = lower(btrim($2))
     ORDER BY created_at LIMIT 1`,
    [spaceId, name]
  );
  return rows[0]?.id || null;
}
async function upsertFood(client, spaceId, profileId, food, externalId) {
  const name = cleanText(food.name);
  if (!name) return null;
  const portion = num(food.portionGrams) || 100;
  const brand = cleanText(food.brand);
  const state = prepState(food.prepState);
  const existing = await client.query(
    `SELECT id FROM foods
     WHERE kitchen_space_id = $1 AND deleted_at IS NULL
       AND lower(btrim(name)) = lower(btrim($2))
       AND prep_state = $3
       AND lower(btrim(COALESCE(brand,''))) = lower(btrim(COALESCE($4,'')))
     LIMIT 1`,
    [spaceId, name, state, brand || ""]
  );
  const values = [
    per100(food.calories, portion),
    per100(food.protein, portion),
    per100(food.carbs, portion),
    per100(food.fat, portion),
    per100(food.fiber, portion),
    nutritionSource(food.source),
    cleanText(food.source) || "Manual",
    food.verified ? "verified" : "pending",
    brand
  ];
  if (existing.rowCount) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE foods SET
         calories_per_100g = COALESCE($2, calories_per_100g),
         protein_per_100g = COALESCE($3, protein_per_100g),
         carbs_per_100g = COALESCE($4, carbs_per_100g),
         fat_total_per_100g = COALESCE($5, fat_total_per_100g),
         fiber_per_100g = COALESCE($6, fiber_per_100g),
         nutrition_source = $7,
         data_origin = $8,
         verification_status = $9,
         brand = COALESCE(brand, $10),
         updated_by = $11,
         external_id = COALESCE(external_id, $12)
       WHERE id = $1`,
      [id, ...values, profileId, externalId]
    );
    return id;
  }
  const { rows } = await client.query(
    `INSERT INTO foods (
       kitchen_space_id, created_by, name, brand, category, prep_state,
       calories_per_100g, protein_per_100g, carbs_per_100g, fat_total_per_100g,
       fiber_per_100g, nutrition_source, data_origin, verification_status, external_id
     ) VALUES ($1,$2,$3,$4,'Cadastro manual',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      spaceId,
      profileId,
      name,
      brand,
      state,
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5],
      values[6],
      values[7],
      externalId
    ]
  );
  if (rows[0]?.id) return rows[0].id;
  const fallback = await findFoodByName(client, spaceId, name);
  return fallback;
}
async function upsertProduct(client, spaceId, profileId, food, externalId) {
  const barcode = cleanText(food.barcode);
  const name = cleanText(food.name);
  if (!barcode || !name) return null;
  if (!/^\d{8}$|^\d{12,14}$/.test(barcode)) return null;
  const portion = num(food.portionGrams) || 100;
  const p100 = food.per100g || {};
  const values = [
    p100.calories ?? per100(food.calories, portion),
    p100.protein ?? per100(food.protein, portion),
    p100.carbs ?? per100(food.carbs, portion),
    p100.fat ?? per100(food.fat, portion),
    p100.fiber ?? per100(food.fiber, portion),
    p100.sodium ?? null
  ];
  const existing = await client.query(`SELECT id FROM products WHERE barcode = $1`, [barcode]);
  if (existing.rowCount) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE products SET
         calories_per_100 = COALESCE($2, calories_per_100),
         protein_per_100 = COALESCE($3, protein_per_100),
         carbs_per_100 = COALESCE($4, carbs_per_100),
         fat_per_100 = COALESCE($5, fat_per_100),
         fiber_per_100 = COALESCE($6, fiber_per_100),
         sodium_per_100 = COALESCE($7, sodium_per_100),
         updated_by = $8,
         last_updated_at = now(),
         external_id = COALESCE(external_id, $9)
       WHERE id = $1`,
      [id, ...values, profileId, externalId]
    );
    return id;
  }
  const { rows } = await client.query(
    `INSERT INTO products (
       kitchen_space_id, created_by, barcode, commercial_name, brand,
       serving_quantity, serving_unit, calories_per_100, protein_per_100,
       carbs_per_100, fat_per_100, fiber_per_100, sodium_per_100,
       data_source, verification_status, external_id
     ) VALUES ($1,$2,$3,$4,$5,$6,'g',$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (barcode) DO NOTHING
     RETURNING id`,
    [
      spaceId,
      profileId,
      barcode,
      name,
      cleanText(food.brand),
      portion,
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5],
      productDataSource(food.source),
      food.verified ? "verified" : "pending",
      externalId
    ]
  );
  return rows[0]?.id || null;
}
async function syncRecipes(client, spaceId, profileId, recipes) {
  for (const recipe of recipes) {
    if (!recipe?.id || !recipe?.title) continue;
    const externalId = `recipe:${recipe.id}`;
    const servings = Math.max(1, Number(recipe.servings) || 1);
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const existing = await client.query(
      `SELECT id FROM recipes WHERE kitchen_space_id = $1 AND external_id = $2`,
      [spaceId, externalId]
    );
    let recipeId;
    if (existing.rowCount) {
      recipeId = existing.rows[0].id;
      await client.query(
        `UPDATE recipes SET
           title = $2, description = $3, photo_path = $4, instructions = $5,
           servings = $6, prep_time_minutes = $7, status = $8, is_favorite = $9,
           carinho_tip = $10, updated_by = $11
         WHERE id = $1`,
        [
          recipeId,
          recipe.title,
          cleanText(recipe.description),
          cleanText(recipe.photoUrl),
          Array.isArray(recipe.instructions) ? recipe.instructions.join("\n") : cleanText(recipe.instructions),
          servings,
          num(recipe.prepTimeMinutes),
          recipe.status || "aprovada",
          Boolean(recipe.isFavorite),
          cleanText(recipe.carinhoTip),
          profileId
        ]
      );
      await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [recipeId]);
    } else {
      const inserted = await client.query(
        `INSERT INTO recipes (
           kitchen_space_id, author_id, title, description, photo_path, instructions,
           servings, prep_time_minutes, status, is_favorite, carinho_tip, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          spaceId,
          profileId,
          recipe.title,
          cleanText(recipe.description),
          cleanText(recipe.photoUrl),
          Array.isArray(recipe.instructions) ? recipe.instructions.join("\n") : cleanText(recipe.instructions),
          servings,
          num(recipe.prepTimeMinutes),
          recipe.status || "aprovada",
          Boolean(recipe.isFavorite),
          cleanText(recipe.carinhoTip),
          externalId
        ]
      );
      if (!inserted.rows[0]?.id) continue;
      recipeId = inserted.rows[0].id;
    }
    const totalWeight = ingredients.reduce(
      (acc, ing) => acc + (num(ing.grams) || num(ing.weight_grams) || 0),
      0
    );
    const recipeCalories = num(recipe.caloriesPerServing);
    const recipeProtein = num(recipe.proteinPerServing);
    const recipeCarbs = num(recipe.carbsPerServing);
    const recipeFat = num(recipe.fatPerServing);
    const recipeFiber = num(recipe.fiberPerServing);
    for (const ing of ingredients) {
      const weight = num(ing.grams) ?? num(ing.weight_grams) ?? 0;
      const foodId = await findFoodByName(client, spaceId, ing.name || "");
      const ratio = totalWeight > 0 ? weight / totalWeight : 0;
      await client.query(
        `INSERT INTO recipe_ingredients
           (recipe_id, food_id, quantity, unit, weight_grams, calories, protein, carbs, fat, fiber)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          recipeId,
          foodId,
          weight || 1,
          "g",
          weight,
          recipeCalories === null ? null : recipeCalories * servings * ratio,
          recipeProtein === null ? null : recipeProtein * servings * ratio,
          recipeCarbs === null ? null : recipeCarbs * servings * ratio,
          recipeFat === null ? null : recipeFat * servings * ratio,
          recipeFiber === null ? null : recipeFiber * servings * ratio
        ]
      );
    }
  }
}
async function syncMarmitas(client, spaceId, profileId, marmitas) {
  for (const marmita of marmitas) {
    if (!marmita?.id || !marmita?.name) continue;
    const externalId = `marmita:${marmita.id}`;
    const existing = await client.query(
      `SELECT id FROM marmitas WHERE kitchen_space_id = $1 AND external_id = $2`,
      [spaceId, externalId]
    );
    let marmitaId;
    if (existing.rowCount) {
      marmitaId = existing.rows[0].id;
      await client.query(
        `UPDATE marmitas SET
           name = $2, description = $3, photo_path = $4, status = $5, updated_by = $6
         WHERE id = $1`,
        [
          marmitaId,
          marmita.name,
          cleanText(marmita.description),
          cleanText(marmita.photoUrl),
          marmita.status || "publicada",
          profileId
        ]
      );
      await client.query(`DELETE FROM marmita_items WHERE marmita_id = $1`, [marmitaId]);
    } else {
      const inserted = await client.query(
        `INSERT INTO marmitas (
           kitchen_space_id, prepared_by, name, description, photo_path, status, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          spaceId,
          profileId,
          marmita.name,
          cleanText(marmita.description),
          cleanText(marmita.photoUrl),
          marmita.status || "publicada",
          externalId
        ]
      );
      if (!inserted.rows[0]?.id) continue;
      marmitaId = inserted.rows[0].id;
    }
    const items = Array.isArray(marmita.items) ? marmita.items : [];
    for (const item of items) {
      const foodId = await findFoodByName(client, spaceId, item.foodName || "");
      await client.query(
        `INSERT INTO marmita_items
           (marmita_id, food_id, weight_grams, calories, protein, carbs, fat, fiber)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          marmitaId,
          foodId,
          num(item.weightGrams) || 0,
          num(item.calories),
          num(item.protein),
          num(item.carbs),
          num(item.fat),
          num(item.fiber)
        ]
      );
    }
  }
}
async function syncMeals(client, spaceId, profileId, meals) {
  for (const meal of meals) {
    if (!meal?.id || !meal?.date || !meal?.mealType) continue;
    const externalId = `meal:${meal.id}`;
    const existing = await client.query(
      `SELECT id FROM meals WHERE kitchen_space_id = $1 AND external_id = $2`,
      [spaceId, externalId]
    );
    let mealId;
    if (existing.rowCount) {
      mealId = existing.rows[0].id;
      await client.query(
        `UPDATE meals SET
           title = $2, photo_path = $3, confidence_notes = $4, updated_by = $5,
           is_planned = $6, consumed_at = $7, total_calories = $8, total_protein = $9,
           total_carbs = $10, total_fat = $11, total_fiber = $12
         WHERE id = $1`,
        [
          mealId,
          cleanText(meal.title),
          cleanText(meal.photoUrl),
          cleanText(meal.confidenceNotes),
          profileId,
          Boolean(meal.isPlanned),
          meal.consumedAt || null,
          num(meal.totalCalories),
          num(meal.totalProtein),
          num(meal.totalCarbs),
          num(meal.totalFat),
          num(meal.totalFiber)
        ]
      );
      await client.query(`DELETE FROM meal_items WHERE meal_id = $1`, [mealId]);
    } else {
      const inserted = await client.query(
        `INSERT INTO meals (
           kitchen_space_id, user_id, meal_date, meal_type, title, photo_path,
           identification_method, confidence_notes, external_id,
           is_planned, consumed_at, total_calories, total_protein, total_carbs, total_fat, total_fiber
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          spaceId,
          profileId,
          meal.date,
          meal.mealType,
          cleanText(meal.title),
          cleanText(meal.photoUrl),
          meal.confidenceNotes ? "foto" : "manual",
          cleanText(meal.confidenceNotes),
          externalId,
          Boolean(meal.isPlanned),
          meal.consumedAt || null,
          num(meal.totalCalories),
          num(meal.totalProtein),
          num(meal.totalCarbs),
          num(meal.totalFat),
          num(meal.totalFiber)
        ]
      );
      if (!inserted.rows[0]?.id) continue;
      mealId = inserted.rows[0].id;
    }
    const foods = Array.isArray(meal.foods) ? meal.foods : [];
    for (const food of foods) {
      const foodId = await findFoodByName(client, spaceId, food.name || "");
      await client.query(
        `INSERT INTO meal_items
           (meal_id, food_id, weight_grams, calories, protein, carbs, fat, fiber, source, verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          mealId,
          foodId,
          num(food.portionGrams) || 0,
          num(food.calories),
          num(food.protein),
          num(food.carbs),
          num(food.fat),
          num(food.fiber),
          nutritionSource(food.source),
          Boolean(food.verified)
        ]
      );
    }
  }
}
async function syncAppStateToDatabase(state, profileId) {
  if (!pool || !state || !profileId) return { ok: false, reason: "missing_data" };
  const spaceId = await findSpace(profileId);
  if (!spaceId) return { ok: false, reason: "no_space" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customFoods = Array.isArray(state.customFoods) ? state.customFoods : [];
    for (const food of customFoods) {
      if (!food?.id) continue;
      await upsertFood(client, spaceId, profileId, food, `food:${food.id}`);
      if (food.barcode) {
        await upsertProduct(client, spaceId, profileId, food, `product:${food.id}`);
      }
    }
    await syncRecipes(client, spaceId, profileId, Array.isArray(state.recipes) ? state.recipes : []);
    await syncMarmitas(
      client,
      spaceId,
      profileId,
      Array.isArray(state.marmitas) ? state.marmitas : []
    );
    const logs = [
      ...Array.isArray(state.todayLogs) ? state.todayLogs : [],
      ...Array.isArray(state.historyLogs) ? state.historyLogs : []
    ];
    await syncMeals(client, spaceId, profileId, logs);
    await client.query(`SELECT emit_sync_event($1,'app_state',NULL,'sync',$2)`, [
      spaceId,
      JSON.stringify({ lastUpdated: state.lastUpdated || (/* @__PURE__ */ new Date()).toISOString() })
    ]);
    await client.query("COMMIT");
    return { ok: true, spaceId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Falha ao normalizar AppState:", err.message || err);
    return { ok: false, reason: err.message || String(err) };
  } finally {
    client.release();
  }
}

// src/images.ts
import crypto2 from "crypto";
import fs3 from "fs";
import path3 from "path";
var UPLOAD_ROOT2 = path3.resolve(process.cwd(), "data", "uploads");
var DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
function extensionFor2(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  return map[mimeType] || "bin";
}
async function persistDataUrls(value, profileId, bucket = "meal-photos") {
  let replaced = 0;
  async function walk(node) {
    if (typeof node === "string") {
      const match = node.match(DATA_URL_RE);
      if (!match) return node;
      const [, mime, base64] = match;
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) return node;
      fs3.mkdirSync(UPLOAD_ROOT2, { recursive: true });
      const id = crypto2.randomUUID();
      const fileName = `${id}.${extensionFor2(mime)}`;
      fs3.writeFileSync(path3.join(UPLOAD_ROOT2, fileName), buffer);
      if (pool) {
        await pool.query(
          `INSERT INTO storage_files
             (id, bucket, file_path, file_name, mime_type, size_bytes, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, bucket, fileName, fileName, mime, buffer.length, profileId]
        );
      }
      replaced++;
      return `/api/files/${id}`;
    }
    if (Array.isArray(node)) {
      const out = [];
      for (const item of node) out.push(await walk(item));
      return out;
    }
    if (node && typeof node === "object") {
      const out = {};
      for (const [key, item] of Object.entries(node)) out[key] = await walk(item);
      return out;
    }
    return node;
  }
  const result = await walk(value);
  return { value: result, replaced };
}

// server.ts
var app = express();
var PORT = 3e3;
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://marimeuamor-kp3n.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});
process.env.GOOGLE_GENAI_API_VERSION = "v1beta";
var GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_KEY || "";
var ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  apiVersion: "v1beta",
  httpOptions: {
    apiVersion: "v1beta",
    headers: {
      "User-Agent": "aistudio-build"
    },
    // Sem retry interno longo (o padrão do SDK são 5 tentativas com backoff que estouram
    // o timeout serverless do Vercel) e teto de 25s por tentativa.
    retryOptions: { attempts: 1 },
    timeout: 25e3
  }
});
async function callGeminiRest(model, params) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_KEY || "";
  if (!apiKey) throw new Error("Chave GEMINI_API_KEY n\xE3o configurada no servidor.");
  const cleanModel = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let parts = [];
  if (typeof params.contents === "string") {
    parts = [{ text: params.contents }];
  } else if (params.contents?.parts) {
    parts = params.contents.parts;
  } else if (Array.isArray(params.contents)) {
    if (params.contents[0]?.parts) {
      parts = params.contents[0].parts;
    } else {
      parts = params.contents;
    }
  }
  const cleanParts = parts.map((p) => {
    if (p.inlineData || p.inline_data) {
      const id = p.inlineData || p.inline_data;
      return {
        inlineData: {
          mimeType: id.mimeType || id.mime_type || "image/jpeg",
          data: id.data
        }
      };
    }
    if (p.text !== void 0) {
      return { text: String(p.text) };
    }
    return p;
  });
  const body = {
    contents: [{ role: "user", parts: cleanParts }],
    generationConfig: {
      temperature: params.temperature ?? 0.2,
      responseMimeType: params.responseMimeType || "application/json"
    }
  };
  if (params.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: params.systemInstruction }]
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9e3);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal
  });
  clearTimeout(timer);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`REST API ${cleanModel} HTTP ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { text };
}
async function callGemini(params) {
  const candidateModels = [
    "gemini-3.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
  ];
  let normalizedSdkContents;
  if (typeof params.contents === "string") {
    normalizedSdkContents = params.contents;
  } else if (params.contents?.parts) {
    normalizedSdkContents = [
      {
        role: "user",
        parts: params.contents.parts.map((p) => {
          if (p.inlineData || p.inline_data) {
            const id = p.inlineData || p.inline_data;
            return {
              inlineData: {
                mimeType: id.mimeType || id.mime_type || "image/jpeg",
                data: id.data
              }
            };
          }
          return p;
        })
      }
    ];
  } else {
    normalizedSdkContents = params.contents;
  }
  let lastError = null;
  for (const model of candidateModels) {
    const cleanModel = model.replace(/^models\//, "");
    try {
      const config = {};
      if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
      if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
      if (params.responseSchema) config.responseSchema = params.responseSchema;
      if (params.temperature !== void 0) config.temperature = params.temperature;
      const response = await ai.models.generateContent({
        model: cleanModel,
        contents: normalizedSdkContents,
        config: Object.keys(config).length > 0 ? config : void 0
      });
      if (response && response.text) {
        return response;
      }
    } catch (err) {
      lastError = err;
      console.warn(`Tentativa SDK modelo ${cleanModel} falhou:`, err?.message || err);
      if (params.responseSchema) {
        try {
          const configNoSchema = {};
          if (params.systemInstruction) configNoSchema.systemInstruction = params.systemInstruction;
          if (params.responseMimeType) configNoSchema.responseMimeType = params.responseMimeType;
          if (params.temperature !== void 0) configNoSchema.temperature = params.temperature;
          const retryResponse = await ai.models.generateContent({
            model: cleanModel,
            contents: normalizedSdkContents,
            config: Object.keys(configNoSchema).length > 0 ? configNoSchema : void 0
          });
          if (retryResponse && retryResponse.text) {
            return retryResponse;
          }
        } catch (retryErr) {
          lastError = retryErr;
          console.warn(`Tentativa SDK sem schema em ${cleanModel} falhou:`, retryErr?.message || retryErr);
        }
      }
    }
    try {
      const restResponse = await callGeminiRest(cleanModel, params);
      if (restResponse && restResponse.text) {
        return restResponse;
      }
    } catch (restErr) {
      lastError = restErr;
      console.warn(`Tentativa REST v1beta em ${cleanModel} falhou:`, restErr?.message || restErr);
    }
  }
  throw lastError || new Error("Nenhum modelo Gemini atualizado conseguiu responder \xE0 solicita\xE7\xE3o.");
}
app.get("/api/health", async (req, res) => {
  const database = await getDatabaseStatus();
  res.status(database.connected ? 200 : 503).json({
    status: database.connected ? "ok" : "degraded",
    appName: "Our Little Kitchen",
    user: "Mari",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    database
  });
});
app.get("/api/storage", async (req, res) => {
  try {
    const profileId = await resolveStorageProfile(req);
    if (!profileId) {
      return res.status(401).json({ error: "N\xE3o autenticado. Fa\xE7a login para acessar os dados." });
    }
    const data = await getAppState();
    if (!data) {
      return res.status(404).json({ error: "Dados n\xE3o encontrados" });
    }
    return res.json(data);
  } catch (err) {
    console.error("Erro ao ler dados do Postgres:", err);
    return res.status(500).json({ error: "Erro ao carregar dados salvos" });
  }
});
function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}
async function resolveStorageProfile(req) {
  const token = readCookie(req, "olk_session");
  if (token && pool) {
    const crypto3 = await import("crypto");
    const hash = crypto3.createHash("sha256").update(token).digest("hex");
    const { rows } = await pool.query(
      `SELECT profile_id FROM profile_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hash]
    );
    if (rows[0]?.profile_id) return rows[0].profile_id;
  }
  const headerId = req.header("X-Profile-ID");
  if (headerId && process.env.NODE_ENV !== "production" && process.env.ALLOW_PROFILE_HEADER !== "false") {
    return headerId;
  }
  if (process.env.SINGLE_USER_PROFILE_ID) {
    return process.env.SINGLE_USER_PROFILE_ID;
  }
  return null;
}
app.post("/api/storage", async (req, res) => {
  try {
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: "Corpo da requisi\xE7\xE3o vazio" });
    }
    const profileId = await resolveStorageProfile(req);
    if (!profileId) {
      return res.status(401).json({ error: "N\xE3o autenticado. Fa\xE7a login para salvar os dados." });
    }
    const persisted = await persistDataUrls(data, profileId);
    const lastUpdated = await saveAppState(persisted.value);
    const normalized = await syncAppStateToDatabase({ ...persisted.value, lastUpdated }, profileId);
    return res.json({
      success: true,
      lastUpdated,
      imagesPersisted: persisted.replaced,
      normalized
    });
  } catch (err) {
    console.error("Erro ao salvar dados no Postgres:", err);
    return res.status(500).json({ error: "Erro ao gravar dados no servidor" });
  }
});
var MEAL_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mealName: { type: Type.STRING },
    overallConfidence: { type: Type.INTEGER },
    confidenceNotes: { type: Type.STRING },
    questionsForMariana: { type: Type.ARRAY, items: { type: Type.STRING } },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          foodName: { type: Type.STRING },
          prepState: { type: Type.STRING },
          portionGrams: { type: Type.NUMBER },
          portionReasoning: { type: Type.STRING },
          probableIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          kcalPer100g: { type: Type.NUMBER },
          proteinPer100g: { type: Type.NUMBER },
          carbsPer100g: { type: Type.NUMBER },
          fatPer100g: { type: Type.NUMBER },
          fiberPer100g: { type: Type.NUMBER },
          confidence: { type: Type.INTEGER },
          reasoning: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          fiber: { type: Type.NUMBER }
        },
        required: [
          "foodName",
          "prepState",
          "portionGrams",
          "portionReasoning",
          "kcalPer100g",
          "proteinPer100g",
          "carbsPer100g",
          "fatPer100g",
          "fiberPer100g",
          "confidence",
          "reasoning",
          "calories",
          "protein",
          "carbs",
          "fat",
          "fiber"
        ]
      }
    },
    totals: {
      type: Type.OBJECT,
      properties: {
        totalGrams: { type: Type.NUMBER },
        calories: { type: Type.NUMBER },
        protein: { type: Type.NUMBER },
        carbs: { type: Type.NUMBER },
        fat: { type: Type.NUMBER },
        fiber: { type: Type.NUMBER }
      },
      required: ["totalGrams", "calories", "protein", "carbs", "fat", "fiber"]
    }
  },
  required: ["mealName", "overallConfidence", "confidenceNotes", "questionsForMariana", "items", "totals"]
};
function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
      }
    }
    return {};
  }
}
function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function normalizeMealAnalysis(parsed) {
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items = rawItems.map((it) => {
    const portionGrams = clampNum(it?.portionGrams, 1, 2e3, 0);
    if (portionGrams <= 0) return null;
    const kcal100 = clampNum(it?.kcalPer100g, 0, 950, 0);
    const p100 = clampNum(it?.proteinPer100g, 0, 100, 0);
    const c100 = clampNum(it?.carbsPer100g, 0, 100, 0);
    const g100 = clampNum(it?.fatPer100g, 0, 100, 0);
    const f100 = clampNum(it?.fiberPer100g, 0, 90, 0);
    const round12 = (x) => Math.round(x * 10) / 10;
    const portion = Math.round(portionGrams * 10) / 10;
    return {
      foodName: String(it?.foodName || "Alimento").slice(0, 120),
      prepState: String(it?.prepState || "cozido").slice(0, 60),
      portionGrams: portion,
      portionReasoning: String(it?.portionReasoning || "").slice(0, 300),
      probableIngredients: Array.isArray(it?.probableIngredients) ? it.probableIngredients.map(String).slice(0, 10) : it?.probableIngredients ? [String(it.probableIngredients)] : [],
      kcalPer100g: Math.round(kcal100),
      // Matemática exata no servidor: porção × valor/100g
      calories: Math.round(portion * kcal100 / 100),
      protein: round12(portion * p100 / 100),
      carbs: round12(portion * c100 / 100),
      fat: round12(portion * g100 / 100),
      fiber: round12(portion * f100 / 100),
      confidence: Math.round(clampNum(it?.confidence, 0, 100, 75)),
      reasoning: String(it?.reasoning || it?.portionReasoning || "").slice(0, 300),
      source: "TACO"
    };
  }).filter((x) => x !== null);
  const round1 = (x) => Math.round(x * 10) / 10;
  const totals = items.reduce(
    (acc, it) => {
      acc.totalGrams += it.portionGrams;
      acc.calories += it.calories;
      acc.protein += it.protein;
      acc.carbs += it.carbs;
      acc.fat += it.fat;
      acc.fiber += it.fiber;
      return acc;
    },
    { totalGrams: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  return {
    mealName: String(parsed?.mealName || "Refei\xE7\xE3o analisada").slice(0, 160),
    overallConfidence: Math.round(clampNum(parsed?.overallConfidence, 0, 100, 75)),
    confidenceNotes: String(parsed?.confidenceNotes || "").slice(0, 500),
    questionsForMariana: Array.isArray(parsed?.questionsForMariana) ? parsed.questionsForMariana.map((q) => String(q).slice(0, 300)).slice(0, 5) : [],
    items,
    totals: {
      totalGrams: round1(totals.totalGrams),
      calories: totals.calories,
      protein: round1(totals.protein),
      carbs: round1(totals.carbs),
      fat: round1(totals.fat),
      fiber: round1(totals.fiber)
    }
  };
}
app.post("/api/gemini/analyze-meal", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", notes, mealType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Imagem n\xE3o fornecida" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Chave do Gemini n\xE3o configurada no servidor (Settings > Secrets)"
      });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
    const promptText = `
Voc\xEA \xE9 uma nutricionista cl\xEDnica de excel\xEAncia especializada na Tabela TACO (Tabela Brasileira de Composi\xE7\xE3o de Alimentos) e TBCA da USP.
Analise detalhadamente a refei\xE7\xE3o na fotografia enviada por Mariana.
Refei\xE7\xE3o pretendida: ${mealType || "Refei\xE7\xE3o"}.
Notas adicionais da usu\xE1ria: ${notes || "Nenhuma"}.

DIRETRIZ FUNDAMENTAL DE IDENTIFICA\xC7\xC3O (PRATO DE COMIDA vs. LANCHE / ITEM \xDANICO):
A) SE FOR UM PRATO DE COMIDA COMPOSTO (ex: almo\xE7o, jantar ou marmita com arroz, feij\xE3o, carnes, legumes, salada):
   - Separe e estime CADA ALIMENTO INDIVIDUALMENTE em itens separados na lista "items" (ex: "Arroz branco cozido", "Feij\xE3o carioca cozido", "Peito de frango grelhado", "Salada mista", etc.).
   - Estime com m\xE1xima precis\xE3o o peso em gramas de cada elemento individual no prato.
B) SE FOR UM LANCHE, SANDU\xCDCHE, SALGADO, PIZZA, PASTEL, A\xC7A\xCD OU ITEM \xDANICO (ex: hamb\xFArguer, sandu\xEDche natural, misto-quente, tapioca recheada, coxinha, fatia de pizza, fatia de bolo, p\xE3o de queijo recheado):
   - NUNCA separe o lanche em fatias soltas de p\xE3o e queijo! Estime as calorias e macronutrientes do lanche JUNTAS em 1 item principal coeso (ex: "Hamb\xFArguer artesanal completo com queijo e bacon" ou "Sandu\xEDche natural de frango", "Coxinha de frango", "Fatia de pizza calabresa").
   - Estime o peso total do lanche e seus macronutrientes de forma precisa e certeira com base na composi\xE7\xE3o real de lanches brasileiros.
   - S\xF3 inclua itens adicionais se houver acompanhamentos ou bebidas vis\xEDveis ao lado (ex: "Por\xE7\xE3o de batata frita", "Suco de laranja natural").

M\xC9TODO OBRIGAT\xD3RIO DE C\xC1LCULO E PRECIS\xC3O:
1. ESCALA VISUAL \u2014 use refer\xEAncias da pr\xF3pria cena como r\xE9gua para medir:
   - Prato de almo\xE7o comum \u2248 24 cm de di\xE2metro; potes/marmitas: me\xE7a pela borda vis\xEDvel
   - Garfo \u2248 18 cm, faca \u2248 20 cm, colher de sopa \u2248 14 cm
   - Concha cheia de arroz/feij\xE3o \u2248 100-120 g; rasa \u2248 60-80 g
   - Palmo de carne grelhada \u2248 100 g; fil\xE9 de peito de frango \u2248 100-180 g
   - Ovo inteiro \u2248 55 g; fatia de p\xE3o franc\xEAs \u2248 30 g; fatia de queijo \u2248 25 g
   - Hamb\xFArguer completo m\xE9dio \u2248 200-280 g; sandu\xEDche natural \u2248 180-220 g; coxinha m\xE9dia \u2248 120 g
   - Banana prata inteira \u2248 100 g; punhado de batata frita \u2248 100 g; fatia de bolo \u2248 80-120 g
   Compare cada alimento com essas refer\xEAncias e estime os gramas com rigor t\xE9cnico.
2. Determine o estado de preparo exato (cru, cozido em \xE1gua, grelhado, assado, frito, refogado com \xF3leo/azeite, no vapor) \u2014 ele muda os valores por 100 g.
3. \xD3LEO INVIS\xCDVEL: se houver brilho, fritura ou refogado, some 5-15 g de \xF3leo/azeite (\u2248 45-135 kcal) \xE0 por\xE7\xE3o; s\xF3 n\xE3o some se a foto demonstrar claramente que n\xE3o houve gordura no preparo.
4. Peso l\xEDquido: desconte osso, casca, semente, caro\xE7o e embalagem.
5. Para cada alimento informe os valores POR 100 g usando a refer\xEAncia TACO abaixo (kcal / prote\xEDna g / carboidrato g / gordura g / fibra g):
   arroz branco cozido 128/2.5/28/0.2/1.6 | arroz integral cozido 112/2.6/23/1.0/2.7 | feij\xE3o cozido 76/4.8/14/0.5/8 | macarr\xE3o cozido 147/5/30/1/1.8 | cuscuz 115/3/25/0.5/1.5
   frango peito grelhado 159/32/0/2.5/0 | frango perna/coxa grelhado 205/28/0/9/0 | carne bovina grelhada 220/30/0/10/0 | carne mo\xEDda refogada 160/19/0/8/0 | porco grelhado 240/28/0/14/0
   peixe branco grelhado 130/23/0/4/0 | salm\xE3o grelhado 230/24/0/15/0 | camar\xE3o grelhado 100/20/1/1.5/0 | ovo frito 240/14/1.6/19/0 | ovo cozido 155/13/1.1/11/0
   batata frita 267/3.5/35/13/3 | batata cozida 52/1.2/12/0/1.3 | batata-doce cozida 77/0.6/18/0.1/2.2 | batata-doce assada 90/2/21/0.1/3.3 | aipim cozido 125/0.6/30/0.3/1.8 | pur\xEA de batata 100/2/17/2.5/1.5
   p\xE3o franc\xEAs 330/8/60/5/2.4 | p\xE3o de forma 250/8/48/3.5/2.5 | queijo mussarela 300/19/3/25/0 | requeij\xE3o 260/5/3.5/26/0 | maionese 300/1/4/32/0
   hamb\xFArguer completo 250/14/22/12/1.5 | sandu\xEDche natural frango 190/11/22/6/1.8 | coxinha frango 260/8/30/12/1.2 | pastel de carne frito 310/9/32/16/1 | pizza mussarela 270/11/33/11/2
   azeite/\xF3leo/manteiga 884/0/0/100/0 | farofa pronta 500/6/60/26/4
   br\xF3colis cozido 34/2.8/6/0.4/3.3 | couve refogada 90/3/6/6/4 | cenoura cozida 43/0.8/10/0.2/3.2 | tomate 15/1.1/3.1/0.2/1.2 | salada mista verde 18/1.2/3.5/0.2/1.5
   banana prata 98/1.3/26/0.1/2 | ma\xE7\xE3 56/0.4/15/0.1/1.3 | bolo simples 350/5/50/13/1.5 | chocolate ao leite 550/7/55/33/2
   refrigerante 42/0/11/0/0 | suco de fruta natural 50/0.5/12/0.1/0.3 | a\xE7a\xED na tigela montado 130/2/22/4/2.5
6. AUTO-VERIFICA\xC7\xC3O OBRIGAT\xD3RIA antes de responder:
   a) calorias/100g \u2248 (4 \xD7 carboidratos) + (4 \xD7 prote\xEDnas) + (9 \xD7 gorduras) \u2014 confira a coer\xEAncia;
   b) calorias da por\xE7\xE3o = gramas \xD7 calorias/100g \xF7 100 \u2014 confira cada item; os totais s\xE3o a soma exata dos itens.
7. Explique cada estimativa com medida caseira (ex.: "1 unidade m\xE9dia \u2248 220g", "2 conchas cheias \u2248 140g", "meio prato \u2248 120g").
8. Estime a confian\xE7a geral (0 a 100). Fa\xE7a 1 a 2 perguntas curtas e gentis para Mariana se houver d\xFAvida (ex: "O lanche tinha molho especial ou maionese?").

Responda OBRIGATORIAMENTE em formato JSON com o seguinte formato:
{
  "mealName": "Nome descritivo da refei\xE7\xE3o (ex: Almo\xE7o com Frango Grelhado e Salada OU Hamb\xFArguer Artesanal com Queijo)",
  "overallConfidence": 85,
  "confidenceNotes": "Explica\xE7\xE3o breve da estimativa visual",
  "questionsForMariana": ["Voc\xEA adicionou molho extra ou azeite no preparo?"],
  "items": [
    {
      "foodName": "Peito de frango grelhado OU Hamb\xFArguer Artesanal",
      "prepState": "grelhado",
      "portionGrams": 130,
      "portionReasoning": "Por\xE7\xE3o m\xE9dia com base na escala visual \u2248 130g",
      "probableIngredients": ["peito de frango", "alho", "azeite", "sal"],
      "kcalPer100g": 159,
      "proteinPer100g": 32,
      "carbsPer100g": 0,
      "fatPer100g": 2.5,
      "fiberPer100g": 0,
      "confidence": 90,
      "reasoning": "Estimativa precisa baseada na TACO/TBCA",
      "calories": 207,
      "protein": 41.6,
      "carbs": 0,
      "fat": 3.3,
      "fiber": 0
    }
  ],
  "totals": {
    "totalGrams": 420,
    "calories": 485,
    "protein": 48.2,
    "carbs": 52.0,
    "fat": 8.5,
    "fiber": 7.2
  }
}
`;
    const response = await callGemini({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          },
          { text: promptText }
        ]
      },
      responseMimeType: "application/json",
      responseSchema: MEAL_ANALYSIS_SCHEMA,
      temperature: 0.3
    });
    const parsed = parseJsonLoose(response.text || "{}");
    return res.json(normalizeMealAnalysis(parsed));
  } catch (err) {
    console.error("Erro no reconhecimento alimentar Gemini:", err);
    return res.status(500).json({
      error: "N\xE3o foi poss\xEDvel analisar a fotografia da refei\xE7\xE3o: " + (err.message || "Erro interno")
    });
  }
});
function parsePtBrNumber(val) {
  if (val === null || val === void 0) return null;
  if (typeof val === "number") {
    return isNaN(val) ? null : val;
  }
  const str = String(val).trim();
  if (!str || str === "-" || str.toLowerCase() === "n/a" || str.toLowerCase() === "tr" || str.toLowerCase() === "tra\xE7os") {
    return null;
  }
  const cleaned = str.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      const normalized = cleaned.replace(/\./g, "").replace(",", ".");
      const num3 = parseFloat(normalized);
      return isNaN(num3) ? null : num3;
    } else {
      const normalized = cleaned.replace(/,/g, "");
      const num3 = parseFloat(normalized);
      return isNaN(num3) ? null : num3;
    }
  }
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(",", ".");
    const num3 = parseFloat(normalized);
    return isNaN(num3) ? null : num3;
  }
  const num2 = parseFloat(cleaned);
  return isNaN(num2) ? null : num2;
}
app.post("/api/gemini/ocr-label", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", barcode, productNameHint, brandHint } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Imagem do r\xF3tulo n\xE3o fornecida" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Chave do Gemini n\xE3o configurada no servidor"
      });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
    const promptText = `
Voc\xEA \xE9 uma intelig\xEAncia artificial especialista em rotulagem e tabelas nutricionais segundo as normas da ANVISA (RDC n\xBA 429/2020 e Instru\xE7\xE3o Normativa n\xBA 75/2020 do Brasil).
Analise com rigor t\xE9cnico a fotografia da tabela nutricional / r\xF3tulo enviada por Mariana.

DIRETRIZES FUNDAMENTAIS DE CONFIABILIDADE E FIDELIDADE:
1. TESTE DE LEGIBILIDADE:
   - Se a imagem estiver cortada, muito emba\xE7ada, ileg\xEDvel, sem ilumina\xE7\xE3o adequada ou N\xC3O contiver uma tabela nutricional de alimentos, defina "isLegible": false.
   - Em "illegibleReason", forne\xE7a uma explica\xE7\xE3o gentil e clara em portugu\xEAs instruindo Mariana a tirar uma nova foto mais n\xEDtida, aproximada e com boa ilumina\xE7\xE3o.
2. FIDELIDADE NUM\xC9RICA ABSOLUTA E CASAS DECIMAIS BRASILEIRAS:
   - No Brasil, r\xF3tulos e embalagens usam v\xEDrgula como separador decimal (ex: 12,5 g; 0,8 g; 3,25 g; 125,6 kcal; 0,04 g; 1,5 mg).
   - Extraia e retorne os n\xFAmeros com ponto decimal mantendo as casas decimais exatas da embalagem (ex: 12.5, 0.8, 3.25, 125.6, 0.04).
   - NUNCA remova casas decimais! NUNCA transforme n\xFAmeros decimais em inteiros (NUNCA transforme 12,5 em 125 ou 0,8 em 8)!
   - NUNCA arredonde automaticamente n\xFAmeros que possuem decimais no r\xF3tulo.
3. CALORIAS DECLARADAS (SEM RECALCULAR):
   - Extraia exatamente o 'Valor Energ\xE9tico' (kcal) impresso na embalagem (ex: se diz 125.6 kcal, informe 125.6; se diz 134 kcal, informe 134).
   - NUNCA recalcule ou altere o valor energ\xE9tico por conta pr\xF3pria a partir de 4*C + 4*P + 9*G! Os r\xF3tulos industriais possuem arredondamentos pr\xF3prios permitidos pela legisla\xE7\xE3o.
4. NUNCA INVENTE DADOS:
   - Extraia estritamente o que est\xE1 impresso na embalagem.
   - NUNCA transforme campos ausentes em zero! Se um nutriente (ex: a\xE7\xFAcares adicionados, gorduras trans, s\xF3dio) N\xC3O constar na tabela ou r\xF3tulo, retorne null para esse campo.
5. VALORES POR 100g / 100ml vs. VALORES POR POR\xC7\xC3O:
   - No padr\xE3o brasileiro ANVISA, a tabela geralmente tem duas colunas: "100 g" (ou 100 ml) e "Por\xE7\xE3o (ex: 30g)".
   - Extraia ambos os blocos ("per100" e "perPortion") com precis\xE3o decimal.
   - Se a embalagem contiver apenas a por\xE7\xE3o, informe os valores da por\xE7\xE3o e calcule os valores por 100g/ml proporcionais.
6. UNIDADE DA POR\xC7\xC3O:
   - Identifique com exatid\xE3o se o alimento \xE9 s\xF3lido (unidade "g") ou l\xEDquido (unidade "ml").
   - Identifique a medida caseira se informada (ex: "2 fatias", "1 x\xEDcara", "3 biscoitos").
7. N\xCDVEL DE CONFIAN\xC7A POR CAMPO:
   - Atribua o n\xEDvel de confian\xE7a ("alta", "media" ou "baixa") para cada nutriente identificado, baseado na clareza visual dos n\xFAmeros na foto.
   - D\xEA uma nota geral de confian\xE7a de 0 a 100 em "overallConfidence".
8. C\xD3DIGO DE BARRAS E NOME:
   - Se houver nome comercial ou marca vis\xEDvel no r\xF3tulo, extraia. Se fornecido pelo usu\xE1rio (${productNameHint ? `Nome sugerido: "${productNameHint}"` : "n\xE3o fornecido"}), preserve-o como prefer\xEAncia.

Responda ESTRITAMENTE em formato JSON com este schema:
{
  "isLegible": true,
  "illegibleReason": null,
  "productName": "${productNameHint || ""}",
  "brand": "${brandHint || ""}",
  "portion": {
    "servingSize": "ex: 30g (2 biscoitos) ou 200ml (1 copo)",
    "servingQuantity": 30,
    "servingUnit": "g",
    "servingsPerPackage": 5
  },
  "perPortion": {
    "calories": 140.5,
    "carbs": 21.0,
    "sugars": 5.2,
    "addedSugars": 3.0,
    "protein": 2.5,
    "totalFat": 5.25,
    "saturatedFat": 2.1,
    "transFat": 0.04,
    "fiber": 1.4,
    "sodium": 85
  },
  "per100": {
    "unit": "100g",
    "calories": 468.3,
    "carbs": 70.0,
    "sugars": 17.3,
    "addedSugars": 10.0,
    "protein": 8.3,
    "totalFat": 17.5,
    "saturatedFat": 7.0,
    "transFat": 0.13,
    "fiber": 4.7,
    "sodium": 283
  },
  "confidence": {
    "overall": 95,
    "calories": "alta",
    "carbs": "alta",
    "protein": "alta",
    "totalFat": "alta",
    "saturatedFat": "alta",
    "transFat": "alta",
    "fiber": "alta",
    "sodium": "alta",
    "sugars": "alta",
    "portion": "alta"
  },
  "ingredientsList": "Ingredientes: farinha de trigo, etc.",
  "notes": "Informa\xE7\xF5es adicionais ou alertas (ex: Cont\xE9m Gl\xFAten)"
}
`;
    const response = await callGemini({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          },
          { text: promptText }
        ]
      },
      responseMimeType: "application/json",
      temperature: 0.1
    });
    const parsed = parseJsonLoose(response.text || "{}");
    if (parsed.isLegible === false) {
      return res.json({
        isLegible: false,
        barcode: barcode || null,
        illegibleReason: parsed.illegibleReason || "A fotografia ficou emba\xE7ada ou cortada e n\xE3o foi poss\xEDvel ler os valores nutricionais com precis\xE3o. Por favor, aproxime a c\xE2mera da tabela nutricional sob boa luz e tire outra foto.",
        confidence: { overall: 10 }
      });
    }
    const servingQty = parsePtBrNumber(parsed.portion?.servingQuantity) || 100;
    const servingUnit = parsed.portion?.servingUnit === "ml" ? "ml" : "g";
    const servingRatio = servingQty > 0 ? 100 / servingQty : 1;
    let per1002 = parsed.per100 || {};
    let perPortion = parsed.perPortion || {};
    const resolveNutrient = (pVal, hVal) => {
      const pNum = parsePtBrNumber(pVal);
      const hNum = parsePtBrNumber(hVal);
      if (hNum != null && pNum != null) {
        return { per100: hNum, perPortion: pNum };
      }
      if (hNum != null) {
        const calculatedPortion = servingQty > 0 ? Number((hNum * servingQty / 100).toFixed(2)) : hNum;
        return { per100: hNum, perPortion: calculatedPortion };
      }
      if (pNum != null) {
        const calculated100 = servingRatio > 0 ? Number((pNum * servingRatio).toFixed(2)) : pNum;
        return { per100: calculated100, perPortion: pNum };
      }
      return { per100: null, perPortion: null };
    };
    const cCalories = resolveNutrient(perPortion.calories, per1002.calories);
    const cCarbs = resolveNutrient(perPortion.carbs, per1002.carbs);
    const cProtein = resolveNutrient(perPortion.protein, per1002.protein);
    const cFat = resolveNutrient(perPortion.totalFat, per1002.totalFat);
    const cSatFat = resolveNutrient(perPortion.saturatedFat, per1002.saturatedFat);
    const cTransFat = resolveNutrient(perPortion.transFat, per1002.transFat);
    const cFiber = resolveNutrient(perPortion.fiber, per1002.fiber);
    const cSodium = resolveNutrient(perPortion.sodium, per1002.sodium);
    const cSugars = resolveNutrient(perPortion.sugars, per1002.sugars);
    const cAddedSugars = resolveNutrient(perPortion.addedSugars, per1002.addedSugars);
    const result = {
      isLegible: true,
      barcode: barcode || null,
      productName: parsed.productName || productNameHint || "Produto identificado por foto",
      brand: parsed.brand || brandHint || "",
      portion: {
        servingSize: parsed.portion?.servingSize || `${servingQty}${servingUnit}`,
        servingQuantity: servingQty,
        servingUnit,
        servingsPerPackage: parsed.portion?.servingsPerPackage || null
      },
      per100g: {
        calories: cCalories.per100 != null ? cCalories.per100 : 0,
        carbs: cCarbs.per100,
        sugars: cSugars.per100,
        addedSugars: cAddedSugars.per100,
        protein: cProtein.per100,
        fat: cFat.per100,
        saturatedFat: cSatFat.per100,
        transFat: cTransFat.per100,
        fiber: cFiber.per100,
        sodium: cSodium.per100
      },
      perPortion: {
        calories: cCalories.perPortion != null ? cCalories.perPortion : 0,
        carbs: cCarbs.perPortion,
        sugars: cSugars.perPortion,
        addedSugars: cAddedSugars.perPortion,
        protein: cProtein.perPortion,
        fat: cFat.perPortion,
        saturatedFat: cSatFat.perPortion,
        transFat: cTransFat.perPortion,
        fiber: cFiber.perPortion,
        sodium: cSodium.perPortion
      },
      confidence: parsed.confidence || {
        overall: 85,
        calories: "alta",
        carbs: "alta",
        protein: "alta",
        fat: "alta"
      },
      ingredientsList: parsed.ingredientsList || "",
      notes: parsed.notes || "",
      provenance: {
        barcodeSource: barcode ? "scanner" : "manual",
        nutritionSource: "gemini_ocr",
        nameSource: parsed.productName ? "ocr" : productNameHint ? "user" : "manual",
        confidenceScore: Number(parsed.confidence?.overall) || 85,
        verifiedStatus: "pending",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
    return res.json(result);
  } catch (err) {
    console.error("Erro no OCR de r\xF3tulo:", err);
    return res.status(500).json({
      error: "N\xE3o foi poss\xEDvel ler o r\xF3tulo nutricional: " + (err.message || "Erro interno")
    });
  }
});
app.post("/api/gemini/estimate-food-nutrition", async (req, res) => {
  try {
    const { foodName, brand, barcode } = req.body;
    if (!foodName || !foodName.trim()) {
      return res.status(400).json({ error: "Nome do alimento \xE9 obrigat\xF3rio" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "Chave do Gemini n\xE3o configurada no servidor" });
    }
    const promptText = `
Voc\xEA \xE9 uma nutricionista e especialista em tabelas de alimentos brasileiras (Tabela TACO, TBCA e rotulagem ANVISA).
O usu\xE1rio informou o alimento comercial ou caseiro: "${foodName.trim()}" ${brand ? `da marca "${brand.trim()}"` : ""}.
Estime com o m\xE1ximo de precis\xE3o cient\xEDfica os valores nutricionais por 100g e a por\xE7\xE3o de refer\xEAncia t\xEDpica recomendada pelo fabricante ou ANVISA.

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "productName": "${foodName.trim()}",
  "brand": "${brand ? brand.trim() : ""}",
  "servingSize": "ex: 30g ou 100g ou 1 unidade (50g)",
  "servingGrams": 100,
  "calories": 150,
  "protein": 10.0,
  "carbs": 20.0,
  "fat": 3.5,
  "fiber": 2.0,
  "sodium": 80
}
Todos os valores de calorias, protein, carbs, fat, fiber devem ser expressos por 100g (n\xFAmeros puros).
servingGrams deve ser o peso em gramas da por\xE7\xE3o de refer\xEAncia t\xEDpica (n\xFAmero).
`;
    const response = await callGemini({
      contents: promptText,
      responseMimeType: "application/json",
      temperature: 0.2
    });
    const parsed = JSON.parse(response.text || "{}");
    const servingGrams = Number(parsed.servingGrams) || 100;
    const per100g = {
      calories: Math.round(Number(parsed.calories) || 0),
      protein: Number(Number(parsed.protein || 0).toFixed(1)),
      carbs: Number(Number(parsed.carbs || 0).toFixed(1)),
      fat: Number(Number(parsed.fat || 0).toFixed(1)),
      fiber: Number(Number(parsed.fiber || 0).toFixed(1)),
      sodium: Number(Number(parsed.sodium || 0).toFixed(1))
    };
    return res.json({
      found: true,
      barcode: barcode || "",
      productName: parsed.productName || foodName.trim(),
      brand: parsed.brand || brand || "",
      servingSize: parsed.servingSize || `${servingGrams}g`,
      servingGrams,
      per100g,
      source: "Estimativa IA (TACO/TBCA)"
    });
  } catch (err) {
    console.error("Erro na estimativa de nutri\xE7\xE3o por IA:", err);
    return res.status(500).json({
      error: "Erro ao estimar valores nutricionais do alimento: " + (err.message || "Erro interno")
    });
  }
});
app.post("/api/gemini/recipe-assistant", async (req, res) => {
  try {
    const { action, ingredients, recipeName, question } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Chave do Gemini n\xE3o configurada"
      });
    }
    let prompt = "";
    if (action === "substitute") {
      prompt = `
Mariana est\xE1 cozinhando e precisa de uma substitui\xE7\xE3o saud\xE1vel e carinhosa para a receita: "${recipeName || "Receita da Mari"}".
D\xFAvida / Alimento a substituir: "${question || ingredients}".
Sugira 3 substitui\xE7\xF5es vi\xE1veis, explicando o impacto em calorias e macronutrientes (prote\xEDnas, carboidratos, gorduras), e como adaptar o modo de preparo.
Responda em formato JSON:
{
  "suggestions": [
    {
      "substituteName": "Iogurte grego natural desnatado em vez de creme de leite",
      "macroImpact": "Reduz 70% das gorduras e aumenta prote\xEDnas em 6g por por\xE7\xE3o",
      "culinaryTip": "Adicionar no final do cozimento em fogo brando para n\xE3o talhar",
      "caloriesDelta": "-120 kcal"
    }
  ]
}
`;
    } else {
      prompt = `
Mariana tem os seguintes ingredientes na cozinha: "${ingredients}".
Crie 1 receita saud\xE1vel, deliciosa e pr\xE1tica para ela ("Our Little Kitchen").
Calcule com precis\xE3o calorias e macronutrientes por por\xE7\xE3o.
Responda em formato JSON:
{
  "title": "Nome da Receita",
  "description": "Breve descri\xE7\xE3o afetuosa",
  "prepTimeMinutes": 25,
  "servings": 2,
  "caloriesPerServing": 320,
  "proteinPerServing": 28,
  "carbsPerServing": 35,
  "fatPerServing": 6,
  "fiberPerServing": 5,
  "ingredients": [
    { "name": "Peito de frango picado", "amount": "250g" },
    { "name": "Abobrinha ralada", "amount": "1 unidade m\xE9dia (150g)" }
  ],
  "steps": [
    "Aque\xE7a uma frigideira antiaderente com um fio de azeite...",
    "Doure o frango e adicione os temperos..."
  ],
  "carinhoTip": "Dica especial de tempero ou apresenta\xE7\xE3o com amor para a Mari \u{1F49C}"
}
`;
    }
    const response = await callGemini({
      contents: prompt,
      responseMimeType: "application/json"
    });
    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (err) {
    console.error("Erro no assistente de receitas:", err);
    return res.status(500).json({ error: "Erro ao gerar sugest\xE3o de receita" });
  }
});
var fatSecretTokenCache = null;
async function getFatSecretToken() {
  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (fatSecretTokenCache && Date.now() < fatSecretTokenCache.expiresAt) {
    return fatSecretTokenCache.token;
  }
  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const res = await fetch("https://oauth.fatsecret.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials&scope=basic",
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.access_token) {
      fatSecretTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + (Number(data.expires_in || 86400) - 300) * 1e3
      };
      return data.access_token;
    }
  } catch (err) {
    console.warn("[FatSecret] Autentica\xE7\xE3o OAuth2 falhou:", err);
  }
  return null;
}
async function lookupFatSecret(barcode) {
  const token = await getFatSecretToken();
  if (!token) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7e3);
    const findUrl = `https://platform.fatsecret.com/rest/server.api?method=food.find_id_for_barcode&barcode=${encodeURIComponent(
      barcode
    )}&format=json`;
    const res = await fetch(findUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const findData = await res.json();
    const foodId = findData?.food_id?.value;
    if (!foodId) return null;
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 7e3);
    const getUrl = `https://platform.fatsecret.com/rest/server.api?method=food.get.v2&food_id=${encodeURIComponent(
      foodId
    )}&format=json`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller2.signal
    });
    clearTimeout(timeout2);
    if (!getRes.ok) return null;
    const getData = await getRes.json();
    const food = getData?.food;
    if (!food) return null;
    const servings = Array.isArray(food.servings?.serving) ? food.servings.serving : food.servings?.serving ? [food.servings.serving] : [];
    const refServing = servings.find((s) => s.metric_serving_unit === "g" || s.metric_serving_amount) || servings[0] || {};
    const servingGrams = Number(refServing.metric_serving_amount) || 100;
    const ratio = servingGrams > 0 ? 100 / servingGrams : 1;
    return {
      found: true,
      barcode,
      productName: food.food_name || "Alimento FatSecret",
      brand: food.brand_name || "",
      servingSize: refServing.serving_description || `${servingGrams}g`,
      servingGrams,
      per100g: {
        calories: Math.round((Number(refServing.calories) || 0) * ratio),
        protein: Number(((Number(refServing.protein) || 0) * ratio).toFixed(1)),
        carbs: Number(((Number(refServing.carbohydrate) || 0) * ratio).toFixed(1)),
        fat: Number(((Number(refServing.fat) || 0) * ratio).toFixed(1)),
        fiber: Number(((Number(refServing.fiber) || 0) * ratio).toFixed(1)),
        sodium: Number(((Number(refServing.sodium) || 0) * ratio).toFixed(1)),
        sugars: refServing.sugar != null ? Number(((Number(refServing.sugar) || 0) * ratio).toFixed(1)) : null,
        saturatedFat: refServing.saturated_fat != null ? Number(((Number(refServing.saturated_fat) || 0) * ratio).toFixed(1)) : null,
        transFat: refServing.trans_fat != null ? Number(((Number(refServing.trans_fat) || 0) * ratio).toFixed(1)) : null
      },
      imageUrl: food.food_images?.food_image?.[0]?.image_url || null,
      source: "FatSecret",
      verificationStatus: "verified"
    };
  } catch (err) {
    console.warn("[FatSecret] Erro na consulta do c\xF3digo:", err);
    return null;
  }
}
async function lookupOpenFoodFacts2(cleanCode) {
  const urls = [
    `https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`,
    `https://br.openfoodfacts.org/api/v2/product/${cleanCode}.json`,
    `https://world.openfoodfacts.org/api/v0/product/${cleanCode}.json`
  ];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6e3);
      const fetchRes = await fetch(url, {
        headers: {
          "User-Agent": "OurLittleKitchen/2.0 (mariana@ourlittlekitchen.app)"
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (fetchRes.ok) {
        const data = await fetchRes.json();
        if (data && (data.status === 1 || data.product)) {
          const productData = data.product;
          if (productData.code && String(productData.code).trim() !== cleanCode) {
            console.warn(`[Open Food Facts] C\xF3digo divergente ignorado: recebido ${productData.code}, esperado ${cleanCode}`);
            continue;
          }
          const nutriments = productData.nutriments || {};
          let servingGrams = 100;
          const servingQuantity = productData.serving_quantity;
          if (servingQuantity && !isNaN(Number(servingQuantity))) {
            servingGrams = Number(servingQuantity);
          }
          const energyKcal = nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"] ?? (nutriments["energy_100g"] ? Math.round(nutriments["energy_100g"] / 4.184) : 0);
          let sodiumMg = null;
          if (nutriments["sodium_100g"] != null) {
            const rawSodium = Number(nutriments["sodium_100g"]);
            sodiumMg = rawSodium < 10 ? Math.round(rawSodium * 1e3) : Math.round(rawSodium);
          } else if (nutriments["salt_100g"] != null) {
            const rawSalt = Number(nutriments["salt_100g"]);
            sodiumMg = rawSalt < 10 ? Math.round(rawSalt / 2.54 * 1e3) : Math.round(rawSalt / 2.54);
          }
          return {
            found: true,
            barcode: cleanCode,
            productName: productData.product_name_pt || productData.product_name || productData.generic_name_pt || productData.generic_name || "Produto sem nome",
            brand: productData.brands || productData.brand_owner || "",
            category: productData.categories || "",
            packageSize: productData.quantity || "",
            servingSize: productData.serving_size || `${servingGrams}g`,
            servingGrams,
            per100g: {
              calories: Math.round(Number(energyKcal) || 0),
              protein: Number(Number(nutriments["proteins_100g"] ?? 0).toFixed(1)),
              carbs: Number(Number(nutriments["carbohydrates_100g"] ?? 0).toFixed(1)),
              fat: Number(Number(nutriments["fat_100g"] ?? 0).toFixed(1)),
              saturatedFat: nutriments["saturated-fat_100g"] != null ? Number(Number(nutriments["saturated-fat_100g"]).toFixed(1)) : null,
              transFat: nutriments["trans-fat_100g"] != null ? Number(Number(nutriments["trans-fat_100g"]).toFixed(1)) : null,
              fiber: Number(Number(nutriments["fiber_100g"] ?? 0).toFixed(1)),
              sugars: nutriments["sugars_100g"] != null ? Number(Number(nutriments["sugars_100g"]).toFixed(1)) : null,
              addedSugars: nutriments["added-sugars_100g"] != null ? Number(Number(nutriments["added-sugars_100g"]).toFixed(1)) : null,
              sodium: sodiumMg
            },
            imageUrl: productData.image_url || productData.image_front_url || null,
            ingredients: productData.ingredients_text_pt || productData.ingredients_text || null,
            source: "Open Food Facts",
            verificationStatus: "verified",
            lastUpdated: productData.last_modified_t ? new Date(productData.last_modified_t * 1e3).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
          };
        }
      }
    } catch (e) {
    }
  }
  return null;
}
app.get("/api/barcode/:code", async (req, res) => {
  const { code } = req.params;
  const cleanCode = String(code || "").trim();
  if (!cleanCode || cleanCode.length < 6) {
    return res.status(400).json({ error: "C\xF3digo de barras inv\xE1lido." });
  }
  try {
    const profileId = await resolveStorageProfile(req);
    if (pool) {
      let local = null;
      if (profileId) {
        local = await pool.query(
          `SELECT p.* FROM products p
           WHERE p.barcode = $1 AND p.deleted_at IS NULL
             AND p.kitchen_space_id = ANY(
               SELECT kitchen_space_id FROM memberships WHERE profile_id = $2
             )
           LIMIT 1`,
          [cleanCode, profileId]
        );
      }
      if (!local || local.rows.length === 0) {
        local = await pool.query(
          `SELECT p.* FROM products p
           WHERE p.barcode = $1 AND p.deleted_at IS NULL
           ORDER BY p.last_updated_at DESC NULLS LAST
           LIMIT 1`,
          [cleanCode]
        );
      }
      if (local && local.rows.length) {
        const p = local.rows[0];
        const servingGrams = Number(p.serving_quantity) || 100;
        return res.json({
          found: true,
          local: true,
          barcode: p.barcode,
          productName: p.commercial_name,
          brand: p.brand || "",
          category: p.category || "",
          packageSize: p.package_size || "",
          servingSize: p.serving_unit || `${servingGrams}g`,
          servingGrams,
          per100g: {
            calories: Number(p.calories_per_100) || 0,
            protein: Number(p.protein_per_100) || 0,
            carbs: Number(p.carbs_per_100) || 0,
            fat: Number(p.fat_per_100) || 0,
            saturatedFat: p.saturated_fat_per_100 != null ? Number(p.saturated_fat_per_100) : null,
            transFat: p.trans_fat_per_100 != null ? Number(p.trans_fat_per_100) : null,
            fiber: Number(p.fiber_per_100) || 0,
            sugars: p.sugars_per_100 != null ? Number(p.sugars_per_100) : null,
            addedSugars: p.added_sugars_per_100 != null ? Number(p.added_sugars_per_100) : null,
            sodium: p.sodium_per_100 != null ? Number(p.sodium_per_100) : null
          },
          imageUrl: p.image_path || null,
          ingredients: p.ingredients || null,
          source: p.data_source || "Banco Local",
          verificationStatus: p.verification_status || "verified",
          confidenceScore: p.confidence_score ? Number(p.confidence_score) : 100,
          provenance: p.provenance || {
            barcodeSource: "scanner",
            nutritionSource: p.data_source || "Banco Local",
            verifiedStatus: p.verification_status || "verified"
          },
          lastUpdated: p.last_updated_at || p.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
          product: p
        });
      }
    }
    const offProduct = await lookupOpenFoodFacts2(cleanCode);
    if (offProduct) {
      return res.json(offProduct);
    }
    if (process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET) {
      const fatSecretProduct = await lookupFatSecret(cleanCode);
      if (fatSecretProduct) {
        return res.json(fatSecretProduct);
      }
    }
    return res.status(404).json({
      found: false,
      barcode: cleanCode,
      message: `O produto com c\xF3digo ${cleanCode} n\xE3o foi localizado automaticamente nas bases cadastradas.`,
      recoveryOptions: {
        allowPhotoNutritionTable: true,
        allowSearchByName: true,
        allowManualEntry: true
      }
    });
  } catch (err) {
    console.error("Erro na consulta em cascata de c\xF3digo de barras:", err);
    return res.status(500).json({
      error: "Falha tempor\xE1ria ao consultar bases de alimentos: " + (err.message || "Erro interno"),
      recoveryOptions: {
        allowPhotoNutritionTable: true,
        allowSearchByName: true,
        allowManualEntry: true
      }
    });
  }
});
app.get("/api/barcode/search-by-name", async (req, res) => {
  const { q, brand } = req.query;
  const queryText = String(q || "").trim();
  if (!queryText) {
    return res.status(400).json({ error: "Termo de busca n\xE3o fornecido" });
  }
  const results = [];
  const seenIds = /* @__PURE__ */ new Set();
  if (pool) {
    try {
      let sql = `SELECT * FROM products WHERE deleted_at IS NULL AND (commercial_name ILIKE $1`;
      const params = [`%${queryText}%`];
      if (brand && brand.trim()) {
        sql += ` OR brand ILIKE $2`;
        params.push(`%${brand.trim()}%`);
      }
      sql += `) ORDER BY commercial_name LIMIT 10`;
      const { rows } = await pool.query(sql, params);
      for (const p of rows) {
        seenIds.add(p.barcode);
        results.push({
          barcode: p.barcode,
          productName: p.commercial_name,
          brand: p.brand || "",
          servingSize: p.serving_unit || `${p.serving_quantity || 100}g`,
          servingGrams: Number(p.serving_quantity) || 100,
          per100g: {
            calories: Number(p.calories_per_100) || 0,
            protein: Number(p.protein_per_100) || 0,
            carbs: Number(p.carbs_per_100) || 0,
            fat: Number(p.fat_per_100) || 0,
            fiber: Number(p.fiber_per_100) || 0,
            sodium: p.sodium_per_100 != null ? Number(p.sodium_per_100) : null
          },
          imageUrl: p.image_path || null,
          source: "Banco Local",
          verificationStatus: p.verification_status || "verified"
        });
      }
    } catch (e) {
      console.warn("Busca local por nome falhou:", e);
    }
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      queryText
    )}&search_simple=1&action=process&json=1&page_size=10`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "OurLittleKitchen/2.0 (mariana@ourlittlekitchen.app)" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (searchRes.ok) {
      const data = await searchRes.json();
      const products = Array.isArray(data?.products) ? data.products : [];
      for (const p of products) {
        if (!p.code || seenIds.has(p.code)) continue;
        seenIds.add(p.code);
        const n = p.nutriments || {};
        const servingGrams = Number(p.serving_quantity) || 100;
        const energyKcal = n["energy-kcal_100g"] ?? n["energy-kcal"] ?? (n["energy_100g"] ? Math.round(n["energy_100g"] / 4.184) : 0);
        results.push({
          barcode: p.code,
          productName: p.product_name_pt || p.product_name || "Produto sem nome",
          brand: p.brands || p.brand_owner || "",
          servingSize: p.serving_size || `${servingGrams}g`,
          servingGrams,
          per100g: {
            calories: Math.round(Number(energyKcal) || 0),
            protein: Number(Number(n.proteins_100g ?? 0).toFixed(1)),
            carbs: Number(Number(n.carbohydrates_100g ?? 0).toFixed(1)),
            fat: Number(Number(n.fat_100g ?? 0).toFixed(1)),
            fiber: Number(Number(n.fiber_100g ?? 0).toFixed(1)),
            sodium: n.sodium_100g != null ? Math.round(Number(n.sodium_100g) < 10 ? Number(n.sodium_100g) * 1e3 : Number(n.sodium_100g)) : null
          },
          imageUrl: p.image_url || p.image_front_url || null,
          source: "Open Food Facts",
          verificationStatus: "verified"
        });
      }
    }
  } catch (e) {
  }
  return res.json({
    found: results.length > 0,
    count: results.length,
    items: results
  });
});
var handleSaveProductOrFood = async (req, res) => {
  try {
    const b = req.body || {};
    const commercialName = String(b.productName || b.commercial_name || b.name || "").trim();
    if (!commercialName) {
      return res.status(400).json({ error: "Nome do alimento \xE9 obrigat\xF3rio para o cadastro." });
    }
    const barcode = b.barcode && String(b.barcode).trim() !== "" ? String(b.barcode).trim() : `FOTO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const brand = b.brand ? String(b.brand).trim() : null;
    const servingQuantity = parsePtBrNumber(b.servingGrams || b.serving_quantity) || 100;
    const servingUnit = String(b.servingSize || b.serving_unit || `${servingQuantity}g`);
    const p100 = b.per100g || {};
    const caloriesPer100 = parsePtBrNumber(p100.calories) ?? 0;
    const proteinPer100 = parsePtBrNumber(p100.protein) ?? 0;
    const carbsPer100 = parsePtBrNumber(p100.carbs) ?? 0;
    const fatPer100 = parsePtBrNumber(p100.fat) ?? 0;
    const saturatedFatPer100 = parsePtBrNumber(p100.saturatedFat);
    const transFatPer100 = parsePtBrNumber(p100.transFat);
    const fiberPer100 = parsePtBrNumber(p100.fiber) ?? 0;
    const sugarsPer100 = parsePtBrNumber(p100.sugars);
    const addedSugarsPer100 = parsePtBrNumber(p100.addedSugars);
    const sodiumPer100 = parsePtBrNumber(p100.sodium);
    const householdMeasure = b.householdMeasure || b.household_measure || null;
    const perPortion = b.perPortion || b.per_portion || null;
    const caloriesPerServing = perPortion?.calories != null ? parsePtBrNumber(perPortion.calories) ?? 0 : caloriesPer100 > 0 ? Number((caloriesPer100 * servingQuantity / 100).toFixed(2)) : 0;
    const dataSource = b.source || "Banco Local";
    const verificationStatus = b.verificationStatus || "user_confirmed";
    const confidenceScore = Number(b.confidenceScore) || 95;
    const ingredients = b.ingredients || b.ingredientsList || null;
    const imagePath = b.imageUrl || b.image_path || null;
    const provenance = b.provenance || {
      barcodeSource: "scanner",
      nutritionSource: dataSource,
      nameSource: "user",
      confidenceScore,
      verifiedStatus: verificationStatus,
      savedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    let savedProduct = null;
    if (pool) {
      const profileId = await resolveStorageProfile(req);
      let spaceId = null;
      if (profileId) {
        const spaceRes = await pool.query(
          `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1 ORDER BY joined_at LIMIT 1`,
          [profileId]
        );
        spaceId = spaceRes.rows[0]?.kitchen_space_id || null;
      }
      if (!spaceId) {
        const anySpace = await pool.query(`SELECT id FROM kitchen_spaces LIMIT 1`);
        spaceId = anySpace.rows[0]?.id || "11111111-1111-1111-1111-111111111111";
      }
      const upsertSql = `
        INSERT INTO products (
          kitchen_space_id, created_by, barcode, commercial_name, brand,
          serving_quantity, serving_unit, household_measure, per_portion,
          calories_per_serving, calories_per_100, protein_per_100, carbs_per_100,
          fat_per_100, fiber_per_100, sodium_per_100, sugars_per_100, added_sugars_per_100,
          saturated_fat_per_100, trans_fat_per_100, image_path, ingredients,
          data_source, provenance, confidence_score, verification_status,
          updated_at, last_updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
          now(), now()
        )
        ON CONFLICT (barcode) DO UPDATE SET
          commercial_name = EXCLUDED.commercial_name,
          brand = COALESCE(EXCLUDED.brand, products.brand),
          serving_quantity = EXCLUDED.serving_quantity,
          serving_unit = EXCLUDED.serving_unit,
          household_measure = COALESCE(EXCLUDED.household_measure, products.household_measure),
          per_portion = COALESCE(EXCLUDED.per_portion, products.per_portion),
          calories_per_serving = EXCLUDED.calories_per_serving,
          calories_per_100 = EXCLUDED.calories_per_100,
          protein_per_100 = EXCLUDED.protein_per_100,
          carbs_per_100 = EXCLUDED.carbs_per_100,
          fat_per_100 = EXCLUDED.fat_per_100,
          fiber_per_100 = EXCLUDED.fiber_per_100,
          sodium_per_100 = EXCLUDED.sodium_per_100,
          sugars_per_100 = EXCLUDED.sugars_per_100,
          added_sugars_per_100 = EXCLUDED.added_sugars_per_100,
          saturated_fat_per_100 = EXCLUDED.saturated_fat_per_100,
          trans_fat_per_100 = EXCLUDED.trans_fat_per_100,
          image_path = COALESCE(EXCLUDED.image_path, products.image_path),
          ingredients = COALESCE(EXCLUDED.ingredients, products.ingredients),
          data_source = EXCLUDED.data_source,
          provenance = EXCLUDED.provenance,
          confidence_score = EXCLUDED.confidence_score,
          verification_status = EXCLUDED.verification_status,
          deleted_at = NULL,
          last_updated_at = now(),
          updated_at = now()
        RETURNING *;
      `;
      const { rows } = await pool.query(upsertSql, [
        spaceId,
        profileId || null,
        barcode,
        commercialName,
        brand,
        servingQuantity,
        servingUnit,
        householdMeasure,
        perPortion ? JSON.stringify(perPortion) : null,
        caloriesPerServing,
        caloriesPer100,
        proteinPer100,
        carbsPer100,
        fatPer100,
        fiberPer100,
        sodiumPer100,
        sugarsPer100,
        addedSugarsPer100,
        saturatedFatPer100,
        transFatPer100,
        imagePath,
        ingredients,
        dataSource,
        JSON.stringify(provenance),
        confidenceScore,
        verificationStatus
      ]);
      savedProduct = rows[0];
      try {
        const stateRes = await pool.query("SELECT data FROM app_state WHERE id = $1", [STATE_ID]);
        if (stateRes.rows.length) {
          const stateData = stateRes.rows[0].data || {};
          const currentCustom = Array.isArray(stateData.customFoods) ? stateData.customFoods : [];
          const customItem = {
            id: `food-${Date.now()}`,
            name: commercialName,
            brand: brand || void 0,
            barcode: barcode || void 0,
            portionGrams: servingQuantity,
            calories: caloriesPerServing,
            protein: perPortion?.protein != null ? parsePtBrNumber(perPortion.protein) ?? 0 : Number((proteinPer100 * servingQuantity / 100).toFixed(2)),
            carbs: perPortion?.carbs != null ? parsePtBrNumber(perPortion.carbs) ?? 0 : Number((carbsPer100 * servingQuantity / 100).toFixed(2)),
            fat: perPortion?.fat != null ? parsePtBrNumber(perPortion.fat) ?? 0 : Number((fatPer100 * servingQuantity / 100).toFixed(2)),
            fiber: perPortion?.fiber != null ? parsePtBrNumber(perPortion.fiber) ?? 0 : Number((fiberPer100 * servingQuantity / 100).toFixed(2)),
            sodium: perPortion?.sodium != null ? parsePtBrNumber(perPortion.sodium) : sodiumPer100 != null ? Number((sodiumPer100 * servingQuantity / 100).toFixed(1)) : void 0,
            sugars: perPortion?.sugars != null ? parsePtBrNumber(perPortion.sugars) : sugarsPer100 != null ? Number((sugarsPer100 * servingQuantity / 100).toFixed(2)) : void 0,
            saturatedFat: perPortion?.saturatedFat != null ? parsePtBrNumber(perPortion.saturatedFat) : saturatedFatPer100 != null ? Number((saturatedFatPer100 * servingQuantity / 100).toFixed(2)) : void 0,
            transFat: perPortion?.transFat != null ? parsePtBrNumber(perPortion.transFat) : transFatPer100 != null ? Number((transFatPer100 * servingQuantity / 100).toFixed(2)) : void 0,
            per100g: {
              calories: caloriesPer100,
              protein: proteinPer100,
              carbs: carbsPer100,
              fat: fatPer100,
              fiber: fiberPer100,
              sodium: sodiumPer100,
              sugars: sugarsPer100,
              addedSugars: addedSugarsPer100,
              saturatedFat: saturatedFatPer100,
              transFat: transFatPer100
            },
            householdMeasure: householdMeasure || void 0,
            source: dataSource,
            verified: true,
            confidenceScore,
            provenance
          };
          const updatedCustom = [
            customItem,
            ...currentCustom.filter((f) => f.barcode !== barcode && f.name !== commercialName)
          ];
          await pool.query(
            "UPDATE app_state SET data = jsonb_set(data, '{customFoods}', $1::jsonb), updated_at = now() WHERE id = $2",
            [JSON.stringify(updatedCustom), STATE_ID]
          );
        }
      } catch (syncErr) {
        console.warn("Sincroniza\xE7\xE3o em app_state customFoods:", syncErr);
      }
      savedProduct = rows[0];
      try {
        await pool.query(
          `INSERT INTO product_nutrition_history (
             product_id, changed_by, previous_values, new_values, change_reason, data_source
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            savedProduct.id,
            profileId || null,
            JSON.stringify({}),
            JSON.stringify(p100),
            "Cadastro / Atualiza\xE7\xE3o via Leitor Inteligente de C\xF3digo de Barras",
            dataSource
          ]
        );
      } catch (auditErr) {
      }
    }
    return res.status(201).json({
      success: true,
      product: {
        barcode,
        productName: commercialName,
        brand: brand || "",
        servingSize: servingUnit,
        servingGrams: servingQuantity,
        per100g: {
          calories: caloriesPer100,
          protein: proteinPer100,
          carbs: carbsPer100,
          fat: fatPer100,
          saturatedFat: saturatedFatPer100,
          transFat: transFatPer100,
          fiber: fiberPer100,
          sugars: sugarsPer100,
          addedSugars: addedSugarsPer100,
          sodium: sodiumPer100
        },
        imageUrl: imagePath,
        ingredients,
        source: "Banco Local",
        verificationStatus,
        confidenceScore,
        provenance,
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (err) {
    console.error("Erro ao salvar produto:", err);
    return res.status(500).json({ error: "Erro ao salvar produto no banco: " + (err.message || "Erro interno") });
  }
};
app.post("/api/barcode/save-product", handleSaveProductOrFood);
app.post("/api/nutrition/save-food", handleSaveProductOrFood);
app.post("/api/gemini/read-barcode", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Imagem n\xE3o fornecida" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "Chave do Gemini n\xE3o configurada" });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
    const promptText = `
Voc\xEA \xE9 um leitor \xF3ptico especialista em leitura de c\xF3digos de barras (EAN-13, EAN-8, UPC-A, UPC-E, Code 128) em embalagens de alimentos e produtos.
Procure na fotografia:
1. As barras pretas verticais do c\xF3digo de barras;
2. Os d\xEDgitos num\xE9ricos impressos diretamente abaixo ou acima das barras (geralmente uma sequ\xEAncia de 8, 12, 13 ou 14 d\xEDgitos, comum come\xE7ar com 789 no Brasil).
Retorne SEMPRE apenas d\xEDgitos num\xE9ricos puros no campo "barcode" (remova quaisquer espa\xE7os, tra\xE7os ou letras).

Formato JSON:
{
  "found": true,
  "barcode": "7891000100103",
  "productName": "Nome do produto se vis\xEDvel",
  "confidence": 95
}
Se realmente n\xE3o houver nenhum c\xF3digo de barras ou n\xFAmeros vis\xEDveis na foto, retorne:
{
  "found": false,
  "barcode": "",
  "reason": "Nenhum c\xF3digo de barras ou n\xFAmero leg\xEDvel na imagem"
}
`;
    const response = await callGemini({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          },
          { text: promptText }
        ]
      },
      responseMimeType: "application/json"
    });
    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (err) {
    console.error("Erro na leitura de c\xF3digo de barras por IA:", err);
    return res.status(500).json({ error: "Erro ao analisar imagem do c\xF3digo de barras" });
  }
});
app.use("/api", api_default);
async function startServer() {
  try {
    await initDatabase();
    console.log("\u{1F418} Postgres (Neon) conectado e schema aplicado.");
  } catch (err) {
    console.error("\u26A0\uFE0F  Falha ao inicializar o Postgres:", err.message || err);
    console.error("   O servidor vai iniciar, mas /api/storage e /api/health v\xE3o reportar erro.");
  }
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path4.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path4.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F49C} Our Little Kitchen server rodando em https://localhost:${PORT}`);
  });
  const shutdown = async () => {
    server.close();
    await closeDatabase().catch(() => {
    });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
if (!process.env.VERCEL) {
  startServer();
}
var server_default = app;

// serverless/index.ts
var dbReady = initDatabase().catch((err) => {
  console.warn("\u26A0\uFE0F initDatabase falhou (seguindo mesmo assim):", err?.message || err);
});
var handler = async (req, res) => {
  await dbReady;
  return server_default(req, res);
};
var index_default = handler;
export {
  index_default as default
};
