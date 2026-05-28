const fs = require('fs');

function patchFile(file, patcher) {
  const src = fs.readFileSync(file, 'utf8');
  const next = patcher(src);
  fs.writeFileSync(file, next);
}

function replaceOnce(src, before, after, label) {
  if (src.includes(after)) return src;
  if (!src.includes(before)) {
    console.error(`Could not find Spooty ${label} to patch`);
    process.exit(1);
  }
  return src.replace(before, after);
}

patchFile('backend/shared/youtube.service.js', (src) => {
  const constructorBefore = 'new ytdlp_nodejs_1.YtDlp()';
  const constructorAfter =
    'new ytdlp_nodejs_1.YtDlp({ binaryPath: process.env.YTDLP_BINARY_PATH || ' +
    JSON.stringify(process.env.YTDLP_PATH) +
    ' })';
  src = replaceOnce(src, constructorBefore, constructorAfter, 'YtDlp constructor');

  const cookiesBefore = '...this.getCookiesOptions(),';
  const cookiesAfter =
    '...(process.env.YT_COOKIES_FILE && fs.existsSync(process.env.YT_COOKIES_FILE) ? { cookies: process.env.YT_COOKIES_FILE } : this.getCookiesOptions()),';
  src = replaceOnce(src, cookiesBefore, cookiesAfter, 'cookie options');

  const audioQualityBefore = "audioQuality: this.configService.get('QUALITY'),";
  const audioQualityAfter =
    "audioQuality: this.configService.get('QUALITY'),\n                format: process.env.YTDLP_FORMAT || 'bestaudio/best',\n                verbose: process.env.YTDLP_VERBOSE === '1',";
  return replaceOnce(src, audioQualityBefore, audioQualityAfter, 'audio options');
});

patchFile('backend/track/track.service.js', (src) => {
  const queueBefore = `const savedTrack = await this.repository.save({ ...track, playlist });
        await this.trackSearchQueue.add('', savedTrack, {
            jobId: \`id-\${savedTrack.id}\`,
        });`;
  const queueAfter = `const savedTrack = await this.repository.save({ ...track, playlist });
        const downloadQueue = savedTrack.youtubeUrl ? this.trackDownloadQueue : this.trackSearchQueue;
        await downloadQueue.add('', savedTrack, {
            jobId: \`id-\${savedTrack.id}\`,
        });`;
  return replaceOnce(src, queueBefore, queueAfter, 'direct YouTube download queue');
});

patchFile('backend/playlist/playlist.service.js', (src) => {
  const branchBefore = `async create(playlist) {
        // Detect if URL is for a single track or a playlist and route accordingly
        const isTrack = this.spotifyService.isTrackUrl(playlist.spotifyUrl);`;
  const branchAfter = `async create(playlist) {
        // Detect if URL is for a single track or a playlist and route accordingly
        if (/^(https?:\\/\\/)?(www\\.|m\\.)?(youtube\\.com|music\\.youtube\\.com|youtu\\.be)\\//i.test(playlist.spotifyUrl || '')) {
            await this.createYoutubeTrack(playlist);
            return;
        }
        const isTrack = this.spotifyService.isTrackUrl(playlist.spotifyUrl);`;
  src = replaceOnce(src, branchBefore, branchAfter, 'direct YouTube playlist branch');

  const methodBefore = `    async createPlaylist(playlist) {`;
  const methodAfter = `    async createYoutubeTrack(playlist) {
        const title = playlist.name || 'YouTube audio';
        const playlist2Save = {
            ...playlist,
            name: title,
            coverUrl: null,
            isTrack: true,
            active: false,
        };
        const savedPlaylist = await this.save(playlist2Save);
        await this.trackService.create({
            artist: 'YouTube',
            name: title,
            spotifyUrl: playlist.spotifyUrl,
            youtubeUrl: playlist.spotifyUrl,
        }, savedPlaylist);
    }

    async createPlaylist(playlist) {`;
  return replaceOnce(src, methodBefore, methodAfter, 'direct YouTube track creator');
});
