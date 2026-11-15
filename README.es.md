# hatena-blog-mcp

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | **Español** | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> Este repositorio es un fork no oficial, mantenido de forma independiente, de [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp). Los cambios propios de este fork incluyen la compatibilidad con Hatena Fotolife, la detección de conflictos de actualización, límites de tamaño defensivos y un entorno de ejecución stdio local. Informa de los problemas relacionados con estos cambios en [este fork](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues). Consulta [CHANGELOG.md](./CHANGELOG.md) para más detalles.

Un servidor MCP (Model Context Protocol) local para leer y escribir mediante la [API AtomPub de Hatena Blog](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) y la [API Atom de Hatena Fotolife](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/). Se comunica por stdio sobre Node.js y no requiere un endpoint MCP alojado externamente ni un relé.

## Características

- 13 herramientas para entradas, páginas, categorías e imágenes de Fotolife
- Actualizaciones parciales seguras en `update_entry` y `update_page`, con detección de conflictos mediante `expected_edited`
- Selección automática de la imagen destacada (eyecatch) mediante un bloque opcional con la primera imagen del cuerpo
- Sin reintentos automáticos para POST, lo que evita publicaciones y subidas de imágenes duplicadas
- Límites defensivos para XML, contenido, categorías, imágenes y cuerpos de error
- Las credenciales proceden de variables de entorno del proceso local, nunca de argumentos de línea de comandos

## Inicio rápido

### Requisitos

- Node.js 22 o posterior
- Tu ID de Hatena
- La clave de API que aparece en Hatena Blog → Configuración → Avanzado → AtomPub

Registra el servidor en cualquier cliente MCP compatible con stdio:

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

Si un cliente de Windows no encuentra `npx`, usa `npx.cmd`. Siempre que sea posible, utiliza el almacén de secretos del cliente o del sistema operativo en lugar de guardar las credenciales directamente en un archivo de configuración compartido.

### Actualizaciones

La especificación `@latest` se resuelve con la dist-tag `latest` de npm cuando se inicia el proceso MCP. El MCP no se reescribe a sí mismo ni contacta con ningún servicio de actualización propio mientras se ejecuta. Para instalaciones reproducibles, sustituye `latest` por la versión exacta que quieras usar.

Si ya registraste el servidor con una versión fijada (por ejemplo, `@kagayoi/hatena-blog-mcp@1.0.6`), cambia el argumento del paquete en ese registro a `@kagayoi/hatena-blog-mcp@latest`. Actualizar este README no modifica los registros existentes, pero tras esa edición cada arranque usará automáticamente la última versión.

### Ejecutar desde el código fuente

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

Configura el comando del cliente como `node`, pasa la ruta absoluta a `dist/cli.js` y proporciona las mismas dos variables de entorno.

## Autenticación y flujo de datos

Al iniciarse, el proceso genera en memoria una cabecera Basic Authorization a partir de `HATENA_ID` y `HATENA_API_KEY` para AtomPub. Las solicitudes a Fotolife generan una cabecera WSSE nueva con las mismas credenciales. El servidor no almacena de forma persistente credenciales, publicaciones ni imágenes.

`blog_id` es el dominio del blog, por ejemplo `example.hatenablog.com` o `example.hateblo.jp`. En los blogs de grupo, el argumento opcional `hatena_id` de la herramienta reemplaza únicamente el ID de Hatena usado en la URL del servicio de origen.

## Referencia de herramientas

### Entradas

