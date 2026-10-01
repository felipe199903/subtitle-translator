import { assToCues } from './ass';

const ASS = `[Script Info]
Title: test

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Hello, there!{\\i0}\\NHow are you?
Dialogue: 1,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Hello, there!{\\i0}\\NHow are you?
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,{\\pos(320,50)}Student Council Room
Dialogue: 0,0:00:06.00,0:00:06.20,OP-Romaji,,0,0,0,,{\\k20}ka{\\k30}ze
Dialogue: 0,0:00:07.00,0:00:08.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}
Dialogue: 0,0:00:09.00,0:00:10.00,Default,,0,0,0,Banner;10,Scrolling sign
Comment: 0,0:00:11.00,0:00:12.00,Default,,0,0,0,,commented out
Dialogue: 0,0:00:13.00,0:00:14.25,Default,,0,0,0,,Fine,\\hthanks.
Dialogue: 2,0:00:15.00,0:00:15.05,OP_EN,,0,0,0,,{\\pos(960,1022)}I'll bring down all of the walls
Dialogue: 2,0:00:15.00,0:00:16.00,OP1-Light,,0,0,0,,Light
Dialogue: 0,0:00:17.00,0:00:17.04,GJM_Main_1080p,,0,0,0,,{\\pos(960,1000)}Moving line
Dialogue: 0,0:00:17.04,0:00:17.08,GJM_Main_1080p,,0,0,0,,{\\pos(962,1000)}Moving line
Dialogue: 0,0:00:17.08,0:00:19.00,GJM_Main_1080p,,0,0,0,,{\\pos(964,1000)}Moving line
Dialogue: 0,0:00:20.00,0:00:21.00,Speed,,0,0,0,,Speed is a dialogue style
`;

describe('assToCues', () => {
  it('keeps only dialogue, strips tags and removes duplicated layers', () => {
    const cues = assToCues(ASS);
    expect(cues.map(c => c.text)).toEqual([
      'Hello, there!\nHow are you?',
      'Fine, thanks.',
      'Moving line',
      'Speed is a dialogue style',
    ]);
    expect(cues[0]).toMatchObject({ start: '00:00:01,000', end: '00:00:03,500' });
    expect(cues[1]).toMatchObject({ start: '00:00:13,000', end: '00:00:14,250' });
  });

  it('skips song styles like OP_EN / OP1-Light and merges a line animated frame by frame', () => {
    const cues = assToCues(ASS);
    expect(cues.some(c => /walls|Light/.test(c.text))).toBe(false);
    expect(cues.find(c => c.text === 'Moving line')).toMatchObject({ start: '00:00:17,000', end: '00:00:19,000' });
  });
});
