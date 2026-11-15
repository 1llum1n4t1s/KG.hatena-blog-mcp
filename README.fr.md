# hatena-blog-mcp

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | **Français** | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> Ce dépôt est un fork non officiel, maintenu de manière indépendante, de [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp). Les modifications propres à ce fork comprennent la prise en charge de Hatena Fotolife, la détection des conflits de mise à jour, des limites de taille défensives et un environnement d'exécution stdio local. Signalez les problèmes liés à ces modifications sur [ce fork](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues). Consultez [CHANGELOG.md](./CHANGELOG.md) pour plus de détails.

Un serveur MCP (Model Context Protocol) local pour lire et écrire via l'[API AtomPub de Hatena Blog](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) et l'[API Atom de Hatena Fotolife](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/). Il communique par stdio sur Node.js et ne nécessite ni point de terminaison MCP hébergé à l'extérieur ni relais.

## Fonctionnalités

- 13 outils couvrant les articles, les pages, les catégories et les images Fotolife
- Mises à jour partielles sûres dans `update_entry` et `update_page`, avec détection des conflits via `expected_edited`
- Sélection automatique de l'image d'accroche (eyecatch) grâce à un bloc facultatif contenant la première image du corps
- Aucune nouvelle tentative automatique pour POST, afin d'éviter les publications et les envois d'images en double
- Limites défensives pour le XML, le contenu, les catégories, les images et les corps d'erreur
- Les identifiants proviennent des variables d'environnement du processus local, jamais des arguments de ligne de commande

## Démarrage rapide

### Prérequis

- Node.js 22 ou version ultérieure
- Votre identifiant Hatena
- La clé d'API affichée dans Hatena Blog → Paramètres → Avancé → AtomPub

Enregistrez le serveur dans n'importe quel client MCP compatible avec stdio :

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

Si un client Windows ne trouve pas `npx`, utilisez `npx.cmd`. Lorsque c'est possible, privilégiez le stockage de secrets du client ou du système d'exploitation plutôt que de conserver les identifiants directement dans un fichier de configuration partagé.

### Mises à jour

La spécification `@latest` est résolue vers la dist-tag `latest` de npm au démarrage du processus MCP. Le MCP ne se réécrit pas lui-même et ne contacte aucun service de mise à jour personnalisé pendant son exécution. Pour des installations reproductibles, remplacez `latest` par la version exacte que vous souhaitez utiliser.

Si vous avez déjà enregistré le serveur avec une version figée (par exemple `@kagayoi/hatena-blog-mcp@1.0.6`), remplacez l'argument du paquet dans cet enregistrement par `@kagayoi/hatena-blog-mcp@latest`. La mise à jour de ce README ne modifie pas les enregistrements existants, mais après cette modification, chaque lancement utilise automatiquement la dernière version.

### Exécuter depuis les sources

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

Définissez la commande du client sur `node`, transmettez le chemin absolu vers `dist/cli.js` et fournissez les deux mêmes variables d'environnement.

## Authentification et flux de données

Au démarrage, le processus dérive en mémoire un en-tête Basic Authorization à partir de `HATENA_ID` et `HATENA_API_KEY` pour AtomPub. Les requêtes Fotolife dérivent un nouvel en-tête WSSE à partir des mêmes identifiants. Le serveur ne conserve de façon persistante ni les identifiants, ni les articles, ni les images.

`blog_id` est le domaine du blog, par exemple `example.hatenablog.com` ou `example.hateblo.jp`. Sur les blogs de groupe, l'argument facultatif `hatena_id` de l'outil remplace uniquement l'identifiant Hatena utilisé dans l'URL du service amont.

## Référence des outils

### Articles

