import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';

/**
 * API normalizada do Our Little Kitchen.
 *
 * Montada em `/api` pelo server.ts. Todos os caminhos abaixo são relativos
 * (ex.: `/foods` => `/api/foods`).
 *
 * Identidade:
 *  - Cookie de sessão `olk_session` (login por PIN, hash scrypt no banco).
 *  - Header `X-Profile-ID` apenas em desenvolvimento/testes
 *    (desative com ALLOW_PROFILE_HEADER=false em produção).
 *  - `profiles.auth_user_id` fica pronto para o Neon Auth: quando o token
 *    do Neon Auth for validado, basta preencher esse vínculo.
 */

export const apiRouter = Router();

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  pin_hash: string | null;
  auth_user_id: string | null;
};

const SESSION_COOKIE = 'olk_session';
const SESSION_DAYS = 30;
const UPLOAD_ROOT = path.resolve(process.cwd(), 'data', 'uploads');

/* ------------------------------------------------------------------ */
/*  Utilidades                                                        */
/* ------------------------------------------------------------------ */
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

const json = (res: Response, status: number, body: any) => res.status(status).json(body);

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashPin(pin: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPin(pin: string, stored: string | null) {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${
      SESSION_DAYS * 24 * 60 * 60
    }${secure}`
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

async function findProfileById(id: string): Promise<ProfileRow | null> {
  const { rows } = await pool!.query<ProfileRow>(
    `SELECT id, name, email, role, pin_hash, auth_user_id FROM profiles WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findProfileBySession(token: string): Promise<ProfileRow | null> {
  const { rows } = await pool!.query<ProfileRow>(
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

async function spaceIdsFor(profileId: string): Promise<string[]> {
  const { rows } = await pool!.query<{ kitchen_space_id: string }>(
    `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1`,
    [profileId]
  );
  return rows.map((r) => r.kitchen_space_id);
}

async function isAdmin(profileId: string, spaceId: string): Promise<boolean> {
  const { rows } = await pool!.query<{ ok: boolean }>(
    `SELECT profile_is_space_admin($1, $2) AS ok`,
    [profileId, spaceId]
  );
  return Boolean(rows[0]?.ok);
}

async function primarySpaceId(profileId: string): Promise<string | null> {
  const { rows } = await pool!.query<{ kitchen_space_id: string }>(
    `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1 ORDER BY joined_at LIMIT 1`,
    [profileId]
  );
  return rows[0]?.kitchen_space_id || null;
}

function profileIdOf(req: Request): string {
  return (req as any).profileId as string;
}

function isDevProfileHeaderAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_PROFILE_HEADER !== 'false';
}

/* ------------------------------------------------------------------ */
/*  Middleware de identidade                                           */
/* ------------------------------------------------------------------ */
const PUBLIC_PATHS = new Set(['/auth/profiles', '/auth/login', '/auth/logout']);

apiRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (PUBLIC_PATHS.has(req.path)) return next();

    let profile: ProfileRow | null = null;

    const sessionToken = parseCookies(req)[SESSION_COOKIE];
    if (sessionToken) profile = await findProfileBySession(sessionToken);

    if (!profile && isDevProfileHeaderAllowed()) {
      const headerId = req.header('X-Profile-ID');
      if (headerId) profile = await findProfileById(headerId);
    }

    // Vínculo opcional com Neon Auth: o proxy/edge pode enviar o id já validado.
    if (!profile) {
      const authUserId = req.header('X-Auth-User-ID');
      if (authUserId && isDevProfileHeaderAllowed()) {
        const { rows } = await pool!.query<ProfileRow>(
          `SELECT id, name, email, role, pin_hash, auth_user_id
           FROM profiles WHERE auth_user_id = $1`,
          [authUserId]
        );
        profile = rows[0] || null;
      }
    }

    // Modo usuário único: quando SINGLE_USER_PROFILE_ID está definido, requisições
    // sem sessão são atribuídas a esse perfil (útil para uso pessoal da Mari).
    if (!profile && process.env.SINGLE_USER_PROFILE_ID) {
      profile = await findProfileById(process.env.SINGLE_USER_PROFILE_ID);
    }

    if (!profile) {
      return json(res, 401, { error: 'Não autenticado. Faça login para continuar.' });
    }

    const spaces = await spaceIdsFor(profile.id);
    if (!spaces.length) {
      return json(res, 403, { error: 'Perfil sem espaço compartilhado.' });
    }

    (req as any).profile = profile;
    (req as any).profileId = profile.id;
    (req as any).profileRole = profile.role;
    (req as any).spaceIds = spaces;
    next();
  } catch (err: any) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  AUTENTICAÇÃO E PERFIS                                             */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/auth/profiles',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool!.query(
      `SELECT p.id, p.name, p.email, p.role,
              CASE WHEN p.pin_hash IS NULL THEN true ELSE false END AS needs_pin_setup
       FROM profiles p
       ORDER BY CASE p.role WHEN 'admin' THEN 0 ELSE 1 END, p.name`
    );
    json(res, 200, rows);
  })
);

