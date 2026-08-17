const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

function patchFile(file, patcher) {
  const fullPath = path.resolve(file);
  const before = read(fullPath);
  const after = patcher(before, fullPath);
  if (after === before) {
    console.log(`unchanged ${file}`);
    return;
  }
  write(fullPath, after);
  console.log(`patched ${file}`);
}

function replaceOnce(content, search, replacement, file) {
  if (!content.includes(search)) {
    throw new Error(`Could not find expected block in ${file}`);
  }
  return content.replace(search, replacement);
}

patchFile("src/backend/src/playlist/entities/playlist.entity.ts", (content, file) => {
  if (content.includes("isPendingCreation")) return content;
  return replaceOnce(
    content,
    `  @Column({ default: true })
  active: boolean;
}`,
    `  @Column({ default: true })
  active: boolean;

  @Column({ default: true })
  allowUpdatingPlaylistById: boolean;

  @Column({ default: true })
  isPendingCreation: boolean;
}`,
    file,
  );
});

patchFile("src/backend/src/playlist/dto/create-playlist.dto.ts", (content, file) => {
  let next = content;
  next = next.replace(
    `import { IsUrl } from 'class-validator';`,
    `import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';`,
  );
  if (next.includes("active?: boolean")) return next;
  const fieldBefore = `  @IsUrl()
  spotifyUrl: string;
}`;
  const fieldAfter = `  @IsUrl()
  spotifyUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}`;
  return replaceOnce(next, fieldBefore, fieldAfter, file);
});

patchFile("src/backend/src/playlist/playlist.service.ts", (content, file) => {
  let next = content;

  if (!next.includes("const envLimit = Number(process.env.SPOTIFY_SEARCH_LIMIT")) {
    next = replaceOnce(
      next,
      `    const searchResult = await this.spotify.search(
      \`album:\${album} artist:\${artist} track:\${name}\`,
      ['track'],
      'US',
      1,
    );`,
      `    const envLimit = Number(process.env.SPOTIFY_SEARCH_LIMIT || '10');
    const searchLimit = Number.isFinite(envLimit) ? Math.min(Math.max(Math.floor(envLimit), 1), 50) : 10;
    const searchResult = await this.spotify.search(
      \`album:\${album} artist:\${artist} track:\${name}\`,
      ['track'],
      'US',
      searchLimit,
    );`,
      file,
    );
  }

  if (!next.includes("allowUpdatingPlaylistById: true")) {
    next = replaceOnce(
      next,
      `    const playlist = await this.playlistRepository.save({
      name: createPlaylistDto.name ?? spotifyTrack.name,
      spotifyUrl: createPlaylistDto.spotifyUrl,
    });`,
      `    const playlist = await this.playlistRepository.save({
      name: createPlaylistDto.name ?? spotifyTrack.name,
      spotifyUrl: createPlaylistDto.spotifyUrl,
      active: createPlaylistDto.active ?? true,
      allowUpdatingPlaylistById: true,
      isPendingCreation: true,
    });`,
      file,
    );
  }

  if (!next.includes("playlist.isPendingCreation = false")) {
    next = replaceOnce(
      next,
      `    playlist.youtubeId = videoId;
    playlist.thumbnail = thumbnail;

    return this.playlistRepository.save(playlist);`,
      `    playlist.youtubeId = videoId;
    playlist.thumbnail = thumbnail;
    playlist.isPendingCreation = false;

    return this.playlistRepository.save(playlist);`,
      file,
    );
  }

  return next;
});

patchFile("src/backend/src/playlist/playlist.controller.ts", (content, file) => {
  if (content.includes("UseGuards(AuthGuard('api-key'))")) return content;
  let next = content;
  next = replaceOnce(
    next,
    `import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';`,
    `import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';`,
    file,
  );
  next = replaceOnce(
    next,
    `import { PlaylistService } from './playlist.service';`,
    `import { PlaylistService } from './playlist.service';
import { AuthGuard } from '@nestjs/passport';`,
    file,
  );
  next = replaceOnce(
    next,
    `  @Post()
  async create(@Body() createPlaylistDto: CreatePlaylistDto) {`,
    `  @Post()
  @UseGuards(AuthGuard('api-key'))
  async create(@Body() createPlaylistDto: CreatePlaylistDto) {`,
    file,
  );
  return next;
});

patchFile("src/backend/src/youtube/youtube.module.ts", (content) => {
  if (content.includes("youtube-robust.service")) return content;
  return content.replace("./youtube.service", "./youtube-robust.service");
});

