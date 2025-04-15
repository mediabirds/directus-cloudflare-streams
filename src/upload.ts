import * as tus from 'tus-js-client'
import { HookExtensionContext } from '@directus/extensions'

export const upload = (ctx: HookExtensionContext) => {
    new tus.Upload(asset.stream, {
        chunkSize: 50 * 1024 * 1024,
        endpoint: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_STREAMS_ACCOUNT_ID}/stream`,
        headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_STREAMS_TOKEN}`,
        },
        metadata: {
            name: asset.file.filename_disk,
            filetype: asset.file.type,
        },
        uploadSize: asset.stat.size,
        onError: function (error) {
            throw error;
        },
        onProgress: function (bytesUploaded, bytesTotal) {
            const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
            logger.info(`${payload.key} ${percentage}%`)
        },
        onSuccess: async (tusPayload) => {
            const mediaIdHeader = tusPayload.lastResponse.getHeader("stream-media-id");

            if (mediaIdHeader) {
                filesService.updateOne(payload.key, { metadata: { cloudflare_streams_media_id: mediaIdHeader } })
                logger.info(`Successfully uploaded video to Cloudflare Streams: ${asset.file.filename_disk} -> ${mediaIdHeader}`);
            }
        },
    });
}