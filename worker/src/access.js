/* ===== VALIDAÇÃO DO CLOUDFLARE ACCESS =====
   O Cloudflare Access já bloqueia quem não tem permissão antes da requisição
   chegar aqui — é a camada principal, configurada no painel do Cloudflare
   (ver README, seção F), não neste código.
   Esta função é a segunda camada, pedida explicitamente no escopo: mesmo que
   o Access esteja mal configurado ou seja contornado por algum motivo, o
   Worker reconfirma sozinho, lendo o token que o Access anexa em
   Cf-Access-Jwt-Assertion, e SÓ aceita a requisição se:
     - a assinatura do token bater com a chave pública do time (JWKS);
     - o emissor (iss) for o domínio do time;
     - a audiência (aud) for a do aplicativo configurado;
     - o token não estiver expirado;
     - o e-mail dentro do token for exatamente o e-mail autorizado.
   Qualquer verificação que não puder ser feita (variável ausente, JWKS fora
   do ar, claim faltando) resulta em rejeição — "falhar de forma fechada",
   nunca o contrário. */

var JWKS_CACHE = { teamDomain: null, keys: null, fetchedAt: 0 };
var JWKS_TTL_MS = 10 * 60 * 1000; /* 10 minutos: as chaves do Access giram raramente */

function base64UrlToUint8Array(b64url) {
  var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  var pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(b64url) {
  var bytes = base64UrlToUint8Array(b64url);
  var text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

async function getJwks(teamDomain) {
  var now = Date.now();
  if (JWKS_CACHE.teamDomain === teamDomain && JWKS_CACHE.keys && (now - JWKS_CACHE.fetchedAt) < JWKS_TTL_MS) {
    return JWKS_CACHE.keys;
  }
  var res = await fetch('https://' + teamDomain + '/cdn-cgi/access/certs');
  if (!res.ok) throw new Error('jwks_fetch_failed');
  var data = await res.json();
  if (!data || !Array.isArray(data.keys)) throw new Error('jwks_invalid');
  JWKS_CACHE = { teamDomain: teamDomain, keys: data.keys, fetchedAt: now };
  return data.keys;
}

async function importRsaKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/* Retorna { ok:true, email } ou { ok:false, reason } — nunca lança, para o
   chamador poder tratar como "sem acesso" de forma previsível. */
async function verifyAccessJWT(request, env) {
  try {
    if (env.DEV_AUTH_BYPASS === 'true') {
      /* Só existe se alguém escreveu isso em .dev.vars, que nunca é enviado
         ao deploy (é ignorado pelo próprio wrangler e pelo .gitignore).
         O aviso no console deixa o bypass impossível de passar despercebido
         durante o desenvolvimento local. */
      console.warn('[access] DEV_AUTH_BYPASS ativo — nunca use isto em produção.');
      return { ok: true, email: env.ADMIN_EMAIL || 'dev@local' };
    }

    var teamDomain = env.ACCESS_TEAM_DOMAIN;
    var aud = env.ACCESS_AUD;
    var adminEmail = env.ADMIN_EMAIL;
    if (!teamDomain || !aud || !adminEmail) {
      return { ok: false, reason: 'access_not_configured' };
    }

    var token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) {
      var cookie = request.headers.get('Cookie') || '';
      var match = cookie.match(/CF_Authorization=([^;]+)/);
      if (match) token = match[1];
    }
    if (!token) return { ok: false, reason: 'missing_token' };

    var parts = token.split('.');
    if (parts.length !== 3) return { ok: false, reason: 'malformed_token' };

    var header = base64UrlToJson(parts[0]);
    var payload = base64UrlToJson(parts[1]);
    var signature = base64UrlToUint8Array(parts[2]);
    var signedData = new TextEncoder().encode(parts[0] + '.' + parts[1]);

    if (header.alg !== 'RS256') return { ok: false, reason: 'unexpected_alg' };

    var keys = await getJwks(teamDomain);
    var jwk = keys.filter(function (k) { return k.kid === header.kid; })[0];
    if (!jwk) return { ok: false, reason: 'unknown_kid' };

    var cryptoKey = await importRsaKey(jwk);
    var validSignature = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
    if (!validSignature) return { ok: false, reason: 'bad_signature' };

    var expectedIssuer = 'https://' + teamDomain;
    if (payload.iss !== expectedIssuer) return { ok: false, reason: 'bad_issuer' };

    var audClaim = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audClaim.indexOf(aud) === -1) return { ok: false, reason: 'bad_audience' };

    var now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return { ok: false, reason: 'expired' };

    var email = payload.email || (payload.identity && payload.identity.email);
    if (!email || email.toLowerCase() !== adminEmail.toLowerCase()) {
      return { ok: false, reason: 'email_not_authorized' };
    }

    return { ok: true, email: email };
  } catch (e) {
    /* qualquer falha de verificação vira rejeição, nunca exceção não tratada */
    return { ok: false, reason: 'verification_error' };
  }
}

export { verifyAccessJWT };
