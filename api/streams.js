const { Innertube } = require('youtubei.js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id } = req.query;

    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const yt = await Innertube.create({
            generate_session_locally: true,
            retrieve_player: true,
        });

        const info = await yt.getBasicInfo(id);
        const basic = info.basic_info;
        const streaming = info.streaming_data;

        if (!streaming) {
            return res.status(404).json({
                error: 'Video not available. It may be private or region-restricted.'
            });
        }

        const videoStreams = [];
        const audioStreams = [];
        const seenVideo = new Set();

        const allFormats = [
            ...(streaming.formats || []),
            ...(streaming.adaptive_formats || [])
        ];

        for (const f of allFormats) {
            let url = null;
            try {
                if (f.decipher && yt.session.player) {
                    url = f.decipher(yt.session.player);
                } else {
                    url = f.url;
                }
            } catch (e) {
                url = f.url;
            }
            if (!url) continue;

            const mime = f.mime_type || '';
            const quality = f.quality_label || f.quality || '';
            const size = parseInt(f.content_length) || 0;
            const fps = f.fps || null;

            let ext = 'mp4';
            if (mime.includes('webm')) ext = 'webm';
            else if (mime.includes('audio/mp4') || mime.includes('m4a')) ext = 'm4a';

            const hasAudio = !!(
                f.audio_channels ||
                (f.audio_quality && f.audio_quality !== 'AUDIO_QUALITY_NONE')
            );

            if (mime.startsWith('video/')) {
                const key = quality + '-' + ext;
                if (!seenVideo.has(key)) {
                    seenVideo.add(key);
                    videoStreams.push({ url, quality, ext, hasAudio, size, fps });
                }
            } else if (mime.startsWith('audio/')) {
                const kbps = f.average_bitrate
                    ? Math.round(f.average_bitrate / 1000) + 'kbps'
                    : (f.bitrate ? Math.round(f.bitrate / 1000) + 'kbps' : '128kbps');
                audioStreams.push({
                    url,
                    quality: kbps,
                    ext: mime.includes('mp4') ? 'm4a' : 'webm',
                    size
                });
            }
        }

        videoStreams.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
        audioStreams.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

        return res.json({
            title: basic.title || 'Video',
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration: basic.duration || 0,
            videoStreams,
            audioStreams
        });

    } catch (e) {
        console.error('DFASTER error:', e);
        return res.status(500).json({ error: e.message || 'Failed to load video' });
    }
};