apiRouter.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { profile_id, pin, setup_code } = req.body || {};
    if (!profile_id || !pin) {
      return json(res, 400, { error: 'Perfil e PIN são obrigatórios.' });
    }
    if (String(pin).length < 4) {
      return json(res, 400, { error: 'O PIN deve ter pelo menos 4 caracteres.' });
    }
    const profile = await findProfileById(profile_id);
    if (!profile) return json(res, 404, { error: 'Perfil não encontrado.' });

    if (profile.pin_hash) {
      if (!verifyPin(String(pin), profile.pin_hash)) {
        return json(res, 401, { error: 'PIN incorreto.' });
      }
    } else {
      const expectedCode = process.env.OLK_SETUP_CODE;
      if (expectedCode && setup_code !== expectedCode) {
        return json(res, 403, { error: 'Código de configuração inválido.' });
      }
      await pool!.query(`UPDATE profiles SET pin_hash = $2 WHERE id = $1`, [
        profile.id,
        hashPin(String(pin)),
      ]);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await pool!.query(
      `INSERT INTO profile_sessions (profile_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [profile.id, sha256(token), req.header('user-agent') || null, req.ip || null, expires]
    );
    setSessionCookie(res, token);

    const spaces = await spaceIdsFor(profile.id);
    json(res, 200, {
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
      },
      spaces,
      expiresAt: expires.toISOString(),
    });
  })
);

apiRouter.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      await pool!.query(
        `UPDATE profile_sessions SET revoked_at = now() WHERE token_hash = $1`,
        [sha256(token)]
      );
    }
    clearSessionCookie(res);
    json(res, 200, { success: true });
  })
);

apiRouter.get(
  '/auth/me',
  asyncHandler(async (req, res) => {
    const profile = (req as any).profile as ProfileRow;
    const spaces = await pool!.query(
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
        role: profile.role,
      },
      spaces: spaces.rows,
    });
  })
);

apiRouter.post(
  '/auth/change-pin',
  asyncHandler(async (req, res) => {
    const { current_pin, new_pin } = req.body || {};
    const profile = (req as any).profile as ProfileRow;
    if (!new_pin || String(new_pin).length < 4) {
      return json(res, 400, { error: 'O novo PIN deve ter pelo menos 4 caracteres.' });
    }
    if (profile.pin_hash && !verifyPin(String(current_pin || ''), profile.pin_hash)) {
      return json(res, 401, { error: 'PIN atual incorreto.' });
    }
    await pool!.query(`UPDATE profiles SET pin_hash = $2 WHERE id = $1`, [
      profile.id,
      hashPin(String(new_pin)),
    ]);
    json(res, 200, { success: true });
  })
);

/* ------------------------------------------------------------------ */
/*  ESPAÇOS E PERFIS                                                  */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/spaces',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
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
  '/profiles',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT DISTINCT p.id, p.name, p.email, p.role, m.role_in_space
       FROM profiles p
       JOIN memberships m ON m.profile_id = p.id
       WHERE m.kitchen_space_id = ANY($1::uuid[])
       ORDER BY p.name`,
      [(req as any).spaceIds]
    );
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT id, name, email, role, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g,
              water_goal_ml, current_weight_kg, target_weight_kg, height_cm, diet_preference
       FROM profiles WHERE id = $1`,
      [profileIdOf(req)]
    );
    if (!rows.length) return json(res, 404, { error: 'Perfil não encontrado' });
    json(res, 200, rows[0]);
  })
);

apiRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const allowed = [
      'name',
      'calorie_goal',
      'protein_goal_g',
      'carbs_goal_g',
      'fat_goal_g',
      'water_goal_ml',
      'current_weight_kg',
      'target_weight_kg',
      'height_cm',
      'diet_preference',
    ];
    const fields: string[] = [];
    const values: any[] = [profileIdOf(req)];
    let i = 2;
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: 'Nenhum campo editável enviado.' });
    const { rows } = await pool!.query(
      `UPDATE profiles SET ${fields.join(', ')} WHERE id = $1
       RETURNING id, name, email, role, calorie_goal, protein_goal_g, carbs_goal_g,
                 fat_goal_g, water_goal_ml, current_weight_kg, target_weight_kg,
                 height_cm, diet_preference`,
      values
    );
    json(res, 200, rows[0]);
  })
);

apiRouter.patch(
  '/profiles/:id',
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const actorId = profileIdOf(req);
    const target = await findProfileById(targetId);
    if (!target) return json(res, 404, { error: 'Perfil não encontrado' });

    const shared = await pool!.query(
      `SELECT 1 FROM memberships a
       JOIN memberships b ON a.kitchen_space_id = b.kitchen_space_id
       WHERE a.profile_id = $1 AND b.profile_id = $2 LIMIT 1`,
      [actorId, targetId]
    );
    if (!shared.rowCount) return json(res, 403, { error: 'Perfil fora do seu espaço.' });

    const admin = await isAdmin(actorId, (await primarySpaceId(actorId))!);
    if (actorId !== targetId && !admin) {
      return json(res, 403, { error: 'Somente administradores editam outros perfis.' });
    }

    // Papel administrativo nunca é editável livremente pelo próprio usuário.
    if (req.body?.role !== undefined) {
      if (!admin) return json(res, 403, { error: 'Somente admin altera papéis.' });
      if (!['admin', 'user'].includes(req.body.role)) {
        return json(res, 400, { error: 'Papel inválido.' });
      }
    }

    const fields: string[] = [];
    const values: any[] = [targetId];
    let i = 2;
    for (const key of ['name', 'role', 'diet_preference', 'calorie_goal']) {
      if (req.body?.[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: 'Nada para atualizar.' });
    const { rows } = await pool!.query(
      `UPDATE profiles SET ${fields.join(', ')} WHERE id = $1
       RETURNING id, name, email, role, diet_preference, calorie_goal`,
      values
    );
    json(res, 200, rows[0]);
  })
);

/* ------------------------------------------------------------------ */
/*  ALIMENTOS                                                         */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/foods',
  asyncHandler(async (req, res) => {
    const { search, category, source, include_deleted } = req.query as any;
    let sql = `SELECT f.*, p.name AS created_by_name
               FROM foods f
               LEFT JOIN profiles p ON p.id = f.created_by
               WHERE f.kitchen_space_id = ANY($1::uuid[])`;
    const params: any[] = [(req as any).spaceIds];
    let i = 2;
    if (include_deleted !== 'true') sql += ` AND f.deleted_at IS NULL`;
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
    const { rows } = await pool!.query(sql, params);
    json(res, 200, rows);
  })
);

apiRouter.post(
  '/foods',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.category || !b.data_origin) {
      return json(res, 400, {
        error: 'Nome, categoria e origem dos dados são obrigatórios',
      });
    }
    const spaceId = (await primarySpaceId(profileIdOf(req)))!;

    // Prevenção explícita de duplicidade (além do índice único).
    const existing = await pool!.query(
      `SELECT id, name FROM foods
       WHERE kitchen_space_id = $1
         AND deleted_at IS NULL
         AND lower(btrim(name)) = lower(btrim($2))
         AND prep_state = $3
         AND lower(btrim(COALESCE(brand,''))) = lower(btrim(COALESCE($4,'')))
       LIMIT 1`,
      [spaceId, b.name, b.prep_state || 'cru', b.brand || '']
    );
    if (existing.rowCount) {
      return json(res, 409, {
        error: 'Já existe um alimento com este nome, marca e estado de preparo neste espaço.',
        food: existing.rows[0],
      });
    }

    try {
      const { rows } = await pool!.query(
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
          b.prep_state || 'cru',
          b.reference_unit || '100g',
          b.calories_per_100g ?? null,
          b.protein_per_100g ?? null,
          b.carbs_per_100g ?? null,
          b.fat_total_per_100g ?? null,
          b.fat_saturated_per_100g ?? null,
          b.fiber_per_100g ?? null,
          b.sugars_per_100g ?? null,
          b.sodium_per_100g ?? null,
          b.nutrition_source || 'Manual',
          b.data_origin,
          b.verification_status || 'pending',
          b.external_id || null,
        ]
      );
      await pool!.query(`SELECT emit_sync_event($1,'foods',$2,'insert',$3)`, [
        spaceId,
        rows[0].id,
        JSON.stringify({ name: rows[0].name }),
      ]);
      json(res, 201, rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        return json(res, 409, { error: 'Alimento duplicado neste espaço.' });
      }
      throw err;
    }
  })
);

apiRouter.get(
  '/foods/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT f.*, p.name AS created_by_name
       FROM foods f
       LEFT JOIN profiles p ON p.id = f.created_by
       WHERE f.id = $1 AND f.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: 'Alimento não encontrado' });
    json(res, 200, rows[0]);
  })
);

apiRouter.put(
  '/foods/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM foods WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Alimento não encontrado' });
    const food = current.rows[0];
    if (!(req as any).spaceIds.includes(food.kitchen_space_id)) {
      return json(res, 403, { error: 'Alimento de outro espaço.' });
    }
    const admin = await isAdmin(actor, food.kitchen_space_id);
    if (!admin && food.created_by !== actor) {
      return json(res, 403, { error: 'Sem permissão para editar este alimento.' });
    }

    const fields: string[] = [];
    const values: any[] = [req.params.id];
    let i = 2;
    const settable = [
      'name',
      'alternative_name',
      'brand',
      'category',
      'description',
      'prep_state',
      'reference_unit',
      'calories_per_100g',
      'protein_per_100g',
      'carbs_per_100g',
      'fat_total_per_100g',
      'fat_saturated_per_100g',
      'fiber_per_100g',
      'sugars_per_100g',
      'sodium_per_100g',
      'nutrition_source',
      'data_origin',
      'verification_status',
    ];
    for (const key of settable) {
      if (b[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: 'Nada para atualizar.' });
    fields.push(`updated_by = $${i++}`);
    values.push(actor);

    const { rows } = await pool!.query(
      `UPDATE foods SET ${fields.join(', ')}
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    if (!rows.length) return json(res, 404, { error: 'Alimento não encontrado' });
    await pool!.query(`SELECT emit_sync_event($1,'foods',$2,'update',NULL)`, [
      food.kitchen_space_id,
      food.id,
    ]);
    json(res, 200, rows[0]);
  })
);