| Outil | Rôle | Obligatoires | Options principales |
| --- | --- | --- | --- |
| `list_entries` | Liste les articles, 7 par page | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | Récupère un article | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | Crée un article | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | Met à jour partiellement un article | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | Supprime un article | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` récupère l'article actuel et ne fusionne que les champs explicitement fournis. Il conserve le titre, le corps, le type de contenu, l'état de publication, les catégories, l'horodatage et le slug lorsqu'ils sont omis. Passez `categories: []` pour vider les catégories. Si `expected_edited` ne correspond pas à la valeur actuelle, l'outil s'arrête avant le PUT et signale un conflit.

Un nouvel article programmé exige `scheduled: true`, `draft: true` et un horodatage de publication dans `updated`. Lorsque Hatena omet `scheduled` dans une réponse GET, le champ est également omis du résultat et du XML de mise à jour, au lieu d'être synthétisé sous la forme `false`. Les horodatages de publication existants ne changent qu'avec `touch_updated: true`.

#### Eyecatch automatique à partir de la première image du corps

Lorsque `eyecatch_image_url` est fourni à `create_entry` ou `update_entry`, le MCP insère au début du corps un bloc d'image HTML identifiable. Hatena Blog peut alors sélectionner automatiquement la première image du corps. Cela ne renseigne pas directement le champ eyecatch officiel de Hatena, et l'image reste visible dans le corps de l'article.

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "Un article avec eyecatch automatique",
    "content": "### Corps\n\nL'article commence ici.",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- Vous pouvez transmettre directement l'`image_url` renvoyée par `upload_image`.
- Si l'option est omise, le corps reste inchangé.
- La fournir à nouveau remplace un bloc précédemment inséré par ce MCP.
- Lorsque `content` est omis lors d'une mise à jour, le bloc est appliqué au corps existant.

### Pages

| Outil | Rôle | Obligatoires | Options principales |
| --- | --- | --- | --- |
| `list_pages` | Liste les pages, 10 par page | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | Récupère une page | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | Crée une page | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | Met à jour partiellement une page | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | Supprime une page | `blog_id`, `page_id` | `hatena_id` |

### Catégories et images

| Outil | Rôle | Obligatoires | Options principales |
| --- | --- | --- | --- |
| `list_categories` | Liste les catégories et leur état d'épinglage | `blog_id` | `hatena_id` |
| `get_image` | Récupère les métadonnées d'une image Fotolife | `image_id` | — |
| `upload_image` | Envoie une image et renvoie son URL et sa syntaxe pour le blog | `title`, `content_type`, `data_base64` | `folder` (par défaut : `Hatena Blog`) |

Le flux officiel de Fotolife ne liste pas le dossier privé « Hatena Blog » alimenté par l'éditeur du blog ; ce serveur ne fournit donc pas d'outil de liste des images.

## Limites et nouvelles tentatives

- Réponse XML de Hatena : 8 MiB
- Corps d'erreur : 16 KiB
- Corps d'un article : 4 MiB
- Image décodée : 10 MiB
- Catégories : 100 entrées, 256 caractères chacune
- Délai d'attente du service amont : 30 secondes par tentative
- Nouvelle tentative automatique : uniquement pour les méthodes idempotentes telles que GET, PUT et DELETE ; jamais pour POST
- L'annulation d'une requête MCP se propage aux requêtes vers le service amont et aux attentes avant nouvelle tentative. Les écritures déjà envoyées ne peuvent pas être annulées.
- Les dépassements de délai du corps de la réponse et les échecs de connexion sont signalés comme des erreurs réseau, séparément des corps trop volumineux et des erreurs d'analyse XML.

## Développement et vérification

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` exécute Biome, TypeScript, Vitest avec couverture, une connexion stdio contre la CLI compilée, ainsi que des contrôles E2E des limites d'image, de l'annulation, des mises à jour partielles et des échecs sur le corps de la réponse. Après la compilation, exécutez `node scripts/smoke-behavior.mjs --report <output.json>` pour enregistrer les résultats. Consultez [DESIGN.md](./DESIGN.md) pour l'architecture et les invariants.

## Sécurité

- Supprimez les valeurs d'environnement avant de partager la configuration d'un client MCP ou un wrapper.
- Les journaux excluent Authorization, les clés d'API, les corps de réponse du service amont et les messages d'exception arbitraires.
- Si une clé fuite, renouvelez-la depuis les paramètres AtomPub de Hatena Blog.
- Il s'agit d'un processus stdio local, mais une protection au niveau du système d'exploitation reste nécessaire contre les autres processus exécutés sous le même utilisateur et contre la divulgation des fichiers de configuration du client.

## Licence

MIT © Keisuke Nishitani
