# Target Cloudflare Workers and D1

Never Four targets Cloudflare Workers with D1 as the first deployment platform. The product is a small public page plus authenticated POST writes, so a single edge worker avoids server operations; supporting Node and local SQLite as equal runtimes would add adapters and tests before there is a need.