apiRouter.delete(
  '/foods/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM foods WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Alimento não encontrado' });
    const food = current.rows[0];
    if (!(await isAdmin(actor, food.kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora exclui alimentos.' });
    }
    const { rows } = await pool!.query(
      `UPDATE foods SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: 'Alimento já excluído' });
    await pool!.query(`SELECT emit_sync_event($1,'foods',$2,'delete',NULL)`, [
      food.kitchen_space_id,
      food.id,
    ]);
    json(res, 200, { success: true, message: 'Exclusão lógica realizada. Pode ser restaurado.' });
  })
);

apiRouter.post(
  '/foods/:id/restore',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM foods WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Alimento não encontrado' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora restaura alimentos.' });
    }
    const { rows } = await pool!.query(
      `UPDATE foods SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);

apiRouter.get(
  '/foods/:id/history',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT h.*, p.name AS changed_by_name
       FROM food_nutrition_history h
       LEFT JOIN profiles p ON p.id = h.changed_by
       WHERE h.food_id = $1
         AND h.food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY($2::uuid[]))
       ORDER BY h.changed_at DESC`,
      [req.params.id, (req as any).spaceIds]
    );
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/household-measures',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool!.query(`SELECT * FROM household_measures ORDER BY name`);
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/foods/:id/conversions',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT c.*, h.name AS measure_name, h.short_label
       FROM food_household_conversions c
       JOIN household_measures h ON h.id = c.household_measure_id
       WHERE c.food_id = $1
         AND c.food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY($2::uuid[]))`,
      [req.params.id, (req as any).spaceIds]
    );
    json(res, 200, rows);
  })
);

apiRouter.post(
  '/foods/:id/conversions',
  asyncHandler(async (req, res) => {
    const { household_measure_id, grams, milliliters, estimation_method, conversion_origin } =
      req.body || {};
    if (!household_measure_id || grams == null) {
      return json(res, 400, { error: 'Medida e gramas são obrigatórios.' });
    }
    const food = await pool!.query(
      `SELECT id FROM foods WHERE id = $1 AND kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!food.rowCount) return json(res, 404, { error: 'Alimento não encontrado.' });
    const { rows } = await pool!.query(
      `INSERT INTO food_household_conversions
         (food_id, household_measure_id, grams, milliliters, estimation_method, conversion_origin)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.params.id,
        household_measure_id,
        grams,
        milliliters ?? null,
        estimation_method || null,
        conversion_origin || null,
      ]
    );
    json(res, 201, rows[0]);
  })
);

/* ------------------------------------------------------------------ */
/*  PRODUTOS E CÓDIGO DE BARRAS                                       */
/* ------------------------------------------------------------------ */
function isValidBarcode(code: string) {
  return /^\d{8}$|^\d{12,14}$/.test(code);
}

async function lookupOpenFoodFacts(code: string) {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_pt,brands,manufacturers,categories,quantity,serving_size,serving_quantity,image_front_url,nutriments,last_modified_t`,
      { headers: { 'User-Agent': 'OurLittleKitchen/1.0 (personal nutrition app)' } }
    );
    if (!response.ok) return null;
    const data: any = await response.json();
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
      calories_per_100: n['energy-kcal_100g'] ?? null,
      protein_per_100: n.proteins_100g ?? null,
      carbs_per_100: n.carbohydrates_100g ?? null,
      fat_per_100: n.fat_100g ?? null,
      fiber_per_100: n.fiber_100g ?? null,
      sodium_per_100: n.sodium_100g ?? null,
      data_source: 'Open Food Facts',
      last_modified: p.last_modified_t || null,
    };
  } catch (err) {
    console.error('Open Food Facts lookup falhou:', err);
    return null;
  }
}

apiRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { search, barcode, include_deleted } = req.query as any;
    let sql = `SELECT p.*, pr.name AS created_by_name
               FROM products p
               LEFT JOIN profiles pr ON pr.id = p.created_by
               WHERE p.kitchen_space_id = ANY($1::uuid[])`;
    const params: any[] = [(req as any).spaceIds];
    let i = 2;
    if (include_deleted !== 'true') sql += ` AND p.deleted_at IS NULL`;
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
    const { rows } = await pool!.query(sql, params);
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/products/lookup/:code',
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim();
    if (!isValidBarcode(code)) {
      return json(res, 400, { error: 'Código de barras inválido (EAN-8, UPC-A, EAN-13).' });
    }
    const local = await pool!.query(
      `SELECT * FROM products
       WHERE barcode = $1 AND deleted_at IS NULL
         AND kitchen_space_id = ANY($2::uuid[])
       LIMIT 1`,
      [code, (req as any).spaceIds]
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
        message: 'Produto não encontrado. Cadastre manualmente.',
      });
    }
    return json(res, 200, {
      found: false,
      local: false,
      external: true,
      barcode: code,
      candidate: external,
      requires_confirmation: true,
    });
  })
);

apiRouter.post(
  '/products',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const barcode = String(b.barcode || '').trim();
    if (!barcode || !b.commercial_name || !b.data_source) {
      return json(res, 400, {
        error: 'Código de barras, nome comercial e origem são obrigatórios.',
      });
    }
    if (!isValidBarcode(barcode)) {
      return json(res, 400, { error: 'Código de barras inválido (EAN-8, UPC-A, EAN-13).' });
    }
    if (
      b.data_source === 'Open Food Facts' &&
      (b.calories_per_100 == null || !b.commercial_name)
    ) {
      return json(res, 422, {
        error: 'Dados externos incompletos. Confirme ou complete antes de salvar.',
      });
    }
    const existing = await pool!.query(`SELECT id, commercial_name FROM products WHERE barcode = $1`, [
      barcode,
    ]);
    if (existing.rowCount) {
      return json(res, 409, {
        error: 'Produto com este código de barras já existe.',
        product: existing.rows[0],
      });
    }
    const spaceId = (await primarySpaceId(profileIdOf(req)))!;
    try {
      const { rows } = await pool!.query(
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
          b.verification_status || (b.data_source === 'Open Food Facts' ? 'verified' : 'pending'),
          b.external_id || null,
        ]
      );
      await pool!.query(`SELECT emit_sync_event($1,'products',$2,'insert',NULL)`, [
        spaceId,
        rows[0].id,
      ]);
      json(res, 201, rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        return json(res, 409, { error: 'Código de barras já cadastrado.' });
      }
      throw err;
    }
  })
);

apiRouter.put(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const before = await pool!.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (!before.rowCount) return json(res, 404, { error: 'Produto não encontrado' });
    const prev = before.rows[0];
    if (!(req as any).spaceIds.includes(prev.kitchen_space_id)) {
      return json(res, 403, { error: 'Produto de outro espaço.' });
    }
    const admin = await isAdmin(actor, prev.kitchen_space_id);
    if (!admin && prev.created_by !== actor) {
      return json(res, 403, { error: 'Sem permissão para editar este produto.' });
    }

    const fields: string[] = [];
    const values: any[] = [req.params.id];
    let i = 2;
    const settable = [
      'commercial_name',
      'brand',
      'manufacturer',
      'category',
      'description',
      'image_path',
      'package_size',
      'serving_quantity',
      'serving_unit',
      'calories_per_serving',
      'calories_per_100',
      'protein_per_100',
      'carbs_per_100',
      'fat_per_100',
      'fiber_per_100',
      'sodium_per_100',
      'data_source',
      'verification_status',
    ];
    for (const key of settable) {
      if (b[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: 'Nada para atualizar.' });
    fields.push(`updated_by = $${i++}`);
    values.push(actor);
    fields.push(`last_updated_at = now()`);

    const { rows } = await pool!.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );

    const nutrKeys = [
      'calories_per_100',
      'protein_per_100',
      'carbs_per_100',
      'fat_per_100',
      'fiber_per_100',
      'sodium_per_100',
    ];
    const prevNutr: any = {};
    const newNutr: any = {};
    for (const key of nutrKeys) {
      if (String(prev[key]) !== String(rows[0][key])) {
        prevNutr[key] = prev[key];
        newNutr[key] = rows[0][key];
      }
    }
    if (Object.keys(prevNutr).length) {
      await pool!.query(
        `INSERT INTO product_nutrition_history
           (product_id, changed_by, previous_values, new_values, change_reason, data_source)
         VALUES ($1,$2,$3,$4,'atualizacao_nutricional',$5)`,
        [req.params.id, actor, JSON.stringify(prevNutr), JSON.stringify(newNutr), rows[0].data_source]
      );
    }
    await pool!.query(`SELECT emit_sync_event($1,'products',$2,'update',NULL)`, [
      prev.kitchen_space_id,
      prev.id,
    ]);
    json(res, 200, rows[0]);
  })
);

apiRouter.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const before = await pool!.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (!before.rowCount) return json(res, 404, { error: 'Produto não encontrado' });
    if (!(await isAdmin(actor, before.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora exclui produtos.' });
    }
    const { rows } = await pool!.query(
      `UPDATE products SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: 'Produto já excluído' });
    await pool!.query(`SELECT emit_sync_event($1,'products',$2,'delete',NULL)`, [
      before.rows[0].kitchen_space_id,
      req.params.id,
    ]);
    json(res, 200, { success: true });
  })
);

