# Directus cloudflare streams

Uploads video files to [https://www.cloudflare.com/developer-platform/products/cloudflare-stream/](Cloudflare streams) 
and attaches the `cloudflare_streams_media_id` as metadata on the file.

```json
{
    // ... directus_files
    metadata: {
        cloudflare_streams_media_id: 'string'
    }
}
```

This directus extension listens on two hooks `files.upload` and `files.delete`. On `files.upload` it checks if the file is a video, and if thats the case, moves that file over to cloudflare streams.

On delete it removes it from Cloudflare streams.

## Installation

To install run

```bash
pnpm install @mediabirds/directus-cloudflare-streams
```

Add these two environment variables to your directus Installation

```env
CLOUDFLARE_STREAMS_ACCOUNT_ID=
CLOUDFLARE_STREAMS_TOKEN=
```