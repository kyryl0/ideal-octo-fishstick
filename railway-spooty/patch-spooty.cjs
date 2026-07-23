const fs = require('fs');

function patchFile(file, patcher) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
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

patchFile('src/backend/src/playlist/dto/create-playlist.dto.ts', (src) => {
  const importBefore = `import { IsString, IsUrl, MaxLength } from 'class-validator';`;
  const importAfter = `import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';`;
  src = replaceOnce(src, importBefore, importAfter, 'playlist DTO validator imports');

  const fieldBefore = `  spotifyUrl: string;
}`;
  const fieldAfter = `  spotifyUrl: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}`;
  return replaceOnce(src, fieldBefore, fieldAfter, 'playlist DTO active field');
});

patchFile('src/backend/src/shared/youtube.service.ts', (src) => {
  const headersBefore = `const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};`;
  const headersAfter = `const HEADERS = {
  'User-Agent':
    process.env.YTDLP_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env[name] || '').toLowerCase(),
  );
}`;
  src = replaceOnce(src, headersBefore, headersAfter, 'yt-dlp configurable user agent');

  const searchExtractorBefore = `      '--extractor-args',
      'youtube:player_client=android_vr',
      '--add-header',`;
  const searchExtractorAfter = `      '--extractor-args',
      process.env.YTDLP_SEARCH_EXTRACTOR_ARGS ||
        process.env.YTDLP_EXTRACTOR_ARGS ||
        'youtube:player_client=android_vr',
      '--add-header',`;
  src = replaceOnce(src, searchExtractorBefore, searchExtractorAfter, 'yt-dlp search extractor args');

  const searchFlagsBefore = `      searchTarget,
    ];

    const output = await this.runYtDlpForOutput(args);`;
  const searchFlagsAfter = `      searchTarget,
    ];

    if (envFlag('YTDLP_FORCE_IPV4')) {
      args.push('--force-ipv4');
    }

    if (envFlag('YTDLP_VERBOSE')) {
      args.unshift('--verbose');
    }

    const output = await this.runYtDlpForOutput(args);`;
  src = replaceOnce(src, searchFlagsBefore, searchFlagsAfter, 'yt-dlp search flags');

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
  src = replaceOnce(src, cookiesBefore, cookiesAfter, 'cookies logging');

  const downloadFlagsBefore = `    const args = [
      '--no-playlist',
      '--no-cache-dir',
      '--no-cookies-from-browser',
      '-f',
      'bestaudio/best',
      '--extract-audio',
      '--audio-format',
      format,
      '--audio-quality',
      quality,
      '--add-header',
      \`User-Agent:\${HEADERS['User-Agent']}\`,
      '-o',
      output,
    ];

    if (cookiesFile) {`;
  const downloadFlagsAfter = `    const args = [
      '--no-playlist',
      '--no-cache-dir',
      '--no-cookies-from-browser',
      '-f',
      'bestaudio/best',
      '--extract-audio',
      '--audio-format',
      format,
      '--audio-quality',
      quality,
      '--add-header',
      \`User-Agent:\${HEADERS['User-Agent']}\`,
      '-o',
      output,
    ];

    const downloadExtractorArgs =
      process.env.YTDLP_DOWNLOAD_EXTRACTOR_ARGS ||
      process.env.YTDLP_EXTRACTOR_ARGS;

    if (downloadExtractorArgs) {
      args.push('--extractor-args', downloadExtractorArgs);
    }

    if (envFlag('YTDLP_FORCE_IPV4')) {
      args.push('--force-ipv4');
    }

    if (envFlag('YTDLP_VERBOSE')) {
      args.unshift('--verbose');
    }

    if (cookiesFile) {`;
  return replaceOnce(src, downloadFlagsBefore, downloadFlagsAfter, 'yt-dlp download flags');
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