apiRouter.post(
  '/products/:id/restore',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const before = await pool!.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (!before.rowCount) return json(res, 404, { error: 'Produto não encontrado' });
    if (!(await isAdmin(actor, before.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora restaura produtos.' });
    }
    const { rows } = await pool!.query(
      `UPDATE products SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);

apiRouter.get(
  '/products/:id/history',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT h.*, p.name AS changed_by_name
       FROM product_nutrition_history h
       LEFT JOIN profiles p ON p.id = h.changed_by
       WHERE h.product_id = $1
         AND h.product_id IN (SELECT id FROM products WHERE kitchen_space_id = ANY($2::uuid[]))
       ORDER BY h.changed_at DESC`,
      [req.params.id, (req as any).spaceIds]
    );
    json(res, 200, rows);
  })
);

/* ------------------------------------------------------------------ */
/*  RECEITAS                                                          */
/* ------------------------------------------------------------------ */
async function insertRecipeIngredients(client: any, recipeId: string, ingredients: any[]) {
  for (const ing of ingredients) {
    const weight = ing.weight_grams ?? ing.grams ?? 0;
    let calc: any = {};
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
        ing.unit || 'g',
        weight,
        ing.calories ?? calc.calories ?? null,
        ing.protein ?? calc.protein ?? null,
        ing.carbs ?? calc.carbs ?? null,
        ing.fat ?? calc.fat ?? null,
        ing.fiber ?? calc.fiber ?? null,
      ]
    );
  }
}

apiRouter.get(
  '/recipes',
  asyncHandler(async (req, res) => {
    const { status, include_deleted } = req.query as any;
    let sql = `SELECT r.*, p.name AS author_name
               FROM recipes r
               LEFT JOIN profiles p ON p.id = r.author_id
               WHERE r.kitchen_space_id = ANY($1::uuid[])`;
    const params: any[] = [(req as any).spaceIds];
    let i = 2;
    if (include_deleted !== 'true') sql += ` AND r.deleted_at IS NULL`;
    if (status) {
      sql += ` AND r.status = $${i++}`;
      params.push(status);
    }
    sql += ` ORDER BY r.title`;
    const { rows } = await pool!.query(sql, params);
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/recipes/:id',
  asyncHandler(async (req, res) => {
    const recipe = await pool!.query(
      `SELECT r.*, p.name AS author_name
       FROM recipes r
       LEFT JOIN profiles p ON p.id = r.author_id
       WHERE r.id = $1 AND r.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!recipe.rowCount) return json(res, 404, { error: 'Receita não encontrada' });
    const ingredients = await pool!.query(
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
  '/recipes',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.title) return json(res, 400, { error: 'Título é obrigatório' });
    const actor = profileIdOf(req);
    const spaceId = (await primarySpaceId(actor))!;
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
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
          Array.isArray(b.instructions) ? b.instructions.join('\n') : b.instructions || null,
          b.servings || 1,
          b.prep_time_minutes ?? null,
          b.status || 'sugerida',
          b.is_favorite ?? false,
          b.carinho_tip || null,
          b.external_id || null,
        ]
      );
      const recipe = rows[0];
      if (Array.isArray(b.ingredients)) {
        for (const ing of b.ingredients) {
          const weight = ing.weight_grams ?? ing.grams ?? 0;
          let calc: any = {};
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
              ing.unit || 'g',
              weight,
              ing.calories ?? calc.calories ?? null,
              ing.protein ?? calc.protein ?? null,
              ing.carbs ?? calc.carbs ?? null,
              ing.fat ?? calc.fat ?? null,
              ing.fiber ?? calc.fiber ?? null,
            ]
          );
        }
      }
      await client.query('COMMIT');
      await pool!.query(`SELECT emit_sync_event($1,'recipes',$2,'insert',NULL)`, [
        spaceId,
        recipe.id,
      ]);
      json(res, 201, recipe);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

apiRouter.put(
  '/recipes/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Receita não encontrada' });
    const recipe = current.rows[0];
    if (!(req as any).spaceIds.includes(recipe.kitchen_space_id)) {
      return json(res, 403, { error: 'Receita de outro espaço.' });
    }
    const admin = await isAdmin(actor, recipe.kitchen_space_id);
    if (!admin && recipe.author_id !== actor) {
      return json(res, 403, { error: 'Sem permissão para editar esta receita.' });
    }
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const fields: string[] = [];
      const values: any[] = [req.params.id];
      let i = 2;
      const settable = [
        'title',
        'description',
        'photo_path',
        'instructions',
        'servings',
        'prep_time_minutes',
        'status',
        'is_favorite',
        'carinho_tip',
      ];
      for (const key of settable) {
        if (b[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(key === 'instructions' && Array.isArray(b[key]) ? b[key].join('\n') : b[key]);
        }
      }
      if (!fields.length && !Array.isArray(b.ingredients)) {
        await client.query('ROLLBACK');
        return json(res, 400, { error: 'Nada para atualizar.' });
      }
      fields.push(`updated_by = $${i++}`);
      values.push(actor);
      const { rows } = await client.query(
        `UPDATE recipes SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
        values
      );
      if (Array.isArray(b.ingredients)) {
        await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [req.params.id]);
        await insertRecipeIngredients(client, req.params.id, b.ingredients);
      }
      await client.query('COMMIT');
      await pool!.query(`SELECT emit_sync_event($1,'recipes',$2,'update',NULL)`, [
        recipe.kitchen_space_id,
        recipe.id,
      ]);
      json(res, 200, rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

apiRouter.post(
  '/recipes/:id/approve',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Receita não encontrada' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora aprova receitas.' });
    }
    const { rows } = await pool!.query(
      `UPDATE recipes SET status = 'aprovada', updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);

apiRouter.delete(
  '/recipes/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Receita não encontrada' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora exclui receitas.' });
    }
    const { rows } = await pool!.query(
      `UPDATE recipes SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: 'Receita já excluída' });
    await pool!.query(`SELECT emit_sync_event($1,'recipes',$2,'delete',NULL)`, [
      current.rows[0].kitchen_space_id,
      req.params.id,
    ]);
    json(res, 200, { success: true });
  })
);

