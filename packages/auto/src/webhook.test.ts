import { webhookPaths } from './webhook';

describe('webhookPaths', () => {
  it('reads the files of a Sonarr import (season pack included) and of a Radarr import', () => {
    const sonarr = {
      eventType: 'Download',
      isUpgrade: false,
      episodeFile: { path: '/TV-Show/A/Season 1/A - S01E01.mkv' },
      episodeFiles: [{ path: '/TV-Show/A/Season 1/A - S01E01.mkv' }, { path: '/TV-Show/A/Season 1/A - S01E02.mkv' }],
    };
    expect(webhookPaths(sonarr)).toEqual({
      imported: ['/TV-Show/A/Season 1/A - S01E01.mkv', '/TV-Show/A/Season 1/A - S01E02.mkv'],
      renamed: [],
    });
    expect(webhookPaths({ eventType: 'Download', isUpgrade: true, movieFile: { path: '/movies/F (2020)/F.mkv' } }).imported).toEqual([
      '/movies/F (2020)/F.mkv',
    ]);
  });

  it('pairs old and new paths of a rename and ignores other events', () => {
    const rename = {
      eventType: 'Rename',
      renamedEpisodeFiles: [
        { previousPath: '/TV-Show/A/Season 01/a.mkv', path: '/TV-Show/A/Season 1/A - S01E01.mkv' },
        { previousPath: '/TV-Show/A/Season 1/same.mkv', path: '/TV-Show/A/Season 1/same.mkv' },
      ],
    };
    expect(webhookPaths(rename)).toEqual({ imported: [], renamed: [['/TV-Show/A/Season 01/a.mkv', '/TV-Show/A/Season 1/A - S01E01.mkv']] });
    expect(webhookPaths({ eventType: 'Test' })).toEqual({ imported: [], renamed: [] });
    expect(webhookPaths({ eventType: 'Grab', release: {} })).toEqual({ imported: [], renamed: [] });
    expect(webhookPaths(null)).toEqual({ imported: [], renamed: [] });
  });
});
