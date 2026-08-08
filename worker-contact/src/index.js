/* ===== FORMULÁRIO DE CONTATO =====
   Recebe o POST do painel de contato do site e manda o e-mail pelo Resend.

   Este Worker é público de propósito e não compartilha código nenhum com o
   Worker do painel administrativo (../worker), que é protegido pelo Cloudflare
   Access. Aqui não existe token do GitHub, não existe escrita em repositório e
   não existe leitura de conteúdo: a única coisa que ele sabe fazer é entregar
   uma mensagem num endereço fixo, definido em configuração e nunca no pedido.

   O destinatário NUNCA vem do corpo da requisição. Se viesse, este endpoint
   viraria um relay aberto: qualquer um poderia mandar e-mail para qualquer
   endereço com o seu domínio no remetente, e o estrago cairia na reputação do
   domínio. MAIL_TO é var de ambiente, ponto. */

var LIMITES = { nome: 120, email: 200, mensagem: 4000 };
var MIN_SEGUNDOS_DE_PREENCHIMENTO = 3;

var CABECALHOS_DE_SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store'
};

function json(corpo, status, extras) {
  var headers = Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8' },
    CABECALHOS_DE_SEGURANCA,
    extras || {}
  );
  return new Response(JSON.stringify(corpo), { status: status || 200, headers: headers });
}

function origensPermitidas(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(function (o) { return o.trim(); })
    .filter(Boolean);
}

/* Em produção a chamada é same-origin e CORS nem entra em cena. Estes
   cabeçalhos existem para o desenvolvimento local (site na 5500, Worker na
   8788) e para o caso de o endpoint um dia mudar de origem.
   A origem é DEVOLVIDA, nunca "*": ecoar só o que está na lista mantém o
   navegador recusando qualquer outro site, e "*" abriria para todos. Sem
   credenciais no pedido, então não há cookie nem sessão em jogo. */