apiRouter.post(
  '/recipes/:id/restore',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM recipes WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Receita não encontrada' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora restaura receitas.' });
    }
    const { rows } = await pool!.query(
      `UPDATE recipes SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);

/* ------------------------------------------------------------------ */
/*  MARMITAS                                                          */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/marmitas',
  asyncHandler(async (req, res) => {
    const { status, include_deleted } = req.query as any;
    let sql = `SELECT m.*, p.name AS prepared_by_name, r.name AS recipient_name
               FROM marmitas m
               LEFT JOIN profiles p ON p.id = m.prepared_by
               LEFT JOIN profiles r ON r.id = m.recipient_id
               WHERE m.kitchen_space_id = ANY($1::uuid[])`;
    const params: any[] = [(req as any).spaceIds];
    let i = 2;
    if (include_deleted !== 'true') sql += ` AND m.deleted_at IS NULL`;
    if (status) {
      sql += ` AND m.status = $${i++}`;
      params.push(status);
    }
    sql += ` ORDER BY m.prep_date DESC NULLS LAST, m.created_at DESC`;
    const { rows } = await pool!.query(sql, params);
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/marmitas/:id',
  asyncHandler(async (req, res) => {
    const marmita = await pool!.query(
      `SELECT m.*, p.name AS prepared_by_name, r.name AS recipient_name
       FROM marmitas m
       LEFT JOIN profiles p ON p.id = m.prepared_by
       LEFT JOIN profiles r ON r.id = m.recipient_id
       WHERE m.id = $1 AND m.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!marmita.rowCount) return json(res, 404, { error: 'Marmita não encontrada' });
    const items = await pool!.query(
      `SELECT mi.*, f.name AS food_name
       FROM marmita_items mi
       LEFT JOIN foods f ON f.id = mi.food_id
       WHERE mi.marmita_id = $1 ORDER BY mi.created_at`,
      [req.params.id]
    );
    json(res, 200, { ...marmita.rows[0], items: items.rows });
  })
);

async function insertMarmitaItems(client: any, marmitaId: string, items: any[]) {
  for (const it of items) {
    const weight = it.weight_grams ?? 0;
    let calc: any = {};
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
        it.fiber ?? calc.fiber ?? null,
      ]
    );
  }
}

