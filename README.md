# Sistema de Sinalização Digital

Painel simples e protegido por senha para atualizar remotamente os vídeos promocionais exibidos em 2 (ou mais) TVs. As TVs se atualizam sozinhas, em poucos segundos, sem precisar de ninguém mexendo nelas.

## Como funciona

- Um **servidor** guarda a lista de vídeos (playlist) e serve duas páginas web:
  - `/admin` — painel de controle, protegido por senha, acessível do celular ou computador.
  - `/player` — página que roda nas TVs em tela cheia, reproduzindo a playlist em loop.
- Quando você adiciona, remove, reordena ou ativa/desativa um vídeo no painel, o servidor avisa instantaneamente todas as TVs conectadas (via WebSocket). Além disso, cada TV também confere a playlist a cada 60 segundos por conta própria — então mesmo que a internet caia por um instante ou o celular do admin esteja desligado, as TVs seguem funcionando e se atualizam sozinhas assim que possível.
- As TVs guardam a última playlist recebida (cache local no navegador), então continuam exibindo vídeos mesmo numa queda de internet passageira.

## Requisitos

- Node.js 18+
- Um lugar para hospedar o servidor com acesso à internet (para o painel funcionar "de qualquer lugar" e as TVs conseguirem se conectar). Veja a seção **Deploy** abaixo.
- Nas TVs: um navegador em modo tela cheia (a própria Smart TV, ou um TV Box/Fire Stick/Chromecast com Google TV/Mini PC conectado na TV).

## Configuração local

```bash
npm install
cp .env.example .env
```

Gere o hash da senha do painel (a senha nunca fica salva em texto puro):

```bash
npm run hash-password -- "sua-senha-aqui"
```

Copie o valor de `ADMIN_PASSWORD_HASH` gerado para o arquivo `.env`. Também defina um `JWT_SECRET` aleatório (o comando abaixo gera um):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Inicie o servidor:

```bash
npm start
```

Acesse `http://localhost:3000/admin` para gerenciar os vídeos e `http://localhost:3000/player` para ver como fica na TV.

## Uso do painel

1. Abra `/admin` no celular ou computador e faça login com a senha.
2. Em **Adicionar vídeo**, envie um arquivo de vídeo (MP4/WebM/OGG/MOV) ou cole um link direto de vídeo já hospedado (ex: um `.mp4` público).
3. A lista **Playlist das TVs** mostra a ordem de reprodução. Use as setas ▲▼ para reordenar, o botão **Ativo/Inativo** para exibir ou ocultar um vídeo sem apagar, e **Remover** para excluir definitivamente.
4. Toda alteração é enviada às TVs automaticamente, em poucos segundos.

## Configurando as TVs

1. No navegador da TV (ou do TV Box conectado a ela), acesse `https://SEU-DOMINIO/player`.
2. Coloque o navegador em **tela cheia** (kiosk mode). Algumas opções:
   - **Smart TVs com navegador embutido**: abra o site e use a opção de tela cheia do navegador.
   - **Fire TV Stick / Android TV Box**: instale um navegador em modo kiosk (ex: "Fully Kiosk Browser") e configure para abrir a URL do player automaticamente ao ligar.
   - **Mini PC / Raspberry Pi conectado à TV**: configure o Chrome/Chromium para iniciar automaticamente com o sistema, em `--kiosk https://SEU-DOMINIO/player`.
3. Pronto. A partir daqui, a TV nunca mais precisa ser mexida manualmente — toda atualização de vídeo é feita pelo painel, remotamente.

Repita esse processo uma única vez em cada uma das 2 TVs (ambas mostram a mesma playlist, sincronizadas).

## Deploy (para acessar de qualquer lugar)

O servidor precisa ficar acessível pela internet, tanto para você abrir o painel de qualquer lugar quanto para as TVs conseguirem buscar os vídeos.

### Opção simples: plataformas com deploy automático (Render, Railway, Fly.io, etc.)

1. Suba este repositório no GitHub.
2. Crie um novo serviço "Web Service" apontando para o repositório.
3. Configure as variáveis de ambiente `JWT_SECRET`, `ADMIN_PASSWORD_HASH` e `CORS_ORIGIN` (com a URL pública que a plataforma vai gerar).
4. **Importante:** configure um **volume/disco persistente** para as pastas `uploads/` e `data/` — sem isso, os vídeos enviados por upload e a playlist podem ser apagados a cada novo deploy. Se a plataforma não oferecer disco persistente no plano gratuito, prefira adicionar vídeos por **link** (aba "Usar link") em vez de upload, apontando para vídeos hospedados em outro serviço de armazenamento.

### Opção com Docker (VPS própria)

```bash
cp .env.example .env   # preencha JWT_SECRET, ADMIN_PASSWORD_HASH e CORS_ORIGIN
docker compose up -d --build
```

O `docker-compose.yml` já mantém `uploads/` e `data/` como volumes persistentes no host. Configure um domínio com HTTPS na frente (ex: Nginx + Certbot, ou Caddy) apontando para a porta `3000`.

## Segurança

- A senha do painel nunca é armazenada em texto puro (apenas o hash bcrypt).
- Login tem limite de tentativas (10 a cada 15 minutos) para dificultar tentativas de adivinhação.
- A sessão do painel expira em 30 dias; basta fazer login novamente depois disso.
- A página `/player` não expõe nenhuma ação de edição — ela só consegue *ler* a playlist ativa.

## Estrutura do projeto

```
server/            servidor Node/Express + Socket.IO + autenticação
public/admin/      painel de controle (protegido por senha)
public/player/     página exibida nas TVs
uploads/           vídeos enviados por upload
data/db.json       playlist salva (criado automaticamente)
```