const robustYoutubeService = `import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { YoutubeService as BaseYoutubeService } from './youtube.service';

const execFileAsync = promisify(execFile);

type VideoCandidate = {
  id?: string;
  url?: string;
  title?: string;
  duration?: number;
  view_count?: number;
  webpage_url?: string;
};

@Injectable()
export class YoutubeService extends BaseYoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private readonly cookiesPath = process.env.YTDLP_COOKIES_FILE || '/config/youtube-cookies.txt';

  constructor(private readonly robustConfigService: ConfigService) {
    super(robustConfigService);
  }

  async searchYoutubeVideoId(name: string, artist: string): Promise<string> {
    const query = \`ytsearch10:\${name} \${artist} audio\`;
    const payload = await this.runYtDlpJson(query, ['--match-filter', '!is_live & duration < 900']);
    const entries = this.extractEntries(payload);
    const selected = entries[0];
    const id = selected?.id || this.idFromUrl(selected?.url) || this.idFromUrl(selected?.webpage_url);

    if (!id) {
      throw new Error(\`No YouTube video found for \"\${name} \${artist}\"\`);
    }

    this.logger.log(\`Selected YouTube video \${id} for \"\${name}\" by \"\${artist}\"\`);
    return id;
  }

  async downloadYoutubeVideo(videoId: string, trackId: string): Promise<string> {
    const pathTemplate = join(tmpdir(), \`\${trackId}.%(ext)s\`);
    const url = videoId.startsWith('http') ? videoId : \`https://www.youtube.com/watch?v=\${videoId}\`;

    const args = this.buildBaseArgs([
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--no-playlist',
      '--output',
      pathTemplate,
      url,
    ]);

    const { stdout, stderr } = await execFileAsync('yt-dlp', args, { maxBuffer: 1024 * 1024 * 20 });
    if (stderr) this.logger.warn(stderr);
    if (stdout) this.logger.debug(stdout);

    return join(tmpdir(), \`\${trackId}.mp3\`);
  }

  private async runYtDlpJson(target: string, extraArgs: string[] = []) {
    const args = this.buildBaseArgs([
      '--dump-single-json',
      '--no-playlist',
      ...extraArgs,
      target,
    ]);
    const { stdout, stderr } = await execFileAsync('yt-dlp', args, { maxBuffer: 1024 * 1024 * 20 });
    if (stderr) this.logger.warn(stderr);
    return JSON.parse(stdout);
  }

  private buildBaseArgs(args: string[]): string[] {
    const base = [
      '--no-check-certificate',
      '--ignore-config',
      '--extractor-args',
      'youtube:player_client=mweb',
      '--format',
      'bestaudio/best',
      '--add-header',
      'Accept-Language: en-US,en;q=0.9',
      '--add-header',
      'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ];

    if (process.env.BGUTIL_PROVIDER_URL) {
      base.push('--extractor-args', \`youtubepot-bgutilhttp:base_url=\${process.env.BGUTIL_PROVIDER_URL}\`);
    }

    if (process.env.YTDLP_COOKIES_BASE64) {
      this.writeCookiesFile();
    }

    if (process.env.YTDLP_USE_COOKIES === 'true') {
      base.push('--cookies', this.cookiesPath);
    }

    return [...base, ...args];
  }

  private writeCookiesFile() {
    const data = Buffer.from(process.env.YTDLP_COOKIES_BASE64 || '', 'base64').toString('utf8');
    fs.mkdir('/config', { recursive: true })
      .then(() => fs.writeFile(this.cookiesPath, data, { mode: 0o600 }))
      .catch((error) => this.logger.warn(\`Failed to write cookies file: \${error.message}\`));
  }

  private extractEntries(payload: unknown): VideoCandidate[] {
    const root = payload as { entries?: VideoCandidate[] } | VideoCandidate;
    if ('entries' in root && Array.isArray(root.entries)) {
      return root.entries.filter(Boolean);
    }
    return [root as VideoCandidate].filter(Boolean);
  }

  private idFromUrl(url?: string): string | undefined {
    if (!url) return undefined;
    const match = url.match(/(?:v=|youtu\\.be\\/|shorts\\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1];
  }
}
`;

const robustPath = path.resolve("src/backend/src/youtube/youtube-robust.service.ts");
if (!fs.existsSync(robustPath)) {
  write(robustPath, robustYoutubeService);
  console.log("created src/backend/src/youtube/youtube-robust.service.ts");
}