apiRouter.post(
  '/marmitas',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) return json(res, 400, { error: 'Nome é obrigatório' });
    const actor = profileIdOf(req);
    const spaceId = (await primarySpaceId(actor))!;
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
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
          b.status || 'preparada',
          b.external_id || null,
        ]
      );
      const marmita = rows[0];
      if (Array.isArray(b.items)) await insertMarmitaItems(client, marmita.id, b.items);
      await client.query('COMMIT');
      await pool!.query(`SELECT emit_sync_event($1,'marmitas',$2,'insert',NULL)`, [
        spaceId,
        marmita.id,
      ]);
      const totals = await pool!.query(`SELECT * FROM marmitas WHERE id = $1`, [marmita.id]);
      json(res, 201, totals.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

apiRouter.put(
  '/marmitas/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Marmita não encontrada' });
    const marmita = current.rows[0];
    if (!(req as any).spaceIds.includes(marmita.kitchen_space_id)) {
      return json(res, 403, { error: 'Marmita de outro espaço.' });
    }
    const admin = await isAdmin(actor, marmita.kitchen_space_id);
    if (!admin && !(marmita.prepared_by === actor && marmita.status !== 'publicada')) {
      return json(res, 403, {
        error: 'Marmitas publicadas só podem ser alteradas pela administradora.',
      });
    }
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const fields: string[] = [];
      const values: any[] = [req.params.id];
      let i = 2;
      const settable = [
        'name',
        'description',
        'photo_path',
        'prep_date',
        'expiry_date',
        'status',
        'recipient_id',
      ];
      for (const key of settable) {
        if (b[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(b[key]);
        }
      }
      if (!fields.length && !Array.isArray(b.items)) {
        await client.query('ROLLBACK');
        return json(res, 400, { error: 'Nada para atualizar.' });
      }
      fields.push(`updated_by = $${i++}`);
      values.push(actor);
      const { rows } = await client.query(
        `UPDATE marmitas SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
        values
      );
      if (Array.isArray(b.items)) {
        await client.query(`DELETE FROM marmita_items WHERE marmita_id = $1`, [req.params.id]);
        await insertMarmitaItems(client, req.params.id, b.items);
      }
      await client.query('COMMIT');
      await pool!.query(`SELECT emit_sync_event($1,'marmitas',$2,'update',NULL)`, [
        marmita.kitchen_space_id,
        marmita.id,
      ]);
      const totals = await pool!.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
      json(res, 200, totals.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

apiRouter.post(
  '/marmitas/:id/publish',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Marmita não encontrada' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora publica marmitas.' });
    }
    const { rows } = await pool!.query(
      `UPDATE marmitas SET status = 'publicada', updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);

apiRouter.delete(
  '/marmitas/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Marmita não encontrada' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora exclui marmitas.' });
    }
    const { rows } = await pool!.query(
      `UPDATE marmitas SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: 'Marmita já excluída' });
    await pool!.query(`SELECT emit_sync_event($1,'marmitas',$2,'delete',NULL)`, [
      current.rows[0].kitchen_space_id,
      req.params.id,
    ]);
    json(res, 200, { success: true });
  })
);

apiRouter.post(
  '/marmitas/:id/restore',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM marmitas WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Marmita não encontrada' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora restaura marmitas.' });
    }
    const { rows } = await pool!.query(
      `UPDATE marmitas SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);

/* ------------------------------------------------------------------ */
/*  REFEIÇÕES                                                         */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/meals',
  asyncHandler(async (req, res) => {
    const { date, meal_type, user_id, include_deleted } = req.query as any;
    let sql = `SELECT m.*, p.name AS user_name
               FROM meals m
               LEFT JOIN profiles p ON p.id = m.user_id
               WHERE m.kitchen_space_id = ANY($1::uuid[])`;
    const params: any[] = [(req as any).spaceIds];
    let i = 2;
    if (include_deleted !== 'true') sql += ` AND m.deleted_at IS NULL`;
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
    const { rows } = await pool!.query(sql, params);
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/meals/:id',
  asyncHandler(async (req, res) => {
    const meal = await pool!.query(
      `SELECT m.*, p.name AS user_name
       FROM meals m LEFT JOIN profiles p ON p.id = m.user_id
       WHERE m.id = $1 AND m.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!meal.rowCount) return json(res, 404, { error: 'Refeição não encontrada' });
    const items = await pool!.query(
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

async function insertMealItems(client: any, mealId: string, items: any[]) {
  for (const it of items) {
    const weight = it.weight_grams ?? 0;
    let calc: any = {};
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
        it.source || 'manual',
        it.verified ?? false,
      ]
    );
  }
}

apiRouter.post(
  '/meals',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.meal_date || !b.meal_type || !b.identification_method) {
      return json(res, 400, {
        error: 'Data, tipo e método de identificação são obrigatórios.',
      });
    }
    const actor = profileIdOf(req);
    const spaceId = (await primarySpaceId(actor))!;
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
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
          b.external_id || null,
        ]
      );
      const meal = rows[0];
      if (Array.isArray(b.items)) await insertMealItems(client, meal.id, b.items);
      await client.query('COMMIT');
      await pool!.query(`SELECT emit_sync_event($1,'meals',$2,'insert',NULL)`, [spaceId, meal.id]);
      const totals = await pool!.query(`SELECT * FROM meals WHERE id = $1`, [meal.id]);
      json(res, 201, totals.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

apiRouter.put(
  '/meals/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Refeição não encontrada' });
    const meal = current.rows[0];
    if (!(req as any).spaceIds.includes(meal.kitchen_space_id)) {
      return json(res, 403, { error: 'Refeição de outro espaço.' });
    }
    const admin = await isAdmin(actor, meal.kitchen_space_id);
    if (!admin && meal.user_id !== actor) {
      return json(res, 403, { error: 'Sem permissão para editar esta refeição.' });
    }
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const fields: string[] = [];
      const values: any[] = [req.params.id];
      let i = 2;
      for (const key of [
        'meal_date',
        'meal_type',
        'title',
        'photo_path',
        'identification_method',
        'confidence_level',
        'confidence_notes',
      ]) {
        if (b[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(b[key]);
        }
      }
      if (!fields.length && !Array.isArray(b.items)) {
        await client.query('ROLLBACK');
        return json(res, 400, { error: 'Nada para atualizar.' });
      }
      fields.push(`updated_by = $${i++}`);
      values.push(actor);
      const { rows } = await client.query(
        `UPDATE meals SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
        values
      );
      if (Array.isArray(b.items)) {
        await client.query(`DELETE FROM meal_items WHERE meal_id = $1`, [req.params.id]);
        await insertMealItems(client, req.params.id, b.items);
      }
      await client.query('COMMIT');
      await pool!.query(`SELECT emit_sync_event($1,'meals',$2,'update',NULL)`, [
        meal.kitchen_space_id,
        meal.id,
      ]);
      const totals = await pool!.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
      json(res, 200, totals.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

apiRouter.delete(
  '/meals/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Refeição não encontrada' });
    const meal = current.rows[0];
    const admin = await isAdmin(actor, meal.kitchen_space_id);
    if (!admin && meal.user_id !== actor) {
      return json(res, 403, { error: 'Sem permissão para excluir esta refeição.' });
    }
    const { rows } = await pool!.query(
      `UPDATE meals SET deleted_at = now(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, actor]
    );
    if (!rows.length) return json(res, 404, { error: 'Refeição já excluída' });
    await pool!.query(`SELECT emit_sync_event($1,'meals',$2,'delete',NULL)`, [
      meal.kitchen_space_id,
      req.params.id,
    ]);
    json(res, 200, { success: true });
  })
);

apiRouter.post(
  '/meals/:id/restore',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM meals WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Refeição não encontrada' });
    const admin = await isAdmin(actor, current.rows[0].kitchen_space_id);
    if (!admin && current.rows[0].user_id !== actor) {
      return json(res, 403, { error: 'Sem permissão para restaurar esta refeição.' });
    }
    const { rows } = await pool!.query(
      `UPDATE meals SET deleted_at = NULL, updated_by = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, actor]
    );
    json(res, 200, rows[0]);
  })
);

/* ------------------------------------------------------------------ */
/*  PEDIDOS                                                           */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const { status } = req.query as any;
    let sql = `SELECT o.*, p.name AS requester_name, r.title AS recipe_title
               FROM orders o
               LEFT JOIN profiles p ON p.id = o.requester_id
               LEFT JOIN recipes r ON r.id = o.recipe_id
               WHERE o.kitchen_space_id = ANY($1::uuid[])`;
    const params: any[] = [(req as any).spaceIds];
    let i = 2;
    if (status) {
      sql += ` AND o.status = $${i++}`;
      params.push(status);
    }
    sql += ` ORDER BY o.created_at DESC`;
    const { rows } = await pool!.query(sql, params);
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await pool!.query(
      `SELECT o.*, p.name AS requester_name
       FROM orders o LEFT JOIN profiles p ON p.id = o.requester_id
       WHERE o.id = $1 AND o.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!order.rowCount) return json(res, 404, { error: 'Pedido não encontrado' });
    const history = await pool!.query(
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
  '/orders',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.description) return json(res, 400, { error: 'Descrição é obrigatória' });
    const actor = profileIdOf(req);
    const spaceId = (await primarySpaceId(actor))!;
    const { rows } = await pool!.query(
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
        b.external_id || null,
      ]
    );
    await pool!.query(`SELECT emit_sync_event($1,'orders',$2,'insert',NULL)`, [spaceId, rows[0].id]);
    json(res, 201, rows[0]);
  })
);

const ORDER_TRANSITIONS: Record<string, string[]> = {
  pendente: ['em_preparacao', 'cancelada'],
  em_preparacao: ['concluida', 'cancelada'],
  concluida: [],
  cancelada: [],
};

apiRouter.put(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!status) return json(res, 400, { error: 'Status é obrigatório' });
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Pedido não encontrado' });
    const order = current.rows[0];
    if (!(req as any).spaceIds.includes(order.kitchen_space_id)) {
      return json(res, 403, { error: 'Pedido de outro espaço.' });
    }
    const admin = await isAdmin(actor, order.kitchen_space_id);
    if (!admin && order.requester_id !== actor) {
      return json(res, 403, { error: 'Sem permissão para alterar este pedido.' });
    }
    const allowed = ORDER_TRANSITIONS[order.status] || [];
    if (!admin && !allowed.includes(status)) {
      return json(res, 422, {
        error: `Transição inválida de ${order.status} para ${status}.`,
      });
    }
    const { rows } = await pool!.query(
      `UPDATE orders SET status = $2, updated_by = $3,
              completed_at = CASE WHEN $2 = 'concluida' THEN now() ELSE completed_at END
       WHERE id = $1 RETURNING *`,
      [req.params.id, status, actor]
    );
    await pool!.query(`SELECT emit_sync_event($1,'orders',$2,'update',NULL)`, [
      order.kitchen_space_id,
      order.id,
    ]);
    json(res, 200, rows[0]);
  })
);

apiRouter.get(
  '/orders/:id/history',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT h.*, p.name AS changed_by_name
       FROM order_status_history h
       LEFT JOIN profiles p ON p.id = h.changed_by
       WHERE h.order_id = $1
         AND h.order_id IN (SELECT id FROM orders WHERE kitchen_space_id = ANY($2::uuid[]))
       ORDER BY h.changed_at`,
      [req.params.id, (req as any).spaceIds]
    );
    json(res, 200, rows);
  })
);

