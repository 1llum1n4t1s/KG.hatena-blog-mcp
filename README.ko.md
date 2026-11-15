# hatena-blog-mcp

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | **한국어** | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> 이 저장소는 [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp)의 비공식 독립 유지보수 포크입니다. 이 포크만의 변경 사항으로는 Hatena Fotolife 지원, 업데이트 충돌 감지, 방어적 크기 제한, 로컬 stdio 런타임이 있습니다. 이러한 변경과 관련된 문제는 [이 포크](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues)에 보고해 주세요. 자세한 내용은 [CHANGELOG.md](./CHANGELOG.md)를 참고하세요.

[Hatena Blog AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom)와 [Hatena Fotolife Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/)를 읽고 쓰기 위한 로컬 MCP(Model Context Protocol) 서버입니다. Node.js에서 stdio로 통신하며, 외부에 호스팅된 MCP 엔드포인트나 릴레이가 필요하지 않습니다.

## 기능

- 글, 페이지, 카테고리, Fotolife 이미지를 다루는 13개의 도구
- `update_entry`와 `update_page`의 안전한 부분 업데이트, 그리고 `expected_edited`를 통한 충돌 감지
- 선택적인 본문 첫 이미지 블록을 통한 아이캐치(eyecatch) 자동 선택
- POST는 자동으로 재시도하지 않아 글 중복 게시와 이미지 중복 업로드를 방지
- XML, 콘텐츠, 카테고리, 이미지, 오류 응답 본문에 대한 방어적 제한
- 자격 증명은 로컬 프로세스의 환경 변수에서만 가져오며, 명령줄 인수로는 전달하지 않음

## 빠른 시작

### 요구 사항

- Node.js 22 이상
- 본인의 Hatena ID
- Hatena Blog → 설정 → 고급 설정 → AtomPub에 표시되는 API 키

stdio를 지원하는 MCP 클라이언트에 서버를 등록합니다.

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

Windows 클라이언트가 `npx`를 찾지 못하면 `npx.cmd`를 사용하세요. 클라이언트나 운영 체제의 비밀 저장소를 사용할 수 있다면, 공유되는 설정 파일에 자격 증명을 직접 두는 대신 그쪽을 우선 사용하는 것이 좋습니다.

### 업데이트

`@latest` 지정은 MCP 프로세스가 시작될 때 npm의 `latest` dist-tag로 해석됩니다. MCP는 실행 중에 스스로를 갱신하지 않으며, 별도의 업데이트 서비스에 접속하지도 않습니다. 재현 가능한 설치가 필요하다면 `latest`를 사용하려는 정확한 릴리스 버전으로 바꾸세요.

이미 고정 버전(예: `@kagayoi/hatena-blog-mcp@1.0.6`)으로 서버를 등록했다면, 해당 등록의 패키지 인수를 `@kagayoi/hatena-blog-mcp@latest`로 변경하세요. 이 README를 갱신해도 기존 등록은 바뀌지 않지만, 위와 같이 수정하면 이후 실행할 때마다 자동으로 최신 릴리스가 사용됩니다.

### 소스에서 실행

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

클라이언트 명령을 `node`로 설정하고 `dist/cli.js`의 절대 경로를 전달한 뒤, 동일한 두 환경 변수를 제공하세요.

## 인증과 데이터 흐름

시작 시 프로세스는 `HATENA_ID`와 `HATENA_API_KEY`로부터 AtomPub용 Basic Authorization 헤더를 메모리 안에서 생성합니다. Fotolife 요청은 같은 자격 증명으로 요청마다 새 WSSE 헤더를 생성합니다. 서버는 자격 증명, 글, 이미지를 영구적으로 저장하지 않습니다.

`blog_id`는 블로그 도메인입니다(예: `example.hatenablog.com`, `example.hateblo.jp`). 그룹 블로그에서는 선택적 도구 인수인 `hatena_id`가 업스트림 URL에 사용되는 Hatena ID만 덮어씁니다.

## 도구 레퍼런스

### 글

| 도구 | 용도 | 필수 | 주요 옵션 |
| --- | --- | --- | --- |
| `list_entries` | 글 목록 조회(페이지당 7개) | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | 글 하나 조회 | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | 글 작성 | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | 글 부분 업데이트 | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | 글 삭제 | `blog_id`, `entry_id` | `hatena_id` |

`update_entry`는 현재 글을 가져온 뒤 명시적으로 지정된 필드만 병합합니다. 생략된 제목, 본문, 콘텐츠 유형, 공개 상태, 카테고리, 타임스탬프, 슬러그는 그대로 유지됩니다. 카테고리를 비우려면 `categories: []`를 전달하세요. `expected_edited`가 현재 값과 일치하지 않으면, 도구는 PUT을 보내기 전에 중단하고 충돌을 보고합니다.