function cabecalhosCors(env, origem) {
  if (!origem || origensPermitidas(env).indexOf(origem) === -1) return {};
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

/* Texto limpo e dentro do limite, ou null. Recusa em vez de truncar: cortar em
   silêncio entregaria uma mensagem pela metade sem ninguém saber que faltou
   pedaço — nem quem escreveu, nem quem recebe. */
function texto(valor, limite) {
  if (typeof valor !== 'string') return null;
  var t = valor.trim();
  if (!t || t.length > limite) return null;
  return t;
}

/* Deliberadamente frouxa. Validar e-mail por regex estrita recusa endereço
   legítimo (é um problema conhecido e sem solução boa), e quem decide de
   verdade é a entrega. O que importa aqui é barrar lixo óbvio e, principalmente,
   quebra de linha: é por ela que se injeta cabeçalho em campo de e-mail. */
function emailValido(valor) {
  if (typeof valor !== 'string') return false;
  var t = valor.trim();
  if (!t || t.length > LIMITES.email) return false;
  if (/[\r\n\t<>,;"]/.test(t)) return false;
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(t);
}

function escaparHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function enviarPeloResend(env, dados, meta) {
  var assunto = 'Contato via site — ' + dados.nome;
  var corpoTexto =
    dados.mensagem + '\n\n' +
    '---\n' +
    'Nome: ' + dados.nome + '\n' +
    'E-mail: ' + dados.email + '\n' +
    'Enviado pelo formulário do site' + (meta.pais ? ' (' + meta.pais + ')' : '') + '\n';

  var corpoHtml =
    '<div style="font-family:system-ui,sans-serif;line-height:1.6">' +
    '<p style="white-space:pre-wrap;margin:0 0 1.5rem">' + escaparHtml(dados.mensagem) + '</p>' +
    '<hr style="border:none;border-top:1px solid #ddd;margin:1.5rem 0">' +
    '<p style="margin:0;color:#666;font-size:14px">' +
    '<strong>' + escaparHtml(dados.nome) + '</strong><br>' +
    '<a href="mailto:' + escaparHtml(dados.email) + '">' + escaparHtml(dados.email) + '</a>' +
    (meta.pais ? '<br>Enviado de: ' + escaparHtml(meta.pais) : '') +
    '</p></div>';

  var resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: (env.MAIL_FROM_NAME || 'Site') + ' <' + env.MAIL_FROM + '>',
      to: [env.MAIL_TO],
      /* O "responder" vai direto para quem escreveu, em vez de voltar para o
         próprio remetente do sistema. É o que torna a caixa de entrada usável
         sem copiar e colar endereço. */
      reply_to: dados.email,
      subject: assunto,
      text: corpoTexto,
      html: corpoHtml
    })
  });

  if (!resposta.ok) {
    var detalhe = await resposta.text();
    throw new Error('resend_' + resposta.status + ': ' + detalhe.slice(0, 300));
  }
  return resposta.json();
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var origem = request.headers.get('Origin');
    var cors = cabecalhosCors(env, origem);

    if (url.pathname !== '/api/contact') {
      return json({ error: 'not_found' }, 404, cors);
    }
    /* Preflight: o navegador manda OPTIONS antes do POST porque o pedido leva
       Content-Type: application/json. Sem resposta aqui, o POST nem sai. */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: Object.assign({ 'Allow': 'POST, OPTIONS' }, CABECALHOS_DE_SEGURANCA, cors)
      });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, Object.assign({ 'Allow': 'POST, OPTIONS' }, cors));
    }

    /* Configuração incompleta falha fechado e diz o que falta no log, mas a
       resposta ao visitante não revela detalhe de infraestrutura. */
    if (!env.RESEND_API_KEY || !env.MAIL_TO || !env.MAIL_FROM) {
      console.error('[contact] configuração incompleta: RESEND_API_KEY, MAIL_TO ou MAIL_FROM ausente');
      return json({ error: 'unavailable', message: 'O envio está indisponível no momento.' }, 503, cors);
    }

    var permitidas = origensPermitidas(env);
    if (permitidas.length && origem && permitidas.indexOf(origem) === -1) {
      return json({ error: 'origin_not_allowed', message: 'Origem não autorizada.' }, 403);
    }

    var corpo;
    try {
      corpo = await request.json();
    } catch (e) {
      return json({ error: 'invalid_json', message: 'Não foi possível ler o formulário.' }, 400, cors);
    }

    /* Armadilha: campo invisível no HTML que pessoa nenhuma preenche. Robô que
       preenche tudo cai aqui. Responde 200 de propósito — dizer "recusado"
       ensinaria o robô a contornar na próxima. Nada é enviado. */
    if (typeof corpo.website === 'string' && corpo.website.trim()) {
      return json({ ok: true }, 200, cors);
    }

    /* Preenchimento instantâneo é robô. Vem do cliente e é falsificável, então
       é filtro barato, não barreira: serve para o volume trivial de spam
       automatizado, e não substitui um desafio de verdade se o problema
       crescer (aí a resposta é Turnstile, ver README). */
    var segundos = Number(corpo.elapsed);
    if (Number.isFinite(segundos) && segundos >= 0 && segundos < MIN_SEGUNDOS_DE_PREENCHIMENTO) {
      return json({ ok: true }, 200, cors);
    }

    var nome = texto(corpo.name, LIMITES.nome);
    var mensagem = texto(corpo.message, LIMITES.mensagem);
    var email = typeof corpo.email === 'string' ? corpo.email.trim() : '';

    if (!nome) return json({ error: 'invalid_name', message: 'Preencha o nome.' }, 422, cors);
    if (!emailValido(email)) return json({ error: 'invalid_email', message: 'Confira o e-mail digitado.' }, 422, cors);
    if (!mensagem) return json({ error: 'invalid_message', message: 'Escreva a mensagem.' }, 422, cors);

    try {
      await enviarPeloResend(env, { nome: nome, email: email, mensagem: mensagem },
        { pais: request.headers.get('CF-IPCountry') || '' });
      return json({ ok: true }, 200, cors);
    } catch (e) {
      /* O detalhe vai para o log do Worker (wrangler tail), não para a tela:
         mensagem de erro de provedor não ajuda o visitante e pode expor
         configuração. Ele recebe o caminho alternativo, que é escrever direto. */
      console.error('[contact] falha ao enviar:', e && e.message);
      return json({ error: 'send_failed', message: 'Não foi possível enviar agora.' }, 502, cors);
    }
  }
};