apiRouter.delete(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Pedido não encontrado' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora exclui pedidos.' });
    }
    await pool!.query(`DELETE FROM orders WHERE id = $1`, [req.params.id]);
    json(res, 200, { success: true });
  })
);

/* ------------------------------------------------------------------ */
/*  LISTAS DE COMPRAS                                                 */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/shopping-lists',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT sl.*, p.name AS created_by_name
       FROM shopping_lists sl
       LEFT JOIN profiles p ON p.id = sl.created_by
       WHERE sl.kitchen_space_id = ANY($1::uuid[])
       ORDER BY sl.created_at DESC`,
      [(req as any).spaceIds]
    );
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/shopping-lists/:id',
  asyncHandler(async (req, res) => {
    const list = await pool!.query(
      `SELECT * FROM shopping_lists
       WHERE id = $1 AND kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!list.rowCount) return json(res, 404, { error: 'Lista não encontrada' });
    const items = await pool!.query(
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
  '/shopping-lists',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) return json(res, 400, { error: 'Nome é obrigatório' });
    const actor = profileIdOf(req);
    const spaceId = (await primarySpaceId(actor))!;
    const { rows } = await pool!.query(
      `INSERT INTO shopping_lists (kitchen_space_id, created_by, name, week_start_date, external_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [spaceId, b.created_by || actor, b.name, b.week_start_date || null, b.external_id || null]
    );
    await pool!.query(`SELECT emit_sync_event($1,'shopping_lists',$2,'insert',NULL)`, [
      spaceId,
      rows[0].id,
    ]);
    json(res, 201, rows[0]);
  })
);

apiRouter.put(
  '/shopping-lists/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const current = await pool!.query(`SELECT * FROM shopping_lists WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Lista não encontrada' });
    if (!(req as any).spaceIds.includes(current.rows[0].kitchen_space_id)) {
      return json(res, 403, { error: 'Lista de outro espaço.' });
    }
    const fields: string[] = [];
    const values: any[] = [req.params.id];
    let i = 2;
    for (const key of ['name', 'week_start_date']) {
      if (b[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: 'Nada para atualizar.' });
    const { rows } = await pool!.query(
      `UPDATE shopping_lists SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    json(res, 200, rows[0]);
  })
);

apiRouter.delete(
  '/shopping-lists/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM shopping_lists WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Lista não encontrada' });
    if (!(await isAdmin(actor, current.rows[0].kitchen_space_id))) {
      return json(res, 403, { error: 'Somente a administradora exclui listas.' });
    }
    await pool!.query(`DELETE FROM shopping_lists WHERE id = $1`, [req.params.id]);
    json(res, 200, { success: true });
  })
);

apiRouter.post(
  '/shopping-lists/:id/items',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (b.quantity == null || !b.unit) {
      return json(res, 400, { error: 'Quantidade e unidade são obrigatórias.' });
    }
    const list = await pool!.query(
      `SELECT id FROM shopping_lists WHERE id = $1 AND kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!list.rowCount) return json(res, 404, { error: 'Lista não encontrada.' });
    const { rows } = await pool!.query(
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
        b.linked_marmita_id || null,
      ]
    );
    json(res, 201, rows[0]);
  })
);

apiRouter.patch(
  '/shopping-lists/items/:id/purchase',
  asyncHandler(async (req, res) => {
    const purchased = Boolean(req.body?.is_purchased);
    const { rows } = await pool!.query(
      `UPDATE shopping_list_items SET is_purchased = $2,
              purchased_at = CASE WHEN $2 THEN now() ELSE NULL END
       WHERE id = $1
         AND shopping_list_id IN (
           SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY($3::uuid[])
         )
       RETURNING *`,
      [req.params.id, purchased, (req as any).spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: 'Item não encontrado' });
    json(res, 200, rows[0]);
  })
);

apiRouter.delete(
  '/shopping-lists/items/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `DELETE FROM shopping_list_items
       WHERE id = $1
         AND shopping_list_id IN (
           SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY($2::uuid[])
         )
       RETURNING id`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: 'Item não encontrado' });
    json(res, 200, { success: true });
  })
);

/* ------------------------------------------------------------------ */
/*  ANÁLISES DE IMAGEM                                                */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/image-analyses',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT ia.*, p.name AS user_name
       FROM image_analyses ia
       LEFT JOIN profiles p ON p.id = ia.user_id
       WHERE ia.kitchen_space_id = ANY($1::uuid[])
       ORDER BY ia.analysis_date DESC`,
      [(req as any).spaceIds]
    );
    json(res, 200, rows);
  })
);

apiRouter.get(
  '/image-analyses/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(
      `SELECT ia.*, p.name AS user_name
       FROM image_analyses ia
       LEFT JOIN profiles p ON p.id = ia.user_id
       WHERE ia.id = $1 AND ia.kitchen_space_id = ANY($2::uuid[])`,
      [req.params.id, (req as any).spaceIds]
    );
    if (!rows.length) return json(res, 404, { error: 'Análise não encontrada' });
    json(res, 200, rows[0]);
  })
);

apiRouter.post(
  '/image-analyses',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.original_photo_path) {
      return json(res, 400, { error: 'Caminho da foto original é obrigatório' });
    }
    const actor = profileIdOf(req);
    const spaceId = (await primarySpaceId(actor))!;
    const { rows } = await pool!.query(
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
        b.status || 'pendente',
        b.user_corrections ? JSON.stringify(b.user_corrections) : null,
        b.final_result ? JSON.stringify(b.final_result) : null,
        b.meal_id || null,
        b.external_id || null,
      ]
    );
    json(res, 201, rows[0]);
  })
);

