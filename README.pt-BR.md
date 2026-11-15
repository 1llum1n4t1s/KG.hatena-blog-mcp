# hatena-blog-mcp

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | **Português (Brasil)**

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> Este repositório é um fork não oficial, mantido de forma independente, de [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp). As alterações específicas do fork incluem suporte ao Hatena Fotolife, detecção de conflitos de atualização, limites defensivos de tamanho e um runtime stdio local. Relate problemas relacionados a essas alterações [neste fork](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues). Consulte [CHANGELOG.md](./CHANGELOG.md) para mais detalhes.

Um servidor MCP (Model Context Protocol) local para ler e escrever por meio da [Hatena Blog AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) e da [Hatena Fotolife Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/). Ele se comunica via stdio no Node.js e não exige um endpoint MCP hospedado externamente nem um relay.

## Recursos

- 13 ferramentas para posts, páginas, categorias e imagens do Fotolife
- Atualizações parciais seguras em `update_entry` e `update_page`, com detecção de conflitos via `expected_edited`
- Seleção automática de eyecatch por meio de um bloco opcional com a primeira imagem do corpo
- Sem nova tentativa automática para POST, evitando posts e uploads de imagem duplicados
- Limites defensivos para XML, conteúdo, categorias, imagens e corpos de erro
- As credenciais vêm de variáveis de ambiente locais do processo, nunca de argumentos de linha de comando

## Início rápido

### Requisitos

- Node.js 22 ou superior
- Seu Hatena ID
- A chave de API exibida em Hatena Blog → Configurações → Avançado → AtomPub

Registre o servidor em qualquer cliente MCP compatível com stdio:

```jsonc
{
  "mcpServers": {
    "hatena-blog": {
      "command": "npx",
      "args": ["--yes", "@kagayoi/hatena-blog-mcp@latest"],
      "env": {
        "HATENA_ID": "your-hatena-id",
        "HATENA_API_KEY": "your-atompub-api-key"
      }
    }
  }
}
```

Se um cliente Windows não encontrar o `npx`, use `npx.cmd`. Sempre que possível, prefira o armazenamento de segredos do cliente ou do sistema operacional em vez de manter as credenciais diretamente em um arquivo de configuração compartilhado.

### Atualizações

A especificação `@latest` é resolvida para a dist-tag `latest` do npm quando o processo MCP é iniciado. O MCP não se reescreve nem contata um serviço de atualização próprio durante a execução. Para instalações reproduzíveis, substitua `latest` pela versão exata do release que você pretende usar.

Se você já registrou o servidor com uma versão fixada (por exemplo, `@kagayoi/hatena-blog-mcp@1.0.6`), altere o argumento do pacote nesse registro para `@kagayoi/hatena-blog-mcp@latest`. Atualizar este README não altera registros existentes, mas, depois dessa edição, cada inicialização passa a usar automaticamente o release mais recente.

### Executar a partir do código-fonte

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

Defina o comando do cliente como `node`, informe o caminho absoluto para `dist/cli.js` e forneça as mesmas duas variáveis de ambiente.

## Autenticação e fluxo de dados

Na inicialização, o processo deriva, apenas em memória, um cabeçalho Basic Authorization a partir de `HATENA_ID` e `HATENA_API_KEY` para o AtomPub. As requisições ao Fotolife geram um cabeçalho WSSE novo a partir das mesmas credenciais. O servidor não persiste credenciais, posts nem imagens.

`blog_id` é o domínio do blog, por exemplo `example.hatenablog.com` ou `example.hateblo.jp`. Em blogs de grupo, o argumento opcional `hatena_id` da ferramenta substitui apenas o Hatena ID usado na URL upstream.

## Referência das ferramentas

### Posts