예약 게시되는 새 글에는 `scheduled: true`, `draft: true`, 그리고 `updated` 게시 타임스탬프가 필요합니다. Hatena가 GET 응답에서 `scheduled`를 생략하면, 결과와 업데이트 XML에서도 이 필드를 `false`로 합성하지 않고 생략합니다. 기존 게시 타임스탬프는 `touch_updated: true`를 지정한 경우에만 변경됩니다.

#### 본문 첫 이미지로 아이캐치 자동 설정

`create_entry` 또는 `update_entry`에 `eyecatch_image_url`을 전달하면, MCP가 본문 맨 앞에 식별 가능한 HTML 이미지 블록을 삽입합니다. 그러면 Hatena Blog가 본문 첫 이미지를 자동으로 아이캐치로 선택할 수 있습니다. 이는 Hatena의 공식 아이캐치 필드를 직접 설정하는 것이 아니며, 이미지는 글 본문에도 그대로 표시됩니다.

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "아이캐치가 자동으로 설정되는 글",
    "content": "### 본문\n\n여기서부터 글이 시작됩니다.",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- `upload_image`가 반환한 `image_url`을 그대로 전달할 수 있습니다.
- 이 옵션을 생략하면 본문은 변경되지 않습니다.
- 다시 지정하면 이 MCP가 이전에 삽입한 블록이 교체됩니다.
- 업데이트할 때 `content`를 생략하면 기존 본문에 블록이 적용됩니다.

### 페이지

| 도구 | 용도 | 필수 | 주요 옵션 |
| --- | --- | --- | --- |
| `list_pages` | 페이지 목록 조회(페이지당 10개) | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | 페이지 하나 조회 | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | 페이지 작성 | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | 페이지 부분 업데이트 | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | 페이지 삭제 | `blog_id`, `page_id` | `hatena_id` |

### 카테고리와 이미지

| 도구 | 용도 | 필수 | 주요 옵션 |
| --- | --- | --- | --- |
| `list_categories` | 카테고리와 고정 상태 목록 조회 | `blog_id` | `hatena_id` |
| `get_image` | Fotolife 이미지 메타데이터 조회 | `image_id` | — |
| `upload_image` | 이미지를 업로드하고 URL과 블로그 문법을 반환 | `title`, `content_type`, `data_base64` | `folder`(기본값: `Hatena Blog`) |

공식 Fotolife 피드는 블로그 에디터를 통해 채워지는 비공개 "Hatena Blog" 폴더를 나열하지 않으므로, 이 서버는 이미지 목록 도구를 제공하지 않습니다.

## 제한과 재시도

- Hatena XML 응답: 8 MiB
- 오류 본문: 16 KiB
- 글 본문: 4 MiB
- 디코딩된 이미지: 10 MiB
- 카테고리: 최대 100개, 각 256자
- 업스트림 타임아웃: 시도당 30초
- 자동 재시도: GET, PUT, DELETE 같은 멱등 메서드만 해당하며 POST는 절대 재시도하지 않음
- MCP 요청 취소는 업스트림 요청과 재시도 대기에도 전파됩니다. 이미 전송된 쓰기는 롤백할 수 없습니다.
- 응답 본문 타임아웃과 연결 실패는 네트워크 오류로 보고되며, 본문 크기 초과 및 XML 파싱 오류와는 구분됩니다.

## 개발과 검증

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify`는 Biome, TypeScript, 커버리지가 활성화된 Vitest, 빌드된 CLI에 대한 stdio 연결 테스트, 그리고 이미지 제한, 취소, 부분 업데이트, 응답 본문 실패에 대한 E2E 검사를 실행합니다. 빌드 후 `node scripts/smoke-behavior.mjs --report <output.json>`을 실행하면 결과를 저장할 수 있습니다. 아키텍처와 불변 조건은 [DESIGN.md](./DESIGN.md)를 참고하세요.

## 보안

- MCP 클라이언트 설정이나 래퍼를 공유하기 전에 환경 변수 값을 제거하세요.
- 로그에는 Authorization, API 키, 업스트림 응답 본문, 임의의 예외 메시지가 포함되지 않습니다.
- 키가 유출되었다면 Hatena Blog의 AtomPub 설정에서 키를 교체하세요.
- 이 서버는 로컬 stdio 프로세스이지만, 같은 사용자 권한으로 실행되는 다른 프로세스와 클라이언트 설정 파일의 노출에 대해서는 여전히 운영 체제 차원의 보호가 필요합니다.

## 라이선스

MIT © Keisuke Nishitani