apiRouter.put(
  '/image-analyses/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const actor = profileIdOf(req);
    const current = await pool!.query(`SELECT * FROM image_analyses WHERE id = $1`, [req.params.id]);
    if (!current.rowCount) return json(res, 404, { error: 'Análise não encontrada' });
    const analysis = current.rows[0];
    if (!(req as any).spaceIds.includes(analysis.kitchen_space_id)) {
      return json(res, 403, { error: 'Análise de outro espaço.' });
    }
    const admin = await isAdmin(actor, analysis.kitchen_space_id);
    if (!admin && analysis.user_id !== actor) {
      return json(res, 403, { error: 'Sem permissão para editar esta análise.' });
    }
    const fields: string[] = [];
    const values: any[] = [req.params.id];
    let i = 2;
    const jsonFields = ['identified_ingredients', 'estimated_quantities', 'estimated_nutrition', 'user_corrections', 'final_result'];
    for (const key of jsonFields) {
      if (b[key] !== undefined) {
        fields.push(`${key} = $${i++}::jsonb`);
        values.push(b[key] === null ? null : JSON.stringify(b[key]));
      }
    }
    for (const key of ['confidence_level', 'ai_model', 'status', 'meal_id']) {
      if (b[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(b[key]);
      }
    }
    if (!fields.length) return json(res, 400, { error: 'Nada para atualizar.' });
    const { rows } = await pool!.query(
      `UPDATE image_analyses SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    json(res, 200, rows[0]);
  })
);

/* ------------------------------------------------------------------ */
/*  CÁLCULO NUTRICIONAL                                               */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/calc/food-portion',
  asyncHandler(async (req, res) => {
    const grams = Number(req.query.grams);
    if (!Number.isFinite(grams)) return json(res, 400, { error: 'grams inválido' });
    const num = (v: any) => (v === undefined || v === '' || v === null ? null : Number(v));
    const { rows } = await pool!.query(
      `SELECT calc_food_portion($1::numeric, $2::numeric, $3::numeric, $4::numeric,
                                $5::numeric, $6::numeric, $7::numeric, $8::numeric) AS resultado`,
      [
        grams,
        num(req.query.kcal100),
        num(req.query.protein100),
        num(req.query.carbs100),
        num(req.query.fat100),
        num(req.query.fiber100),
        num(req.query.sugars100),
        num(req.query.sodium100),
      ]
    );
    json(res, 200, rows[0].resultado);
  })
);

apiRouter.post(
  '/calc/portion',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const grams = Number(b.grams);
    if (!Number.isFinite(grams)) return json(res, 400, { error: 'grams inválido' });
    const num = (v: any) => (v === undefined || v === null ? null : Number(v));
    const { rows } = await pool!.query(
      `SELECT calc_food_portion($1::numeric, $2::numeric, $3::numeric, $4::numeric,
                                $5::numeric, $6::numeric, $7::numeric, $8::numeric) AS resultado`,
      [
        grams,
        num(b.calories_per_100g),
        num(b.protein_per_100g),
        num(b.carbs_per_100g),
        num(b.fat_total_per_100g),
        num(b.fiber_per_100g),
        num(b.sugars_per_100g),
        num(b.sodium_per_100g),
      ]
    );
    json(res, 200, rows[0].resultado);
  })
);

/* ------------------------------------------------------------------ */
/*  ARMAZENAMENTO DE IMAGENS (metadados no Postgres, bytes em disco)  */
/* ------------------------------------------------------------------ */
const BUCKETS = new Set([
  'food-photos',
  'product-photos',
  'label-photos',
  'recipe-photos',
  'marmita-photos',
  'meal-photos',
]);

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function extensionFor(mimeType: string) {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimeType] || 'bin';
}

apiRouter.post(
  '/uploads',
  asyncHandler(async (req, res) => {
    const { bucket, file_name, mime_type, data_base64 } = req.body || {};
    if (!bucket || !BUCKETS.has(bucket)) {
      return json(res, 400, { error: 'Bucket inválido.' });
    }
    if (!data_base64) return json(res, 400, { error: 'Conteúdo da imagem é obrigatório.' });
    const mime = mime_type || 'image/jpeg';
    if (!mime.startsWith('image/')) return json(res, 400, { error: 'Arquivo precisa ser imagem.' });
    const clean = String(data_base64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    if (!buffer.length) return json(res, 400, { error: 'Imagem vazia.' });
    if (buffer.length > 20 * 1024 * 1024) {
      return json(res, 413, { error: 'Imagem maior que 20MB.' });
    }

    ensureUploadDir();
    const id = crypto.randomUUID();
    const fileName = `${id}.${extensionFor(mime)}`;
    const diskPath = path.join(UPLOAD_ROOT, fileName);
    fs.writeFileSync(diskPath, buffer);

    const { rows } = await pool!.query(
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
      size_bytes: buffer.length,
    });
  })
);

apiRouter.get(
  '/files/:id',
  asyncHandler(async (req, res) => {
    const actor = profileIdOf(req);
    const { rows } = await pool!.query(
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
    if (!rows.length) return json(res, 404, { error: 'Arquivo não encontrado' });
    const file = rows[0];
    const diskPath = path.join(UPLOAD_ROOT, file.file_path);
    if (!fs.existsSync(diskPath)) return json(res, 404, { error: 'Arquivo físico ausente' });
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(diskPath).pipe(res);
  })
);

apiRouter.delete(
  '/files/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool!.query(`SELECT * FROM storage_files WHERE id = $1`, [req.params.id]);
    if (!rows.length) return json(res, 404, { error: 'Arquivo não encontrado' });
    const file = rows[0];
    const actor = profileIdOf(req);
    if (file.uploaded_by !== actor) {
      const admin = await isAdmin(actor, (await primarySpaceId(actor))!);
      if (!admin) return json(res, 403, { error: 'Sem permissão.' });
    }
    const diskPath = path.join(UPLOAD_ROOT, file.file_path);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    await pool!.query(`DELETE FROM storage_files WHERE id = $1`, [req.params.id]);
    json(res, 200, { success: true });
  })
);

/* ------------------------------------------------------------------ */
/*  SINCRONIZAÇÃO                                                     */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/sync/status',
  asyncHandler(async (req, res) => {
    const spaces = (req as any).spaceIds as string[];
    const state = await pool!.query(`SELECT updated_at FROM app_state WHERE id = 'mariana-kitchen'`);
    const latest = await pool!.query(
      `SELECT COALESCE(max(id), 0) AS last_event_id, count(*)::int AS events
       FROM sync_events WHERE kitchen_space_id = ANY($1::uuid[])`,
      [spaces]
    );
    const counts: Record<string, number> = {};
    for (const table of [
      'foods',
      'products',
      'recipes',
      'marmitas',
      'meals',
      'orders',
      'shopping_lists',
      'image_analyses',
    ]) {
      const { rows } = await pool!.query(
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
      counts,
    });
  })
);

apiRouter.get(
  '/sync/events',
  asyncHandler(async (req, res) => {
    const after = Number(req.query.after || 0);
    const { rows } = await pool!.query(
      `SELECT * FROM sync_events
       WHERE kitchen_space_id = ANY($1::uuid[]) AND id > $2
       ORDER BY id ASC LIMIT 200`,
      [(req as any).spaceIds, after]
    );
    json(res, 200, { events: rows, lastEventId: rows.length ? Number(rows[rows.length - 1].id) : after });
  })
);

/* ------------------------------------------------------------------ */
/*  STATUS DOS DADOS                                                  */
/* ------------------------------------------------------------------ */
apiRouter.get(
  '/data/status',
  asyncHandler(async (req, res) => {
    const spaces = (req as any).spaceIds as string[];
    const counts: Record<string, number> = {};
    for (const table of [
      'foods',
      'products',
      'recipes',
      'marmitas',
      'meals',
      'orders',
      'shopping_lists',
      'image_analyses',
      'storage_files',
    ]) {
      const { rows } = await pool!.query(`SELECT count(*)::int AS c FROM ${table}`);
      counts[table] = rows[0].c;
    }
    json(res, 200, { ok: true, spaces, counts });
  })
);

/* ------------------------------------------------------------------ */
/*  Tratamento de erros da API                                        */
/* ------------------------------------------------------------------ */
apiRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Erro na API:', err);
  if (res.headersSent) return;
  json(res, err.status || 500, {
    error: err.message || 'Erro interno na API',
    code: err.code || undefined,
  });
});

export default apiRouter;