| Ferramenta | Finalidade | Obrigatórios | Principais opções |
| --- | --- | --- | --- |
| `list_entries` | Listar posts, 7 por página | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | Obter um post | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | Criar um post | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | Atualizar parcialmente um post | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | Excluir um post | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` busca o post atual e mescla apenas os campos informados explicitamente. Ele preserva título, corpo, tipo de conteúdo, estado de publicação, categorias, carimbo de data/hora e slug quando omitidos. Passe `categories: []` para limpar as categorias. Se `expected_edited` não corresponder ao valor atual, a ferramenta para antes do PUT e informa um conflito.

Um novo post agendado exige `scheduled: true`, `draft: true` e um carimbo de data/hora de publicação em `updated`. Quando o Hatena omite `scheduled` em uma resposta GET, o campo também é omitido do resultado e do XML de atualização, em vez de ser sintetizado como `false`. Os carimbos de data/hora de publicação existentes só mudam com `touch_updated: true`.

#### Eyecatch automático a partir da primeira imagem do corpo

Quando `eyecatch_image_url` é informado em `create_entry` ou `update_entry`, o MCP insere no início do corpo um bloco de imagem HTML identificável. O Hatena Blog pode então selecionar automaticamente a primeira imagem do corpo. Isso não define diretamente o campo oficial de eyecatch do Hatena, e a imagem continua visível no corpo do artigo.

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "Um post com eyecatch automático",
    "content": "### Corpo\n\nO artigo começa aqui.",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- Você pode passar diretamente a `image_url` retornada por `upload_image`.
- Omitir a opção deixa o corpo inalterado.
- Informá-la novamente substitui um bloco inserido anteriormente por este MCP.
- Quando `content` é omitido em uma atualização, o bloco é aplicado ao corpo existente.

### Páginas

| Ferramenta | Finalidade | Obrigatórios | Principais opções |
| --- | --- | --- | --- |
| `list_pages` | Listar páginas, 10 por página | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | Obter uma página | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | Criar uma página | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | Atualizar parcialmente uma página | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | Excluir uma página | `blog_id`, `page_id` | `hatena_id` |

### Categorias e imagens

| Ferramenta | Finalidade | Obrigatórios | Principais opções |
| --- | --- | --- | --- |
| `list_categories` | Listar categorias e o estado de fixação | `blog_id` | `hatena_id` |
| `get_image` | Obter os metadados de uma imagem do Fotolife | `image_id` | — |
| `upload_image` | Enviar uma imagem e retornar sua URL e a sintaxe para o blog | `title`, `content_type`, `data_base64` | `folder` (padrão: `Hatena Blog`) |

O feed oficial do Fotolife não lista a pasta privada “Hatena Blog”, preenchida por meio do editor do blog; por isso, este servidor não oferece uma ferramenta para listar imagens.

## Limites e novas tentativas

- Resposta XML do Hatena: 8 MiB
- Corpo de erro: 16 KiB
- Corpo do post: 4 MiB
- Imagem decodificada: 10 MiB
- Categorias: 100 entradas, 256 caracteres cada
- Timeout upstream: 30 segundos por tentativa
- Nova tentativa automática: apenas para métodos idempotentes, como GET, PUT e DELETE; nunca para POST
- O cancelamento de uma requisição MCP se propaga para as requisições upstream e para as esperas entre tentativas. Escritas já enviadas não podem ser revertidas.
- Timeouts do corpo da resposta e falhas de conexão são reportados como erros de rede, separadamente de corpos grandes demais e de erros de análise de XML.

## Desenvolvimento e verificação

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` executa Biome, TypeScript, Vitest com cobertura habilitada, uma conexão stdio com a CLI compilada e verificações E2E para limites de imagem, cancelamento, atualizações parciais e falhas no corpo da resposta. Após a compilação, execute `node scripts/smoke-behavior.mjs --report <output.json>` para salvar os resultados. Consulte [DESIGN.md](./DESIGN.md) para a arquitetura e as invariantes.

## Segurança

- Remova os valores de ambiente antes de compartilhar a configuração de um cliente MCP ou um wrapper.
- Os logs excluem Authorization, chaves de API, corpos de resposta upstream e mensagens de exceção arbitrárias.
- Se uma chave vazar, gere uma nova nas configurações de AtomPub do Hatena Blog.
- Trata-se de um processo stdio local, mas ainda é necessária a proteção do sistema operacional contra outros processos executados pelo mesmo usuário e contra a divulgação de arquivos de configuração do cliente.

## Licença

MIT © Keisuke Nishitani
