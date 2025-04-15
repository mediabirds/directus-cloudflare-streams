import type { EventContext } from '@directus/types'
import { defineHook } from '@directus/extensions-sdk';
import * as tus from 'tus-js-client'

export default defineHook(({ action, filter }, context) => {
    const { services, getSchema, logger } = context;
    const { AssetsService, FilesService } = services;

    if (!process.env.CLOUDFLARE_STREAMS_TOKEN || !process.env.CLOUDFLARE_STREAMS_ACCOUNT_ID) {
        logger.error('Cloudflare Streams token or account ID is not set. Skipping Cloudflare Streams integration.')
        return;
    }

    const uploader = async (key: string, req: EventContext) => {
        const assetsService = new AssetsService({
            schema: await getSchema(),
            accountability: req.accountability
        });
        const filesService = new FilesService({
            schema: await getSchema(),
            accountability: req.accountability
        });
    
        const asset = await assetsService.getAsset(key);

        if (asset.file.type.startsWith('video/') === false) {
            return
        }

        logger.info(`Uploading video to Cloudflare Streams: ${asset.file.filename_disk}`);

        return new tus.Upload(asset.stream, {
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
                logger.info(`${key} ${percentage}%`)
            },
            onSuccess: async (tusPayload) => {
                const mediaIdHeader = tusPayload.lastResponse.getHeader("stream-media-id");

                if (mediaIdHeader) {
                    filesService.updateOne(key, { metadata: { cloudflare_streams_media_id: mediaIdHeader } })
                    logger.info(`Successfully uploaded video to Cloudflare Streams: ${asset.file.filename_disk} -> ${mediaIdHeader}`);
                }
            },
        });
    }

	action('files.upload', async (payload, req) => {
        const upload = await uploader(payload.key, req);

        if (upload) {
            logger.info(`Starting upload for file ${payload.key}`);
            upload.start();
        } else {
            logger.info(`No upload needed for file ${payload.key}`);
        }
	});

    filter('files.delete', async (keys: any, req) => {
        const assetsService = new AssetsService({
            schema: await getSchema(),
            accountability: req.accountability
        });

        for await(const key of keys) {
            const { file } = await assetsService.getAsset(key);

            if (!file.metadata?.cloudflare_streams_media_id) {
                logger.info(`No Cloudflare Streams media ID found for asset ${key}. Skipping deletion.`);
                continue;
            }

            const request = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_STREAMS_ACCOUNT_ID}/stream/${file.metadata.cloudflare_streams_media_id}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${process.env.CLOUDFLARE_STREAMS_TOKEN}`,
                }
            })

            if (request.ok) {
                logger.info(`Successfully deleted file from Cloudflare Streams: ${file.metadata.cloudflare_streams_media_id}`);
            } else {
                const response = await request.json()

                for (const error of response.errors) {
                    logger.error(`Could not delete file from cloudflare streams: ${error.message}`);
                }
            }
        }
    })

    action('files.update', async ({ keys }, req) => {
        const assetsService = new AssetsService({
            schema: await getSchema(),
            accountability: req.accountability
        });

        for await(const key of keys) {
            const { file } = await assetsService.getAsset(key);

            if (!file.metadata?.cloudflare_streams_media_id) {
                const upload = await uploader(key, req);

                if (upload) {
                    logger.info(`Starting upload for file ${key}`);
                    upload.start();
                } else {
                    logger.info(`No upload needed for file ${key}`);
                }
            }
        }
    })
});
