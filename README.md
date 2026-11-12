# Our Little Kitchen 💜

Aplicativo de nutrição e rotina de cozinha compartilhado entre **Lívia** e
**Mariana**. Interface em React/Vite, servidor Express e persistência no
**Neon Postgres**.

## Requisitos

- Node.js 20+
- Projeto Neon com `DATABASE_URL` (veja `.env.example`)

## Instalação

```bash
npm install --legacy-peer-deps
```

Copie `.env.example` para `.env.local` e preencha as credenciais. O comando
`neon deploy` também pode gerar `.env.local` a partir do projeto vinculado.

## Banco de dados

```bash
npm run db:migrate   # aplica migrations pendentes (idempotente)
```

As migrations ficam em `db/migrations` e são registradas em
`schema_migrations`. Detalhes do modelo, RLS, autenticação e backup estão em
[DATABASE.md](./DATABASE.md).

## Desenvolvimento

```bash
npm run dev          # http://localhost:3000
```

No primeiro acesso, escolha o perfil (Lívia ou Mariana) e crie/entre com o PIN.
O primeiro PIN de cada perfil é definido no login; se `OLK_SETUP_CODE` estiver
definido no servidor, ele será solicitado.

## Testes

Com o servidor rodando em outro terminal:

```bash
npm run test:db
```

Os testes cobrem autenticação, alimentos, produtos/código de barras, receitas,
marmitas, refeições, pedidos, compras, imagens, sincronização, permissões,
isolamento de espaço e RLS. Eles criam um espaço isolado temporário e limpam
tudo ao final.

## Build

```bash
npm run build
npm start
```

## IA (opcional)

Defina `GEMINI_API_KEY` para habilitar análise de fotos, OCR de rótulos e
sugestões de receita. Sem a chave, esses endpoints respondem 503 de forma
controlada; o restante do app continua funcionando.