| Herramienta | Propósito | Obligatorios | Opciones principales |
| --- | --- | --- | --- |
| `list_entries` | Lista entradas, 7 por página | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | Obtiene una entrada | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | Crea una entrada | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | Actualiza parcialmente una entrada | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | Elimina una entrada | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` obtiene la entrada actual y fusiona únicamente los campos indicados de forma explícita. Conserva el título, el cuerpo, el tipo de contenido, el estado de publicación, las categorías, la marca de tiempo y el slug que se hayan omitido. Pasa `categories: []` para vaciar las categorías. Si `expected_edited` no coincide con el valor actual, la herramienta se detiene antes del PUT y notifica un conflicto.

Una entrada nueva programada requiere `scheduled: true`, `draft: true` y una marca de tiempo de publicación en `updated`. Cuando Hatena omite `scheduled` en una respuesta GET, el campo también se omite del resultado y del XML de actualización, en lugar de sintetizarse como `false`. Las marcas de tiempo de publicación existentes solo cambian con `touch_updated: true`.

#### Eyecatch automático a partir de la primera imagen del cuerpo

Cuando se proporciona `eyecatch_image_url` a `create_entry` o `update_entry`, el MCP inserta al inicio del cuerpo un bloque de imagen HTML identificable. Hatena Blog puede entonces seleccionar automáticamente la primera imagen del cuerpo. Esto no establece directamente el campo oficial de eyecatch de Hatena, y la imagen sigue siendo visible en el cuerpo del artículo.

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "Una entrada con eyecatch automático",
    "content": "### Cuerpo\n\nAquí comienza el artículo.",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- Puedes pasar directamente el `image_url` devuelto por `upload_image`.
- Si omites la opción, el cuerpo no se modifica.
- Si la vuelves a proporcionar, se reemplaza el bloque insertado previamente por este MCP.
- Si se omite `content` durante una actualización, el bloque se aplica al cuerpo existente.

### Páginas

| Herramienta | Propósito | Obligatorios | Opciones principales |
| --- | --- | --- | --- |
| `list_pages` | Lista páginas, 10 por página | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | Obtiene una página | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | Crea una página | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | Actualiza parcialmente una página | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | Elimina una página | `blog_id`, `page_id` | `hatena_id` |

### Categorías e imágenes

| Herramienta | Propósito | Obligatorios | Opciones principales |
| --- | --- | --- | --- |
| `list_categories` | Lista las categorías y su estado de fijación | `blog_id` | `hatena_id` |
| `get_image` | Obtiene los metadatos de una imagen de Fotolife | `image_id` | — |
| `upload_image` | Sube una imagen y devuelve su URL y su sintaxis para el blog | `title`, `content_type`, `data_base64` | `folder` (por defecto: `Hatena Blog`) |

El feed oficial de Fotolife no lista la carpeta privada «Hatena Blog» que se llena desde el editor del blog, por lo que este servidor no ofrece una herramienta para listar imágenes.

## Límites y reintentos

- Respuesta XML de Hatena: 8 MiB
- Cuerpo de error: 16 KiB
- Cuerpo de una entrada: 4 MiB
- Imagen decodificada: 10 MiB
- Categorías: 100 elementos, de 256 caracteres cada uno
- Tiempo de espera del servicio de origen: 30 segundos por intento
- Reintento automático: solo métodos idempotentes como GET, PUT y DELETE; nunca POST
- La cancelación de una solicitud MCP se propaga a las solicitudes al servicio de origen y a las esperas de reintento. Las escrituras ya enviadas no pueden revertirse.
- Los tiempos de espera agotados del cuerpo de la respuesta y los fallos de conexión se notifican como errores de red, por separado de los cuerpos demasiado grandes y de los errores de análisis de XML.

## Desarrollo y verificación

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` ejecuta Biome, TypeScript, Vitest con cobertura, una conexión stdio contra la CLI compilada y comprobaciones E2E de límites de imagen, cancelación, actualizaciones parciales y fallos en el cuerpo de la respuesta. Tras compilar, ejecuta `node scripts/smoke-behavior.mjs --report <output.json>` para guardar los resultados. Consulta [DESIGN.md](./DESIGN.md) para la arquitectura y los invariantes.

## Seguridad

- Elimina los valores de entorno antes de compartir la configuración de un cliente MCP o un wrapper.
- Los registros excluyen Authorization, las claves de API, los cuerpos de respuesta del servicio de origen y los mensajes de excepción arbitrarios.
- Si se filtra una clave, rótala desde la configuración AtomPub de Hatena Blog.
- Se trata de un proceso stdio local, pero sigue siendo necesaria la protección del sistema operativo frente a otros procesos que se ejecuten con el mismo usuario y frente a la divulgación de los archivos de configuración del cliente.

## Licencia

MIT © Keisuke Nishitani
