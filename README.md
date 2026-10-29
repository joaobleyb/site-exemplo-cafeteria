# Freijó Café e Padaria

Site de uma cafeteria e padaria artesanal com tema de madeira, com **pedidos de verdade pelo cardápio** (na mesa pelo QR code ou para retirar no balcão), **reserva do pão do dia seguinte** e um **painel para a equipe** acompanhar tudo ao vivo.

![Freijó Café e Padaria](public/assets/hero-ending.jpg)

> **Marca fictícia**, criada para demonstração. Imagens e vídeo gerados por IA. Depoimentos ilustrativos.

## A ideia

Freijó é uma madeira brasileira nobre e dourada. O balcão levou décadas para crescer, o pão descansa 48 horas e o café pinga do coador de pano, gota a gota. O site inteiro ensina uma coisa só: **tudo que é bom leva tempo**.

## O que o cliente faz

- **Navega pelo site**, com o vídeo do coador de pano controlado pela rolagem, o cardápio, o cartão de fidelidade e as dúvidas.
- **Faz um pedido pelo cardápio:** abre o cardápio, toca no **+** dos itens e envia. Ele escolhe entre:
  - **Na mesa:** pelo QR code, o número da mesa já vem preenchido.
  - **Retirar no balcão:** informa o nome para ser chamado.
- **Acompanha o pedido ao vivo:** Recebido, Preparando, Pronto e Entregue, sem recarregar a página. Se fechar e abrir de novo, o pedido continua lá.
- **Reserva o pão de amanhã:** recebe um código (ex.: `R-7KQ2`) e o dia de retirada.
- **Paga ao receber**, no balcão ou na mesa. Não há pagamento online.

## O que a equipe faz (`/painel`)

Entrada com uma **senha única da equipe**.

- **Pedidos:** quadro com **Novos**, **Preparando** e **Prontos**.
  - Pedido novo chega na hora, com sininho, aviso na tela e contador na aba do navegador.
  - Um toque avança o status, e o cliente vê a mudança no mesmo instante.
  - Cartões ficam laranja quando o pedido está esperando demais: mais de 5 min como novo ou 15 min no preparo.
  - Mostra o total de pedidos e o valor vendido no dia, além dos pedidos entregues e cancelados.
- **Reservas:**
  - Lista por dia (hoje, amanhã ou outra data), agrupada por horário de retirada.
  - Mostra o **total de cada pão para separar**.
  - Botões **Separar**, **Retirado** e **Cancelar**, e link direto para o WhatsApp do cliente.
- **Cardápio:** marca o que acabou. O item aparece como **Esgotado** para os clientes na hora, e o servidor recusa pedidos com ele.

## Como rodar

Precisa do **Node.js 22.13 ou mais novo**. O banco SQLite já vem embutido no Node, sem instalar nada além do Express.

```bash
npm install
cp .env.example .env      # depois edite a senha da equipe
npm start
```

- Site: `http://localhost:3000`
- Painel da equipe: `http://localhost:3000/painel`
- Sem `.env`, a senha de desenvolvimento é `freijo-dev`.

O banco é criado sozinho em `data/freijo.db` no primeiro início, já com o cardápio.

## QR code das mesas

Cada mesa recebe um QR code que aponta para:

```
https://SEU-ENDERECO/?mesa=4#menu
```

Troque o `4` pelo número de cada mesa. Quem escaneia cai direto no cardápio, com **Mesa 4** no topo e o pedido indo para essa mesa. Qualquer gerador de QR code serve.

## Estrutura

```
server/
  server.js            inicia o servidor
  app.js               Express: segurança, API e arquivos do site
  config.js            variáveis de ambiente
  db.js                SQLite (node:sqlite), tabelas e cardápio inicial
  routes/              endereços da API
  controllers/         recebem a requisição e respondem
  services/            regras: pedidos, reservas, cardápio, sessão, tempo real
  middlewares/         senha da equipe, limite de tentativas, cabeçalhos, erros
  utils/               datas no fuso de São Paulo, cookies, erros HTTP
public/
  index.html  style.css  script.js     site do cliente
  painel.html painel.css painel.js     painel da equipe
  assets/                              vídeo e imagens
```

## API

| Método | Endereço | Quem | O que faz |
|---|---|---|---|
| GET | `/api/menu` | público | cardápio com preços e itens esgotados |
| POST | `/api/orders` | público | cria pedido (`type`: `mesa` ou `balcao`, `table`, `name`, `note`, `items`) |
| GET | `/api/orders/:token` | público | status do pedido |
| GET | `/api/orders/:token/stream` | público | status ao vivo (Server-Sent Events) |
| GET | `/api/reservations/options` | público | pães, horários e próximo dia de retirada |
| POST | `/api/reservations` | público | cria reserva |
| POST | `/api/auth/login` · `/logout` | equipe | entra e sai do painel |
| GET | `/api/staff/orders` | equipe | pedidos do dia e em aberto |
| PATCH | `/api/staff/orders/:id` | equipe | muda status (`novo`, `preparando`, `pronto`, `entregue`, `cancelado`) |
| GET | `/api/staff/reservations?date=AAAA-MM-DD` | equipe | reservas do dia e total por pão |
| PATCH | `/api/staff/reservations/:id` | equipe | muda status (`reservado`, `separado`, `retirado`, `cancelado`) |
| PATCH | `/api/staff/menu/:id` | equipe | marca item como disponível ou esgotado |
| GET | `/api/staff/stream` | equipe | novidades ao vivo para o painel |

## Regras importantes

- **O preço é sempre calculado no servidor**, a partir do banco. O navegador só envia o item e a quantidade.
- **Reserva:** feita até as 20h, o pão sai no dia seguinte. Feita depois das 20h, sai em dois dias. O horário segue o fuso de São Paulo.
- **Limites de tentativas:**
  - Pedidos: 8 por minuto por endereço.
  - Reservas: 6 a cada 10 minutos.
  - Senha do painel: 8 tentativas a cada 15 minutos.
- **Segurança:**
  - A sessão da equipe usa um cookie assinado e protegido (`httpOnly`, `SameSite=Strict`, `Secure` em produção).
  - A API só aceita JSON.
  - O site tem cabeçalhos de segurança e política de conteúdo (CSP).
  - O código do servidor e o banco ficam fora da pasta pública.

## Colocar no ar

Este projeto **precisa de uma hospedagem que rode Node.js**, não apenas arquivos estáticos. Pode ser um plano com suporte a Node.js ou uma VPS. Em produção:

```
NODE_ENV=production
STAFF_PASSWORD=uma-senha-forte
SESSION_SECRET=um-texto-longo-e-aleatorio
TRUST_PROXY=1
```

Garanta que a pasta `data/` fique num disco que **não é apagado a cada deploy**, porque é onde ficam os pedidos e reservas. Para backup, basta copiar `data/freijo.db`.

## Animações

- **Vídeo do topo:** rolagem suavizada, buscas no vídeo que nunca se sobrepõem e vídeo com um quadro-chave a cada 8 quadros.
- **Motion** ([motion.dev](https://motion.dev), 14.3.0 pela CDN):
  - entradas com mola nas seções e nos carimbos do cartão de fidelidade;
  - cardápio entrando item por item;
  - botões que reagem ao toque;
  - marcador das abas do cardápio;
  - abertura do pedido;
  - cartões novos no painel.
- **Movimento reduzido:** quem ativa "reduzir movimento" no sistema vê tudo no estado final, sem animações e sem baixar o vídeo.

## Créditos

Feito com Claude Code, a skill 10K Websites e a skill Motion. Imagens e vídeo gerados no Higgsfield.
