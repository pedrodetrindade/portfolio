# Portfólio — Pedro de Trindade

Brief de projeto para continuar o desenvolvimento no Claude Code.
Leia este brief antes de editar.

## Objetivo
Site de portfólio pessoal, codado, hospedado no GitHub Pages com domínio próprio.
Posicionamento: diretor de arte e designer sênior, com foco em direção criativa,
branding, identidade visual, campanhas e estratégia de marca para fintech,
ativos digitais e negócios B2B e B2C.

## Identidade
- Nome público: Pedro de Trindade
- Handle (todas as redes): @pedrodetrindade
- Domínio: pedrodetrindade.com
- E-mail: contact@pedrodetrindade.com (e contato@, ambos encaminham para o Gmail)

## Stack
Site estático: HTML + CSS + JS puro, sem framework e sem build.
Deploy no GitHub Pages. O objetivo é controle total do design e zero custo além do domínio.

## Arquivos
```
index.html          home (capa, trabalhos, sobre, ferramentas, experiência, contato)
css/style.css       todo o CSS do site
js/main.js          todo o JS; injeta menu, painel de contato e transições em todas as páginas
work/case-01..04    páginas de case, bilíngues, mesmo sistema visual
assets/             imagens reais dos projetos (ainda vazio)
CNAME               pedrodetrindade.com
```

CSS e JS são compartilhados pelas 5 páginas. Os links usam `?v=N` para furar o cache
do navegador: ao editar `css/style.css` ou `js/main.js`, incremente esse número em
todas as páginas, senão o navegador continua servindo a versão antiga.

## Direção visual (referências: Mercury + midu.design)
Técnico, clean, elegante, maduro. Baixo contraste.
- Fundo: carvão-azulado profundo e dessaturado (não preto puro).
- Texturas-assinatura: orbes/esferas de luz difusas, grain, vidro fosco (blur/translucidez).
- Sobreposições (selos, botões flutuantes, tags) sempre translúcidas, nunca creme sólido.
- Tipografia: Onest (display/corpo) + JetBrains Mono (rótulos técnicos, sempre minúsculos).

Tokens principais (ver `:root` em css/style.css):
ink #0A0C11 · ink-2 #12151D · paper #E7E9F0 · cream #EAE1CC · accent #AEBAD0 · muted #787E8D

## Estrutura atual
1. Portal de idioma na entrada (PT/EN), a cada carregamento; seletor PT/EN no topo.
2. Capa: título centralizado, glow monocromático subindo do rodapé, barra com cargo,
   relógio ao vivo do Rio e "role para explorar", wordmark gigante em marca-d'água.
3. Trabalhos: 4 cards grandes com tags translúcidas no topo e título sobreposto na base.
4. Sobre: bio real e destaques de trajetória.
5. Ferramentas: grade de cards.
6. Experiência: 7 posições em duas colunas (período/local à esquerda, cargo e descrição à direita).
7. Contato + footer.

Bilíngue via atributos `data-pt` / `data-en` em cada elemento traduzível.
Todo texto novo precisa dos dois atributos, incluindo datas (Abr/Apr, Set/Sep, Ago/Aug).

## Interações
- Menu overlay em vidro fosco com miniaturas, CTA e redes (botão "Menu" no topo).
- Painel de contato: nome, e-mail e mensagem apenas. Sem campos de orçamento ou escopo.
- Transições entre páginas: véu escurece, navega, a próxima entra em fade.
- Glow suave seguindo o cursor pelo site.
- Selo translúcido "ver caso" acompanhando o mouse sobre os cards de projeto.
Tudo respeita `prefers-reduced-motion` e é desativado em telas touch quando faz sentido.

## Próximos passos
1. Trocar as prévias placeholder por imagens reais dos projetos.
   Cada prévia é uma `<div class="scene pX"></div>`.
   Substituir por: `<img src="assets/case-01.jpg" class="scene" alt="...">`
   (mesmo enquadramento, grain e hover continuam funcionando).
2. Curadoria: escrever o conteúdo real de cada case (contexto, processo, resultado).
   Hoje é texto placeholder genérico. Elevar a nível de direção criativa sênior.
3. Deploy: criar conta e repositório no GitHub, enviar os arquivos, apontar o DNS.
4. Acabamento: favicon, meta tags Open Graph, performance, acessibilidade.
5. Confirmar as URLs de LinkedIn, Behance e Instagram (hoje assumem /pedrodetrindade).
6. Decidir o envio do formulário: hoje abre o cliente de e-mail via `mailto:`.
   Para envio real sem sair do site, usar um serviço como Formspree (tem plano grátis).

## Deploy no GitHub Pages (resumo)
- Criar conta no GitHub e um repositório público (ex.: `pedrodetrindade`).
  Pages em repositório privado exige plano pago, então use público.
- Enviar os arquivos, mantendo o `CNAME` na raiz com apenas: pedrodetrindade.com
- Em Settings > Pages, apontar para a branch principal.
- No DNS do domínio (Porkbun): registros A do domínio apex apontando para os IPs do
  GitHub Pages e um CNAME `www` para `SEU-USUARIO.github.io`.
  Confirmar os IPs atuais na documentação do GitHub Pages antes de configurar.
- Ativar "Enforce HTTPS" após a propagação.

## Preferências de escrita
Sem travessões (—) no corpo do texto. Sem caixa alta em texto corrido.
Registro premium, claro e estratégico. Evitar tom que soe gerado por IA.
