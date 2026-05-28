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

patchFile('src/backend/src/shared/youtube.service.ts', (src) => {
  const cookiesBefore = `    if (cookiesFile && fs.existsSync(cookiesFile)) {
      this.logger.debug(\`Using cookies file: \${cookiesFile}\`);
      return cookiesFile;
    }

    return null;`;
  const cookiesAfter = `    if (cookiesFile && fs.existsSync(cookiesFile) && fs.statSync(cookiesFile).size > 0) {
      this.logger.debug(\`Using cookies file: \${cookiesFile}\`);
      return cookiesFile;
    }

    if (cookiesFile) {
      this.logger.warn(\`YouTube cookies file not found or empty at \${cookiesFile}\`);
    }

    return null;`;
  return replaceOnce(src, cookiesBefore, cookiesAfter, 'cookies logging');
});

patchFile('src/backend/src/track/track.service.ts', (src) => {
  const queueBefore = `    const savedTrack = await this.repository.save({ ...track, playlist });
    await this.enqueueSearch(savedTrack.id);
    this.io.emit(WsTrackOperation.New, {`;
  const queueAfter = `    const savedTrack = await this.repository.save({ ...track, playlist });
    if (savedTrack.youtubeUrl) {
      await this.enqueueDownload(savedTrack.id);
    } else {
      await this.enqueueSearch(savedTrack.id);
    }
    this.io.emit(WsTrackOperation.New, {`;
  return replaceOnce(src, queueBefore, queueAfter, 'direct YouTube download queue');
});

patchFile('src/backend/src/playlist/playlist.service.ts', (src) => {
  const branchBefore = `  async create(playlist: PlaylistEntity): Promise<void> {
    // Detect if URL is for a single track or a playlist and route accordingly
    const isTrack = this.spotifyService.isTrackUrl(playlist.spotifyUrl);`;
  const branchAfter = `  async create(playlist: PlaylistEntity): Promise<void> {
    // Detect if URL is for a single track or a playlist and route accordingly
    if (/^(https?:\\/\\/)?(www\\.|m\\.)?(youtube\\.com|music\\.youtube\\.com|youtu\\.be)\\//i.test(playlist.spotifyUrl || '')) {
      await this.createYoutubeTrack(playlist);
      return;
    }

    const isTrack = this.spotifyService.isTrackUrl(playlist.spotifyUrl);`;
  src = replaceOnce(src, branchBefore, branchAfter, 'direct YouTube playlist branch');

  const methodBefore = `  private async createPlaylist(playlist: PlaylistEntity): Promise<void> {`;
  const methodAfter = `  private async createYoutubeTrack(playlist: PlaylistEntity): Promise<void> {
    const title = playlist.name || 'YouTube audio';
    const playlist2Save = {
      ...playlist,
      name: title,
      coverUrl: null,
      isTrack: true,
      active: false,
    };
    const savedPlaylist = await this.save(playlist2Save);
    await this.trackService.create(
      {
        artist: 'YouTube',
        name: title,
        spotifyUrl: playlist.spotifyUrl,
        youtubeUrl: playlist.spotifyUrl,
      },
      savedPlaylist,
    );
  }

  private async createPlaylist(playlist: PlaylistEntity): Promise<void> {`;
  return replaceOnce(src, methodBefore, methodAfter, 'direct YouTube track creator');
});
